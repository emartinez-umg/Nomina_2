import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { requierePermisoEquipo } from '../../shared/security/equipo.js';
import { crearEquipoController } from './equipo.controller.js';
import type { crearEquipoService } from './equipo.service.js';
export function crearEquipoRouter(s: ReturnType<typeof crearEquipoService>) {
  const r = Router(),
    c = crearEquipoController(s);
  r.get('/jefaturas/:id/permisos', permitirRoles('RH', 'ADMIN'), c.permisos);
  r.patch('/jefaturas/:id/permisos', permitirRoles('RH', 'ADMIN'), c.guardar);
  r.use(permitirRoles('EMPLEADO'));
  r.get('/resumen', c.resumen);
  r.get('/personas', requierePermisoEquipo(s, 'VER_EQUIPO'), c.listar);
  r.get('/opciones', c.opciones);
  r.get('/saldos', requierePermisoEquipo(s, 'VER_VACACIONES_EQUIPO'), c.saldos);
  r.get('/saldos/exportar/:formato', requierePermisoEquipo(s, 'VER_VACACIONES_EQUIPO'), c.exportar);
  return r;
}
