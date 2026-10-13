import { Router } from 'express';
import { permitirRoles } from '../../shared/security/rbac.js';
import { crearNominaController } from './nomina.controller.js';
import type { crearNominaService } from './nomina.service.js';
export function crearNominaRouter(s: ReturnType<typeof crearNominaService>) {
  const r = Router(),
    c = crearNominaController(s);
  r.get('/boletas', c.listar);
  r.get('/boletas/:id', c.detalle);
  r.get('/boletas/:id/pdf', c.boleta);
  r.use(permitirRoles('ADMIN', 'RH'));
  r.get('/periodos', c.periodos);
  r.post('/periodos', c.crear);
  r.get('/periodos/:id', c.periodo);
  r.get('/periodos/:id/planilla', c.listar);
  for (const a of ['calcular', 'revisar', 'aprobar', 'cerrar', 'devolver'])
    r.post(`/periodos/:id/${a}`, c.accion(a));
  r.post('/periodos/:id/reabrir', permitirRoles('ADMIN'), c.accion('reabrir'));
  r.get('/historial', c.listar);
  for (const f of ['excel', 'pdf', 'boletas'] as const) {
    r.get(`/exportar/${f}`, c.exportar(f));
    r.get(`/periodos/:id/exportar/${f}`, c.exportar(f));
  }
  r.get('/isr/tipos', c.tipos);
  r.get('/isr/empleados/:id', c.fiscal);
  r.post('/isr/aperturas', c.guardarFiscal('apertura'));
  r.post('/isr/deducciones', c.guardarFiscal('deduccion'));
  r.get('/igss/formato', c.formato);
  r.post('/igss/formato', c.guardarFormato);
  r.get('/igss/exportar', c.igss);
  return r;
}
