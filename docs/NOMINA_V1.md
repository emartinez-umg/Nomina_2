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
topes y tramos se leen de Oracle con su vigencia. Parámetros del Anticipo usan el corte del día 15; los del Pago, el último día (IGSS sobre toda su base mensual). ANTICIPO_PORCENTAJE se configura en BD (referencia 50).
Los meses y sus días son calendario; la fecha informativa de pago nunca se desplaza por feriados.

- SB: mensual por días de contrato con tope del divisor mensual (referencia 30); mes completo paga
  el mensual también en febrero. Una vigencia salarial intermedia distribuye la base por sus días.
- AUS = días sin goce × SB prorrateado / divisor, según A11. La captura A10 conserva su
  valoración nominal de referencia; al pagar se archiva y aplica la valoración del motor. Con goce no resta. BI = parámetro mensual × max(0, divisor − días de AUS) / divisor.
- HE: horas × salario / divisor / horas diarias del horario × (1 + recargo / 100), sin redondear
  el valor hora antes de multiplicar; se revalora al calcular y conserva cantidad/importe aplicado.
- Anticipo = porcentaje × SB + BI + comisiones + HE cargadas. Sin deducciones de ley ni cuotas.
- Pago = SB − AUS + BI + COM + HE − anticipo realmente pagado − IGSS − ISR − parqueo − tienda
  − préstamos/anticipos/embargos/otros. Sin anticipo registrado se resta cero.
- Los ingresos aplicados al anticipo integran nuevamente el devengado mensual y las bases fiscales;
  restar el anticipo completo evita pagarlos dos veces. Sus novedades no se aplican por segunda vez.
- Pendientes anteriores se etiquetan como retroactivas y tributan en el mes de aplicación.
  Aplicarlas no modifica el cálculo ni el documento del periodo original cerrado.
- ISR solo en Pago: historia real pagada v1 (o cierres/apertura v0) + mes actual + proyección de meses
  futuros. Retención = saldo ISR anual / meses restantes; diciembre/egreso liquida el saldo y devuelve
  excesos. Aguinaldo/Bono 14 conservan sus exenciones y snapshots; no se adelanta su automatización.

BI sigue literalmente A11: no se multiplica por días de contrato, solo se reduce por AUS; salario sí
se prorratea. AUS usa el SB ya prorrateado, literalmente según A11; una ausencia retroactiva toma el SB de su mes de origen.
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
No se realizan transferencias bancarias. La fecha guardada es la fecha informativa del tipo de pago.

`BOLETAS_PAGO` conserva cada PDF emitido; descargarlo después no cambia membrete, firma ni cálculo.
La descarga individual valida propiedad; el ZIP de RH/ADMIN respeta mes/objetivo y agrupa por
ID de departamento. Boletas masivas desde Planilla también usa ZIP si incluye pagos v1.
El portal, campana e Inicio muestran el pago desde la confirmación, sin esperar el cierre.

ADMIN revierte un pago vigente con motivo de al menos diez caracteres y confirmación, antes del cierre.
Primero se revierten los posteriores dependientes (incluido Pago antes de Anticipo del mismo mes).
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

Oracle puede emitir ORA-01466 justo después del DDL. Las lecturas consistentes de nómina reintentan
hasta dos veces, esperando un segundo y abriendo otra lectura. No se repiten pagos/escrituras.

Validación: `npm run verify:pagos`, `npm test`, `npm run lint`, `npm run typecheck`,
`npm run build`, `npm run db:verify` y `npm run test:e2e -- --grep 'FASE V1-10'`.
Oracle/Supertest usa esquemas desechables y Node 20; no crea datos ficticios en la aplicación.
