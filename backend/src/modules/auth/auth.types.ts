import type { PermisoEquipo } from '../equipo/equipo.schemas.js';
export type Rol = 'ADMIN' | 'RH' | 'EMPLEADO';
export interface UsuarioSeguro {
  permisosEquipo?: PermisoEquipo[];
  idUsuario: number;
  usuario: string;
  nombreMostrado?: string | undefined;
  correo: string;
  idRol: number;
  rol: Rol;
  activo: boolean;
  cambioObligatorio: boolean;
}
export interface UsuarioCredencial extends UsuarioSeguro {
  contrasenaHash: string;
  intentosFallidos: number;
  bloqueado: boolean;
}
export interface Autenticacion extends UsuarioSeguro {
  idSesion: number;
  csrfHash: Buffer;
}
export interface ContextoPeticion {
  ip: string;
  agente: string;
}
export interface ActorAuditoria {
  idUsuario: number;
  idRol: number;
  rol: Rol;
  ip: string;
}

export function usuarioPublico(u: UsuarioSeguro) {
  return {
    ...(u.permisosEquipo ? { permisosEquipo: u.permisosEquipo } : {}),
    idUsuario: u.idUsuario,
    usuario: u.usuario,
    nombreMostrado: u.nombreMostrado,
    correo: u.correo,
    idRol: u.idRol,
    rol: u.rol,
    activo: u.activo,
    cambioObligatorio: u.cambioObligatorio,
  };
}
