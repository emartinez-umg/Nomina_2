import { Router } from 'express';
import type { crearCodigosService } from './codigos.service.js';
import { crearCodigosController } from './codigos.controller.js';
export function crearCodigosRouter(service: ReturnType<typeof crearCodigosService>) {
  const router = Router();
  router.get('/vista-previa', crearCodigosController(service).vistaPrevia);
  return router;
}
