# FASE 8 — Motor quincenal de nómina

> Referencia del motor histórico V0. Las altas operativas V1 usan
> [Anticipo, Pago y Simular pago](NOMINA_V1.md); los periodos históricos conservan este flujo.

## Operación

RH/ADMIN abre `/planilla`, crea una quincena o abre la que ya generaron las novedades.
Elige cualquier fecha: el servidor normaliza 1–15 / 16–fin de mes y evita duplicados/solapamientos.
El flujo obligatorio es ABIERTO → CALCULADO → REVISADO → APROBADO → CERRADO.
Cada confirmación envía la versión observada para rechazar pantallas desactualizadas.

Calcular/recalcular crea una versión nueva; conserva las anteriores. Un error de negocio de un
empleado se muestra con su código en las alertas del periodo; los resultados válidos se pueden
consultar, pero no se permite revisar/aprobar/cerrar hasta resolver todas las alertas bloqueantes.
Las horas/ausencias pendientes deben autorizarse o rechazarse en Novedades y luego recalcular.
El neto negativo nunca se guarda como resultado ni se convierte artificialmente en cero.

Antes de revisar, aprobar y cerrar se vuelve a obtener la fuente y contrastar su SHA-256. Un cambio
de salario, organización, novedad, historia fiscal o configuración legal invalida la revisión.
Si el periodo estaba aprobado, **Devolver a revisión** exige confirmación y motivo para habilitar
la corrección y recálculo. Esta acción no aplica cobros.

Cerrar aplica cuotas/fijos, vincula las aplicaciones al detalle y marca fecha de pago al fin de la
quincena en la misma transacción que el estado y la auditoría. Los módulos anteriores bloquean
novedades y cambios retroactivos que intersectan cierres. Dos cierres concurrentes no duplican pagos.
No se transmite dinero ni se integra una banca desde este módulo.

Solo ADMIN reabre un cierre con motivo de al menos 10 caracteres. Se revierten sus aplicaciones,
saldos y cuotas, conservando las filas históricas REVERTIDA. El periodo vuelve a ABIERTO y requiere
calcular → revisar → aprobar → cerrar otra vez. No puede modificarse/reabrirse si hay periodos
posteriores aprobados/cerrados: resolverlos en orden inverso protege ISR y saldos. Para calcular o
cerrar se exige cerrar primero los periodos anteriores existentes del mismo año.

## Cálculo y vigencias

- Dinero viaja como texto decimal. Oracle se consulta con `TO_CHAR`/NLS explícito y se escribe con
  binds/`TO_NUMBER`; cálculo con Decimal y redondeo único half-up de `shared/utils/dinero.ts`.
  No se redondea el valor hora antes de multiplicar. Se redondea cada línea, después se suman totales.
- Se requiere una única vigencia por código, fecha y unidad; nunca hay tasas o montos de respaldo
  en el código. Salarios, conceptos y tasas se resuelven en cada segmento/día efectivo. Una vigencia
  faltante o ambigua bloquea al empleado con una explicación.
- Quincena completa paga salario mensual / QUINCENAS_MES. La segunda quincena conserva la mitad
  aunque febrero tenga 28/29 días o el mes tenga 31. Una quincena parcial paga días calendario
  dentro de la relación laboral × salario / SALARIO_DIAS_MES, hasta el equivalente de una quincena.
  Los cambios salariales intermedios se ponderan por sus días. El motor exige periodicidad 2/24;
  estos valores se leen y se validan desde BD, pues las fechas del dominio son quincenales.
- Ausencias APROBADA con efecto SIN_GOCE/SUBSIDIO_IGSS descuentan únicamente días laborales del
  horario vigente, excluyendo feriados nacionales/locales. Cada segmento conserva origen, fecha,
  salario y tasas. CON_GOCE/vacaciones aprobadas conservan salario. La bonificación se reduce
  proporcionalmente sin duplicar esa reducción en descuentos. El subsidio del Instituto no se
  inventa como ingreso pagado por la empresa.
- Horas APROBADA usan salario y parámetros de su fecha/jornada; comisiones activas usan la quincena.
  Conceptos conservan sus banderas IGSS/ISR/prestaciones. La bonificación mensual, divisor, horas
  diurnas/mixtas/nocturnas y recargo salen de PARAMETROS_LEGALES.
- IGSS laboral/patronal, IRTRA e INTECAP aplican sus tasas vigentes a la base afecta después de
  ausencias. Las tasas intermedias se ponderan por segmento. COSTO_PATRONAL guarda los aportes
  informativos; la UI los identifica como **Aporte patronal**. Costo total empresa = ingresos + aportes.
