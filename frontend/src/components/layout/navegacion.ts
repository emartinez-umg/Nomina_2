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
    titulo: 'Prestaciones',
    icono: 'planilla',
    ruta: '/prestaciones',
    descripcion: 'Bono 14, aguinaldo, finiquitos y constancias de salario.',
  },
  {
    titulo: 'Novedades',
    icono: 'planilla',
    ruta: '/novedades',
    descripcion: 'Descuentos, préstamos, comisiones, horas extra y ausencias.',
  },
  {
    titulo: 'Catálogos',
    icono: 'configuracion',
    ruta: '/catalogos',
    descripcion: 'Organización, horarios, feriados y parametrización legal.',
  },
  {
    titulo: 'Empleados',
    ruta: '/empleados',
    icono: 'empleados',
    descripcion: 'Gestiona los datos del personal y su organización.',
  },
  {
    titulo: 'Planilla',
    ruta: '/planilla',
    icono: 'planilla',
    descripcion: 'Calcula, revisa y cierra los periodos de nómina.',
  },
  {
    titulo: 'Solicitudes',
    ruta: '/solicitudes',
    icono: 'documento',
    descripcion: 'Revisa las gestiones y documentos solicitados.',
  },
  {
    titulo: 'Vacaciones',
    ruta: '/vacaciones',
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
      ruta: '/mis-gestiones/boletas',
      icono: 'planilla',
      descripcion: 'Consulta y descarga tus boletas.',
    },
    {
      titulo: 'Mis solicitudes',
      ruta: '/mis-gestiones/solicitudes',
      icono: 'documento',
      descripcion: 'Solicita constancias, certificados, gafete y parqueo.',
    },
    {
      titulo: 'Mis vacaciones',
      ruta: '/mis-gestiones/vacaciones',
      icono: 'calendario',
      descripcion: 'Consulta tu saldo y solicita vacaciones.',
    },
    {
      titulo: 'Mis datos',
      ruta: '/mis-gestiones/datos',
      icono: 'usuario',
      descripcion: 'Actualiza tus datos de contacto.',
    },
  ],
};
export const nombreRol: Record<Rol, string> = {
  ADMIN: 'Administrador',
  RH: 'Recursos Humanos',
  EMPLEADO: 'Empleado',
};
