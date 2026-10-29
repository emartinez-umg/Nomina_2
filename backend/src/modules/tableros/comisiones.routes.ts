import { Router } from 'express';
import { crearComisionesController } from './comisiones.controller.js';
import type { crearComisionesService } from './comisiones.service.js';
export function crearComisionesRouter(s: ReturnType<typeof crearComisionesService>) {
  const r = Router(),
    c = crearComisionesController(s);
  r.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  r.get('/anios', c.anios);
  r.get('/opciones', c.opciones);
  r.get('/resumen', c.resumen);
  r.get('/tendencia', c.tendencia);
  r.get('/ranking', c.ranking);
  r.get('/tabla', c.tabla);
  r.get('/vendedores/:id/historial', c.historial);
  return r;
}
