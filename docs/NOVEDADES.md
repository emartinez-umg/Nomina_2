# Novedades que alimentan la nómina — FASE 6

RH y ADMIN acceden a `/novedades`. Cada sección tiene alta, edición, detalle, filtros combinados,
orden y paginación en Oracle, CSV completo, ayuda reiniciable y anulación lógica con motivo.
La aplicación consume Oracle real. EMPLEADO queda excluido tanto por guard como por RBAC;
todas las escrituras exigen sesión válida, cambio de contraseña completado y CSRF.

## Captura

| Sección               | Datos y comportamiento                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descuentos            | Tipo activo (parqueo, tienda, embargo u otro), modalidad, monto, inicio, fin opcional para fijo y motivo. Fijo repite el importe sin saldo total; cuotas distribuye un total; único crea una cuota. |
| Préstamos y anticipos | Tipo PRESTAMO/ANTICIPO, capital, 1–600 cuotas, primera cuota hoy o futura, desembolso no posterior a la primera cuota, referencia única y motivo. Amortización sin intereses.                       |
| Comisiones            | Empleado, día de la quincena, importe manual, referencia y descripción. Una referencia por empleado/quincena evita duplicados.                                                                      |
| Horas extra           | Empleado, día, horas con hasta dos decimales (mayor que cero y máximo 24), jornada, estado y motivo. Un registro por empleado/día.                                                                  |
| Ausencias             | Tipo y efecto, rango inclusivo de hasta 366 días, estado, motivo y respaldo opcional. Los días registrados son calendario; no equivalen automáticamente a días laborales descontables.              |

El importe de descuentos en cuotas representa el total; el importe fijo representa cada quincena.
Las cuotas vencen el 15 y el último día del mes. Se distribuyen centavos enteros y el residuo se
suma a la última cuota, conservando exactamente el total. No se permiten cuotas de cero centavos.
Las fechas deben estar dentro de la relación laboral del empleado activo.

Solo APROBADA se destina al cálculo de horas/ausencias. PENDIENTE permite revisión;
RECHAZADA conserva la decisión. Cambiar a aprobado/rechazado exige confirmación y motivo.
Una ausencia no rechazada no puede traslapar otra activa no rechazada ni vacaciones EN_PROCESO,
APROBADA o TOMADA. Extremos inclusivos: el mismo día cuenta como traslape; el día siguiente queda libre.

La valoración de horas consulta salario y parámetros vigentes **en la fecha del registro**:
`SALARIO_DIAS_MES` (DIAS), `JORNADA_DIURNA_HORAS` / MIXTA / NOCTURNA (HORAS) y
`HORAS_EXTRA_RECARGO_PORCENTAJE` (PORCENTAJE). No hay tasas legales en el código.
Valor = salario / divisor mensual / horas de jornada × horas registradas × (1 + recargo / 100).
Se redondea half-up únicamente el resultado monetario; el valor hora visible es informativo.
Una configuración ausente/duplicada o un divisor cero bloquea la captura. La valoración es estimada;
la nómina de Fase 8 deberá guardar sus propios snapshots de salario/parámetros.

Configuración RF-21 reutiliza `/catalogos/tipos-descuento`, `/catalogos/tipos-ausencia` y
`/catalogos/parametros-legales`. Los botones de configuración abren estas páginas.
El código de un tipo utilizado y el efecto de una ausencia utilizada se conservan: crear otro tipo
permite cambiar el significado sin alterar los registros históricos.

## Integridad y adjuntos

Se serializan las escrituras con el mismo orden de bloqueos de catálogos/usuarios y un lock SHARE
sobre PERIODOS_NOMINA. La sesión y el rol se revalidan dentro de la transacción. Registro, préstamo,
calendario, periodo creado automáticamente, BLOB y auditoría se confirman o revierten juntos.
Fase 8 deberá conservar este orden de locks al calcular/cerrar/reabrir.

Se comprueba tanto el rango anterior como el nuevo contra todos los periodos CERRADO, incluso al
anular o mover de fecha. Un fijo sin fin abarca desde su inicio hacia adelante; para detenerlo antes
hay que definir el fin antes del cierre. Aplicaciones de nómina, cuotas con pagos y referencias de
NOMINA_DETALLE también hacen inmutable la novedad. Las anuladas/liquidadas quedan para consulta.
El empleado de una novedad no puede cambiarse al editar. No se borran físicamente registros de negocio.

Respaldo privado: PDF, PNG o JPEG de hasta 1 MiB. JSON base64 limitado a 1500 KiB en la ruta de
ausencias; el servidor verifica tamaño decodificado, base64 canónico, nombre sin rutas y firma binaria.
Se persiste en AUSENCIAS.SOPORTE dentro de la transacción; no se crean archivos públicos.
Omitir `adjunto` conserva el existente; enviar `null` lo quita. Auditoría guarda metadatos, tamaño y
SHA-256 del reemplazo, nunca contenido/base64. La verificación de firma no analiza malware ni valida
completamente la estructura del documento. La descarga autenticada usa Blob con nombre de archivo.

## API

Prefijo `/api/novedades`, respuesta uniforme `{ ok, data, error? }`.
`tipo`: `descuentos`, `prestamos`, `comisiones`, `horas-extra`, `ausencias`.

