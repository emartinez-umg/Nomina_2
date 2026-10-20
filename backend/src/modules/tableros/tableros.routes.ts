import { permitirRoles } from '../../shared/security/rbac.js';
import { Router } from 'express';
import { crearTablerosController, crearEstadisticasController } from './tableros.controller.js';
import type { crearTablerosService } from './tableros.service.js';
export function crearTablerosRouter(s: ReturnType<typeof crearTablerosService>) {
  const r = Router();
  const c = crearEstadisticasController(s);
  const roles = permitirRoles('RH', 'ADMIN');
  r.use('/rh/', (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  r.get('/rh/remuneraciones', roles, c.remuneraciones);
  r.get('/rh/inasistencias', roles, c.inasistencias);
  r.get('/rh/vacaciones', roles, c.vacaciones);
  r.get('/rh/celebraciones', roles, c.celebraciones);
  r.get('/:rol', crearTablerosController(s));
  return r;
}
