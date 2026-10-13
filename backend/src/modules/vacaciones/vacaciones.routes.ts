import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { crearVacacionesController } from './vacaciones.controller.js';
import type { crearVacacionesService } from './vacaciones.service.js';
export function crearVacacionesRouter(s: ReturnType<typeof crearVacacionesService>) {
  const r = Router(),
    c = crearVacacionesController(s);
  r.get('/notificaciones', c.notificaciones);
  r.post('/notificaciones/:id/leida', c.leer);
  r.get('/mi-saldo', permitirRoles('EMPLEADO'), c.saldo);
  r.get('/mi-calendario', permitirRoles('EMPLEADO'), c.calendario);
  r.post('/previsualizar', permitirRoles('EMPLEADO'), c.preview);
  r.post('/solicitudes', permitirRoles('EMPLEADO'), c.solicitar);
  r.get('/solicitudes', c.listar);
  r.get('/exportar', c.exportar);
  r.use(permitirRoles('ADMIN', 'RH'));
  r.get('/opciones', c.opciones);
  r.get('/empleados/:id/saldo', c.saldo);
  r.get('/empleados/:id/calendario', c.calendario);
  r.post('/empleados/:id/cargar', c.cargar);
  r.get('/empleados/:id/finiquito', c.finiquito);
  r.post('/solicitudes/:id/resolver', c.resolver);
  return r;
}
