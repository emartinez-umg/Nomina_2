import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { crearEmpresaController } from './empresa.controller.js';
import type { crearEmpresaService } from './empresa.service.js';
export function crearEmpresaRouter(s: ReturnType<typeof crearEmpresaService>) {
  const r = Router(),
    c = crearEmpresaController(s);
  r.get('/estado', c.estado);
  r.use(permitirRoles('RH', 'ADMIN'));
  r.get('/', c.consultar);
  r.patch('/', c.guardar);
  return r;
}
