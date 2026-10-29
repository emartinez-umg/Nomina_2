# Planilla v1 — Anticipo y pago mensual (A11)

RH/ADMIN usa Nómina → Simular pago (`/nomina/simular`): elige mes actual o anterior y un empleado,
un departamento o todos. Bono 14 y Aguinaldo permanecen deshabilitados hasta V1-11.
Simular abre una transacción de solo lectura: no crea periodos, resultados, documentos ni cargos.
La tabla muestra devengado/neto, totales de habilitados y alertas individuales. Vista previa PDF
incluye «SIMULACIÓN». Completar salario, horario o tarifa habilita una nueva simulación.

## Acumulados automáticos para el proyecto académico

Calcular/Recalcular en Planilla y Simular pago completan los intervalos fiscales faltantes desde
el 1 de enero o el ingreso, lo que ocurra después. Se utilizan las vigencias salariales y los
parámetros/conceptos/tramos de Oracle mediante los motores existentes; no se multiplica el salario
actual por todos los meses ni se codifican tasas nuevas. Meses completos v1 usan el motor mensual;
la planilla v0 y los huecos parciales usan el quincenal. Se prorratea el alta y se redondea con Decimal.

La reconstrucción incluye salario e incentivo, IGSS e ISR teórico. No presume comisiones, horas,
ausencias, deducciones acreditadas ni cuotas de periodos sin pago registrado. Las novedades del
pago actual, incluidas retroactivas, siguen su cálculo habitual. Aperturas y pagos existentes tienen
prioridad, sin duplicación; las vigencias faltantes o ambiguas siguen generando un bloqueo claro.

La interfaz muestra «Acumulados fiscales automáticos», con desglose por empleado y por intervalo
en el detalle de boleta. Es informativo: RRHH revisa los importes y continúa con el flujo habitual,
sin registrar aperturas individuales. No se crean pagos anteriores ni filas de ISR_APERTURAS.
El snapshot y el PDF identifican la estimación académica. Al pagar/cerrar se conserva, y los meses
siguientes reutilizan esos importes para que un cambio posterior de fuentes no reescriba la historia.
Simular no escribe; el hash de fuentes sigue invalidando una confirmación desactualizada.

