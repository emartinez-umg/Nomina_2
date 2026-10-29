import type { DefinicionAyuda } from '../../components/help/HelpProvider';
export const ayudaAsignacionJefaturas: DefinicionAyuda = {
  id: 'jefaturas-asignacion-r3-5',
  pasos: [
    {
      elemento: 'jefaturas-destino',
      titulo: 'Destino del equipo',
      descripcion:
        'Elige una jefatura activa. Se propone su departamento; cambiar destino limpia la selección para evitar trasladar personas por error. La asignación reemplaza la anterior: nunca agrega una segunda jefatura al empleado.',
    },
    {
      elemento: 'jefaturas-seleccion',
      titulo: 'Buscar y seleccionar empleados',
      descripcion:
        'Combina departamento, centro de trabajo y nombre o código. Las casillas solo habilitan empleados del departamento de destino. Seleccionar página agrega los resultados visibles; Anterior y Siguiente consultan otras páginas en Oracle. Las selecciones se conservan al filtrar; Limpiar selección retira todas. El máximo es 500 por operación y el borrador conserva los identificadores para continuar después.',
    },
    {
      elemento: 'jefaturas-confirmar',
      titulo: 'Revisar y confirmar',
      descripcion:
        'Escribe un motivo y pulsa Revisar asignación. Comprueba destino y cantidad total, incluso los seleccionados en otras páginas. Confirmar vuelve a validar estado y departamento y guarda cada cambio y su auditoría en una transacción. Si alguien dejó de estar activo, falla todo el lote: recarga y revisa. Los ya asignados no se modifican. Después consulta la ficha o el listado para ver el jefe inmediato.',
    },
  ],
};
