import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaSolicitudes: DefinicionAyuda = {
  id: 'solicitudes-v1-9',
  pasos: [
    {
      elemento: 'empresa-aviso',
      titulo: 'Membrete y firma de aprobación',
      descripcion:
        'Antes de emitir PDF completa Configuración de empresa. Todos los documentos incluyen sus datos y logo si está cargado. Para aprobar, tu usuario debe estar vinculado a un expediente con nombres, apellidos y puesto activo. La firma conserva la identidad y fecha de quien aprobó.',
      roles: ['RH', 'ADMIN'],
    },
    {
      elemento: 'codigo-automatico',
      titulo: 'Código asignado por el sistema',
      descripcion:
        'La vista previa consulta el contador actual sin reservar números. Guardar asigna el código definitivo dentro de la transacción. Será permanente, también después de editar o desactivar el registro. Puedes copiarlo para localizarlo en la búsqueda del listado.',
    },
    {
      elemento: 'gestiones-accesos',
      titulo: 'Elige tu gestión',
      descripcion:
        'Los códigos internos se asignan automáticamente al guardar y se conservan al editar. Puedes buscarlos en el listado. Las boletas se descargan directamente de tu historial. Vacaciones abre el calendario laboral. Para constancias, certificados, gafete y parqueo, envía una solicitud: RRHH recibirá un aviso. No envíes otra del mismo tipo mientras esté en proceso.',
      roles: ['EMPLEADO'],
    },
    {
      elemento: 'solicitudes-nueva',
      titulo: 'Solicita un trámite',
      descripcion:
        'Indica para qué necesitas la gestión en Observaciones. Revisa y confirma antes de enviarla. El servidor identifica tu expediente desde la sesión. Para cambiar nombres, DPI, NIT o estado civil abre Mis datos: esos cambios requieren aprobación.',
      roles: ['EMPLEADO'],
    },
    {
      elemento: 'solicitudes-filtros',
      titulo: 'Busca y combina filtros',
      descripcion:
        'Filtra por tipo, estado, empleado y fecha de creación. Desde y Hasta incluyen ambos días. Los chips quitan un filtro y Limpiar restablece la consulta. Puedes ordenar columnas, avanzar de página y exportar toda la consulta a CSV.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'solicitudes-filtros',
      titulo: 'Consulta tus solicitudes',
      descripcion:
        'Abre Filtros para combinar tipo, estado y fechas de creación, ambos extremos incluidos. Los chips quitan un filtro y Limpiar vuelve a mostrar todas tus gestiones. Exportar CSV descarga tu consulta. Anterior y Siguiente recorren tus resultados; solo puedes consultar solicitudes de tu expediente.',
      roles: ['EMPLEADO'],
    },
    {
      elemento: 'solicitudes-listado',
      titulo: 'Seguimiento e historial',
      descripcion:
        'Abre Ver para consultar cada cambio, su actor y motivo. En proceso espera resolución; Rechazada muestra la razón. El documento aprobado aún espera entrega. Cuando esté Entregada recibirás un aviso y podrás descargar el PDF desde el detalle.',
    },
    {
      elemento: 'solicitud-detalle',
      titulo: 'Resuelve y entrega',
      descripcion:
        'Comprueba observaciones e historial. Rechazar exige un motivo que permita corregir el problema. Aprobar un documento exige empresa configurada y tu ficha con nombre completo y puesto; genera un PDF membretado con tu firma. Revísalo antes de Enviar y entregar. Esa acción publica el archivo y notifica al empleado; no puede repetirse.',
      roles: ['RH', 'ADMIN'],
    },
    {
      elemento: 'solicitud-detalle',
      titulo: 'Tu documento entregado',
      descripcion:
        'Revisa cada estado en el historial. Cuando RRHH entregue el documento podrás abrirlo y descargarlo. Ampliar página permite leer el PDF en móvil; Leer texto ofrece el contenido accesible. Un rechazo conserva su motivo y permite iniciar otra solicitud corregida.',
      roles: ['EMPLEADO'],
    },
    {
      elemento: 'solicitud-parqueo',
      titulo: 'Tarifa de parqueo',
      descripcion:
        'El empleado indica Carro o Moto y placa opcional. Aprobar usa la tarifa mensual configurada vigente desde el mes actual y crea una suscripción sin prorrateo. Mi parqueo permite solicitar baja; RRHH puede dar de baja o suspender al cierre del mes. Sin vehículo histórico o tarifa se bloquea y explica cómo completarlo.',
      roles: ['RH', 'ADMIN'],
    },
    {
      elemento: 'plantillas-editor',
      titulo: 'Plantillas versionadas',
      descripcion:
        'Selecciona un documento y edita el texto. Los botones insertan variables como {{nombre}} con los datos reales del expediente y empresa. No escribas datos de una persona dentro de la plantilla. Guarda con motivo: se crea una versión y los PDF ya aprobados conservan su texto original.',
      roles: ['RH', 'ADMIN'],
    },
    {
      elemento: 'mis-datos-contacto',
      titulo: 'Contacto y emergencia',
      descripcion:
        'Teléfono, correo, dirección y contacto principal se guardan directamente y quedan auditados. Usa ocho dígitos en teléfonos y un correo válido. Revisa los errores de cada campo y confirma los cambios.',
      roles: ['EMPLEADO'],
    },
    {
      elemento: 'mis-datos-criticos',
      titulo: 'Cambios de identidad',
      descripcion:
        'Nombres, DPI, NIT y estado civil requieren revisión de RRHH. Completa los valores propuestos; tu expediente se conserva hasta la aprobación. Si RRHH modifica los originales mientras tanto, será necesario enviar una nueva solicitud.',
      roles: ['EMPLEADO'],
    },
  ],
};

export const ayudaDatos: DefinicionAyuda = {
  ...ayudaSolicitudes,
  id: 'mis-datos',
  pasos: ayudaSolicitudes.pasos.filter((p) => p.elemento.startsWith('mis-datos-')),
};
