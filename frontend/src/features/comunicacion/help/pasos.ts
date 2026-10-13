import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaComunicacion: DefinicionAyuda = {
  id: 'comunicacion',
  pasos: [
    {
      elemento: 'calendario-eventos',
      titulo: 'Agenda mensual',
      descripcion:
        'Cambia de mes y selecciona un día marcado para ver todos sus eventos, incluidos los que abarcan varios días. La agenda consulta el mes completo independientemente de la página del listado. Las horas son locales de Guatemala.',
    },
    {
      elemento: 'calendario-eventos',
      titulo: 'Crear desde el calendario',
      roles: ['RH', 'ADMIN'],
      descripcion:
        'Selecciona la fecha y presiona Crear evento en esta fecha. Completa inicio, fin, horas y lugar. No se crean eventos en el pasado; el servidor vuelve a comparar con su reloj de Guatemala. Los eventos iniciados conservan su historia y no se editan.',
    },
    {
      elemento: 'comunicacion-filtros',
      titulo: 'Buscar y combinar filtros',
      descripcion:
        'Abre Filtros para buscar por título o rango. El rango incluye las publicaciones que lo intersectan. Los chips muestran los filtros enviados al servidor; quítalos uno a uno o limpia todos. Exportar CSV descarga toda la consulta, no solo la página visible, con un máximo de 10,000 publicaciones.',
    },
    {
      elemento: 'comunicacion-filtros',
      titulo: 'Filtrar destinatarios y eliminados',
      roles: ['RH', 'ADMIN'],
      descripcion:
        'Estado distingue activos y eliminados; alcance distingue todos y grupos. Para filtrar una audiencia elige departamento, puesto o jefatura y luego el grupo concreto. Los empleados siempre reciben una consulta restringida a su identidad y vigencia, aunque cambien los filtros.',
    },
    {
      elemento: 'comunicacion-listado',
      titulo: 'Consultar publicaciones',
      descripcion:
        'Ver abre el texto completo. Los títulos y fechas se pueden ordenar desde su cabecera; Anterior y Siguiente consultan páginas del servidor. Un anuncio incluye los dos días de vigencia. Los eventos del empleado se muestran mientras su fin no haya pasado.',
    },
    {
      elemento: 'comunicacion-listado',
      titulo: 'Edición y eliminación',
      roles: ['RH', 'ADMIN'],
      descripcion:
        'Editar conserva el identificador y crea una nueva versión. Si alguien guardó antes, recarga para evitar sobrescribir sus cambios. Eliminar requiere motivo y confirmación; retira la publicación y sus avisos, conserva auditoría y no permite edición posterior.',
    },
    {
      elemento: 'comunicacion-formulario',
      titulo: 'Completar publicación',
      roles: ['RH', 'ADMIN'],
      descripcion:
        'Escribe título y contenido; el texto se muestra sin interpretar HTML. Anuncios permite programar vigencia. Eventos exige fecha y hora futuras, lugar y fin igual o posterior al inicio. Los campos se validan al salir y el resumen indica qué corregir antes de guardar.',
    },
    {
      elemento: 'destinatarios',
      titulo: 'Todos o varios grupos',
      roles: ['RH', 'ADMIN'],
      descripcion:
        'Todos llega a empleados activos con usuario activo. Desmárcalo para buscar grupos y presiona Agregar grupo por cada selección. Los grupos se unen: basta pertenecer a uno, y pertenecer a varios no duplica avisos. Quitar retira una selección. Guardar y notificar confirma contenido, grupos y avisos juntos. Los anuncios programados avisan ahora y se ven en el portal durante su vigencia.',
    },
    {
      elemento: 'comunicacion-detalle',
      titulo: 'Leer el contenido completo',
      descripcion:
        'Consulta el texto, vigencia o inicio y fin, y ubicación del evento. Tu acceso se comprueba de nuevo en el servidor. Si cambió la audiencia, se eliminó o dejó de estar vigente, el empleado ya no puede abrirlo.',
    },
  ],
};
