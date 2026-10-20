import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { crearSolicitudesController } from './solicitudes.controller.js';
import type { crearSolicitudesService } from './solicitudes.service.js';
export function crearSolicitudesRouter(s: ReturnType<typeof crearSolicitudesService>) {
  const r = Router(),
    c = crearSolicitudesController(s);
  r.get('/', c.listar);
  r.post('/', permitirRoles('EMPLEADO'), c.crear);
  r.get('/exportar', c.exportar);
  r.get('/mis-datos', permitirRoles('EMPLEADO'), c.misDatos);
  r.patch('/mis-datos/contacto', permitirRoles('EMPLEADO'), c.contacto);
  r.get('/plantillas', permitirRoles('ADMIN', 'RH'), c.plantillas);
  r.patch('/plantillas/:tipo', permitirRoles('ADMIN', 'RH'), c.plantilla);
  r.get('/:id', c.detalle);
  r.get('/:id/documento', c.documento);
  r.post('/:id/resolver', permitirRoles('ADMIN', 'RH'), c.resolver);
  r.post('/:id/reemitir', permitirRoles('ADMIN', 'RH'), c.reemitir);
  r.post('/:id/entregar', permitirRoles('ADMIN', 'RH'), c.entregar);
  return r;
}
export function crearNotificacionesRouter(s: ReturnType<typeof crearSolicitudesService>) {
  const r = Router(),
    c = crearSolicitudesController(s);
  r.get('/', c.notificaciones);
  r.post('/:id/leida', c.leer);
  r.delete('/', c.borrarNotificaciones);
  r.delete('/:id', c.borrarNotificacion);
  return r;
}
