import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
import { secciones } from '../api/formulario';
export function ayudaEmpleados(
  pagina: 'listado' | 'formulario' | 'detalle' | 'carga',
): DefinicionAyuda {
  const pasos = {
    listado: [
      {
        elemento: 'empleados-acciones',
        titulo: 'Gestionar empleados',
        descripcion:
          'Crea un expediente individual o abre Carga masiva para validar un CSV antes de importar. Necesitas organización, contratos, centros y horarios activos en Catálogos.',
      },
      {
        elemento: 'empleados-filtros',
        titulo: 'Combinar filtros',
        descripcion:
          'Nombre, DPI y NIT se combinan con departamento, puesto, jefatura, contrato, estado, ingreso y salario. Aplica los filtros para consultar Oracle. Un resultado vacío no elimina datos; amplía la búsqueda o limpia los filtros.',
      },
      {
        elemento: 'empleados-tabla',
        titulo: 'Orden y ficha',
        descripcion:
          'Presiona los títulos con icono de orden para ordenar toda la consulta. La paginación viene del servidor. Ver abre la ficha con datos completos y pestañas de historial. DPI y NIT permanecen protegidos en el listado.',
      },
      {
        elemento: 'empleados-exportar',
        titulo: 'Exportar consulta',
        descripcion:
          'Descarga todos los empleados que cumplen los filtros aplicados, aunque estén en otras páginas. La exportación conserva el enmascaramiento de los documentos personales.',
      },
    ],
    formulario: [
      {
        elemento: 'codigo-automatico',
        titulo: 'Código automático por departamento',
        descripcion:
          'Selecciona el departamento en Datos laborales para ver EMP, su código y un contador de cuatro dígitos. Cada departamento tiene su propio contador. La vista previa no reserva el número. El código definitivo se asigna al guardar y nunca cambia, incluso si el empleado se traslada.',
      },
      ...secciones.map((s, i) => ({
        elemento: `empleado-seccion-${i}`,
        titulo: s.titulo,
        descripcion: [
          'Ingresa los nombres del DPI. DPI requiere 13 dígitos; NIT incluye verificador y teléfono 8 dígitos. El servidor comprueba unicidad, incluso frente a empleados egresados. El calendario impide fechas futuras y edades fuera de los parámetros vigentes.',
          'Selecciona primero el departamento: puesto y jefatura deben pertenecer a él. Ingreso debe respetar la edad mínima y no superar 30 días futuros. Se conserva al editar porque inicia el historial. Cambiar horario exige fecha efectiva posterior a su último registro y al último cierre.',
          'El salario es mensual en quetzales. Se crea su historial desde el ingreso. Revisa el aviso del mínimo legal parametrizado. Después del alta utiliza Cambiar salario en la ficha para conservar importe, fecha, motivo y actor de cada modificación.',
          'Registra una persona real de contacto, su parentesco y teléfono de 8 dígitos. El contacto principal se guarda junto al expediente en la misma transacción.',
          'Los datos bancarios son opcionales. Si completas alguno debes indicar banco, cuenta y tipo. Usa letras, números o guiones en la cuenta y verifica el número antes de guardar.',
        ][i]!,
      })),
      {
        elemento: 'empleado-usuario',
        titulo: 'Acceso al portal',
        descripcion:
          'Generar usuario crea nombre.apellido con sufijo si ya existe. La contraseña aleatoria aparece una sola vez tras guardar: copia o imprime y entrégala en privado. El empleado debe cambiarla en su primer acceso. No se recupera al consultar la ficha.',
      },
      {
        elemento: 'empleado-guardar',
        titulo: 'Guardar y corregir',
        descripcion:
          'Los errores aparecen junto al campo y en el resumen. Corrige los datos indicados. El expediente, contacto, salario, horario, usuario opcional y auditoría se guardan juntos; si una operación falla se revierte el alta.',
      },
    ],
    detalle: [
      {
        elemento: 'empleado-resumen',
        titulo: 'Expediente',
        descripcion:
          'Esta ficha contiene información personal completa y solo está disponible para RH y ADMIN. Resumen muestra organización, contacto y banco. Las otras pestañas consultan registros reales del empleado, con páginas independientes.',
      },
      {
        elemento: 'empleado-salario',
        titulo: 'Cambios salariales',
        descripcion:
          'Indica el nuevo salario mensual, fecha efectiva y motivo. Revisa la confirmación con el valor anterior y nuevo. El cambio cierra la vigencia anterior el día previo y conserva su autor; los cambios futuros no sustituyen el salario de hoy.',
      },
      {
        elemento: 'empleado-baja',
        titulo: 'Dar de baja',
        descripcion:
          'La baja exige fecha igual o posterior al ingreso y motivo. Tras confirmar se conserva el expediente, se desactiva el usuario vinculado y se revocan sus sesiones. La fecha no puede afectar periodos cerrados.',
      },
      {
        elemento: 'empleado-tabs',
        titulo: 'Consultar historial',
        descripcion:
          'Salario muestra las vigencias y quién las registró. Descuentos, vacaciones y documentos muestran lo registrado por sus módulos. Historial muestra solo acciones de este expediente; no concede acceso a la bitácora global.',
        roles: ['RH', 'ADMIN'] as ('RH' | 'ADMIN')[],
      },
      {
        elemento: 'empleado-tabs',
        titulo: 'Auditoría de administración',
        descripcion:
          'Como ADMIN puedes consultar además la bitácora global desde Bitácora. Esta pestaña se limita al expediente seleccionado y evita mostrar secretos o documentos bancarios.',
        roles: ['ADMIN'] as 'ADMIN'[],
      },
    ],
    carga: [
      {
        elemento: 'carga-archivo',
        titulo: 'Preparar CSV',
        descripcion:
          'El CSV no pide código: se asigna al importar. Descarga la plantilla y reemplaza la fila ilustrativa con empleados reales. Conserva las columnas; usa fechas aaaa-mm-dd, montos sin Q ni separadores de miles, IDs reales de catálogos y true/false para generarUsuario. Máximo 100 empleados y 1 MB. Textos con comas llevan comillas dobles.',
      },
      {
        elemento: 'carga-preview',
        titulo: 'Revisar cada fila',
        descripcion:
          'Validar crea una vista previa, sin dar de alta empleados. Revisa los errores por número de fila y las advertencias salariales. Repetir un DPI, NIT, correo o IGSS dentro del archivo invalida todas sus apariciones. Corrige el CSV y vuelve a validar.',
      },
      {
        elemento: 'carga-confirmar',
        titulo: 'Importar con confirmación',
        descripcion:
          'Todo o nada exige todas las filas válidas. Solo válidas omite las filas con errores. El servidor revalida al confirmar y realiza todas las altas elegidas en una transacción. Una falla de escritura revierte todo el conjunto. La misma carga no se puede importar dos veces.',
      },
      {
        elemento: 'carga-reporte',
        titulo: 'Reporte y contraseñas',
        descripcion:
          'Después de importar descarga el reporte con estados e IDs. Las contraseñas de usuarios nuevos aparecen una sola vez: copia o imprime antes de cerrar. El reporte persistente nunca incluye contraseñas. Solo quien subió el archivo puede confirmar y descargar su reporte.',
      },
    ],
  };
  return { id: `empleados-${pagina}`, pasos: pasos[pagina] };
}

