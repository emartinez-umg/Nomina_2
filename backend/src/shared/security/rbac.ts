import type { Request, RequestHandler } from 'express';
import type { Rol } from '../../modules/auth/auth.types.js';
import { ErrorNoAutorizado, ErrorProhibido } from '../errors/errors.js';

export function autenticacionDe(req: Request) {
  if (!req.autenticacion) throw new ErrorNoAutorizado();
  return req.autenticacion;
}
export function permitirRoles(...roles: Rol[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(autenticacionDe(req).rol)) throw new ErrorProhibido();
    next();
  };
}
// El id propietario debe obtenerse del repositorio, nunca de un cuerpo enviado por el cliente.
export function verificarPropiedad(
  actor: { idUsuario: number; rol: Rol },
  idUsuarioPropietario: number | null,
) {
  if (actor.rol === 'EMPLEADO' && actor.idUsuario !== idUsuarioPropietario) {
    throw new ErrorProhibido(
      'Solo puedes consultar o modificar tus propios datos.',
      'RECURSO_AJENO',
    );
  }
}
export const exigirCambioCompletado: RequestHandler = (req, _res, next) => {
  if (autenticacionDe(req).cambioObligatorio) {
    throw new ErrorProhibido(
      'Cambia tu contraseña temporal para continuar.',
      'CAMBIO_CONTRASENA_OBLIGATORIO',
    );
  }
  next();
};
