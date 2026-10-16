import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaVacaciones: DefinicionAyuda = {
  id: 'vacaciones-v1-8',
  pasos: [
    {
      elemento: 'vacaciones-cancelar',
      titulo: 'Cancelar y recuperar días',
      descripcion:
        'Solo puedes cancelar una aprobación antes de su día de inicio y fuera de periodos cerrados. Escribe un motivo de al menos diez caracteres y confirma. Se devuelve exactamente el débito original, aunque después haya cambiado el horario o un feriado. El historial conserva solicitante, aprobación y cancelación con sus usuarios y fechas. Repetir no devuelve días otra vez. Si ya comenzó, el servidor bloquea la acción.',
    },
    {
      elemento: 'codigo-automatico',
      titulo: 'Código de solicitud',
      descripcion:
        'El sistema asigna SOL, el año y un contador al enviar la solicitud, dentro de la misma transacción. La vista previa no reserva el número. El código definitivo aparece en el historial y permanece al aprobar, rechazar o cancelar. Puedes buscarlo para localizar tu trámite.',
    },
    {
      elemento: 'vacaciones-resolver',
      titulo: 'Resolver con el saldo actual',
      descripcion:
        'Comprueba empleado, rango y días laborales. Verde indica saldo suficiente; rojo explica el bloqueo y no permite aprobar. Confirmar aprobación vuelve a validar horario, feriados, saldo y traslapes y registra un único débito. Cancelar antes del inicio devuelve el débito original y conserva el aprobador. Rechazar exige un motivo útil para el empleado y conserva el historial sin descontar. Una aprobación simultánea puede cambiar el saldo: actualiza antes de volver a intentar.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'vacaciones-saldo',
      titulo: 'Saldo y kardex',
      descripcion:
        'Acumulados = meses completos desde la contratación × tasa mensual configurada (referencia 1.25). Se restan tomados/aprobados y previas para obtener disponibles con dos decimales. Solicitables redondea hacia abajo: 5 meses = 6.25 disponibles y 6 días completos solicitables. La fracción permanece para meses siguientes. Consultar actualiza el cálculo sin crear movimientos; una solicitud pendiente no reserva días. El kardex conserva consumos, devoluciones y ajustes históricos.',
    },
    {
      elemento: 'vacaciones-calendario',
      titulo: 'Selecciona tu descanso',
      descripcion:
        'Elige inicio y fin del rango, incluso si son descansos. Solo se cuentan días laborales según el horario vigente de cada fecha, excluyendo feriados. Del 1 al 15 de noviembre de 2026, Lun–Vie consume 10 días sin feriados laborales. Fechas pasadas, sin horario o bloqueadas no se seleccionan. No cruces otra solicitud, ausencia o periodo cerrado. La selección se vuelve a revisar en el servidor.',
      roles: ['EMPLEADO'],
    },
    {
      elemento: 'vacaciones-enviar',
      titulo: 'Revisa los días',
      descripcion:
        'Compara los días laborales con los solicitables enteros antes de enviar: 6.25 disponibles permiten hasta 6 días, nunca 7. Si el saldo es insuficiente o hay un traslape, el botón explica el bloqueo. RRHH recibirá una notificación y revisará el saldo vigente al aprobar.',
      roles: ['EMPLEADO'],
    },
    {
      elemento: 'vacaciones-carga',
      titulo: 'Historia anterior',
      descripcion:
        'Selecciona un empleado para ver acumulados, tomados/aprobados, disponibles decimales, solicitables enteros y kardex. Se actualizan al abrir, al volver a la ventana, cada minuto y tras operaciones. Carga días ya tomados con referencia y motivo, o un saldo disponible certificado al día de hoy. La apertura se permite una sola vez antes de otros ajustes o disfrutes; sustituye la historia anterior y conserva los aniversarios de contratación.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'vacaciones-filtros',
      titulo: 'Busca solicitudes',
      descripcion:
        'Combina empleado, estado y fechas. Desde/Hasta incluyen solicitudes que intersectan el rango. Los chips permiten quitar filtros; la exportación descarga toda la consulta y la paginación se procesa en el servidor.',
    },
    {
      elemento: 'vacaciones-bandeja',
      titulo: 'Historial y resolución',
      descripcion:
        'Revisa fechas, días y estado. RRHH ve el saldo actual en verde cuando alcanza y rojo cuando no. Aprobar revalida horarios, saldo, fechas y traslapes, y descuenta una sola vez. Rechazar exige explicar el motivo y notifica al empleado. Ver solicitud consulta otra vez el saldo y el calendario antes de decidir. Conserva solicitante, fechas, días aprobados, aprobador y fecha. Cancelar vacaciones exige motivo y confirmación, solo antes del día de inicio y fuera de periodos cerrados; devuelve el débito original una sola vez y conserva aprobación y cancelación. No se recalculan los días devueltos con un horario nuevo.',
    },
  ],
};
