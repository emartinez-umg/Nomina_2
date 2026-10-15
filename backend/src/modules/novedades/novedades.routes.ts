import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { crearNovedadesController } from './novedades.controller.js';
import type { crearNovedadesService } from './novedades.service.js';
export function crearNovedadesRouter(s: ReturnType<typeof crearNovedadesService>) {
  const r = Router(),
    c = crearNovedadesController(s);
  r.get('/parqueo/tarifas', c.tarifas);
  r.get('/parqueo/exportar', c.parqueoExportar);
  r.get('/parqueo', c.parqueoListar);
  r.post('/parqueo/:id/cambiar', c.parqueoCambiar);
  r.use(permitirRoles('ADMIN', 'RH'));
  r.post('/parqueo/tarifas', c.tarifaGuardar);
  r.get('/pendientes/exportar', c.pendientesExportar);
  r.get('/pendientes', c.pendientes);
  r.get('/reglas', c.reglas);
  r.get('/opciones/:ref', c.opciones);
  r.get('/restricciones/:id', c.restricciones);
  r.get('/ausencias/:id/adjunto', c.adjunto);
  r.get('/:tipo/exportar', c.exportar);
  r.post('/:tipo/:id/previsualizar', c.preview);
  r.post('/:tipo/previsualizar', c.preview);
  r.get('/:tipo', c.listar);
  r.post('/:tipo', c.guardar);
  r.get('/:tipo/:id', c.detalle);
  r.patch('/:tipo/:id', c.guardar);
  r.post('/:tipo/:id/anular', c.anular);
  return r;
}
