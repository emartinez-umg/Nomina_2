import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaAuditoria: DefinicionAyuda = {
  id: 'auditoria',
  pasos: [
    {
      elemento: 'auditoria-filtros',
      titulo: 'Acotar la auditoría',
      descripcion:
        'Combina ID de actor, rol, nombre exacto de entidad y acción, ID de recurso, IP y fechas. Las fechas incluyen días completos en Guatemala. Usa los chips para quitar una condición o Limpiar filtros para regresar a todo el historial.',
    },
    {
      elemento: 'auditoria-listado',
      titulo: 'Historial inmutable',
      descripcion:
        'Cada fila muestra quién actuó, su rol, fecha y recurso. Ordena por ID o fecha y cambia de página para consultar el servidor. Ver cambios abre los valores anteriores y nuevos depurados. La bitácora no permite editar ni eliminar registros.',
    },
    {
      elemento: 'auditoria-filtros',
      titulo: 'Exportar la consulta',
      descripcion:
        'Exportar CSV obtiene todas las filas de los filtros activos, hasta 10,000 acciones. Si excedes ese límite reduce el rango. El CSV incluye metadatos y motivos; los cambios detallados se consultan en pantalla y nunca incluye contraseñas ni tokens.',
    },
    {
      elemento: 'auditoria-detalle',
      titulo: 'Comparar los cambios',
      descripcion:
        'Valores anteriores describe el registro antes de la acción y Valores nuevos después. Null indica que no aplica o no se registró ese valor. DPI, NIT, afiliación, cuentas, tokens y contraseñas se excluyen desde el servicio de auditoría.',
    },
  ],
};
