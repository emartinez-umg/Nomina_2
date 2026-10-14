import type { Rol } from '../../features/auth/api/auth';
import type { NombreIcono } from '../ui/icons';

export interface Acceso {
  id: string;
  titulo: string;
  descripcion: string;
  ruta: string;
  icono: NombreIcono;
  palabras: string[];
}
export interface GrupoNavegacion {
  id: string;
  titulo: string;
  icono: NombreIcono;
  items: Acceso[];
  acciones?: Acceso[];
}
const acceso = (
  id: string,
  titulo: string,
  ruta: string,
  icono: NombreIcono,
  descripcion: string,
  palabras: string[] = [],
): Acceso => ({ id, titulo, ruta, icono, descripcion, palabras });
const catalogo = (slug: string, titulo: string, descripcion: string, palabras: string[] = []) =>
  acceso(slug, titulo, `/catalogos/${slug}`, 'configuracion', descripcion, palabras);
const compartidos: GrupoNavegacion[] = [
  {
    id: 'personal',
    titulo: 'Personal',
    icono: 'empleados',
    items: [
      acceso(
        'empleados',
        'Empleados',
        '/empleados',
        'empleados',
        'Consulta y gestiona los expedientes del personal.',
        ['personal', 'colaboradores'],
      ),
      acceso(
        'carga-masiva',
        'Carga masiva',
        '/empleados/carga-masiva',
        'cargar',
        'Valida e importa empleados desde un archivo CSV.',
        ['importar', 'csv'],
      ),
    ],
    acciones: [
      acceso(
        'nuevo-empleado',
        'Nuevo empleado',
        '/empleados/nuevo',
        'crear',
        'Abre el formulario de alta de un empleado.',
        ['crear', 'contratar', 'alta'],
      ),
    ],
  },
  {
    id: 'organizacion',
    titulo: 'Organización',
    icono: 'configuracion',
    items: [
      acceso(
        'catalogos',
        'Todos los catálogos',
        '/catalogos',
        'configuracion',
        'Consulta los catálogos y su configuración.',
      ),
      catalogo('departamentos', 'Departamentos', 'Organiza las áreas de la empresa.', ['áreas']),
      catalogo('puestos', 'Puestos', 'Administra los cargos y sus departamentos.', ['cargos']),
      catalogo('jefaturas', 'Jefaturas', 'Define las relaciones de supervisión.', ['jefes']),
      catalogo('horarios', 'Horarios', 'Consulta jornadas y días de trabajo.', [
        'turnos',
        'jornadas',
      ]),
      catalogo('centros-trabajo', 'Centros de trabajo', 'Gestiona las sedes del personal.', [
        'sedes',
        'localidad',
      ]),
      catalogo('feriados', 'Feriados', 'Define los descansos del calendario laboral.', ['asuetos']),
      catalogo('tipos-contrato', 'Tipos de contrato', 'Configura las modalidades de contratación.'),
      catalogo('bancos', 'Bancos', 'Administra los bancos para pagos al personal.'),
    ],
  },
  {
    id: 'novedades',
    titulo: 'Novedades',
    icono: 'tiempo',
    items: [
      acceso(
        'novedades',
        'Todas las novedades',
        '/novedades',
        'planilla',
        'Consulta los movimientos que afectan la nómina.',
      ),
      acceso(
        'descuentos',
        'Descuentos',
        '/novedades/descuentos',
        'planilla',
        'Gestiona descuentos fijos, únicos y en cuotas.',
        ['parqueo', 'consumo', 'tienda', 'embargos'],
      ),
      acceso(
        'prestamos',
        'Préstamos y anticipos',
        '/novedades/prestamos',
        'planilla',
        'Consulta los préstamos, cuotas y saldos.',
        ['créditos'],
      ),
      acceso(
        'comisiones',
        'Comisiones',
        '/novedades/comisiones',
        'planilla',
        'Registra ingresos variables del personal.',
        ['ventas'],
      ),
      acceso(
        'horas-extra',
        'Horas extra',
        '/novedades/horas-extra',
        'tiempo',
        'Gestiona el trabajo adicional y su cálculo.',
        ['extras', 'sobretiempo'],
      ),
      acceso(
        'ausencias',
        'Ausencias y permisos',
        '/novedades/ausencias',
        'calendario',
        'Consulta ausencias, permisos e incapacidades.',
        ['faltas', 'incapacidad'],
      ),
      catalogo('tipos-descuento', 'Tipos de descuento', 'Configura las categorías de deducciones.'),
      catalogo('tipos-ausencia', 'Tipos de ausencia', 'Configura permisos y su efecto en nómina.'),
    ],
    acciones: [
      acceso(
        'cargar-comision',
        'Cargar comisión',
        '/novedades/comisiones/nuevo',
        'crear',
        'Abre el registro de una comisión.',
        ['nueva', 'ventas'],
      ),
      acceso(
        'registrar-horas',
        'Registrar horas extra',
        '/novedades/horas-extra/nuevo',
        'crear',
        'Abre el formulario de horas adicionales.',
        ['cargar', 'extras'],
      ),
      acceso(
        'nuevo-descuento',
        'Nuevo descuento',
        '/novedades/descuentos/nuevo',
        'crear',
        'Abre el registro de una deducción.',
      ),
      acceso(
        'nuevo-prestamo',
        'Nuevo préstamo',
        '/novedades/prestamos/nuevo',
        'crear',
        'Abre el formulario de préstamo o anticipo.',
      ),
      acceso(
        'registrar-ausencia',
        'Registrar ausencia',
        '/novedades/ausencias/nuevo',
        'crear',
        'Abre el registro de ausencia o permiso.',
      ),
    ],
  },
  {
    id: 'nomina',
    titulo: 'Nómina',
    icono: 'planilla',
    items: [
      acceso(
        'planilla',
        'Planilla y boletas',
        '/planilla',
        'planilla',
        'Calcula y revisa periodos, boletas y reportes IGSS.',
        ['nómina', 'salarios', 'boleta', 'pagos', 'igss', 'historial', 'reporte'],
      ),
    ],
  },
  {
    id: 'prestaciones',
    titulo: 'Prestaciones',
    icono: 'documento',
    items: [
      acceso(
        'prestaciones',
        'Prestaciones y finiquitos',
        '/prestaciones',
        'documento',
        'Gestiona aguinaldo, Bono 14 y liquidaciones.',
        ['indemnización', 'aguinaldo', 'bono 14', 'finiquito', 'constancia de salario'],
      ),
    ],
  },
  {
    id: 'vacaciones',
    titulo: 'Vacaciones',
    icono: 'calendario',
    items: [
      acceso(
        'vacaciones',
        'Vacaciones del personal',
        '/vacaciones',
        'calendario',
        'Revisa saldos y autoriza solicitudes de descanso.',
        ['kardex', 'descanso'],
      ),
    ],
  },
  {
    id: 'solicitudes',
    titulo: 'Solicitudes',
    icono: 'documento',
    items: [
      acceso(
        'solicitudes',
        'Bandeja y plantillas',
        '/solicitudes',
        'documento',
        'Gestiona solicitudes, documentos y sus plantillas.',
        ['constancias', 'certificados', 'igss', 'intecap', 'gafete', 'parqueo', 'plantilla'],
      ),
    ],
  },
  {
    id: 'comunicacion',
    titulo: 'Comunicación',
    icono: 'notificaciones',
    items: [
      acceso(
        'anuncios',
        'Anuncios',
        '/comunicacion/anuncios',
        'notificaciones',
        'Publica noticias dirigidas al personal.',
        ['comunicados', 'noticias'],
      ),
      acceso(
        'eventos',
        'Eventos',
        '/comunicacion/eventos',
        'calendario',
        'Organiza actividades desde el calendario.',
        ['agenda', 'actividades'],
      ),
    ],
  },
  {
    id: 'configuracion',
    titulo: 'Configuración',
    icono: 'configuracion',
    items: [
      catalogo(
        'parametros-legales',
        'Parámetros legales',
        'Consulta valores y vigencias de las reglas legales.',
        ['igss', 'porcentajes'],
      ),
      catalogo('tramos-isr', 'Tramos ISR', 'Consulta la tabla de retención de impuestos.', [
        'impuestos',
      ]),
      catalogo(
        'empresa',
        'Datos de empresa',
        'Administra los datos empresariales para documentos.',
      ),
    ],
  },
];
const inicio = (ruta: string, descripcion: string): GrupoNavegacion => ({
  id: 'inicio',
  titulo: 'Inicio',
  icono: 'inicio',
  items: [
    acceso('inicio', 'Resumen', ruta, 'inicio', descripcion, ['inicio', 'dashboard', 'tablero']),
  ],
});
export const navigation: Record<Rol, GrupoNavegacion[]> = {
  ADMIN: [
    inicio('/admin', 'Revisa usuarios, sesiones y estado del sistema.'),
    ...compartidos,
    {
      id: 'sistema',
      titulo: 'Sistema',
      icono: 'seguridad',
      items: [
        acceso(
          'usuarios',
          'Usuarios',
          '/admin/usuarios',
          'seguridad',
          'Administra accesos, contraseñas y roles.',
          ['cuentas', 'permisos'],
        ),
        acceso(
          'bitacora',
          'Bitácora',
          '/admin/bitacora',
          'documento',
          'Consulta las acciones auditadas del sistema.',
          ['auditoría', 'historial'],
        ),
        acceso(
          'salud',
          'Estado del sistema',
          '/salud',
          'salud',
          'Comprueba la conexión real con Oracle.',
          ['salud', 'oracle'],
        ),
      ],
    },
  ],
  RH: [inicio('/rh', 'Revisa los indicadores de Recursos Humanos.'), ...compartidos],
  EMPLEADO: [
    inicio('/mis-gestiones', 'Accede a tu portal y consulta tus avisos.'),
    {
      id: 'gestiones',
      titulo: 'Mis gestiones',
      icono: 'documento',
      items: [
        acceso(
          'mis-boletas',
          'Boletas de pago',
          '/mis-gestiones/boletas',
          'planilla',
          'Consulta y descarga tus boletas de pago.',
          ['salario', 'nómina', 'pagos', 'boleta'],
        ),
        acceso(
          'mis-solicitudes',
          'Mis solicitudes',
          '/mis-gestiones/solicitudes',
          'documento',
          'Solicita constancias, certificados, gafete y parqueo.',
          ['igss', 'intecap', 'constancia', 'gafete', 'parqueo'],
        ),
      ],
    },
    {
      id: 'vacaciones',
      titulo: 'Vacaciones',
      icono: 'calendario',
      items: [
        acceso(
          'mis-vacaciones',
          'Mis vacaciones',
          '/mis-gestiones/vacaciones',
          'calendario',
          'Consulta tu saldo y solicita días de descanso.',
          ['saldo', 'descanso'],
        ),
      ],
      acciones: [
        acceso(
          'solicitar-vacaciones',
          'Solicitar vacaciones',
          '/mis-gestiones/vacaciones',
          'crear',
          'Abre tu calendario de vacaciones.',
        ),
      ],
    },
    {
      id: 'comunicacion',
      titulo: 'Anuncios y eventos',
      icono: 'notificaciones',
      items: [
        acceso(
          'mis-anuncios',
          'Anuncios',
          '/mis-gestiones/anuncios',
          'notificaciones',
          'Lee noticias dirigidas a ti.',
          ['noticias', 'comunicados'],
        ),
        acceso(
          'mis-eventos',
          'Eventos',
          '/mis-gestiones/eventos',
          'calendario',
          'Consulta tus próximas actividades.',
          ['agenda', 'calendario'],
        ),
      ],
    },
    {
      id: 'datos',
      titulo: 'Mis datos',
      icono: 'usuario',
      items: [
        acceso(
          'mis-datos',
          'Mis datos de contacto',
          '/mis-gestiones/datos',
          'usuario',
          'Revisa y actualiza tu información personal.',
          ['teléfono', 'correo', 'dirección', 'perfil'],
        ),
      ],
      acciones: [
        acceso(
          'actualizar-contacto',
          'Actualizar mi contacto',
          '/mis-gestiones/datos',
          'editar',
          'Abre tu formulario de datos de contacto.',
        ),
      ],
    },
  ],
};
export const nombreRol: Record<Rol, string> = {
  ADMIN: 'Administrador',
  RH: 'Recursos Humanos',
  EMPLEADO: 'Empleado',
};
export type OpcionNavegacion = Acceso & { grupo: string; rapida: boolean };
export function opcionesNavegacion(rol: Rol): OpcionNavegacion[] {
  return navigation[rol].flatMap((grupo) => [
    ...grupo.items.map((item) => ({ ...item, grupo: grupo.titulo, rapida: false })),
    ...(grupo.acciones ?? []).map((item) => ({ ...item, grupo: grupo.titulo, rapida: true })),
  ]);
}

// Se elige el destino más específico para no activar «Empleados» al importar, ni dos catálogos.
export function accesoActivo(rol: Rol, pathname: string): string | undefined {
  return opcionesNavegacion(rol)
    .filter(
      (item) => !item.rapida && (pathname === item.ruta || pathname.startsWith(`${item.ruta}/`)),
    )
    .sort((a, b) => b.ruta.length - a.ruta.length)[0]?.id;
}
