import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { crearAuditoriaController } from './auditoria.controller.js';
import type { crearAuditoriaService } from './auditoria.service.js';

export function crearAuditoriaRouter(service: ReturnType<typeof crearAuditoriaService>) {
  const router = Router();
  router.use(permitirRoles('ADMIN'));
  router.get('/', crearAuditoriaController(service));
  return router;
}