export function ayudaCambio(tipo: 'salario' | 'baja'): DefinicionAyuda {
  return {
    id: `empleados-cambio-${tipo}`,
    pasos: [
      {
        elemento: 'empleado-cambio-salario',
        titulo: 'Nuevo salario mensual',
        descripcion:
          'Ingresa el salario mensual en quetzales. El importe debe ser mayor a cero y tener hasta dos decimales. El aviso del mínimo utiliza el parámetro vigente para la fecha efectiva; revisa la categoría aplicable a la empresa.',
      },
      {
        elemento: 'empleado-cambio-fecha',
        titulo: tipo === 'salario' ? 'Fecha efectiva' : 'Fecha de egreso',
        descripcion:
          tipo === 'salario'
            ? 'Elige una fecha posterior al ingreso, a la última vigencia registrada y al último periodo cerrado. Los cambios futuros quedan programados. Si ya existe uno posterior, el servidor indicará que debes conservar su historia.'
            : 'Elige una fecha igual o posterior al ingreso y posterior al último cierre. Al confirmar se desactiva inmediatamente el usuario y se revocan todas sus sesiones, incluso si registras una fecha futura.',
      },
      {
        elemento: 'empleado-cambio-motivo',
        titulo: 'Motivo obligatorio',
        descripcion:
          'Explica la aprobación, ajuste o finalización de la relación laboral con 5 a 500 caracteres. Se registra junto a tu usuario y fecha dentro de la misma transacción.',
      },
      {
        elemento: 'empleado-cambio-confirmar',
        titulo: 'Revisar y confirmar',
        descripcion:
          'Revisar cambio muestra los valores y efectos antes de escribir. Verifica nombre, fecha, monto y motivo; editar cualquiera vuelve a exigir revisión. Confirmar guarda todo junto con auditoría. Si el servidor rechaza un campo, corrígelo y revisa nuevamente.',
      },
    ],
  };
}
