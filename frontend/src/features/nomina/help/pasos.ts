import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaNomina: DefinicionAyuda = {
  id: 'nomina',
  pasos: [
    {
      elemento: 'nomina-detalle',
      titulo: 'Comprobar los conceptos de la boleta',
      descripcion:
        'Verifica empleado, intervalo, versión y estado. Compara ingresos, deducciones y neto; cada línea explica base, cantidad, tasa y banderas de IGSS/ISR. Descargar PDF conserva la versión actual cerrada; RH puede abrir una vista previa provisional. Si un importe no corresponde, resuelve la fuente y recalcula antes de aprobar.',
    },
    {
      elemento: 'nomina-confirmar',
      titulo: 'Confirmar el paso del periodo',
      descripcion:
        'Revisa qué cambia en esta operación. Calcular crea una versión, revisar acredita la revisión, aprobar habilita el cierre y cerrar aplica descuentos y publica boletas. Un cambio de fuentes invalida la revisión. ADMIN reabre con motivo y revierte cobros; no repitas el envío mientras se procesa.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'igss-patrono',
      titulo: 'Identificación patronal',
      descripcion:
        'Captura número patronal, razón social, NIT, dirección y correo inscritos ante IGSS. Selecciona el destino de pruebas o producción según corresponda. Estos datos configuran el archivo mensual; para datos de constancias y representante utiliza Catálogos, Datos de empresa.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'igss-registros',
      titulo: 'Centros, tipos y empleados',
      descripcion:
        'Elige una sección. Vincula cada centro interno con sus códigos oficiales; configura los tipos de planilla, jornada y cobertura IVS. Asigna empleados reales con sus nombres registrados sin dividir apellidos compuestos automáticamente. Agregar o actualizar incorpora el registro a la revisión, todavía sin guardar en Oracle.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'igss-tabla',
      titulo: 'Revisar las asignaciones',
      descripcion:
        'Comprueba identificador y nombre de cada fila. Editar carga sus datos para corregirlos y Agregar o actualizar reemplaza ese identificador. Quitar del formato retira la asignación pendiente; no elimina el centro ni el expediente. Para exportar se exige el mes completo cerrado y todas las referencias vigentes.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'igss-guardar',
      titulo: 'Guardar la configuración revisada',
      descripcion:
        'Explica el origen de los códigos con al menos diez caracteres. Revisa número patronal, destino y cantidades antes de confirmar. Cambiar un campo vuelve a exigir revisión. El servidor valida códigos, duplicados y referencias; corrige el error y revisa otra vez. Guardar no presenta una declaración externa.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'nomina-periodos',
      titulo: 'Quincenas e historial',
      descripcion:
        'Crea una quincena eligiendo cualquier fecha del intervalo. El servidor determina del 1 al 15 o del 16 al último día del mes y rechaza duplicados. Filtra por mes, año y estado para abrir una planilla existente.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'nomina-flujo',
      titulo: 'Calcula, revisa, aprueba y cierra',
      descripcion:
        'Calcular conserva una nueva versión con salarios, novedades y parámetros vigentes. Revisa cada detalle y resuelve alertas; recalcular elimina la revisión anterior. Aprobar requiere revisión y cerrar aplica descuentos una sola vez. Si cambian los datos, debes recalcular. ADMIN puede reabrir con motivo: revierte cobros y conserva los cálculos anteriores.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'nomina-totales',
      titulo: 'Totales y alertas',
      descripcion:
        'Los totales suman toda la consulta filtrada, aunque tenga varias páginas. Un neto negativo bloquea la aprobación y muestra el empleado que debes corregir. Las novedades pendientes deben autorizarse o rechazarse antes de recalcular.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'nomina-filtros',
      titulo: 'Busca por periodo y empleado',
      descripcion:
        'Combina año, mes, búsqueda, empleado, departamento y alertas. Quita chips o limpia los filtros. Ordenar columnas y cambiar de página consulta el servidor; no limita la exportación a la página visible.',
    },
    {
      elemento: 'nomina-tabla',
      titulo: 'Detalle y boletas',
      descripcion:
        'Abre el detalle para comprobar cada concepto, su base, cantidad, tasa y efecto en IGSS/ISR. Las boletas conservan la versión histórica del cálculo. El empleado solo puede consultar sus propios periodos cerrados. La vista previa de RRHH indica cuando aún no están cerrados.',
    },
    {
      elemento: 'nomina-exportar',
      titulo: 'Excel, PDF e IGSS',
      descripcion:
        'Excel y PDF descargan todos los resultados de tus filtros; Boletas genera un PDF con una boleta por empleado. IGSS consolida las dos quincenas cerradas del mes y exige configurar los códigos patronales, centros, tipos y nombres registrados. La descarga no presenta la declaración al IGSS.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'nomina-fiscal',
      titulo: 'Historia fiscal y deducciones acreditadas',
      descripcion:
        'Si implantas el sistema a mitad de año, registra renta gravada, cuotas IGSS e ISR realmente acumulados al cierre de la quincena anterior. No dupliques periodos ya cerrados. Las deducciones requieren comprobante y referencia única: el cálculo aplica los topes vigentes agrupados por tipo.',
      roles: ['ADMIN', 'RH'],
    },
  ],
};
