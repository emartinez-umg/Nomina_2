import { Router } from 'express';
import { crearTablerosController } from './tableros.controller.js';
import type { crearTablerosService } from './tableros.service.js';
export function crearTablerosRouter(s: ReturnType<typeof crearTablerosService>) {
  const r = Router();
  r.get('/:rol', crearTablerosController(s));
  return r;
}
