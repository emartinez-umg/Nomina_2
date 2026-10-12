import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { crearUsuariosController } from './usuarios.controller.js';
import type { crearUsuariosService } from './usuarios.service.js';

export function crearUsuariosRouter(service: ReturnType<typeof crearUsuariosService>) {
  const router = Router();
  const controller = crearUsuariosController(service);
  router.use(permitirRoles('ADMIN'));
  router.get('/', controller.listar);
  router.patch('/:id/estado', controller.estado);
  router.patch('/:id/rol', controller.rol);
  router.post('/:id/restablecer-contrasena', controller.restablecer);
  return router;
}
