import { auditoriaQuerySchema } from './auditoria.schemas.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { crearAuditoriaController } from './auditoria.controller.js';
import type { crearAuditoriaService } from './auditoria.service.js';

export function crearAuditoriaRouter(service: ReturnType<typeof crearAuditoriaService>) {
  const router = Router();
  router.use(permitirRoles('ADMIN'));
  router.get('/exportar', async (req, res) => {
    res.json(respuestaOk(await service.exportar(auditoriaQuerySchema.parse(req.query))));
  });
  router.get('/', crearAuditoriaController(service));
  return router;
}
