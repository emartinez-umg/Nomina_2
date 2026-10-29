import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaSaldosVacaciones: DefinicionAyuda = {
  id: 'saldos-vacaciones-r3-7',
  pasos: [
    {
      elemento: 'saldos-indicadores',
      titulo: 'Saldo de todos los resultados',
      descripcion:
        'Los indicadores se calculan sobre todos los empleados que cumplen los filtros, antes de paginar: personas en alerta, promedio de días disponibles y suma de días acumulados desde la contratación. No representan solo esta página. El corte usa hoy de Guatemala; para una baja se detiene en la fecha de egreso.',
    },
    {
      elemento: 'saldos-umbral',
      titulo: 'Cuándo se muestra la alerta',
      descripcion:
        'La fila roja, el ícono y la etiqueta Más de N días aparecen solo cuando el disponible supera estrictamente el umbral vigente. Con 15 días de umbral, 15.00 no alerta y 15.25 sí. La comparación conserva los decimales, aunque solo puedan solicitarse días enteros. Configurar umbral abre el parámetro vigente: revisa valor anterior y nuevo, unidad Días y fecha de vigencia, explica el motivo y confirma. El cambio queda en bitácora y no modifica el kardex.',
    },
    {
      elemento: 'saldos-filtros',
      titulo: 'Localiza el personal que requiere atención',
      descripcion:
        'Busca por nombre o código. Despliega los filtros para combinar departamento, centro, jefatura, estado activo y Solo con alerta. Activos incluye fichas habilitadas con estado Activo; Todos también permite consultar bajas. Los selectores admiten búsqueda y Más opciones. Los chips muestran cada filtro; quítalos individualmente o usa Limpiar filtros. Cambiar un filtro vuelve a la primera página.',
    },
    {
      elemento: 'saldos-listado',
      titulo: 'Comprende y ordena los saldos',
      descripcion:
        'Disponible y Solicitables aparecen junto al nombre para priorizar la planificación. Acumulado y meses completos usan el mismo servicio que el saldo individual. Tomados incluye días aprobados y sus devoluciones; Previas y ajustes se muestra debajo cuando existe. Disponible = acumulado menos tomados y previas; Solicitables redondea hacia abajo y conserva las fracciones para el futuro. Ordena con los encabezados; los filtros, el orden y la paginación se ejecutan en el servidor. La alerta no bloquea solicitudes ni cambia saldos. Sin jefatura o centro se explica en la celda.',
    },
    {
      elemento: 'saldos-exportar',
      titulo: 'Exporta todos los resultados filtrados',
      descripcion:
        'CSV y Excel incluyen todas las páginas de esta consulta en el mismo orden, los saldos, previas, estado, corte y marca de alerta con su umbral. Excel genera un archivo XLSX. Ningún archivo incluye salario, banco, DPI ni NIT. Actualizar vuelve a consultar los movimientos y el umbral vigentes.',
    },
  ],
};

export const ayudaUmbralVacaciones: DefinicionAyuda = {
  id: 'umbral-vacaciones-r3-7',
  pasos: [
    {
      elemento: 'catalogo-formulario',
      titulo: 'Configura la alerta de vacaciones',
      descripcion:
        'Este parámetro solo cambia la advertencia operativa; no descuenta ni acumula días. El código asignado y la clave interna se conservan. El nombre identifica el parámetro. El borrador guarda lo escrito y puedes descartarlo al cancelar.',
    },
    {
      elemento: 'campo-valor',
      titulo: 'Umbral con comparación estricta',
      descripcion:
        'Ingresa días mayores que cero, hasta seis decimales. Disponible debe ser mayor que el valor: 15.00 no alerta y 15.25 sí al configurar 15. Solo se solicitan días completos, pero la alerta conserva la fracción del saldo.',
    },
    {
      elemento: 'campo-unidad',
      titulo: 'Mantén la unidad Días',
      descripcion:
        'Este umbral se expresa en días. Las versiones conservan la unidad para evitar cambios de significado; otra unidad se rechaza en el servidor.',
    },
    {
      elemento: 'campo-vigenteDesde',
      titulo: 'Vigencia del nuevo umbral',
      descripcion:
        'Selecciona desde cuándo aplica. Usa una fecha posterior al último periodo cerrado y no anterior a la versión elegida. Una nueva vigencia cierra la anterior y conserva su historia. Para afectar la advertencia actual, la fecha debe incluir hoy de Guatemala.',
    },
    {
      elemento: 'campo-vigenteHasta',
      titulo: 'Fin de vigencia opcional',
      descripcion:
        'Déjalo vacío mientras no exista un fin previsto. Si lo completas, debe ser igual o posterior al inicio. Siempre debe quedar un único umbral vigente para consultar saldos.',
    },
    {
      elemento: 'campo-fundamento',
      titulo: 'Explica la regla operativa',
      descripcion:
        'Registra el criterio de planificación del descanso. Revisar cambio muestra los valores anteriores frente a los nuevos antes de guardar. En la confirmación explica el motivo con al menos cinco caracteres y confirma una sola vez: el cambio se audita y la lista se vuelve a consultar.',
    },
  ],
};
