# Novedades antes del pago — FASE V1-9 (A10)

RH/ADMIN cargan novedades reales antes de calcular la nómina. La rama v1 usa un libro mensual
`NOVEDADES_MENSUALES`: horas extra, comisiones, consumo en tienda, ausencias y cargos de parqueo.
Los registros tienen `PENDIENTE` / `APLICADA`, referencia `ID_NOMINA_EMPLEADO` y auditoría.
Una aplicación o cualquier quincena cerrada del mes protege la edición y la anulación.

## Captura y valoración

- **Horas extra:** empleado, selectores de mes/año, horas enteras o medias horas y descripción.
  Mes actual/anterior dentro de la relación laboral; un total pendiente por empleado/mes.
  Salario y horario vigentes al corte: último día del mes, limitado por hoy y egreso.
  En patrones con bloques de distinta duración se usa la media de horas diarias de los días
  laborales del patrón. No se elige manualmente una jornada nominal.
  `horas × salario / 30 / jornada diaria × (1 + recargo / 100)`; recargo vigente desde Oracle
  (referencia 50%). Decimal conserva precisión intermedia y redondea half-up al final.
  `HORAS_EXTRA_TOPE_MENSUAL`, unidad HORAS, genera advertencia considerando también horas
  aplicadas del mismo mes. V027 incorpora 40 como referencia operativa editable en Parámetros;
  no es una afirmación de un límite legal. Superarlo requiere revisión y confirmación.
- **Comisiones y consumo en tienda:** cargas manuales por empleado/mes con monto, descripción y
  referencia única por clase, empleado y mes. Filtros por empleado, departamento, mes, estado, búsqueda y monto;
  orden/paginación del servidor y CSV de toda la consulta. Tienda se reserva para el pago mensual.
- **Ausencias:** mantienen tipos, autorización, rangos inclusivos, respaldo privado y controles
  de traslape con ausencias/vacaciones. Sin goce: suma salario vigente / 30 por cada día calendario;
  con goce y subsidio no generan este descuento. El desglose separa meses y redondea cada línea
  mensual a centavos, por lo que el total visible suma esas líneas. Se conserva el efecto del
  subsidio para el consumidor de nómina. La vista previa y detalle muestran días/monto por mes;
  una ausencia aplicada parcialmente queda completamente protegida para conservar su historia.

Todos los cálculos se validan otra vez en backend. Formularios con borradores por usuario,
validación al salir, confirmaciones, hints y recorridos de ayuda v1-9. No hay endpoint para marcar
manualmente una novedad como aplicada ni para cobrarla desde una pantalla de captura.

## Parqueo mensual

`Configuración → Tarifas de parqueo` mantiene Carro/Moto con vigencias desde el primer día de un
mes, importes reales, motivo y confirmación anterior/nuevo. Una vigencia nueva termina la anterior
sin solapes; una vigencia existente no se sobrescribe. No se permite alterar meses cerrados.
No se crean importes ficticios al instalar: RRHH debe configurar ambos vehículos.

El empleado solicita Carro/Moto y placa opcional. Aprobar crea `PARQUEO_SUSCRIPCIONES`, con tarifa
vigente obligatoria y mes de aprobación como inicio. No se prorratea ni se permite duplicar una
suscripción que cubra el mismo mes. Las solicitudes históricas sin vehículo deben rechazarse y
volver a solicitarse; no se adivina el vehículo.

`Mi parqueo` valida propiedad en servidor, consulta cargos y permite solicitar baja con motivo;
RRHH/ADMIN reciben aviso. RRHH puede completar un vehículo migrado, dar de baja o suspender con
confirmación y auditoría. Baja/suspensión conserva el cargo completo del mes en curso y detiene
los siguientes; puede tramitarse después del cobro, pues no cambia el importe aplicado. Un mes
cerrado bloquea la gestión. Una suscripción finalizada requiere una solicitud nueva para un alta
posterior. No se edita un cargo aplicado. Listado con búsqueda/estado/mes, orden y CSV protegido
por la misma propiedad del usuario.

## Novedades pendientes

`Novedades → Novedades pendientes` resume por empleado y departamento, con filtro de mes,
búsqueda y departamento laboral, paginación y CSV. Incluye pendientes anteriores como retroactivas,
autorizaciones sin resolver y faltas de salario/horario/vehículo/tarifa. Los totales departamentales
abarcan todo el filtro. «Sin registro» permite comprobar respaldos: no inventa que deba existir
una novedad en cada concepto. Consultar no crea cobros ni cambia estados.

## Migraciones V027–V028 y conservación

- V000–V026 permanecen intactas. Cuatro tablas nuevas con identities ALWAYS, restricciones,
  auditoría, índices y triggers de fecha de modificación; FK compuesta asegura el empleado del pago.
