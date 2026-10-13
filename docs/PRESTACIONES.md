# Prestaciones de ley — FASE 9

Acceso RH/ADMIN: `/prestaciones`. La acción **Liquidar y dar de baja** del expediente abre
la simulación con el empleado seleccionado. El portal EMPLEADO no tiene acceso a cálculos masivos,
liquidaciones ni constancias de otros empleados.

## Cálculos y fuentes

- Bono 14: ciclo julio–junio. Aguinaldo: diciembre–noviembre. El año identifica el cierre.
  Inicio y límite de pago se leen de parámetros vigentes; la vista previa muestra el vencimiento.
- Ingresos devengados: conceptos con `AFECTA_PRESTACIONES`, menos ausencias sin goce afectas.
  Las banderas de nóminas cerradas provienen del snapshot original. Las demás quincenas usan el
  mismo motor de nómina con salarios y novedades reales registrados; no se presupone que se pagaron.
  Novedades pendientes, huecos de vigencia y fuentes incoherentes bloquean el cálculo.
- Promedio mensual = suma devengada / meses equivalentes. Los meses equivalentes se obtienen
  de cantidades de salario base / divisor mensual vigente, conservando la convención quincenal
  de FASE 8 (quincena completa = medio mes; parcial = días calendario, tope quincenal).
  Las ausencias disminuyen el importe devengado sin acortar el tiempo contractual.
- Prestación anual = promedio × fracción del año × porcentaje vigente. No se aplica dos veces
  la proporcionalidad: seis meses de Q3,000 dan Q1,500; aumentar a Q5,000 desde abril y devengar
  Q1,800 en comisiones durante enero–junio da promedio Q4,300 y Bono 14 Q2,150.
- Indemnización, conforme a la fórmula solicitada en RF-12: promedio devengado de los últimos
  seis meses (o desde ingreso si es posterior) × años y fracción × porcentaje vigente.
  Los años se cuentan por aniversarios; la fracción usa la duración real del año del aniversario,
  incluidos bisiestos. El corte es inclusivo; la ventana comienza el día posterior al mismo día
  de seis meses atrás, ajustado al fin del mes cuando ese día no existe.
- Finiquito: indemnización cuando la causa es despido injustificado, vacaciones pendientes
  valoradas por la primitiva de FASE 7, aguinaldo y Bono 14 del ciclo en curso al egreso.
  Renuncia/despido justificado dejan indemnización cero y conservan los otros componentes.
  Al egresar al cierre de un ciclo, descuenta la prestación ya pagada para evitar otro desembolso.
- La bonificación incentivo y los demás conceptos respetan sus banderas reales. Comisiones
  registradas en la quincena abierta final se consideran ya devengadas y se incluyen completas;
  RRHH debe capturar el importe definitivo antes de confirmar. Una comisión cerrada se atribuye
  al final de su quincena, sin repartirla artificialmente por días.
- `decimal.js`, half-up y dos decimales en importes. Promedios, fuentes, parámetros, tiempo y
  componentes se conservan en JSON; la reproducción usa precisiones internas, no la cifra visible.

## Aprobación, pago y baja

1. Generar vista previa masiva por empleado/departamento (máximo 500). Cada fila explica su error.
2. Corregir errores y guardar el lote con motivo/confirmación. Se revalida la huella SHA-256;
   todo el lote se confirma o revierte. Guardar no registra pago.
3. Abrir detalle y aprobar. Las fuentes se revalidan nuevamente. Una prestación anual calculada
   o aprobada puede anularse con motivo y calcularse de nuevo; se conserva el registro anulado.
4. Registrar el pago realizado con fecha, referencia y motivo. No transfiere dinero a un banco.
   Fecha no futura, desde el corte y posterior al último cierre, dentro del año fiscal actual.
   Reintentos y dos aprobaciones simultáneas no producen pagos/estados duplicados.
5. El finiquito se simula antes de confirmar; se rechazan reservas/movimientos posteriores,
   prestaciones pendientes, ciclos anuales anteriores sin pago registrado y nóminas aprobadas/cerradas que excedan el egreso. Confirmar guarda
   la liquidación aprobada, debita vacaciones, da de baja, desactiva usuario y revoca sesiones
   en una transacción auditada. La liquidación confirmada conserva la baja y no puede anularse.
6. Su pago debe registrarse en la quincena final y antes de cerrarla para incorporar las bases
   gravadas en nómina. Los documentos indican claramente si el pago está pendiente o registrado.

El sistema aplica el límite exento por tipo y empleado, resta exenciones ya usadas en el año
fiscal y vuelve a comprobarlo al pagar. Guarda `MONTO_EXENTO_ISR`; solo el excedente y vacaciones
pagadas se incorporan a la renta del motor de FASE 8. La indemnización permanece exenta.
La retención se calcula en nómina, no se inventa una deducción ni un desembolso en prestaciones.
Un cierre que sustenta una prestación vigente no puede reabrirse: hay que anular los cálculos
anuales sin pagar que lo referencian; los aprobados/pagados que se conservan protegen su historia.

