import { pasoSelectorEmpleado } from '../../../components/help/selectorEmpleado';
import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaPrestaciones: DefinicionAyuda = {
  id: 'prestaciones-v1-12',
  pasos: [
    pasoSelectorEmpleado,
    {
      elemento: 'prestaciones-secciones',
      titulo: 'Elegir la gestión de prestaciones',
      descripcion:
        'Bono 14 y aguinaldo abre la revisión y pago anual. Indemnización y finiquito calcula la baja individual; Constancias de salario prepara un documento de pagos registrados. Cambiar de sección no confirma pagos ni bajas. El historial permanece disponible debajo para consultar documentos y resultados anteriores.',
    },
    {
      elemento: 'empresa-aviso',
      titulo: 'Membrete y firma de aprobación',
      descripcion:
        'Antes de emitir PDF completa Configuración de empresa. Todos los documentos incluyen sus datos y logo si está cargado. Para aprobar, tu usuario debe estar vinculado a un expediente con nombres, apellidos y puesto activo. La firma conserva la identidad y fecha de quien aprobó.',
      roles: ['RH', 'ADMIN'],
    },
    {
      elemento: 'pago-objetivo',
      titulo: 'Ciclos y vista previa',
      descripcion:
        'Bono 14 usa julio a junio; aguinaldo diciembre a noviembre. El mes identifica julio o diciembre del año del ciclo; el desembolso usa hoy de Guatemala. Las prestaciones atrasadas aparecen Pendiente de pago y Extemporáneo: exige motivo de 10 a 500 caracteres, conservado en bitácora y PDF. Las planillas posteriores no impiden pagar ni revertir la prestación por ADMIN. La quincena cerrada conserva su estado. La pantalla precalcula al entrar; filtra el objetivo y revisa el ciclo, promedio y exención antes de confirmar. Datos faltantes, novedades pendientes y duplicados siguen bloqueando.',
    },
    {
      elemento: 'pago-extemporaneo',
      titulo: 'Motivo del pago fuera de plazo',
      descripcion:
        'El límite procede de los parámetros del ciclo original. Si la fecha real lo supera, explica el atraso con 10 a 500 caracteres. Se guarda como borrador y se exige antes de confirmar; quedará en bitácora y PDF junto con fecha real y límite. La etiqueta Pendiente de pago indica el primer día de atraso. No necesitas revertir planillas para pagar; los datos faltantes y pagos duplicados siguen bloqueando.',
    },
    {
      elemento: 'prestaciones-finiquito',
      titulo: 'Simulación de egreso',
      descripcion:
        'Al seleccionar empleado, fecha no futura y causa el desglose se calcula automáticamente. Por defecto se usa hoy; cambiar la fecha recalcula y retira la confirmación anterior. Despido injustificado incluye indemnización; renuncia y despido justificado conservan vacaciones y prestaciones proporcionales. El detalle muestra paso a paso el promedio de seis meses × años y fracción, vacaciones pendientes × salario / 30 y aguinaldo y Bono 14 proporcionales por días / 365, con exenciones. Resolver reservas posteriores es obligatorio. Confirmar guarda la liquidación, consume vacaciones, registra la baja y revoca el acceso en una transacción; el pago se registra después.',
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
