import { pasoSelectorEmpleado } from '../../../components/help/selectorEmpleado';
import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaSimular: DefinicionAyuda = {
  id: 'simular-pago-acumulados-automaticos',
  pasos: [
    pasoSelectorEmpleado,
    {
      elemento: 'pago-objetivo',
      titulo: 'Elige qué pago revisar',
      descripcion:
        'Los empleados sin salario vigente se excluyen con alerta de Perfil incompleto; los demás pueden pagarse. Completa el salario desde la ficha y vuelve a simular. Anticipo corresponde al día 15 e incluye la mitad del salario mensual prorrateado, la bonificación completa ajustada por ausencias y las comisiones y horas extra cargadas. No retiene descuentos. Pago del mes corresponde al último día calendario: devengado completo menos anticipo, IGSS, ISR y descuentos mensuales. La fecha es informativa y no se mueve por feriados. Bono 14 se paga en julio y Aguinaldo en diciembre. Se calculan desde contratación con promedio de salario, comisiones y horas extra del ciclo, proporcional por días / 365 hasta completar un año. La indemnización individual está en Prestaciones.',
    },
    {
      elemento: 'pago-simular',
      titulo: 'Simular no guarda ni aplica novedades',
      descripcion:
        'Selecciona mes y empleado, departamento o todos. Simular consulta salarios, horarios, parámetros y novedades reales. Puedes corregir fuentes y simular cuantas veces necesites. Cambiar objetivo descarta los resultados y su confirmación. Un pago ya registrado aparece bloqueado; no se duplica.',
    },
    {
      elemento: 'pago-resultados',
      titulo: 'Revisa importes y bloqueos por empleado',
      descripcion:
        'La tabla suma únicamente empleados habilitados. La historia fiscal faltante se estima automáticamente desde enero o el ingreso, usando las vigencias de salario, incentivo y parámetros. Las aperturas y los pagos registrados tienen prioridad. Revisa el bloque Acumulados fiscales automáticos: muestra renta, IGSS e ISR teórico de los intervalos faltantes. Es una estimación académica de salario e incentivo, sin inventar pagos anteriores ni novedades externas. Cada alerta explica qué completar: salario, horario, vehículo/tarifa o un neto negativo. Una comisión u hora pagada en el anticipo permanece en el devengado mensual y en IGSS; se resta el anticipo completo para no pagarla dos veces.',
    },
    {
      elemento: 'nomina-acumulados',
      titulo: 'Acumulados calculados automáticamente',
      descripcion:
        'Este bloque aparece cuando faltan periodos fiscales anteriores. Abre el desglose para revisar renta, IGSS e ISR teórico por empleado. Al abrir una boleta puedes revisar cada intervalo estimado. Las vigencias salariales permiten considerar aumentos e ingresos parciales. No se crean pagos pasados ni aperturas certificadas; los datos ya registrados conservan prioridad. La estimación se conserva con la boleta para los meses siguientes.',
    },
    {
      elemento: 'pago-verificacion',
      titulo: 'Completa las novedades antes de confirmar',
      descripcion:
        'Los contadores indican empleados con horas extra, comisiones, consumo, ausencias, retroactivas y alertas. Revisa también los acumulados automáticos si aparecen; abre el desglose para ver importes por empleado. No necesitas capturar una apertura individual para esta simulación académica. Para prestaciones, revisa la historia salarial completa del ciclo y las bases exenta y gravada. Marca que las fuentes están completas. Cambiar datos o simular de nuevo retira esa confirmación.',
    },
    {
      elemento: 'pago-confirmar',
      titulo: 'Confirmar y pagar',
      descripcion:
        'Revisa el objetivo y confirma la operación. El servidor vuelve a calcular y rechaza si cambiaron fuentes o pagos desde la simulación. Guarda cálculo y boleta membretada, aplica novedades/cuotas y notifica al empleado en una sola transacción. El botón permanece bloqueado durante el envío. Si se corta la respuesta, consulta el historial antes de volver a pagar.',
    },
    {
      elemento: 'pago-descargas',
      titulo: 'Boletas, cierre y reversión',
      descripcion:
        'La vista previa lleva SIMULACIÓN en ambas copias. Las boletas regulares tienen dos copias idénticas en una hoja carta y se nombran con las fechas reales del periodo; el anticipo agrega Anticipo al inicio del nombre. En el ZIP cada archivo añade el código del empleado. Tras pagar, las boletas archivadas se descargan individualmente desde Planilla o juntas en ZIP con carpetas por departamento. Ya están disponibles en el portal. Revisa, aprueba y cierra el periodo desde Planilla. Solo ADMIN puede revertir con motivo antes del cierre; primero debe revertir los pagos posteriores dependientes. La reversión devuelve cuotas y novedades, conserva el PDF histórico y retira la boleta del portal.',
    },
  ],
};
