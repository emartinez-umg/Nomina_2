import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { crearComunicacionController } from './comunicacion.controller.js';
import type { crearComunicacionService } from './comunicacion.service.js';
export function crearComunicacionRouter(s: ReturnType<typeof crearComunicacionService>) {
  const r = Router(),
    c = crearComunicacionController(s);
  r.get('/:tipo', c.listar);
  r.get('/:tipo/exportar', c.exportar);
  r.get('/:tipo/:id', c.detalle);
  r.post('/:tipo', permitirRoles('ADMIN', 'RH'), c.guardar);
  r.patch('/:tipo/:id', permitirRoles('ADMIN', 'RH'), c.guardar);
  r.delete('/:tipo/:id', permitirRoles('ADMIN', 'RH'), c.eliminar);
  return r;
}
