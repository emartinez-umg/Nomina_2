import { Router } from 'express';
import { crearUbicacionesController } from './ubicaciones.controller.js';
import type { crearUbicacionesService } from './ubicaciones.service.js';

export function crearUbicacionesRouter(service: ReturnType<typeof crearUbicacionesService>) {
  const router = Router();
  const c = crearUbicacionesController(service);
  router.get('/departamentos', c.departamentos);
  router.get('/municipios', c.municipios);
  return router;
}
