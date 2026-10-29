import type { BaseDatos } from '../../shared/db/pool.js';
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Connection } from 'oracledb';
import { crearTablerosRouter } from '../tableros/tableros.routes.js';
import { crearTablerosService } from '../tableros/tableros.service.js';
import { manejarErrores } from '../../shared/middleware/error-handler.js';
import { crearLogger } from '../../config/logger.js';
import type { Autenticacion } from '../auth/auth.types.js';
function escenario(anios: number[], rol = 'RH') {
  const execute = vi.fn(async (sql: string) => ({
    rows: sql.startsWith('WITH')
      ? anios.map((anio) => ({ anio }))
      : [{ ahora: '2026-01-01T00:01:00' }],
  }));
  const rollback = vi.fn();
  const conConexion = vi.fn(async <T>(fn: (c: Connection) => Promise<T>) =>
    fn({ execute, rollback } as unknown as Connection),
  );
  const app = express();
  app.use((req, _res, next) => {
    req.autenticacion = { idUsuario: 9, rol } as Autenticacion;
    next();
  });
  app.use(
    '/api/tableros',
    crearTablerosRouter(
      crearTablerosService({
        conConexion: conConexion as BaseDatos['conConexion'],
        cerrar: vi.fn(),
      }),
    ),
  );
  app.use(manejarErrores(crearLogger('silent')));
  return { app, execute, rollback, conConexion };
}
describe('R3-4: años por fuente', () => {
  it.each(['planillas', 'comisiones', 'ausencias', 'vacaciones', 'calculo-nomina'])(
    'incluye hoy, deduplica y conserva huecos de %s',
    async (fuente) => {
      const { app, rollback } = escenario([2021, 2024, 2024, 2028]);
      const r = await request(app).get(`/api/tableros/anios?fuente=${fuente}`).expect(200);
      expect(r.body.data).toEqual({
        fuente,
        anioActual: 2026,
        anioMin: 2021,
        anioMax: 2028,
        anios: [2021, 2024, 2026, 2028],
      });
      expect(r.headers['cache-control']).toBe('private, no-store');
      expect(rollback).toHaveBeenCalledOnce();
    },
  );
  it('sin datos solo ofrece el año del reloj de Guatemala', async () => {
    const r = await request(escenario([]).app)
      .get('/api/tableros/anios?fuente=vacaciones')
      .expect(200);
    expect(r.body.data.anios).toEqual([2026]);
  });
  it('rechaza fuentes manipuladas y filtros adicionales antes de consultar', async () => {
    const { app, conConexion } = escenario([]);
    for (const q of [
      'fuente=USUARIOS',
      'fuente=planillas&usuario=1',
      'fuente=planillas&fuente=vacaciones',
      '',
    ])
      await request(app).get(`/api/tableros/anios?${q}`).expect(400);
    expect(conConexion).not.toHaveBeenCalled();
  });
  it('el empleado consulta solo años propios y no accede a fuentes de RH', async () => {
    const { app, execute, conConexion } = escenario([], 'EMPLEADO');
    await request(app).get('/api/tableros/anios?fuente=comisiones').expect(403);
    // R3-9: comisiones permite jefes y comprueba su ficha/permiso vigente en Oracle.
    expect(conConexion).toHaveBeenCalledOnce();
    for (const fuente of ['planillas', 'vacaciones', 'parqueo']) {
      await request(app).get(`/api/tableros/anios?fuente=${fuente}`).expect(200);
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('E.ID_USUARIO=:usuario'),
        { usuario: 9 },
        expect.anything(),
      );
    }
  });
});
