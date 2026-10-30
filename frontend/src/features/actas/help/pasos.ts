import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
function construirAyudaActas(empleado = false): DefinicionAyuda {
  return {
    id: empleado ? 'mis-actas' : 'actas-administrativas',
    pasos: [
      {
        elemento: 'actas-listado',
        titulo: empleado ? 'Mis actas' : 'Actas y trazabilidad',
        descripcion: empleado
          ? 'Solo aparecen tus actas que ya fueron emitidas. Consulta su estado, documento y firma sin modificar registros. Los permisos de jefe no permiten ver actas de otras personas.'
          : 'RH y ADMIN gestionan las actas. Abre un registro para consultar sus hechos, PDF original, adjuntos e historial con actor y fecha. No hay eliminación física. Tras emitir, el contenido queda bloqueado.',
      },
      {
        elemento: 'actas-filtros',
        titulo: 'Filtros combinados',
        descripcion:
          'Busca por código o nombre y filtra por estado y fechas del hecho; Desde y Hasta incluyen ambos días. RH también filtra por tipo, departamento y empleado. Al cambiar departamento el selector retira un empleado ajeno. Los filtros se conservan en la dirección de la página; los chips permiten retirarlos y Limpiar vuelve al listado completo.',
      },
      ...(!empleado
        ? [
            {
              elemento: 'actas-empleado',
              titulo: 'Empleado y antecedentes',
              descripcion:
                'Selecciona departamento y empleado por nombre o código. Revisa las actas de los últimos doce meses antes de documentar un hecho. El empleado de un acta guardada permanece fijo. La fecha del hecho debe estar entre su ingreso y hoy; el servidor la vuelve a comprobar al guardar y emitir.',
            },
            {
              elemento: 'actas-hechos',
              titulo: 'Documentar los hechos',
              descripcion:
                'Describe de 30 a 4,000 caracteres, indicando lugar, norma y medida adoptada; agrega testigos y descargos si existen. Usa información verificable y revisa antes de emitir. Los borradores del navegador conservan texto por usuario; archivos y confirmaciones se eligen de nuevo. Guardar crea un Borrador en el servidor.',
            },
            {
              elemento: 'actas-suspension',
              titulo: 'Suspensión y nómina',
              descripcion:
                'El tipo de suspensión exige entre uno y el máximo de días vigente. Revisa la advertencia y la política interna con RH. Al emitir puedes confirmar una ausencia sin goce, con inicio y fin calculado por días calendario inclusivos. Usa las validaciones normales de salario, traslapes y periodos abiertos. Emisión y ausencia se confirman juntas. Anular el acta no revierte una ausencia ni un pago: revisa el vínculo en Novedades.',
            },
            {
              elemento: 'actas-acciones',
              titulo: 'Emitir, firmar o anular',
              descripcion:
                'Emitir requiere empresa configurada y nombre completo/cargo del emisor RH en su ficha. Genera un PDF inmutable con la plantilla vigente y notifica al empleado. Descarga o imprime para recabar la firma. Cargar el escaneo con confirmación marca Firmada; Se negó a firmar requiere identificar testigos presentes. Anular exige motivo y conserva PDF, adjuntos e historial.',
            },
            {
              elemento: 'actas-adjuntos',
              titulo: 'Archivos privados',
              descripcion:
                'Guarda primero el borrador y adjunta evidencias PDF, JPG o PNG, hasta el límite mostrado. Después de emitir solo se admite el escaneo de la firma; su carga cambia el estado en la misma operación. Los archivos no se guardan en el navegador. Visualizar y descargar se autorizan y auditan cada vez.',
            },
            {
              elemento: 'actas-plantilla',
              titulo: 'Plantilla editable',
              descripcion:
                'Edita el texto y conserva las variables disponibles para incluir todos los datos. La línea Recibí conforme y el nombre/cargo del emisor se agregan automáticamente. Explica el motivo y confirma la nueva versión. Las actas ya emitidas conservan su PDF original.',
            },
          ]
        : [
            {
              elemento: 'actas-hechos',
              titulo: 'Consulta del acta',
              descripcion:
                'Revisa la fecha, el lugar, los hechos, los descargos y la medida. El documento se conserva como fue emitido por RH. Una anulación se indica junto al motivo y mantiene el documento como antecedente.',
            },
            {
              elemento: 'actas-acciones',
              titulo: 'Documento emitido',
              descripcion:
                'Ver PDF muestra la vista privada. Descargar e Imprimir obtienen de nuevo el PDF con tu sesión y registran el acceso. En la ventana de impresión usa la función Imprimir del navegador. No puedes cambiar contenido, estado ni adjuntar archivos.',
            },
            {
              elemento: 'actas-adjuntos',
              titulo: 'Firma y seguimiento',
              descripcion:
                'Consulta las evidencias y, cuando RH la haya cargado, la copia firmada. Historial muestra las decisiones desde la emisión, su fecha y responsable. Si necesitas una aclaración, contacta a RH.',
            },
          ]),
    ],
  };
}

const gestion = construirAyudaActas(false);
const propias = construirAyudaActas(true);
export const ayudaActas = (empleado = false) => (empleado ? propias : gestion);