## Constancias y PDF

La constancia RF-17 filtra por **fecha de pago**, incluye ingresos brutos de nóminas cerradas
(versiones actuales) y componentes salariales de prestaciones pagadas; excluye indemnizaciones.
El rango máximo es cinco años y no puede terminar en el futuro. Incluye empresa real, empleado,
puesto, departamento, ingreso, detalle por fecha, total y fecha de emisión. Sin empresa o sin
pagos no se emite un documento vacío. Vista previa y descarga quedan auditadas con SHA-256.
Los PDF de prestaciones utilizan la instantánea conservada y el estado/fecha/referencia actuales.

## API

Todos los endpoints usan `/api/prestaciones`, sesión, cambio de clave completado y RBAC RH/ADMIN.
Escrituras requieren CSRF; campos/IDs/fechas/órdenes se validan con Zod estricto.

| Método | Ruta                          | Uso                                          |
| ------ | ----------------------------- | -------------------------------------------- |
| GET    | `/`                           | Filtros, búsqueda, orden y paginación Oracle |
| POST   | `/previsualizar`              | `{tipo, anio, idDepartamento?, idEmpleado?}` |
| POST   | `/calcular`                   | `{seleccion, hash, motivo, confirmado:true}` |
| POST   | `/simular`                    | `{idEmpleado, corte, causa}`                 |
| POST   | `/liquidar`                   | `{seleccion, hash, motivo, confirmado:true}` |
| GET    | `/:id`                        | Detalle y snapshot                           |
| POST   | `/:id/aprobar`, `/:id/anular` | `{hash, motivo, confirmado:true}`            |
| POST   | `/:id/pagar`                  | Lo anterior más `fechaPago` y `referencia`   |
| GET    | `/:id/pdf`                    | PDF de prestación o finiquito                |
| GET    | `/constancia`                 | `idEmpleado, inicio, fin` (fechas de pago)   |
| GET    | `/exportar`                   | CSV de toda la consulta, máximo 10,000       |

Filtros: `buscar, idEmpleado, idDepartamento, tipo, estado, desde, hasta` (ciclos que intersectan
el rango); `pagina, limite, ordenarPor, direccion`. Respuestas uniformes y errores en español.
Bloqueo compartido con módulos existentes, revalidación del actor y binds Oracle, incluidos CLOB.

## Supuestos y revisión legal

Se implementa la fórmula explícita del proyecto para indemnización (`promedio × tiempo`).
No se añade automáticamente una integración de alícuotas de aguinaldo/Bono 14 al promedio.
Antes de uso laboral real, RH debe validar esa base, banderas, vigencias y obligaciones pendientes
anteriores al ciclo actual; los pagos históricos deben quedar registrados antes del egreso.
Las constancias certifican el historial registrado, no una firma electrónica ni un trámite ante SAT.
No se automatizan transferencias, fraccionamientos de aguinaldo ni declaraciones fiscales externas.

Referencias oficiales consultadas el 12/10/2026:

- [MINTRAB: aguinaldo](https://mintrabajo.gob.gt/aguinaldo/): ciclo y proporcionalidad;
  la modalidad de pago único hasta 15/12 sigue la instrucción del proyecto.
- [Gobierno de Guatemala: Bono 14](https://guatemala.gob.gt/que-es-el-bono-14-cuanto-deben-pagarte-por-concepto-del-bono-14/):
  promedio anual julio–junio y pago durante primera quincena de julio.
- [Congreso: Decreto 10-2012, art. 70](https://www.congreso.gob.gt/assets/uploads/info_legislativo/decretos/2012/010-2012.pdf):
  exención limitada de aguinaldo/bonificación anual e indemnización.
- [Corte de Constitucionalidad: guía de prestaciones](https://cc.gob.gt/wp-content/uploads/2023/07/Guia-para-el-calculo-de-Prestaciones-Laborales-Indemnizacion-y-Vacaciones-v.2.1-Infomacion-Publica.pdf):
  referencia de integración de bases, con régimen institucional propio; requiere contraste por RH
  con el régimen laboral aplicable a la empresa, no se adopta silenciosamente su fórmula.

## Verificación

`npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`.
`npm run verify:prestaciones` crea y elimina un esquema N2SEC, sin fixtures en la aplicación:
RBAC/CSRF, fuentes cambiadas, salarios/comisiones, aprobación concurrente, pago único, PDF,
constancia, filtros/CSV, finiquito y rollback real de baja/usuario/kardex/auditoría.
`npm run verify:security` conserva las 72 pruebas de fases anteriores; `npm run db:verify`
verifica V000–V017 y seeds idempotentes. `--docker` usa la imagen de pruebas Node 20 documentada
para ambos verificadores. Los PDF temporales de QA se guardan en `tmp/pdfs/`, fuera de Git.