- Las horas v0 se agrupan por empleado/mes, separando consumidas por pago, anuladas y rechazadas.
  Un grupo pendiente conserva la necesidad de revisión si alguno de sus orígenes no estaba aprobado.
  Los días/horas/motivos originales permanecen en HORAS_EXTRA y se enlazan con NOVEDADES_ORIGEN;
  el detalle permite consultarlos. No se redondean las cantidades históricas a medias horas.
- Comisiones conservan referencia, monto, origen y pago. Ausencias conservan snapshots aplicados;
  solo días no consumidos generan líneas pendientes. Los originales y las boletas no cambian.
- V028 reemplaza la unicidad global de referencias de V027 por CLAVE_REFERENCIA para cargas v1
  (clase, empleado, mes, referencia). Los originales v0 pueden repetir referencia entre quincenas
  o empleados: mantienen el texto y su origen, sin claves artificiales ni pérdida de información.
  Si al actualizar desde v0 falla ese bloque V027 por UQ_NOV_MES_REFERENCIA, el runner reconoce
  exclusivamente su checksum publicado y ese error Oracle, registra/ejecuta V028 y repite el
  bloque original completo (Oracle revierte la sentencia fallida). Ambas versiones solo se
  completan tras terminar V027; cualquier otro error o reparación fallida detiene el arranque
  y exige revisión manual. Con V027 ya aplicada, V028 se ejecuta en orden normal. No se cambian
  archivos, checksums ni estados fallidos anteriores.
- Los acuerdos de parqueo v0 se conservan y enlazan a suscripciones. El importe quincenal queda
  como referencia, sin inferir vehículo ni tarifa mensual. Los cobros previos se agrupan por mes,
  con sus aplicaciones originales enlazadas, evitando cobrarlos otra vez. La fuente de descuentos
  v0 excluye acuerdos ya migrados; desaparecen de la captura manual de parqueo.
- La numeración de los nuevos registros del libro es independiente de los IDs diarios v0. La
  trazabilidad conserva esos IDs de origen. Los rechazos históricos se conservan y no se consumen.

Los préstamos, anticipos, embargos y acuerdos v0 conservan su lógica de cuotas; su conversión a
cuotas mensuales corresponde a V1-10. El consumo v0 existente conserva su acuerdo e historial;
las nuevas cargas se hacen únicamente por mes en su pantalla dedicada.

## API y contrato para V1-10

Prefijo `/api/novedades`, sesión, cambio obligatorio completado, CSRF y RBAC existentes.

| Ruta                                                    | Operación                                             |
| ------------------------------------------------------- | ----------------------------------------------------- |
| GET/POST `/:tipo`, GET/PATCH `/:tipo/:id`               | Captura; tipos nuevos incluyen consumo-tienda         |
| POST `/:tipo/previsualizar`, `/:tipo/:id/previsualizar` | Cálculo sin guardar; edición excluye su propio total  |
| POST `/:tipo/:id/anular`, GET `/:tipo/exportar`         | Anulación motivada y CSV filtrado                     |
| GET `/pendientes`, `/pendientes/exportar`               | Resumen previo al pago, solo RH/ADMIN                 |
| GET `/parqueo`, `/parqueo/exportar`                     | Suscripciones y cargos del mes; empleado solo propios |
| POST `/parqueo/:id/cambiar`                             | SOLICITAR_BAJA, BAJA, SUSPENDER, COMPLETAR            |
| GET/POST `/parqueo/tarifas`                             | Consulta autenticada; escritura solo RH/ADMIN         |
| GET `/opciones/:ref`, `/restricciones/:id`, `/reglas`   | Catálogos reales, fechas ocupadas y hoy de Guatemala  |

`prepararNovedadesParaPago(connection, mes, empleado?)` obtiene las líneas pendientes y la proyección
mensual de suscripciones. Valora históricos de horas sin monto sin escribir al consultar.
`materializarParqueo` crea cargos únicos por suscripción/mes dentro de la transacción del pago;
`aplicarNovedades` guarda el pago, audita y rechaza repetición/empleado incorrecto/mes futuro respecto
al pago/estado no autorizado/cierre. El consumidor controla commit/rollback junto con su cálculo.
Se prueban primitivas con pagos de prueba reales de Oracle, sin exponer cobro manual por HTTP.
La nueva simulación, anticipo/pago, boletas mensuales y consumo automático se implementan en V1-10;
V1-9 deja cantidades, descuentos, referencias y estados disponibles para ese consumidor.

## Verificación

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run format:check`.
`npm run verify:novedades` usa Oracle/Supertest con esquema desechable; `npm run db:verify`
comprueba V000–V028 desde cero. `npm run test:e2e -- --grep 'FASE V1-9'` prueba las pantallas,
recorridos, teclado, móvil a 390 px y axe A/AA con API/Oracle reales. Preferir Node 20.20.2 y
correr las suites Oracle en secuencia para no agotar Oracle XE.
