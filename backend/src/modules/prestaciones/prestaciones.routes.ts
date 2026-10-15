import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import type { crearPrestacionesService } from './prestaciones.service.js';
import { crearPrestacionesController } from './prestaciones.controller.js';
export function crearPrestacionesRouter(s: ReturnType<typeof crearPrestacionesService>) {
  const r = Router(),
    c = crearPrestacionesController(s);
  r.use(permitirRoles('ADMIN', 'RH'));
  r.get('/', c.listar);
  r.get('/exportar', c.exportar);
  r.get('/constancia', c.constancia);
  for (const op of ['previsualizar', 'calcular', 'simular', 'liquidar'] as const)
    r.post(`/${op}`, c.operar(op));
  r.post('/simular/pdf', c.operar('previewFiniquito'));
  r.get('/:id', c.detalle);
  r.get('/:id/pdf', c.pdf);
  for (const op of ['aprobar', 'pagar', 'anular']) r.post(`/:id/${op}`, c.accion(op));
  return r;
}
