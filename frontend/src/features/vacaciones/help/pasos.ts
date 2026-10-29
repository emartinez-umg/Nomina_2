import { pasoSelectorEmpleado } from '../../../components/help/selectorEmpleado';
import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaVacaciones: DefinicionAyuda = {
  id: 'vacaciones-r3-6',
  pasos: [
    pasoSelectorEmpleado,
    {
      elemento: 'vacaciones-colisiones',
      titulo: 'Ausencias que coinciden',
      descripcion:
        'La advertencia ámbar lista solicitudes aprobadas (también en curso) y en proceso de otros empleados del mismo departamento o centro. Ambos indica que coinciden los dos; un centro vacío no coincide. Rechazadas, canceladas y tomadas se excluyen. La línea de tiempo usa días naturales inclusivos: no modifica los días laborales descontados. El máximo cuenta personas únicas, incluida esta solicitud, sobre la unión del departamento y centro, sin duplicados; las pendientes son ausencias potenciales. Puedes consultar la tabla diaria. Aprobar de todos modos confirma la advertencia y guarda una copia en la aprobación y bitácora; si cambia antes de guardar, revisa y confirma nuevamente. El saldo insuficiente siempre bloquea. Esta información es exclusiva de RRHH y ADMIN y no se envía al empleado.',
      roles: ['ADMIN', 'RH'],
    },
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
        'Comprueba empleado, rango y días laborales. Verde indica saldo suficiente; rojo explica el bloqueo y no permite aprobar. Las colisiones de otros empleados generan una advertencia ámbar que permite Aprobar de todos modos con confirmación y copia auditada. Confirmar vuelve a validar horario, feriados, saldo y traslapes propios y registra un único débito. Cancelar antes del inicio devuelve el débito original y conserva el aprobador. Rechazar exige un motivo útil para el empleado y conserva el historial sin descontar. Una aprobación simultánea puede cambiar el saldo: actualiza antes de volver a intentar.',
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
      titulo: 'Filtrar colisiones',
      descripcion:
        'Con colisiones filtra en el servidor antes de paginar: incluye solo solicitudes con al menos otra solicitud coincidente del mismo departamento o centro. La insignia ⚠ N colisiones cuenta solicitudes, mientras que el resumen del detalle cuenta personas únicas. El filtro también se aplica al CSV. Quita su chip o usa Limpiar filtros para volver al listado general. El empleado no recibe estos conteos ni puede consultar este filtro.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'vacaciones-filtros',
      titulo: 'Busca solicitudes',
      descripcion:
        'Combina empleado, estado y fechas. Desde/Hasta incluyen solicitudes que intersectan el rango. Desde Vacaciones del dashboard se aplican el empleado y las fechas, mostrando todos sus estados para conservar solicitudes aprobadas o tomadas. Los chips permiten quitar filtros; la exportación descarga toda la consulta y la paginación se procesa en el servidor.',
    },
    {
      elemento: 'vacaciones-bandeja',
      titulo: 'Historial y resolución',
      descripcion:
        'Revisa fechas, días y estado. RRHH ve el saldo actual en verde cuando alcanza y rojo cuando no. Aprobar revalida horarios, saldo, fechas y traslapes, y descuenta una sola vez. Rechazar exige explicar el motivo y notifica al empleado. Ver solicitud consulta otra vez el saldo y el calendario antes de decidir. Conserva solicitante, fechas, días aprobados, aprobador y fecha. Cancelar vacaciones exige motivo y confirmación, solo antes del día de inicio y fuera de periodos cerrados; devuelve el débito original una sola vez y conserva aprobación y cancelación. No se recalculan los días devueltos con un horario nuevo.',
    },
  ],
};
