# Prestaciones automáticas — V1-11 / A12

RH/ADMIN dispone de Bono 14 y Aguinaldo en **Nómina → Simular pago** y en **Prestaciones**.
La pantalla de Prestaciones consulta automáticamente la prestación disponible del año al abrirse
(julio: Bono 14; diciembre: Aguinaldo). Consultar no registra cálculos ni desembolsos.
Indemnización/finiquito es individual; **Liquidar y dar de baja** abre el empleado seleccionado.

## Cálculos y fuentes

- Bono 14: 1 julio–30 junio. Aguinaldo: 1 diciembre–30 noviembre. Ciclos, fecha límite,
  porcentajes, meses de promedio, divisor mensual y límite exento proceden de parámetros Oracle.
- Promedio mensual = ingresos afectos a prestaciones / meses equivalentes de contrato.
  Incluye salario con sus aumentos, comisiones y horas extra; resta ausencias sin goce afectas.
  Bonificación incentivo respeta la bandera del concepto, inicialmente excluida.
- Menos de un año: promedio × días calendario inclusivos / PRESTACIONES_DIAS_ANIO (referencia 365).
  Un año o más: 100 % del promedio de los últimos doce meses; nunca supera el 100 % en bisiestos.
  Ejemplo: enero–junio 2026 son 181 días. Salario Q3,000 constante produce Q1,487.67.
  Tres meses Q3,000, tres Q5,000 y Q1,800 de comisión: promedio Q4,300, pago Q2,132.33.
- V1 consulta contrato, salarios y libro mensual. El pago mensual conserva sus importes/banderas
  archivados; el anticipo no se suma de nuevo. Una comisión retroactiva pertenece al mes de origen.
  Cargas adicionales al snapshot se incorporan sin duplicar las ya archivadas. Sin pago previo,
  se calcula desde fuentes reales; no requiere aperturas fiscales para calcular prestaciones.
- Historia v0 conserva sus snapshots cerrados y motor quincenal. No se modifican sus importes.
  Salarios/parámetros sin vigencia, novedades pendientes y historia incoherente producen un error
  que indica qué completar; nunca se inventan ingresos ni vigencias históricas.
- Horas extra aún no pagadas se valoran con salario/horario y recargo vigentes al corte.
  Una carga mensual se atribuye al cierre del mes o al corte de baja, sin dividir comisiones por días.
- Indemnización: promedio de los últimos seis meses (desde ingreso si es posterior) × años y
  fracción por aniversarios. El corte incluye su último día. Se conserva la convención previa
  de fracción sobre la duración real del año de aniversario, incluidos bisiestos.
- Finiquito suma indemnización por despido injustificado, vacaciones pendientes × salario / divisor
  mensual, aguinaldo y Bono 14 proporcionales. Renuncia/despido justificado dejan indemnización cero.
  Las vacaciones se consultan al corte desde el saldo A9, incluidos sus decimales. Los pagos anuales
  anteriores se descuentan de la obligación cuando corresponden al mismo ciclo.
- Dinero usa Decimal y redondeo half-up a dos decimales. Promedios/fracciones se calculan con
  precisión interna; el desglose muestra rango, promedio, días, fórmula, importe y base fiscal.

## Revisión, pago y baja

1. Seleccionar tipo, mes y objetivo (empleado/departamento/todos). Solo julio para Bono 14 y
   diciembre para Aguinaldo según configuración. Simular devuelve filas, totales, alertas, contadores
   de fuentes del ciclo y PDF con **SIMULACIÓN**. No consume novedades ni cuotas de nómina.
2. Revisar historia salarial, comisiones/HE y exenciones; marcar la casilla obligatoria y confirmar.
   El servidor recalcula y compara SHA-256. Un cambio exige nueva simulación.
3. Confirmar guarda PRESTACIONES/detalle, NOMINA_EMPLEADO, firma RH, PDF inmutable, notificación
   y auditoría en la misma transacción. UNIQUE empleado/mes/tipo, bloqueo y conflictos de ciclo
   previenen duplicados. Se conservan las filas bloqueadas sin cobrar.
