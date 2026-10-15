import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaInicio: DefinicionAyuda = {
  id: 'tableros-v1-10',
  pasos: [
    {
      elemento: 'indicadores',
      titulo: 'Indicadores de Recursos Humanos',
      roles: ['RH'],
      descripcion:
        'Los empleados activos tienen ingreso efectivo hasta hoy. Altas y bajas cuentan fechas efectivas del mes actual. Bruto, neto y aportes patronales pertenecen a la quincena de hoy y a los pagos vigentes del periodo (o a la versión histórica v0). Sin calcular indica que falta crear o calcular esa quincena; no representa un pago en cero. Solicitudes incluye vacaciones, que también aparecen por separado.',
    },
    {
      elemento: 'graficas',
      titulo: 'Distribución y evolución',
      roles: ['RH'],
      descripcion:
        'La distribución agrupa empleados activos por departamento. La evolución muestra los últimos seis periodos existentes y su versión vigente: recalcular no suma dos veces. Un periodo abierto es provisional. Usa Tab y las flechas para recorrer las gráficas; abre Ver datos para consultar cifras exactas y estados.',
    },
    {
      elemento: 'alertas',
      titulo: 'Acciones que requieren atención',
      roles: ['RH'],
      descripcion:
        'Revisa los periodos iniciados que siguen sin cerrar y los contratos vencidos o que vencen dentro de 30 días. Revisar abre el módulo correspondiente. Se muestran hasta 50 alertas, empezando por las fechas más antiguas. No se cierra una nómina automáticamente desde este tablero.',
    },
    {
      elemento: 'celebraciones',
      titulo: 'Cumpleaños y aniversarios',
      roles: ['RH'],
      descripcion:
        'La lista muestra hasta 50 celebraciones de empleados activos para hoy y los próximos 30 días, ordenadas por fecha. Los aniversarios cuentan años cumplidos, no el ingreso del año actual. Los aniversarios de febrero se ajustan al calendario del año.',
    },
    {
      elemento: 'indicadores',
      titulo: 'Tu saldo y última boleta',
      roles: ['EMPLEADO'],
      descripcion:
        'Se muestran acumulados por meses completos, tomados/aprobados, disponibles decimales y solicitables enteros (redondeo hacia abajo). Cinco meses a 1.25 dan 6.25 disponibles y 6 solicitables. Abre Vacaciones para revisar previas, kardex o cancelar una aprobada antes de iniciar. No anticipa meses futuros. Si falta historia o configuración, verás Por revisar y la indicación de RRHH. La última boleta corresponde a tu pago confirmado más reciente o a una nómina histórica cerrada; abre Boletas de pago para consultar o descargar su PDF.',
    },
    {
      elemento: 'accesos',
      titulo: 'Tus ocho gestiones',
      roles: ['EMPLEADO'],
      descripcion:
        'Boletas y Vacaciones abren su historial. Las tarjetas de constancias, IGSS, INTECAP, gafete y parqueo abren la solicitud correspondiente para revisarla antes de enviarla. Actualizar mis datos abre contacto y solicitudes de datos críticos. Cada operación valida en el servidor que el expediente te pertenezca.',
    },
    {
      elemento: 'anuncios',
      titulo: 'Anuncios dirigidos a ti',
      roles: ['EMPLEADO'],
      descripcion:
        'Aparecen los cinco anuncios vigentes más recientes para todos o para tu departamento, puesto o jefatura actual. La vigencia incluye ambos días. Leer publicación abre el texto completo; Ver todos consulta el resto con filtros. Los anuncios futuros aparecen cuando comienza su vigencia.',
    },
    {
      elemento: 'eventos',
      titulo: 'Tu agenda',
      roles: ['EMPLEADO'],
      descripcion:
        'Aquí aparecen los cinco eventos más próximos, incluidos los que siguen en curso. Revisa fecha, hora local de Guatemala y lugar. Ver todos abre el calendario y la lista completa de actividades dirigidas a ti; seleccionar un día permite consultar sus eventos.',
    },
    {
      elemento: 'indicadores',
      titulo: 'Usuarios y sesiones',
      roles: ['ADMIN'],
      descripcion:
        'Las tarjetas agrupan usuarios activos por rol y distinguen registrados e inactivos. El total de sesiones activas excluye vencidas y revocadas, y cuentas o roles inactivos. No se muestran credenciales ni tokens.',
    },
    {
      elemento: 'sistema',
      titulo: 'Estado real de la plataforma',
      roles: ['ADMIN'],
      descripcion:
        'El servidor consulta Oracle, la última migración aplicada y objetos inválidos. Operativo significa que esas comprobaciones están correctas; si la API o Oracle no responde verás un error de carga. Consultar conectividad abre el diagnóstico de salud.',
    },
    {
      elemento: 'sesiones',
      titulo: 'Actividad reciente',
      roles: ['ADMIN'],
      descripcion:
        'Las diez sesiones más recientes se ordenan por última actividad. Finalizada agrupa sesiones vencidas o revocadas. Los datos se actualizan al recargar o al presionar Actualizar; no revelan hashes de sesión ni CSRF.',
    },
    {
      elemento: 'bitacora',
      titulo: 'Trazabilidad administrativa',
      roles: ['ADMIN'],
      descripcion:
        'Revisa las diez últimas acciones de la bitácora. Consultar bitácora permite combinar actor, rol, entidad, recurso, acción, IP y fechas, ver cambios y exportar CSV. Solo ADMIN tiene acceso a la auditoría global.',
    },
    {
      elemento: 'accesos',
      titulo: 'Accesos rápidos',
      roles: ['RH'],
      descripcion:
        'Abre empleados, planilla, solicitudes, vacaciones o comunicaciones. Crear un anuncio o evento guarda la publicación, audita la acción y notifica a los destinatarios en una sola transacción.',
    },
    {
      elemento: 'notificaciones',
      titulo: 'Campana y actualizaciones',
      descripcion:
        'La campana consulta tus avisos reales. Puedes abrir su recurso y marcarlos como leídos. Actualizar vuelve a consultar el tablero completo; la hora mostrada corresponde a Guatemala. Ayuda permite repetir este recorrido en cualquier momento.',
    },
  ],
};
