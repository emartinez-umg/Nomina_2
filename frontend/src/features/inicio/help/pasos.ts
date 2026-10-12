import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaInicio: DefinicionAyuda = {
  id: 'inicio',
  pasos: [
    {
      elemento: 'sidebar',
      titulo: 'Navegación del sistema',
      descripcion:
        'Este menú muestra los accesos de tu rol. El elemento verde indica la página actual. Los accesos deshabilitados explican cuándo estarán disponibles. En pantallas pequeñas, abre el menú con el botón de la barra superior.',
    },
    {
      elemento: 'buscador',
      titulo: 'Encuentra una sección',
      descripcion:
        'Escribe el nombre de una sección para filtrar los accesos del menú. El buscador no consulta datos de empleados ni información privada. Puedes limpiarlo para volver a ver todas las opciones.',
    },
    {
      elemento: 'notificaciones',
      titulo: 'Notificaciones',
      descripcion:
        'La campana abre el panel de notificaciones. Esta fase prepara su interfaz; las solicitudes y avisos reales aparecerán cuando se conecte el módulo correspondiente. No se muestra un contador de prueba.',
    },
    {
      elemento: 'usuario-menu',
      titulo: 'Tu sesión',
      descripcion:
        'Este menú muestra el usuario y rol confirmados por el servidor. Puedes cerrar tu sesión desde aquí. Por seguridad, evita dejar tu sesión abierta en equipos compartidos.',
    },
    {
      elemento: 'contenido',
      titulo: 'Administración',
      descripcion:
        'Aquí se ubicarán los accesos a usuarios, bitácora y estado del sistema. Tu rol permite administrar la plataforma. Las acciones de administración se auditan en el servidor.',
      roles: ['ADMIN'],
    },
    {
      elemento: 'contenido',
      titulo: 'Gestión de Recursos Humanos',
      descripcion:
        'Desde aquí accederás a empleados, planilla, solicitudes y vacaciones. Cada módulo validará las reglas de negocio y mostrará sus datos reales cuando sea implementado.',
      roles: ['RH'],
    },
    {
      elemento: 'contenido',
      titulo: 'Mis gestiones',
      descripcion:
        'Este es tu portal personal. Aquí podrás consultar tus boletas, solicitar documentos, gestionar vacaciones y actualizar tus datos. Solo tendrás acceso a tu propia información.',
      roles: ['EMPLEADO'],
    },
    {
      elemento: 'ayuda-global',
      titulo: 'Ayuda siempre disponible',
      descripcion:
        'Presiona Ayuda para repetir el recorrido de la página actual. Cada sección tendrá explicaciones propias. Los iconos de información junto a los campos describen el formato de cada dato.',
    },
    {
      elemento: 'cerrar-sesion',
      titulo: 'Cerrar sesión con seguridad',
      descripcion:
        'Al cerrar sesión se revoca el acceso de este navegador en el servidor y se limpia la información de la sesión en pantalla. Si la sesión vence por inactividad, el sistema te llevará al login.',
    },
  ],
};
