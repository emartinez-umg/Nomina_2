import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
import type { Catalogo } from '../api/catalogos';
export function ayudaCatalogo(cat: Catalogo, formulario: boolean): DefinicionAyuda {
  return {
    id: `catalogos-${cat.slug}-${formulario ? 'formulario' : 'listado'}`,
    pasos: formulario
      ? [
          {
            elemento: 'catalogo-formulario',
            titulo: `Registrar ${cat.titulo.toLowerCase()}`,
            descripcion: cat.legal
              ? 'Los valores se conservan por vigencia. Para cambiar un valor histórico, selecciona una fecha posterior al último periodo cerrado; no cambies el código ni su unidad. Al guardar revisarás una advertencia con los valores anteriores y nuevos.'
              : 'Completa los campos obligatorios. Los formatos se guían mientras escribes; los errores se muestran al salir de cada campo y antes de guardar.',
          },
          ...cat.campos.map((f) => ({
            elemento: `campo-${f.nombre}`,
            titulo: f.etiqueta,
            descripcion: `${f.hint} ${f.requerido ? 'Es obligatorio.' : 'Puede dejarse vacío.'} ${f.tipo === 'referencia' ? 'Escribe para buscar registros reales; puedes cargar más opciones. Un registro inactivo no se acepta para nuevas asignaciones.' : ''}`,
          })),
          ...(cat.slug === 'horarios'
            ? [
                {
                  elemento: 'horario-dias',
                  titulo: 'Cada día tiene su propia distribución',
                  descripcion:
                    'Selecciona los días laborables y captura sus horas de 24 horas. Entrada y salida pueden variar entre lunes y viernes. El descanso se resta de la duración; para una salida al día siguiente activa Cruza medianoche. Debe existir al menos un día laborable. Un horario ya asignado conserva su patrón: crea otro para cambiarlo.',
                },
              ]
            : []),
          {
            elemento: 'catalogo-guardar',
            titulo: 'Revisar y guardar',
            descripcion: cat.legal
              ? 'Primero se valida el formulario. Después aparece ADVERTENCIA con anterior y nuevo, vigencias y motivo obligatorio. Confirmar escribe los cambios y la auditoría en una sola transacción. Si ocurre un error se conserva el formulario.'
              : 'Guardar valida nuevamente en el servidor y registra la auditoría. Si hay duplicados o referencias inválidas, corrige el campo indicado; no vuelvas a enviar mientras se guarda.',
          },
        ]
      : [
          {
            elemento: 'catalogo-menu',
            titulo: 'Catálogos y parametrización',
            descripcion:
              'Selecciona un catálogo para consultar y gestionar datos de la organización, calendarios y reglas legales. Cada página tiene su propio recorrido.',
          },
          {
            elemento: 'catalogo-busqueda',
            titulo: 'Buscar y combinar filtros',
            descripcion:
              'La búsqueda consulta códigos, nombres y textos en el servidor. Despliega Filtros para combinar todos los campos relevantes, rangos y estado. Aplica los filtros; las etiquetas muestran los activos. Limpiar restablece la consulta y vuelve a la primera página.',
          },
          {
            elemento: 'catalogo-nuevo',
            titulo: 'Crear registro',
            descripcion:
              'Abre el formulario guiado. Crea departamentos antes de puestos y jefaturas. Un jefe responsable se elige de empleados activos del mismo departamento; si aún no hay empleados, podrás asignarlo después de crear su expediente.',
          },
          {
            elemento: 'catalogo-tabla',
            titulo: 'Orden, páginas y acciones',
            descripcion:
              'Los encabezados ordenan todas las filas desde el servidor. Anterior y Siguiente cambian de página. Ver muestra el detalle, Editar abre el formulario y Desactivar conserva el historial. Eliminar se bloquea cuando existen referencias; en ese caso usa Desactivar.',
          },
          {
            elemento: 'catalogo-exportar',
            titulo: 'Exportación CSV',
            descripcion:
              'Descarga todos los resultados de la consulta, incluyendo las páginas restantes. Los filtros y el orden se respetan; el archivo puede abrirse en Excel.',
          },
          {
            elemento: 'catalogo-tabla',
            titulo: 'Auditoría y permisos ADMIN',
            descripcion:
              'Como ADMIN puedes elegir eliminación física con confirmación y motivo si no existen referencias. Toda creación, modificación, versión y baja queda en bitácora con valores anteriores y nuevos.',
            roles: ['ADMIN'],
          },
          {
            elemento: 'catalogo-tabla',
            titulo: 'Auditoría y permisos RH',
            descripcion:
              'Puedes administrar estos catálogos y los parámetros legales con motivo. Eliminar realiza una baja lógica; Desactivar conserva las referencias existentes e impide nuevas asignaciones. La bitácora global corresponde a ADMIN.',
            roles: ['RH'],
          },
          ...(cat.legal
            ? [
                {
                  elemento: 'catalogo-tabla',
                  titulo: 'Vigencias y valores legales',
                  descripcion:
                    'Editar con una fecha posterior crea una versión y termina la anterior el día previo. Las vigencias no se traslapan. Las versiones utilizadas o que afectan un periodo cerrado se conservan. Al guardar se exige motivo y confirmación del valor anterior frente al nuevo.',
                },
              ]
            : []),
          ...(cat.slug === 'feriados'
            ? [
                {
                  elemento: 'feriados-calendario',
                  titulo: 'Calendario anual',
                  descripcion:
                    'Selecciona el año y consulta los descansos reales de cada mes. Los feriados locales indican su localidad y los medios días muestran su franja. El calendario respeta los filtros aplicados; Ver abre el detalle del feriado.',
                },
              ]
            : []),
        ],
  };
}
