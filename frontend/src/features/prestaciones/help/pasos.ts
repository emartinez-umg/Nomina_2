import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaPrestaciones: DefinicionAyuda = {
  id: 'prestaciones',
  pasos: [
    {
      elemento: 'prestaciones-calculo',
      titulo: 'Ciclos y vista previa',
      descripcion:
        'Bono 14 usa julio a junio; aguinaldo diciembre a noviembre. El año identifica el final del ciclo. Filtra un empleado o departamento, revisa importes por persona y los errores antes de guardar. El promedio incluye los conceptos afectos y comisiones reales; la bonificación incentivo conserva su bandera. Una fuente faltante o novedad pendiente bloquea el cálculo.',
    },
    {
      elemento: 'prestaciones-finiquito',
      titulo: 'Simulación de egreso',
      descripcion:
        'Selecciona empleado, fecha no futura y causa. Despido injustificado incluye indemnización; renuncia y despido justificado conservan vacaciones y prestaciones proporcionales. El detalle muestra promedio de seis meses, tiempo trabajado, saldo de vacaciones y exenciones. Resolver reservas posteriores es obligatorio. Confirmar guarda la liquidación, consume vacaciones, registra la baja y revoca el acceso en una transacción; el pago se registra después.',
    },
    {
      elemento: 'prestaciones-constancia',
      titulo: 'Constancia de salario',
      descripcion:
        'Selecciona empleado y rango de fechas de pago. El PDF incluye ingresos brutos de nóminas cerradas y prestaciones pagadas; los periodos abiertos no acreditan pagos. Completa la empresa en Planilla. Vista previa y descarga usan datos reales y quedan auditadas.',
    },
    {
      elemento: 'prestaciones-filtros',
      titulo: 'Historial y exportación',
      descripcion:
        'Combina búsqueda, empleado, departamento, tipo, estado y fechas del ciclo. Los chips quitan filtros individuales. El orden y las páginas se resuelven en Oracle; CSV exporta toda la consulta, hasta 10,000 registros.',
    },
    {
      elemento: 'prestaciones-historial',
      titulo: 'Aprobar y registrar pago',
      descripcion:
        'Abre un registro para revisar componentes y generar PDF. Aprobar revalida las fuentes; pagar exige fecha real no futura, referencia y motivo. El documento distingue pendiente de pago de pago registrado. Los cambios de fuente requieren anular y calcular de nuevo; un pagado queda protegido. En finiquito, paga antes de cerrar la nómina final para incorporar las bases fiscales.',
    },
    {
      elemento: 'prestaciones-confirmar',
      titulo: 'Confirmación y trazabilidad',
      descripcion:
        'Revisa el importe y explica el motivo con al menos diez caracteres. Guardar un cálculo no registra pago. Confirma solo después de revisar el detalle. Si cambió un salario, novedad o saldo, el servidor exige otra vista previa. Cada transición se audita con el actor y la misma transacción.',
      roles: ['RH'],
    },
    {
      elemento: 'prestaciones-confirmar',
      titulo: 'Control administrativo',
      descripcion:
        'Los pagos y liquidaciones conservan snapshots. Un cierre usado por prestaciones no puede reabrirse mientras existan cálculos vigentes que lo referencien. Las operaciones de anulación requieren motivo y nunca borran el historial. El pago no transfiere dinero automáticamente.',
      roles: ['ADMIN'],
    },
  ],
};