Supuesto aprobado el 22/10/2026: el usuario confirmó que todos los datos son simulados y el sistema
se usa para un curso de Análisis de Sistemas. La reconstrucción es una estimación, no acredita
retenciones practicadas fuera del sistema. Para una implementación real se debe validar la apertura
con registros/constancias y revisar esta política. Referencia: [orientación oficial de SAT sobre
retenciones del trabajo](https://portal.sat.gob.gt/portal/descarga/1817/orientacion-legal-y-derechos-de-contribuyentes/11575/obligaciones-tributarias-de-los-patronos-como-agentes-de-retencion-del-impuesto-sobre-la-renta-generado-por-rentas-del-trabajo-en-relacion-de-dependencia.pdf).

La lista de verificación cuenta empleados con HE, comisiones, consumos, ausencias, retroactivas y
alertas. Marcar «Confirmo que las novedades del mes están completas» habilita la confirmación final.
El servidor calcula otra vez dentro del lock compartido de negocio y compara el SHA-256 de fuentes,
objetivo, periodos y pagos observados. Una diferencia exige simular nuevamente.

## Cálculo y evidencia

Se usa Decimal y `shared/utils/dinero.ts` (half-up, dos decimales) para líneas y totales. Salario,
conceptos/banderas, IGSS laboral/patronal, IRTRA, INTECAP, BI, recargo HE, divisor, deducción personal,
topes y tramos se leen de Oracle con su vigencia. Parámetros del Anticipo usan el corte del día 15;
los del Pago, el último día (IGSS sobre toda su base mensual). C1.1 sustituye el porcentaje de A11
por días activos del 1 al 15; ANTICIPO_PORCENTAJE se conserva para historia y no gobierna cálculos nuevos.
Los meses y sus días son calendario; la fecha informativa de pago nunca se desplaza por feriados.

- SB: mensual por días de contrato con tope del divisor mensual (referencia 30); mes completo paga
  el mensual también en febrero. Una vigencia salarial intermedia distribuye la base por sus días.
- AUS = días sin goce × SB prorrateado / divisor, según A11. La captura A10 conserva su
  valoración nominal de referencia; al pagar se archiva y aplica la valoración del motor. Con goce no resta.
- BI del mes = parámetro mensual × max(0, días activos del mes − ausencias sin goce del mes) / divisor.
  Se conserva la convención v1: mes completo equivale al divisor; parcial usa días calendario con tope.
- HE: horas × salario / divisor / horas diarias del horario × (1 + recargo / 100), sin redondear
  el valor hora antes de multiplicar; se revalora al calcular y conserva cantidad/importe aplicado.
- Anticipo base = salario mensual × días activos del 1 al 15 / divisor, respetando las vigencias
  salariales de esos días. BI del anticipo = min(parámetro mensual × días activos del 1 al 15 / 15,
  BI del mes). Se suman comisiones y HE cargadas; sin deducciones de ley ni cuotas.
- Si no hay días activos del 1 al 15, la simulación informa «Sin anticipo». No bloquea a los demás,
  no consume novedades, no genera pago ni boleta y no se exige para cerrar el periodo del anticipo.
- Pago = SB − AUS + BI + COM + HE − anticipo realmente pagado − IGSS − ISR − parqueo − tienda
  − préstamos/anticipos/embargos/otros. Sin anticipo registrado se resta cero.
- Los ingresos aplicados al anticipo integran nuevamente el devengado mensual y las bases fiscales;
  restar el anticipo completo evita pagarlos dos veces. Sus novedades no se aplican por segunda vez.
- Pendientes anteriores se etiquetan como retroactivas y tributan en el mes de aplicación.
  Aplicarlas no modifica el cálculo ni el documento del periodo original cerrado.
- ISR solo en Pago: historia real pagada v1 (o cierres/apertura v0) + mes actual + proyección de meses
  futuros. Retención = saldo ISR anual / meses restantes; diciembre/egreso liquida el saldo y devuelve
  excesos. Aguinaldo/Bono 14 conservan sus exenciones y snapshots; no se adelanta su automatización.

BI sigue C1.2, con prorrateo por ingreso, egreso y ausencias sin goce; también en proyección fiscal
y acumulados mensuales nuevos. Es un supuesto de negocio solicitado, pendiente de validar con el contador.
AUS conserva el SB ya prorrateado de A11; una ausencia retroactiva toma el SB de su mes de origen
y no reduce los días de incentivo del mes actual. La fórmula salarial de AUS no cambia en R3-1.
Estas decisiones quedan registradas también en PROGRESO_V1.md. Las referencias iniciales requieren
validación operativa de RH; el motor no usa porcentajes monetarios de respaldo en el código.

Esperados independientes para Q10,000 y año completo sin extras: anticipo Q5,250; IGSS Q483;
renta anual Q123,000 − Q48,000 − Q5,796 = Q69,204 imponibles; ISR anual Q3,460.20,
retención mensual Q288.35; pago después del anticipo Q4,228.65; neto mensual Q9,478.65.
Las pruebas usan literales derivados de esa aritmética, sin llamar al motor para generar esperados.

## Confirmación, documentos y reversión

`PAGOS_NOMINA` tiene UNIQUE empleado/mes/tipo. Un pago existente se bloquea; reintentos de la misma
simulación no duplican dinero. Un neto negativo o una fuente inválida bloquea exclusivamente al
empleado; los habilitados se guardan todos en una transacción, con novedades, cuotas, PDF BLOB,
SHA-256, firma de la ficha de quien confirma, aviso y auditoría. Fallar cualquiera revierte todo el lote.
No se realizan transferencias bancarias. Anticipo/Pago conservan la fecha informativa del tipo;
Bono 14/Aguinaldo guardan la fecha real de confirmación en Guatemala, conservando el mes del ciclo.

`BOLETAS_PAGO` conserva cada PDF emitido; descargarlo después no cambia membrete, firma ni cálculo.
La descarga individual valida propiedad; el ZIP de RH/ADMIN respeta mes/objetivo y agrupa por
ID de departamento. Boletas masivas desde Planilla también usa ZIP si incluye pagos v1.
El portal, campana e Inicio muestran el pago desde la confirmación, sin esperar el cierre.

ADMIN revierte un pago vigente con motivo de al menos diez caracteres y confirmación.
Anticipo/Pago requieren hacerlo antes del cierre y en orden inverso de pagos salariales
(incluido Pago antes de Anticipo del mismo mes). Bono 14/Aguinaldo son independientes: pueden
pagarse o revertirse con planillas posteriores y la quincena cerrada conserva su estado.
El atraso exige motivo y leyenda en PDF/bitácora; ver [Prestaciones](PRESTACIONES.md).
Se restauran exactamente saldo/cuotas y novedades, se retira la boleta del portal y se notifica.
Resultados/PDF/auditoría anteriores permanecen. Volver a pagar reutiliza la identidad UNIQUE del pago
con un nuevo NOMINA_EMPLEADO/version individual; ningún otro empleado pierde su versión vigente.
Si el cálculo sustenta prestaciones, se bloquea su reversión hasta resolver esas dependencias.

Planilla conserva revisar → aprobar → cerrar; exige completar el periodo y resolver novedades
pendientes. Cerrar no vuelve a cobrar. ADMIN puede reabrir con motivo: en v1 conserva pagos y permite
revertirlos explícitamente. El cierre del anticipo no impide cargar novedades pendientes para Pago;
las ya aplicadas permanecen protegidas. IGSS del mes cerrado toma la base del Pago, sin sumar Anticipo.

## Migración y API

V029 agrega MOTOR sin alterar snapshots ni SQL anteriores: los periodos existentes quedan V0,
salvo abiertos sin resultados, que pasan a V1; nuevos periodos operativos usan V1. Un periodo con
resultados v0 conserva su motor y no puede mezclarse con pagos v1: terminarlo y comenzar en un mes
completo siguiente, con los acumulados automáticos académicos o una apertura acreditada.

Descuentos/préstamos conservan MONTO_QUINCENA como nombre interno de compatibilidad y como monto
ahora **mensual**: no se duplica ni divide. Se conservan número de cuotas, capital, saldo, pagos y
aplicaciones. Solo cuotas pendientes/parciales se espacian al fin de meses sucesivos desde el mes
más antiguo pendiente. FECHA_VENCIMIENTO_ANTERIOR y FECHA_FIN_ANTERIOR preservan las fechas v0.
Las cuotas pagadas permanecen intactas. Nuevos planes son mensuales; el residuo sigue en la última.

- POST `/api/nomina/simular`, `/simular/:idEmpleado/pdf` (solo lectura RH/ADMIN).
- POST `/api/nomina/pagar` requiere objetivo, hash, confirmado y novedadesCompletas verdaderos.
- POST `/api/nomina/pagos/:idNomina/revertir` (ADMIN, motivo y confirmado).
- GET `/api/nomina/pagos/zip?mes=AAAA-MM&idDepartamento=…&idEmpleado=…` (filtros opcionales).
- Boletas, historial (filtro tipoPago), periodos/cierre y formato/exportación IGSS conservan sus rutas.

### Resumen mensual (R3-2, C1.3/C1.4)

`nomina.resumen.service.ts` centraliza `resumenMensualNomina`: agrupa por empleado y mes los
resultados vigentes, sin recalcular pagos. Historial, Inicio, evolución, remuneraciones y los
exportadores Excel/PDF/IGSS usan esa misma función, con Decimal y half-up a dos decimales.

- Ingresos = devengado del Pago, que ya incluye lo anticipado. Sin Pago usa solo el Anticipo y
  marca «Parcial: solo anticipo». El estado parcial se evalúa por empleado antes de sumar el mes.
- Descuentos excluye `ANTICIPO_PAGADO` (neteo). También excluye `AUSENCIA_SIN_GOCE` en el Pago:
  esa reducción salarial ya está restada del devengado. Neto = neto Anticipo + neto Pago.
  Una devolución de ISR reduce la deducción efectiva de ISR; no aumenta el devengado salarial.
  Puede producir deducciones con signo negativo, conservadas también como números en Excel.
- SB Q10,000 sin extras: anticipo Q5,250, devengado Q10,250, IGSS Q483. Con el año completo de
  referencia e ISR Q288.35: deducciones Q771.35, neto mensual Q9,478.65.
- Los filtros limitan los registros incluidos; la paginación no limita los totales. Filtrar solo
  Pago o un periodo excluye el neto de los anticipos ajenos a ese filtro. Para comparar con Inicio,
  consultar el mes completo sin filtro de tipo/periodo. La tabla y los PDF de boletas conservan
  los importes individuales originales; Excel y PDF de planilla consolidan por empleado y mes.
- V0 suma sus quincenas vigentes. Las prestaciones anuales conservan grupos separados en historial
  y exportaciones; Inicio/IGSS las excluyen. IGSS usa base afecta y días del Pago (ambas quincenas
  en V0), nunca días/base del Anticipo, y rechaza un resumen que aún sea parcial.

Inicio incorpora `nominaMes` (mes, ingresos, descuentos, neto, patronal, empleados, parcial,
calculada), independiente de que exista la quincena de hoy. Sus dos tarjetas tienen tooltips
accesibles y la evolución agrupa los últimos seis meses con periodos. No cambia el contenido
archivado de boletas, snapshots, estados, cuotas ni documentos confirmados.

Oracle puede emitir ORA-01466 justo después del DDL. Las lecturas consistentes de nómina reintentan
hasta dos veces, esperando un segundo y abriendo otra lectura. No se repiten pagos/escrituras.

Validación: `npm run verify:pagos`, `npm test`, `npm run lint`, `npm run typecheck`,
`npm run build`, `npm run db:verify` y `npm run test:e2e -- --grep 'FASE V1-10'`.
Oracle/Supertest usa esquemas desechables y Node 20; no crea datos ficticios en la aplicación.

## R3-1 — Diagnóstico y corrección de pagos anteriores

Ejecutar `scripts/diagnostico-anticipos.sql` con una conexión Oracle de consulta al esquema de la
aplicación (SQL Developer o SQL*Plus). Es una única consulta de solo lectura: lista anticipos aún
pagados sin días activos del 1 al 15 o con incentivo distinto al proporcional. Usa fechas, novedades
y parámetros guardados en el snapshot, sin tomar salarios ni parámetros actuales. Muestra IDs,
código, mes, estado del periodo, días, incentivo pagado/esperado y diferencia. Los parámetros
ausentes o ambiguos se marcan para revisión; no se inventan valores de respaldo. No cubre los
errores de agregación mensual de C1.3, corregidos al consultar por el servicio de resumen mensual.

La actualización del código no modifica pagos, boletas, snapshots ni acumulados ya aceptados.
ADMIN debe revisar cada hallazgo con RH/contador antes de corregirlo:

1. Conservar el diagnóstico y revisar anticipo, pago mensual y dependencias del empleado. Documentar
   IDs, importes y motivo. El neteo de un anticipo histórico realmente confirmado se conserva hasta
   su reversión explícita; no se transforma en cero silenciosamente.
2. Si el periodo está cerrado, ADMIN lo reabre con motivo. Revertir por la interfaz los pagos
   dependientes en orden inverso, primero el Pago del mes y luego su Anticipo. Resolver también
   las dependencias fiscales posteriores o prestaciones indicadas por el sistema; no saltar bloqueos.
3. En Planilla, usar Revertir con confirmación y motivo de al menos diez caracteres. Se restituyen
   novedades/cuotas/saldos y se conserva el comprobante histórico con su auditoría. No ejecutar UPDATE/DELETE manuales.
4. Simular otra vez en orden cronológico. Si ingresó después del 15, dejar el anticipo sin registrar;
   el Pago tomará cero. Con ingreso 08/10 y salario Q9,000: anticipo Q2,533.33, devengado Q7,400.00,
   pago antes de descuentos Q4,866.67. Revisar diferencias de IGSS/ISR y los netos antes de confirmar.
5. Confirmar únicamente lo revisado, descargar las nuevas boletas y completar revisar → aprobar
   → cerrar. Repetir la consulta y comprobar que los pagos vigentes corregidos ya no aparecen.
   Si el neto es negativo (por ejemplo, un egreso temprano con anticipo ya entregado), resolverlo
   con RH/contador mediante el flujo permitido; se mantiene el bloqueo existente.
