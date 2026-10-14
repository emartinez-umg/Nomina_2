import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
import type { Tipo } from '../api/novedades';
import { titulos } from '../api/novedades';
const explicaciones: Record<Tipo, string> = {
  descuentos:
    'El monto fijo se repite cada quincena y no tiene saldo total. Cuotas distribuye el total entre quincenas; único crea una cuota. Parqueo y consumo en tienda se capturan con el tipo correspondiente. El neto se comprobará al calcular planilla.',
  prestamos:
    'Selecciona préstamo o anticipo, capital y número de cuotas. La primera cuota debe ser hoy o futura. No se calculan intereses: el capital se distribuye en centavos y el residuo se suma a la última cuota. Revisa la amortización antes de guardar.',
  comisiones:
    'Selecciona un día dentro de la quincena correspondiente y escribe el monto manual. El sistema identifica del 1 al 15 o del 16 al último día del mes, creando el periodo abierto cuando todavía no existe. La referencia evita registrar el mismo origen dos veces.',
  'horas-extra':
    'Registra un único total de horas por empleado y día. Selecciona la jornada real; el valor usa salario vigente en esa fecha, divisor mensual, horas de jornada y recargo parametrizados. La vista previa es estimada; la planilla conserva los valores al calcular.',
  ausencias:
    'Selecciona permiso, ausencia o incapacidad y revisa el efecto indicado por el catálogo: con goce, sin goce o subsidio IGSS. Las fechas son inclusivas; no se aceptan traslapes con ausencias ni vacaciones en proceso, aprobadas o tomadas. Puedes adjuntar PDF, PNG o JPEG de hasta 1 MB.',
};
export function ayudaNovedades(
  tipo: Tipo,
  pagina: 'listado' | 'formulario' | 'detalle',
): DefinicionAyuda {
  return {
    id: `novedades-${tipo}-${pagina}`,
    pasos: [
      {
        elemento: 'codigo-automatico',
        titulo: 'Código asignado por el sistema',
        descripcion:
          'La vista previa consulta el contador actual sin reservar números. Guardar asigna el código definitivo dentro de la transacción. Será permanente, también después de editar o desactivar el registro. Puedes copiarlo para localizarlo en la búsqueda del listado.',
      },
      {
        elemento: 'novedades-tipos',
        titulo: 'Novedades de nómina',
        descripcion:
          'Los códigos internos se asignan automáticamente al guardar y se conservan al editar. Puedes buscarlos en el listado. Cada sección registra novedades reales para las próximas quincenas. Cambiar de sección conserva los registros; los filtros se aplican dentro del módulo seleccionado.',
      },
      {
        elemento: 'novedades-filtros',
        titulo: 'Buscar y combinar filtros',
        descripcion:
          'Busca por empleado o motivo y combina empleado, tipo, fechas y estado con los rangos de montos, saldos, cuotas u horas disponibles. Las fechas buscan registros que intersectan el rango. Aplica, elimina un chip o limpia para ampliar resultados. CSV descarga toda la consulta.',
      },
      {
        elemento: 'novedades-tabla',
        titulo: 'Consultar y ordenar',
        descripcion:
          'Los encabezados con icono ordenan toda la consulta en Oracle. Ver detalle abre el registro y su calendario. Editar y Anular se bloquean cuando hay periodos cerrados, aplicaciones de nómina o la novedad está finalizada.',
      },
      { elemento: 'novedad-campos', titulo: titulos[tipo], descripcion: explicaciones[tipo] },
      {
        elemento: 'novedad-preview',
        titulo: 'Revisar importes',
        descripcion:
          'Revisar amortización o cálculo consulta al servidor. Revisa fechas, cuotas y monto estimado. Cualquier cambio posterior invalida la vista previa. El calendario deshabilita fechas inválidas y el servidor revalida rangos completos al guardar.',
      },
      {
        elemento: 'novedad-guardar',
        titulo: 'Guardar con auditoría',
        descripcion:
          'Al guardar, corrige primero los errores junto a los campos. Revisa la confirmación de empleado, monto, fechas y estado. El registro, calendario, adjunto y auditoría se confirman juntos; una falla revierte la operación.',
      },
      {
        elemento: 'novedad-detalle',
        titulo: 'Historial y autorización',
        descripcion:
          'Solo las horas y ausencias aprobadas se consumirán en nómina. Para aprobar o rechazar, edita el estado y explica el motivo. Anular conserva el registro y exige motivo y confirmación. Un saldo cero liquida automáticamente el descuento al aplicar su última cuota.',
      },
      {
        elemento: 'novedad-detalle',
        titulo: 'Control administrativo',
        descripcion:
          'Como ADMIN puedes consultar los cambios en Bitácora por entidad e ID. El cierre protege novedades de todos los roles; la reapertura del periodo se realiza en Planilla con motivo y confirmación.',
        roles: ['ADMIN'],
      },
      {
        elemento: 'novedad-detalle',
        titulo: 'Revisión de Recursos Humanos',
        descripcion:
          'Como RH puedes capturar y autorizar estas novedades. Si están bloqueadas por un cierre, solicita la revisión del periodo al administrador. Conserva el respaldo de cada registro.',
        roles: ['RH'],
      },
    ],
  };
}
