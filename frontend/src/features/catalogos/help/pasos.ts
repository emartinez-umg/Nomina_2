import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
import type { Catalogo } from '../api/catalogos';
export function ayudaCatalogo(cat: Catalogo, formulario: boolean): DefinicionAyuda {
  return {
    id: `catalogos-${cat.slug}-${formulario ? 'formulario' : 'listado'}-v1-12`,
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
            descripcion:
              f.tipo === 'codigo'
                ? 'El código se genera a partir del nombre: iniciales sin conectores o primeras letras. Ante coincidencias usa consonantes y luego un número. La vista previa no reserva el código; al guardar se asigna sin duplicados y será permanente aunque renombres el registro.'
                : `${f.hint} ${f.requerido ? 'Es obligatorio.' : 'Puede dejarse vacío.'} ${f.tipo === 'referencia' ? 'Escribe para buscar registros reales; puedes cargar más opciones. Un registro inactivo no se acepta para nuevas asignaciones.' : 'Respeta el formato y la longitud indicados. Revisa el resultado al pegar; al salir del campo verás cómo corregir un dato inválido. Guardar vuelve a comprobar duplicados y referencias en el servidor.'}`,
          })),
          ...(cat.slug === 'centros-trabajo'
            ? [
                {
                  elemento: 'ubicacion-select',
                  titulo: 'Ubicación oficial en cascada',
                  descripcion:
                    'Busca el departamento geográfico y luego su municipio en el catálogo del INE. En altas se propone Guatemala / Guatemala. Cambiar departamento borra el municipio anterior para evitar combinaciones inválidas. En registros migrados se conserva la localidad anterior: revisa la coincidencia propuesta o selecciona manualmente cuando no es única. Usar coincidencia solo llena los campos; Guardar confirma y audita. El borrador conserva ambas selecciones para continuar después.',
                },
              ]
            : []),
          ...(cat.slug === 'horarios'
            ? [
                {
                  elemento: 'horario-bloques',
                  titulo: 'Bloques, rangos y días de descanso',
                  descripcion:
                    'Agrega un bloque por cada grupo que comparte horas. Usa Lun–Vie, Lun–Sáb, Lun–Dom o Fin de semana y ajusta los chips con Personalizado. Elige entrada/salida de media en media hora y descanso de 30 o 60 minutos; no se escribe la hora. Para salir al día siguiente activa Cruza medianoche. Se revisan solapes con el día siguiente y de domingo a lunes. Los días sin bloques son descansos y no consumen vacaciones. El borrador conserva todos los bloques. Un horario asignado se conserva: usa Duplicar en el listado y asigna el nuevo con fecha efectiva.',
                },
              ]
            : []),
          ...(cat.slug === 'horarios'
            ? [
                {
                  elemento: 'horario-totales',
                  titulo: 'Horas y jornada calculadas',
                  descripcion:
                    'Se suman las horas efectivas diarias y semanales y se detecta jornada diurna, mixta o nocturna a partir de las franjas. Los límites diarios y semanales se leen de Parámetros legales vigentes; los errores explican qué día o bloque debes reducir. El servidor los valida otra vez y asigna el código automático. Horarios históricos conservan sus minutos originales.',
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
              'Los encabezados ordenan todas las filas desde el servidor. Anterior y Siguiente cambian de página. Ver muestra el detalle, Editar abre el formulario y Desactivar conserva el historial. En horarios, Duplicar copia los bloques a un alta con código nuevo; revisa nombre y distribución antes de guardar. Eliminar se bloquea cuando existen referencias; en ese caso usa Desactivar.',
          },
          {
            elemento: 'catalogo-exportar',
            titulo: 'Exportación CSV',
            descripcion:
              'Descarga todos los resultados de la consulta, incluyendo las páginas restantes. Los filtros y el orden se respetan; el archivo puede abrirse en Excel.',
          },
          ...(cat.slug === 'centros-trabajo'
            ? [
                {
                  elemento: 'catalogo-tabla',
                  titulo: 'Ubicaciones oficiales y centros pendientes',
                  descripcion:
                    'Departamento y municipio muestran los nombres del catálogo del INE. Sin asignar indica un centro histórico pendiente de revisión: abre Editar para consultar su localidad anterior y usar una coincidencia propuesta o elegir la ubicación correcta. Los filtros de departamento y municipio consultan el servidor; el CSV incluye sus nombres. Al crear se propone Guatemala / Guatemala y al cambiar departamento debes volver a seleccionar el municipio.',
                },
              ]
            : []),
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
