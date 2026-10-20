import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { crearTablerosRouter } from './tableros.routes.js';
import { crearTablerosService } from './tableros.service.js';
import { crearEstadisticasService } from './estadisticas.service.js';
import type { Autenticacion } from '../auth/auth.types.js';
import {
  remuneracionesSchema,
  inasistenciasSchema,
  vacacionesTableroSchema,
} from './tableros.schemas.js';
import { rangoInasistencias } from './tableros.reglas.js';
const auth = { rol: 'EMPLEADO' } as Autenticacion;
describe('R2-8: contratos del dashboard y defensa de salarios', () => {
  it.each([
    ['2026-12-31', 'mes', '2026-12-01', '2026-12-31'],
    ['2026-12-31', 'trimestre', '2026-10-01', '2026-12-31'],
    ['2026-01-01', 'trimestre', '2026-01-01', '2026-03-31'],
    ['2028-02-29', 'mes', '2028-02-01', '2028-02-29'],
    ['2028-02-29', 'anio', '2028-01-01', '2028-12-31'],
  ] as const)('recorta %s / %s con límites reales', (fecha, periodo, inicio, fin) => {
    expect(rangoInasistencias(fecha, periodo)).toEqual({ inicio, fin });
  });
  it('valida listas blancas, mes, fecha y límites antes de consultar', () => {
    expect(remuneracionesSchema.parse({})).toEqual({
      agrupar: 'empleado',
      metrica: 'totalDevengado',
    });
    for (const q of [
      { mes: '2026-00' },
      { mes: '2026-13' },
      { mes: '2026-1' },
      { agrupar: 'ID_USUARIO' },
      { metrica: 'neto' },
      { mes: ['2026-01', '2026-02'] },
    ])
      expect(remuneracionesSchema.safeParse(q).success).toBe(false);
    expect(inasistenciasSchema.safeParse({ fecha: '2027-02-29' }).success).toBe(false);
    expect(inasistenciasSchema.safeParse({ fecha: '2028-02-29' }).success).toBe(true);
    expect(vacacionesTableroSchema.parse({ dias: '90', limite: '100' }).dias).toBe(90);
    for (const q of [{ dias: '31' }, { pagina: '0' }, { limite: '101' }])
      expect(vacacionesTableroSchema.safeParse(q).success).toBe(false);
  });
  it('rechaza EMPLEADO también desde servicio, antes de adquirir conexión', () => {
    const conConexion = vi.fn(),
      s = crearEstadisticasService({ conConexion, cerrar: vi.fn() });
    expect(() => s.remuneraciones(auth, remuneracionesSchema.parse({}))).toThrow();
    expect(() => s.inasistencias(auth, inasistenciasSchema.parse({}))).toThrow();
    expect(() => s.vacaciones(auth, vacacionesTableroSchema.parse({}))).toThrow();
    expect(() => s.celebraciones(auth)).toThrow();
    expect(conConexion).not.toHaveBeenCalled();
  });
  it('regresión: existen cuatro rutas con RBAC antes de llegar a los datos', async () => {
    const conConexion = vi.fn(),
      app = express();
    app.use((req, _res, next) => {
      req.autenticacion = auth;
      next();
    });
    app.use(
      '/api/tableros',
      crearTablerosRouter(crearTablerosService({ conConexion, cerrar: vi.fn() })),
    );
    app.use(
      (
        _error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(403).json({ ok: false });
      },
    );
    for (const ruta of ['remuneraciones', 'inasistencias', 'vacaciones', 'celebraciones'])
      await request(app).get(`/api/tableros/rh/${ruta}`).expect(403);
    expect(conConexion).not.toHaveBeenCalled();
  });
});
