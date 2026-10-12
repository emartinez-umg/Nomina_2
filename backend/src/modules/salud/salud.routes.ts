import { Router } from 'express';
import { crearSaludController } from './salud.controller.js';
import type { SaludService } from './salud.types.js';

export function crearSaludRouter(service: SaludService) {
  const router = Router();
  router.get('/', crearSaludController(service));
  return router;
}
