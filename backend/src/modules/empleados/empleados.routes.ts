import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { crearEmpleadosController } from './empleados.controller.js';
import type { crearEmpleadosService } from './empleados.service.js';
export function crearEmpleadosRouter(s: ReturnType<typeof crearEmpleadosService>) {
  const r = Router(),
    c = crearEmpleadosController(s);
  r.use(permitirRoles('RH', 'ADMIN'));
  r.get('/parentescos', c.parentescos);
  r.post('/:id/restablecer-contrasena', c.restablecer);
  r.get('/reglas', c.reglas);
  r.get('/opciones/:referencia', c.opciones);
  r.get('/exportar', c.exportar);
  r.get('/cargas/plantilla', c.plantilla);
  r.post('/cargas', c.previsualizar);
  r.post('/cargas/:id/confirmar', c.confirmar);
  r.get('/cargas/:id/reporte', c.reporte);
  r.get('/', c.listar);
  r.post('/', c.crear);
  r.get('/:id', c.detalle);
  r.get('/:id/pestanas/:tipo', c.pestana);
  r.patch('/:id', c.editar);
  r.post('/:id/salario', c.salario);
  r.post('/:id/baja', c.baja);
  r.delete('/:id', c.baja);
  return r;
}
