import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaNomina: DefinicionAyuda = {
  id: 'nomina-v1-11',
  pasos: [
    {
      elemento: 'nomina-revertir',
      titulo: 'Reversión antes del cierre',
      descripcion:
        'Solo ADMIN: explica el motivo con al menos diez caracteres y confirma. Devuelve las cuotas exactamente y libera novedades, conserva el cálculo y PDF históricos y retira la boleta del portal. No se permite si el periodo está cerrado o existe un pago posterior dependiente; revierte primero ese pago. Simula nuevamente para volver a pagar.',
      roles: ['ADMIN'],
    },
    {
      elemento: 'empresa-aviso',
      titulo: 'Membrete y firma de aprobación',
      descripcion:
        'Antes de emitir PDF completa Configuración de empresa. Todos los documentos incluyen sus datos y logo si está cargado. Para aprobar, tu usuario debe estar vinculado a un expediente con nombres, apellidos y puesto activo. La firma conserva la identidad y fecha de quien aprobó.',
      roles: ['RH', 'ADMIN'],
    },
    {
      elemento: 'nomina-detalle',
      titulo: 'Comprobar los conceptos de la boleta',
      descripcion:
        'Verifica empleado, intervalo, versión y estado. Compara ingresos, deducciones y neto; cada línea explica base, cantidad, tasa y banderas de IGSS/ISR. Descargar PDF conserva la boleta archivada del pago v1; en históricos v0 se usa la versión cerrada. Si un importe pagado no corresponde, ADMIN revierte antes del cierre y RRHH vuelve a simular.',
    },
    {
      elemento: 'nomina-confirmar',
      titulo: 'Confirmar el paso del periodo',
      descripcion:
        'Revisar acredita la revisión, aprobar habilita el cierre y cerrar bloquea el periodo. En v1 el pago ya aplicó descuentos y publicó boletas; cerrar no vuelve a cobrar. ADMIN reabre conservando pagos y los revierte explícitamente antes de corregirlos. En v0 se conserva el cálculo/cobro al cierre. No repitas el envío mientras se procesa.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'igss-patrono',
      titulo: 'Identificación patronal',
      descripcion:
        'Captura número patronal, razón social, NIT, dirección y correo inscritos ante IGSS. Selecciona el destino de pruebas o producción según corresponda. Estos datos configuran el archivo mensual; para el membrete utiliza Configuración de empresa. La firma procede de la ficha del usuario que aprueba.',
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
      titulo: 'Anticipo, pago e historial',
      descripcion:
        'Cada mes tiene Anticipo (1–15) y Pago (16–último día). Simular pago crea el periodo al confirmar si todavía no existe. También puedes abrirlo previamente eligiendo una fecha. Filtra por mes, año y estado para revisar pagos y cerrar el periodo.',
      roles: ['ADMIN', 'RH'],
    },
    {
      elemento: 'nomina-flujo',
      titulo: 'Calcula, revisa, aprueba y cierra',
      descripcion:
        'En v1 comienza en Simular pago: revisa la tabla y la lista de verificación y confirma el pago. Las cuotas, novedades, boletas y notificaciones se aplican en esa transacción. Aquí revisas, apruebas y cierras lo pagado; el cierre no cobra de nuevo. ADMIN puede reabrir con motivo conservando los pagos, y revertir individualmente antes del cierre. Los periodos históricos v0 conservan su flujo original.',
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
        'Abre el detalle para comprobar cada concepto, su base, cantidad, tasa y efecto en IGSS/ISR. Las boletas conservan la versión histórica del cálculo. El empleado consulta sus boletas pagadas desde la confirmación, además de los periodos históricos cerrados. Los PDF v1 archivados conservan membrete, firma y cálculo originales. Una reversión retira la boleta del portal y conserva su historial.',
    },
    {
      elemento: 'nomina-exportar',
      titulo: 'Excel, PDF e IGSS',
      descripcion:
        'Excel y PDF descargan todos los resultados de tus filtros; Boletas descarga un ZIP con PDFs archivados en v1; los históricos v0 conservan su PDF masivo. IGSS toma el devengado del pago mensual cerrado, sin sumar otra vez el anticipo; los históricos v0 consolidan ambas quincenas cerradas y se exige configurar los códigos patronales, centros, tipos y nombres registrados. La descarga no presenta la declaración al IGSS.',
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
