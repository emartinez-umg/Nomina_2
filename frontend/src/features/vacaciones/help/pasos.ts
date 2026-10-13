import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaVacaciones: DefinicionAyuda = {
  id: 'vacaciones',
  pasos: [
    {
      elemento: 'vacaciones-saldo',
      titulo: 'Saldo y kardex',
      descripcion:
        'El saldo suma meses cumplidos desde tu contratación y resta días previos y reservas aprobadas. Una solicitud en proceso todavía no descuenta. El kardex muestra el origen de cada movimiento; no incluye acumulación futura.',
      roles: ['EMPLEADO'],
    },
    {
      elemento: 'vacaciones-calendario',
      titulo: 'Selecciona tu descanso',
      descripcion:
        'Elige el primer y último día laboral. Los días atenuados son descansos según tu horario, feriados o fechas bloqueadas. Puedes incluir descansos intermedios: no consumen saldo. No cruces otra solicitud, ausencia o periodo cerrado. La selección se vuelve a revisar en el servidor.',
      roles: ['EMPLEADO'],
    },
    {
      elemento: 'vacaciones-enviar',
      titulo: 'Revisa los días',
      descripcion:
        'Compara días laborales y saldo antes de enviar. Si el saldo es insuficiente o hay un traslape, el botón explica el bloqueo. RRHH recibirá una notificación y revisará el saldo vigente al aprobar.',
      roles: ['EMPLEADO'],
    },
    {
      elemento: 'vacaciones-carga',
      titulo: 'Historia anterior',
      descripcion:
        'Selecciona un empleado para consultar su saldo y kardex. Carga días ya tomados con referencia y motivo, o un saldo disponible certificado al día de hoy. La apertura se permite una sola vez antes de otros ajustes o disfrutes; sustituye la historia anterior y conserva los aniversarios de contratación.',
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
        'Revisa fechas, días y estado. RRHH ve el saldo actual en verde cuando alcanza y rojo cuando no. Aprobar revalida horarios, saldo, fechas y traslapes, y descuenta una sola vez. Rechazar exige explicar el motivo y notifica al empleado. El kardex y los estados se conservan.',
    },
  ],
};
