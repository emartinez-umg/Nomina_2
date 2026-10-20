import type { PasoAyuda } from './HelpProvider';
export const pasoSelectorEmpleado: PasoAyuda = {
  elemento: 'selector-empleado',
  titulo: 'Buscar empleados por departamento',
  descripcion:
    'Cuando hay un departamento seleccionado, el servidor ofrece únicamente sus empleados. Al cambiar a otro departamento se retira la persona elegida si no pertenece a él; elegir el mismo o quitar el departamento conserva una selección válida. Sin departamento, cada opción muestra código, nombre y departamento. Escribe código, nombres o apellidos; la búsqueda y Más empleados consultan páginas del servidor. Si no hay empleados, cambia o quita el departamento. Los registros nuevos ofrecen activos; los filtros históricos también permiten consultar suspendidos y egresados. Reintentar recupera una consulta fallida sin borrar la selección.',
  roles: ['RH', 'ADMIN'],
};
