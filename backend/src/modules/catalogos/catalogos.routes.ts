import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { crearCatalogosController } from './catalogos.controller.js';
import type { crearCatalogosService } from './catalogos.service.js';
export function crearCatalogosRouter(service: ReturnType<typeof crearCatalogosService>) {
  const router = Router();
  const c = crearCatalogosController(service);
  router.use(permitirRoles('ADMIN', 'RH'));
  router.get('/', c.definiciones);
  router.get('/restricciones', c.restricciones);
  router.get('/opciones/:referencia', c.opciones);
  router.get('/:catalogo', c.listar);
  router.get('/:catalogo/:id', c.detalle);
  router.post('/:catalogo', c.guardar);
  router.patch('/:catalogo/:id', c.guardar);
  router.patch('/:catalogo/:id/estado', c.estado);
  router.delete('/:catalogo/:id', c.eliminar);
  return router;
}
