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
          'Ingresa los nombres del DPI. DPI requiere 13 dígitos; NIT valida el módulo 11, admite K final y teléfono 8 dígitos. Dirección usa departamento y municipio INE, zona obligatoria en Guatemala y número de vivienda (12-A). Al editar revisa la dirección histórica como referencia; sexo solo Masculino/Femenino. El servidor comprueba unicidad, incluso frente a empleados egresados. El calendario impide fechas futuras y edades fuera de los parámetros vigentes.',
          'Selecciona primero el departamento: puesto y jefatura deben pertenecer a él. Ingreso comienza en hoy y debe respetar la edad mínima y no superar 30 días futuros. Se conserva al editar porque inicia el historial. La bandera del contrato bloquea y vacía el fin en indefinidos; en contratos con plazo exige fecha posterior al ingreso. Cambiar horario exige fecha efectiva posterior a su último registro y al último cierre. Crear horario personalizado abre un modal sin perder el expediente: agrega bloques con rangos/chips, horas en desplegables de 30 minutos y descanso de 30 o 60; revisa totales, jornada y límites vigentes. Al guardar se selecciona el nuevo horario. Cada formulario conserva su propio borrador.',
          'El salario es mensual en quetzales. Se crea su historial desde el ingreso. Revisa el aviso del mínimo legal parametrizado. Después del alta utiliza Cambiar salario en la ficha para conservar importe, fecha, motivo y actor de cada modificación.',
          'Registra una persona real de contacto, su parentesco desde el catálogo (sin texto libre) y teléfono de 8 dígitos. Los parentescos inactivos se conservan en fichas existentes y no se ofrecen en contactos nuevos. El contacto principal se guarda junto al expediente en la misma transacción.',
          'Los datos bancarios son opcionales. Si completas alguno debes indicar banco, cuenta y tipo. Usa letras, números o guiones en la cuenta y verifica el número antes de guardar.',
        ][i]!,
      })),
      {
        elemento: 'empleado-crear-horario',
        titulo: 'Crear un horario sin salir del expediente',
        descripcion:
          'Este botón abre el mismo constructor del catálogo en un modal. El código es automático. Selecciona rangos, ajusta los chips y elige horas/descanso de la lista. Revisa jornada, totales y avisos. Guardar crea el patrón y lo selecciona aquí; Cancelar conserva su borrador. Los datos del empleado se mantienen y se guardan después con su propia acción.',
      },
      {
        elemento: 'empleado-usuario',
        titulo: 'Acceso al portal',
        descripcion:
          'Guardar crea automáticamente nombre.apellido con sufijo si ya existe. La contraseña aleatoria aparece una sola vez tras guardar: copia o descarga el PDF membretado y entrégala en privado. Copia o descarga antes de marcar Ya copié o descargué; sin confirmación no se cierra. El PDF solo se descarga una vez y no se conserva en el servidor. El empleado debe cambiarla en su primer acceso. No se recupera al consultar la ficha.',
      },
      {
        elemento: 'empleado-guardar',
        titulo: 'Guardar y corregir',
        descripcion:
          'Los errores aparecen junto al campo y en el resumen. Corrige los datos indicados. El expediente, contacto, salario, horario, usuario obligatorio y auditoría se guardan juntos; si una operación falla se revierte el alta.',
      },
    ],
    detalle: [
      {
        elemento: 'empleado-restablecer',
        titulo: 'Restablecer acceso',
        descripcion:
          'RH/ADMIN puede restablecer una cuenta EMPLEADO activa con motivo y confirmación. Se revocan sesiones y se entrega una contraseña nueva una sola vez, con cambio obligatorio. Cuentas RH/ADMIN se administran en Usuarios.',
      },
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
          'Liquidar y dar de baja abre Prestaciones con el empleado seleccionado y calcula automáticamente el finiquito. Revisa promedio de seis meses, años y fracción, vacaciones pendientes y prestaciones proporcionales; la fecha empieza en hoy y se puede ajustar desde el ingreso. La baja exige motivo y confirmación. Tras confirmar se conserva el expediente, se desactiva el usuario vinculado y se revocan sus sesiones. La fecha no puede afectar periodos cerrados.',
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
          'El CSV no pide código ni usuario: se asignan al importar. Ubicaciones deben pertenecer al catálogo oficial y zona es obligatoria en Guatemala. Descarga la plantilla y reemplaza la fila ilustrativa con empleados reales. Conserva las columnas; usa fechas aaaa-mm-dd, montos sin Q ni separadores de miles, IDs reales de catálogos y código del horario, sexo M/F y parentesco del catálogo. Máximo 100 empleados y 1 MB. Textos con comas llevan comillas dobles.',
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
          'Después de importar descarga el reporte con estados e IDs. Las contraseñas de usuarios nuevos aparecen una sola vez: copia o descarga el PDF membretado antes de cerrar. El reporte persistente nunca incluye contraseñas. Solo quien subió el archivo puede confirmar y descargar su reporte.',
      },
    ],
  };
  return {
    id: `empleados-${pagina}-v1-11`,
    pasos: pasos[pagina],
  };
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

export const ayudaCredenciales: DefinicionAyuda = {
  id: 'empleados-credenciales-v1-7',
  pasos: [
    {
      elemento: 'credenciales-aviso',
      titulo: 'Entrega privada de una sola vez',
      descripcion:
        'Empleado y usuario ya se guardaron juntos. Estas contraseñas solo existen en esta respuesta y no se recuperan desde la ficha. El primer ingreso obliga a cambiarlas. Entrégalas de forma privada al empleado correcto.',
    },
    {
      elemento: 'credenciales-entrega',
      titulo: 'Copiar o descargar',
      descripcion:
        'Copiar credenciales coloca los accesos en el portapapeles. Descargar PDF entrega un único documento membretado con una página por empleado e instrucciones. Después de descargar, el botón queda deshabilitado. El servidor no archiva este archivo ni la contraseña.',
    },
    {
      elemento: 'credenciales-confirmar',
      titulo: 'Confirmar antes de cerrar',
      descripcion:
        'Después de copiar o descargar, marca Ya copié o descargué las credenciales. Sin esa confirmación, Cerrar y Escape mantienen la ventana abierta. Al cerrar se descarta el contenido de memoria. Si pierdes las credenciales solicita un restablecimiento a RH/ADMIN.',
    },
  ],
};

export const ayudaRestablecer: DefinicionAyuda = {
  id: 'empleados-restablecer-v1-7',
  pasos: [
    {
      elemento: 'restablecer-motivo',
      titulo: 'Motivo obligatorio',
      descripcion:
        'Indica por qué necesita otra contraseña el empleado (5–500 caracteres). El motivo se guarda en bitácora con tu identidad; ninguna contraseña se incluye en esa auditoría. La operación solo está disponible para cuentas EMPLEADO activas.',
    },
    {
      elemento: 'restablecer-confirmar',
      titulo: 'Revisar y confirmar',
      descripcion:
        'Revisar permite comprobar el usuario afectado. Confirmar invalida su contraseña anterior y revoca sus sesiones. La nueva contraseña y PDF aparecen una vez; copia o descarga antes de confirmar la entrega. El siguiente inicio obliga al empleado a cambiarla.',
    },
  ],
};
