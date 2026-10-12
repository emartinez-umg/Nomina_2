import type { Rol } from '../../features/auth/api/auth';
import type { NombreIcono } from '../ui/icons';
export interface Acceso {
  titulo: string;
  icono: NombreIcono;
  ruta?: string;
  descripcion: string;
}
const compartidos: Acceso[] = [
  {
    titulo: 'Catálogos',
    icono: 'configuracion',
    ruta: '/catalogos',
    descripcion: 'Organización, horarios, feriados y parametrización legal.',
  },
  {
    titulo: 'Empleados',
    icono: 'empleados',
    descripcion: 'Gestiona los datos del personal y su organización.',
  },
  {
    titulo: 'Planilla',
    icono: 'planilla',
    descripcion: 'Calcula, revisa y cierra los periodos de nómina.',
  },
  {
    titulo: 'Solicitudes',
    icono: 'documento',
    descripcion: 'Revisa las gestiones y documentos solicitados.',
  },
  {
    titulo: 'Vacaciones',
    icono: 'calendario',
    descripcion: 'Consulta y autoriza los descansos del personal.',
  },
  {
    titulo: 'Anuncios y eventos',
    icono: 'notificaciones',
    descripcion: 'Comunica noticias y actividades al personal.',
  },
];
export const navegacion: Record<Rol, Acceso[]> = {
  ADMIN: [
    {
      titulo: 'Inicio',
      icono: 'inicio',
      ruta: '/admin',
      descripcion: 'Resumen de administración.',
    },
    ...compartidos,
    {
      titulo: 'Usuarios',
      icono: 'seguridad',
      descripcion: 'Administra accesos y roles del sistema.',
    },
    {
      titulo: 'Bitácora',
      icono: 'documento',
      descripcion: 'Consulta las acciones auditadas del sistema.',
    },
    {
      titulo: 'Configuración',
      icono: 'configuracion',
      descripcion: 'Administra los parámetros del sistema.',
    },
  ],
  RH: [
    { titulo: 'Inicio', icono: 'inicio', ruta: '/rh', descripcion: 'Resumen de Recursos Humanos.' },
    ...compartidos,
  ],
  EMPLEADO: [
    {
      titulo: 'Mis gestiones',
      icono: 'inicio',
      ruta: '/mis-gestiones',
      descripcion: 'Accesos a tu portal personal.',
    },
    {
      titulo: 'Boletas de pago',
      icono: 'planilla',
      descripcion: 'Consulta y descarga tus boletas.',
    },
    {
      titulo: 'Mis solicitudes',
      icono: 'documento',
      descripcion: 'Solicita constancias, certificados, gafete y parqueo.',
    },
    {
      titulo: 'Mis vacaciones',
      icono: 'calendario',
      descripcion: 'Consulta tu saldo y solicita vacaciones.',
    },
    { titulo: 'Mis datos', icono: 'usuario', descripcion: 'Actualiza tus datos de contacto.' },
  ],
};
export const nombreRol: Record<Rol, string> = {
  ADMIN: 'Administrador',
  RH: 'Recursos Humanos',
  EMPLEADO: 'Empleado',
};