4. Boletas individuales y ZIP por departamento; publicación inmediata en el portal propio.
   El PDF archivado también se devuelve desde el historial de Prestaciones. No transfiere dinero.
5. ADMIN puede revertir con motivo antes del cierre, después de resolver pagos/finiquitos dependientes.
   La prestación queda ANULADA, el PDF anterior se conserva y volver a pagar crea otra versión.
   Un pago mensual del mismo mes consume sus bases fiscales: hay que revertirlo antes de añadir
   o revertir una prestación anual. Si hay anticipos salariales, cerrar exige completar todos. Un periodo que contiene solo prestaciones anuales se cierra sin forzar anticipos; las novedades del salario se revisan en su pago mensual.
6. Finiquito se calcula automáticamente al elegir empleado/fecha/causa, por defecto hoy de Guatemala.
   PDF de simulación disponible antes de confirmar. Fecha no futura y no anterior al ingreso;
   reservas posteriores, prestaciones pendientes y ciclos anteriores sin registrar pago bloquean la baja.
   Confirmar con motivo guarda liquidación aprobada, debita vacaciones, registra baja y revoca acceso
   en una transacción. Su pago se registra en el historial, antes del cierre de la nómina final.

La exención anual se limita al sueldo mensual × parámetro de meses exentos, menos lo consumido
por el mismo tipo/año. Solo el excedente y vacaciones pagadas entran al ISR mensual; no se retiene
ISR ni IGSS al desembolsar la prestación. Indemnización conserva su tratamiento exento.
La historia fiscal excluye las boletas anuales del salario mensual y toma el excedente desde
PRESTACION_DETALLE, una sola vez. IGSS excluye boletas anuales y anticipos.

Las operaciones históricas calcular → aprobar → registrar pago siguen disponibles para registros
v0 y su regularización; las nuevas pantallas anuales usan la confirmación integrada de A11.

## API y documentos

`/api/nomina/simular`, `/simular/:id/pdf`, `/pagar`, `/pagos/:id/revertir`, `/pagos/zip` aceptan
los tipos ANTICIPO, PAGO, BONO_14 y AGUINALDO. Se mantienen RBAC, propiedad del portal y CSRF.
`/api/prestaciones/simular` consulta finiquito; `/simular/pdf` genera su preview sin baja;
`/liquidar` confirma con selección/hash/motivo. Listado, filtros, detalle, CSV, transiciones y
constancias conservan sus endpoints anteriores. Zod estricto y binds en todas las consultas.

Todos los PDF usan shared/pdf: membrete de empresa, logo opcional, pie/paginación, identidad y
fecha de aprobación RH conservadas. La constancia filtra por fecha de pago, incluye salarios de
nóminas cerradas y componentes salariales de prestaciones pagadas, excluyendo indemnización.
Las prestaciones anuales no duplican el salario de esa constancia.

## Decisiones y verificación

A12 pide incluir comisiones/HE y usar promedio × tiempo para indemnización: no se añaden alícuotas
al promedio ni modalidades de pago externas al alcance solicitado. RH configura vigencias reales
históricas antes de liquidar si faltan; no hay respaldos de parámetros inventados en código.

La exención conserva los límites del [Decreto 10-2012, artículo 70](https://www.tse.org.gt/images/UECFFPP/leyes/decreto_10-2012_Ley_actualizacion_tributaria.pdf).
Se contrastaron también las fuentes de [Bono 14 del MINTRAB](https://www.mintrabajo.gob.gt/doc/Ley_de_Bonificacin_Anual_Para_Trabajadores_del_Sector_Privado_y_Pblico_Decreto_42-92.pdf)
y [aguinaldo del Congreso](https://www.congreso.gob.gt/detalle_pdf/decretos/2730), el 15/10/2026.
Las fórmulas implementadas siguen el alcance explícito A12 del proyecto.

Verificar con npm run lint, npm run typecheck, npm test, npm run build, npm run format:check,
npm run db:verify, npm run verify:prestaciones, npm run verify:pagos y
npm run test:e2e -- --grep 'FASE V1-11'. Oracle/E2E usan esquemas temporales; PDFs QA en tmp/pdfs.
V030 amplía tipos de pago y vincula boletas a prestaciones sin alterar migraciones ni datos previos.