- FIJO se aplica una vez por cierre. CUOTAS/UNICO cobran pendientes con vencimiento hasta el fin
  del periodo, incluidas cuotas anteriores aún pendientes; se conserva su vencimiento original y
  se registra la quincena que efectivamente cobró. Se limita cada cobro al saldo restante conjunto;
  la última cuota liquida exactamente. Tipos adicionales usan su concepto si existe o
  OTRO_DESCUENTO, conservando el nombre del catálogo. Parqueo/tienda se consumen como cualquier
  acuerdo vigente; la solicitud que origine parqueo pertenece al módulo de solicitudes posterior.

## ISR completo e implantación a mitad de año

La renta anual suma renta afecta realmente pagada en versiones vigentes de periodos cerrados,
renta afecta actual y proyección restante de salario/bonificación con sus vigencias futuras y egreso.
Las comisiones y horas variables se incorporan cuando existen en la quincena calculada; no se
extrapolan comisiones/horas hipotéticas. El IGSS proyectado suma cuotas reales acumuladas, cuota
actual y cuotas futuras redondeadas por quincena, coherentes con el motor.

Se resta deducción personal vigente, IGSS y deducciones acreditadas del empleado/año. Comprobantes
se agrupan por tipo antes de aplicar el tope: PORCENTAJE sobre renta proyectada o QUETZALES. Un tope
nulo representa un tipo sin tope monetario adicional configurado. Los IGSS acreditados manualmente
son exclusivamente cuotas ajenas a la planilla para evitar doble deducción (catálogo inicial).
Los tramos deben cubrir desde cero, ser contiguos y conservar cuotas fijas coherentes. El motor
calcula cuota fija + excedente × tasa, y retiene la diferencia con el acumulado / periodos restantes.
La última quincena fiscal usa únicamente reales. Si se retuvo de más, el concepto ISR_DEVOLUCION
reintegra el exceso como ingreso no afecto a IGSS/ISR/prestaciones; S005 lo instala aditivamente.
Antes del último periodo el exceso se muestra como aviso informativo, sin otra retención.

Aguinaldo/Bono 14 ya PAGADA en PRESTACIONES incorporan únicamente el exceso sobre los meses exentos
configurados. Este módulo consume ese contrato; el cálculo/pago de prestaciones y finiquitos sigue
reservado a FASE 9. No duplica prestaciones dentro de la nómina ordinaria.

Si el empleado trabajó antes del primer periodo del sistema, se exige continuidad de nóminas
cerradas o una **apertura fiscal certificada**. RH registra renta gravada, IGSS e ISR reales al cierre
de la quincena anterior. ISR_APERTURAS admite una apertura por empleado/año antes de aprobar/cerrar
su primera planilla; rechaza solapamiento con nóminas ya cerradas. No se infieren ingresos pagados
solo a partir del salario del contrato. Los comprobantes/aperturas son registros históricos auditados.

## Persistencia y reproducción

NOMINA_EMPLEADO conserva versión, salario de referencia, días, ingresos/descuentos/neto y aportes.
DATOS_EMPLEADO contiene `versionMotor`, entrada completa (vigencias, fuentes, horarios/feriados,
historia fiscal) y resultado, además de los datos de empresa de la emisión. NOMINA_DETALLE conserva
líneas/base/cantidad/tasa/banderas y FKs de comisión, horas, ausencia o aplicación de descuento.
NOMINA_PARAMETROS conserva IDs y valores aplicados, incluidos parámetros de la proyección anual.
ISR_PROYECCIONES conserva renta, deducciones, tabla de tramos, acumulados y retención.
Las boletas usan los importes del snapshot histórico, sin recalcular al descargarlas.
La prueba de reproducción vuelve a calcular exclusivamente desde esa entrada conservada.

Las escrituras serializan con el mismo lock de catálogos/administración y revalidan actor/sesión
antes de modificar datos. Commit/rollback son explícitos. Los listados/exportaciones usan una
transacción Oracle READ ONLY para mantener filas/totales/versiones consistentes entre consultas.
La bitácora recibe cambios depurados y binds CLOB explícitos, incluso para configuraciones grandes.

## Pantallas y exportaciones

Planilla e historial permiten filtros combinados por año/mes, estado, código/nombre, empleado,
departamento y avisos, paginación/orden en servidor, chips removibles y limpiar. Los totales suman
toda la consulta filtrada. Excel es XLSX real, con celdas monetarias numéricas exactas y textos que
no ejecutan fórmulas. PDF consolidado y boletas masivas descargan toda la consulta (máximo operativo:
10,000 resultados). PDFKit pagina encabezados/filas y numera páginas. Las vistas previas sin cierre
lo indican expresamente. Se reutilizan tokens, iconos, campos y ayuda declarativa del mockup.

