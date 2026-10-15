import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaSimular: DefinicionAyuda = {
  id: 'simular-pago-v1-10',
  pasos: [
    {
      elemento: 'pago-objetivo',
      titulo: 'Elige qué pago revisar',
      descripcion:
        'Anticipo corresponde al día 15 e incluye la mitad del salario mensual prorrateado, la bonificación completa ajustada por ausencias y las comisiones y horas extra cargadas. No retiene descuentos. Pago del mes corresponde al último día calendario: devengado completo menos anticipo, IGSS, ISR y descuentos mensuales. La fecha es informativa y no se mueve por feriados. Bono 14 y Aguinaldo estarán disponibles en V1-11.',
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
        'La tabla suma únicamente empleados habilitados. Cada alerta explica qué completar: salario, horario, historia fiscal, vehículo/tarifa o un neto negativo. Los demás empleados se pueden pagar. Una comisión u hora pagada en el anticipo permanece en el devengado del mes y en IGSS; se resta el anticipo completo para no pagarla dos veces. Las novedades de meses anteriores se identifican como retroactivas.',
    },
    {
      elemento: 'pago-verificacion',
      titulo: 'Completa las novedades antes de confirmar',
      descripcion:
        'Los contadores indican empleados con horas extra, comisiones, consumo, ausencias, retroactivas y alertas. Compara con tus respaldos; cero significa que no hay cargas de ese tipo. Marca obligatoriamente que las novedades están completas. Cambiar datos o simular de nuevo retira esa confirmación.',
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
        'La vista previa lleva SIMULACIÓN. Tras pagar, las boletas archivadas se descargan individualmente desde Planilla o juntas en ZIP con carpetas por departamento. Ya están disponibles en el portal. Revisa, aprueba y cierra el periodo desde Planilla. Solo ADMIN puede revertir con motivo antes del cierre; primero debe revertir los pagos posteriores dependientes. La reversión devuelve cuotas y novedades, conserva el PDF histórico y retira la boleta del portal.',
    },
  ],
};
