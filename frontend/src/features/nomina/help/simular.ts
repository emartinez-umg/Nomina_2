import { pasoSelectorEmpleado } from '../../../components/help/selectorEmpleado';
import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaSimular: DefinicionAyuda = {
  id: 'simular-pago-extemporaneo-r33',
  pasos: [
    pasoSelectorEmpleado,
    {
      elemento: 'pago-objetivo',
      titulo: 'Elige qué pago revisar',
      descripcion:
        'Los empleados sin salario vigente se excluyen con alerta de Perfil incompleto; completa el salario desde la ficha y vuelve a simular. Anticipo corresponde al día 15: salario mensual × días activos del 1 al 15 / divisor mensual. Sin días activos se informa «Sin anticipo»; no es un bloqueo ni genera pago o boleta. La bonificación del mes es proporcional a días activos menos ausencias sin goce; en el anticipo se entrega bonificación mensual × días activos del 1 al 15 / 15, limitada a la bonificación del mes. Con mes completo conserva medio salario y bonificación completa. Se suman las comisiones y horas extra cargadas, sin retener descuentos. Pago del mes liquida el devengado menos anticipo realmente pagado, IGSS, ISR y descuentos. La fecha no se mueve por feriados. Bono 14 se paga en julio y Aguinaldo en diciembre; la indemnización individual está en Prestaciones.',
    },
    {
      elemento: 'pago-simular',
      titulo: 'Simular no guarda ni aplica novedades',
      descripcion:
        'Selecciona mes y empleado, departamento o todos. Para Bono 14 elige julio y para Aguinaldo diciembre del año del ciclo, aunque se pague hoy. Se conserva el periodo legal original; las planillas posteriores no cambian el promedio ni impiden pagar. Anticipo y Pago del mes mantienen el bloqueo por orden cronológico. Simular consulta fuentes reales sin guardarlas. Cambiar objetivo descarta resultados y confirmación. Un pago ya registrado permanece bloqueado; no se duplica.',
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
      elemento: 'pago-extemporaneo',
      titulo: 'Regularizar una prestación atrasada',
      descripcion:
        'Si hoy supera el límite legal configurado, aparece Extemporáneo y Pendiente de pago con el primer día de atraso. Escribe el motivo con 10 a 500 caracteres; se guarda como borrador y se exige al confirmar. Fecha real, límite y motivo quedan en bitácora y comprobante PDF. No se modifican las planillas pagadas. Si cambia el día, vuelve a simular. ADMIN puede revertir esta prestación con motivo sin revertir planillas, incluso con la quincena cerrada; se conservan documentos y versiones anteriores.',
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
        'La vista previa lleva SIMULACIÓN. Las boletas regulares tienen dos copias en una hoja carta; las prestaciones muestran su ciclo y, si corresponde, la leyenda Extemporáneo con fecha, límite y motivo. En el ZIP cada archivo añade el código del empleado. Tras pagar, descarga desde Planilla o el portal. Solo ADMIN revierte con motivo. Anticipo y Pago requieren hacerlo antes del cierre y en orden inverso. Bono 14 y Aguinaldo son independientes de las planillas, incluso cerradas; un finiquito que usa la prestación conserva su protección. Se mantiene el PDF histórico y se retira la boleta del portal.',
    },
  ],
};