EMPLEADO abre `/mis-gestiones/boletas`: solo versiones actuales de periodos cerrados, propiedad
obtenida del vínculo USUARIOS/EMPLEADOS en Oracle. En móvil se muestran tarjetas con neto, detalle
y descarga directa; en desktop, tabla paginada. La API no acepta una identidad del cliente para
sustituir al propietario. RH/ADMIN puede consultar boletas y versiones anteriores mediante su ID.

## Reporte IGSS mensual

Referencia: [manual oficial de sistema propio 2.2.0](https://servicios.igssgt.org/Descargas/Planilla/GenerarArchivoPlanilla_2.2.0.pdf).
El editor guiado guarda FORMATO_IGSS en CONFIGURACION_EMPRESA: número patronal, versión, destino
pruebas/producción, nombre/NIT/correo, centros y sus códigos geográficos/actividad, tipos de planilla
y asignación/nombres exactos de afiliación de cada empleado. La primera configuración crea empresa
si no existe; las posteriores cambian la configuración del reporte, conservando el expediente fiscal.
No se parten automáticamente apellidos compuestos ni se inventan códigos de ocupación/centro.

Se exige cerrar ambas quincenas. El archivo TXT UTF-8 usa texto en mayúsculas, barras `|`, CRLF,
nombre patrono-añomes-fecha-hora en Guatemala y bloques Centros, TiposPlanilla, Liquidaciones,
Empleados (19 campos), Suspendidos, Licencias, Juramento y Fin Planilla. Agrupa base afecta mensual
por empleado/tipo y conserva altas/bajas y suspensiones/licencias. TC deja horas opcionales vacías;
TP obtiene horas del horario efectivo conservado, excluye ausencias sin salario/feriados y agrega
horas extra aprobadas; exige historial suficiente. Los días corresponden a días pagados del motor.
La estructura oficial se mantiene fija por versión; los datos/mapeos se parametrizan en BD.
La aplicación genera el archivo descargable, no lo presenta en el portal externo.

Fuentes legales de referencia: [SAT, obligaciones patronales en relación de dependencia](https://portal.sat.gob.gt/portal/descarga/1817/orientacion-legal-y-derechos-de-contribuyentes/11575/obligaciones-tributarias-de-los-patronos-como-agentes-de-retencion-del-impuesto-sobre-la-renta-generado-por-rentas-del-trabajo-en-relacion-de-dependencia.pdf)
y [Minfin, Decreto 10-2012, artículos 72–79](https://www.minfin.gob.gt/images/archivos/despacho/decreto10_ag134_ag133.pdf).
RRHH debe validar vigencias, deducciones, liquidación anual y códigos contra su registro antes del
uso real, como se exige desde FASE 1. Los seeds de referencia no constituyen certificación legal.

## API

Todas las rutas están bajo `/api/nomina`, con sesión/cambio obligatorio y CSRF en escrituras.
Respuestas JSON uniformes; archivos como `{nombre,tipo,base64}` para el cliente autenticado.

| Método / ruta                                                   | Alcance                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| GET /periodos; POST /periodos `{fecha}`; GET /periodos/:id      | RH/ADMIN, quincenas exactas                                              |
| POST /periodos/:id/calcular, revisar, aprobar, cerrar, devolver | RH/ADMIN, `{version,confirmado:true,motivo?}`                            |
| POST /periodos/:id/reabrir                                      | Solo ADMIN; motivo obligatorio                                           |
| GET /periodos/:id/planilla; GET /historial                      | RH/ADMIN; filtros/página/orden                                           |
| GET /boletas; GET /boletas/:id; GET /boletas/:id/pdf            | Propias cerradas para EMPLEADO; RH/ADMIN consulta                        |
| GET /exportar/excel, pdf, boletas                               | Toda la consulta filtrada RH/ADMIN                                       |
| GET /periodos/:id/exportar/excel, pdf, boletas                  | Exportación acotada a periodo                                            |
| GET /isr/tipos; GET /isr/empleados/:id?anio=                    | Tipos reales e historia fiscal                                           |
| POST /isr/aperturas                                             | `{idEmpleado,anio,fecha,monto,igss,isr,motivo,confirmado:true}`          |
| POST /isr/deducciones                                           | `{idEmpleado,idTipo,anio,fecha,monto,referencia,motivo,confirmado:true}` |
| GET/POST /igss/formato                                          | Configuración; POST `{formato,motivo,confirmado:true}`                   |
| GET /igss/exportar?anio=&mes=                                   | Mes completo cerrado, RH/ADMIN                                           |

Filtros de planilla: pagina/limite, anio/mes, estado, buscar, idEmpleado/idDepartamento, alertas=1/0,
ordenarPor=inicio/empleado/ingresos/descuentos/neto/estado y direccion=asc/desc. Campos desconocidos,
fechas inválidas, órdenes fuera de lista blanca y confirmaciones ausentes se rechazan con Zod.