| Método y ruta                | Operación                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------- |
| GET `/reglas`                | Fecha actual de Guatemala.                                                        |
| GET `/opciones/:ref`         | Empleados/tipos/periodos reales, buscables y paginados (100 por página).          |
| GET `/restricciones/:id`     | Relación laboral, rangos ocupados y cierres; `excluir` omite la ausencia editada. |
| GET `/:tipo`                 | Lista paginada y ordenada.                                                        |
| GET `/:tipo/exportar`        | CSV de todas las páginas con los mismos filtros, límite 100,000 filas.            |
| GET `/:tipo/:id`             | Detalle, cuotas y estimación de horas cuando corresponde.                         |
| POST `/:tipo`                | Captura validada y auditada.                                                      |
| PATCH `/:tipo/:id`           | Edición si el registro sigue editable.                                            |
| POST `/:tipo/previsualizar`  | Amortización/estimación sin persistir; usa el mismo cuerpo de alta.               |
| POST `/:tipo/:id/anular`     | Motivo de 5–500 caracteres y `confirmado: true`.                                  |
| GET `/ausencias/:id/adjunto` | Respaldo privado (nombre, tipo y base64), solo RH/ADMIN.                          |

Filtros comunes: `buscar`, `idEmpleado`, `desde`, `hasta`, `estado`; páginas `pagina`, `limite`
(1–100), `ordenarPor` (`id`, `empleado`, `fechaInicio`, `monto`, `saldo`, `estado`), `direccion`.
Descuentos/préstamos: `idTipo`, `modalidad`, `montoMin/Max`, `saldoMin/Max`, `cuotasMin/Max`.
Comisiones: `idPeriodo`, `montoMin/Max`. Horas: `idPeriodo`, `jornada`, `horasMin/Max`.
Ausencias: `idTipo`, `efecto`. Las fechas filtran por intersección de rangos, incluyendo extremos.
SQL/columnas proceden de listas estáticas del servidor; todos los valores usan binds.

Cuerpos comunes: `idEmpleado` numérico y `motivo`. Campos específicos:

- Descuento: `idTipo`, `modalidad`, `monto` decimal como texto, `cuotas` entero o null,
  `fechaInicio`, `fechaFin` o null. FIJO exige cuotas null; UNICO exige 1; CUOTAS exige 1–600.
- Préstamo: `idTipo`, `monto`, `cuotas`, `fechaInicio`, `fechaDesembolso`, `referencia`.
- Comisión: `fecha`, `monto`, `referencia`.
- Horas: `fecha`, `horas` decimal como texto, `jornada`, `estado`, `confirmado` al resolver.
- Ausencia: `idTipo`, `fechaInicio`, `fechaFin`, `estado`, `confirmado` al resolver y `adjunto`
  opcional `{nombre, tipo, base64}` o null.

Fechas API: aaaa-mm-dd; pantalla: dd/mm/aaaa. Estados y enumeraciones en mayúsculas.
Los IDs expuestos para préstamos son **ID_DESCUENTO_EMPLEADO**, el acuerdo y sus cuotas;
PRESTAMOS conserva su PK interna y referencia única al acuerdo. Los listados generales de descuentos
excluyen préstamos, pero la ficha del empleado conserva todos sus acuerdos reales.

## Contrato para Fase 8

La captura crea PERIODOS_NOMINA ABIERTO para comisiones/horas cuando la quincena aún no existe.
No calcula, aprueba ni cierra planilla. No se descuentan cuotas al capturarlas ni por el paso del tiempo.

El consumidor deberá consultar comisiones activas del periodo, horas APROBADA activas, ausencias
APROBADA activas que intersectan el periodo y descuentos VIGENTE activos efectivos. Para cuotas,
usar vencimientos del periodo, pendiente `MONTO - MONTO_PAGADO` y saldo real. Para fijo, aplicar
MONTO_QUINCENA según vigencia. Único utiliza el mismo mecanismo de una cuota.
Prorrateo, días laborales/feriados, subsidio IGSS y control del neto no negativo pertenecen al cálculo.

`registrarCobroCuota(connection, actor, idCuota, idNomina, monto)` es una primitiva interna del servicio:
comprueba pertenencia al empleado/nómina, vencimiento, periodo abierto, cuota pendiente y saldo;
inserta DESCUENTOS_APLICACIONES, actualiza cuota/acuerdo y audita. Saldo cero cambia a LIQUIDADO.
Repetir el cobro completo se rechaza. El llamador controla commit/rollback junto con todos los
resultados de nómina y valida sesión/actor. No hay un endpoint de cobro manual.
Reapertura/reversión y nueva versión de cálculo se implementarán en Fase 8 utilizando las tablas
existentes; no se deben regenerar cuotas ni editar acuerdos ya consumidos.

## Cómo probar

1. `docker compose up --build` aplica V014 conservando datos/credenciales. HTTPS en producción.
2. Para HTTP local con Node 20: `NODE_ENV=development npm run dev`; entrar como RH o ADMIN.
3. Abrir `/novedades`, seleccionar empleado/tipo real y registrar las cinco clases de novedades.
   Revisar amortización, estimación de horas, filtros/chips/CSV, edición, autorización, anulación y ayuda.
4. Registrar dos ausencias que coinciden; la segunda se rechaza. Adjuntar un PDF válido, descargarlo
   desde el detalle y editar para quitarlo. Probar primera cuota pasada y referencias repetidas.
5. `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`.
6. `npm run verify:security` prueba cuotas/saldos/traslapes/cierres/rollback en N2SEC desechable.
   `npm run db:verify` verifica V000–V014, índices y seeds desde cero; `npm run verify:infra` prueba Compose.

## Actualización de consumo en FASE 8

El motor ya implementa el contrato de cierre/reapertura descrito en [NOMINA.md](NOMINA.md).
Las cuotas elegibles incluyen vencimientos **hasta** el fin del periodo, también vencidas que sigan
pendientes. Se conserva el vencimiento original y se registra la quincena del cobro efectivo.
FIJO se aplica una vez por cierre; CUOTAS/UNICO respetan saldo conjunto y se liquidan en cero.
Reabrir revierte aplicaciones/cuotas/saldo dentro de la transacción auditada y conserva versiones.
