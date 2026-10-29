import type { RequestHandler } from 'express';
import type { crearEquipoService } from '../../modules/equipo/equipo.service.js';
import type { PermisoEquipo } from '../../modules/equipo/equipo.schemas.js';
import { autenticacionDe } from './rbac.js';
export function requierePermisoEquipo(
  service: ReturnType<typeof crearEquipoService>,
  permiso: PermisoEquipo,
): RequestHandler {
  return async (req, _res, next) => {
    await service.autorizar(autenticacionDe(req), permiso);
    next();
  };
}
