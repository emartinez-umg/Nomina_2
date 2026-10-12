import { beforeEach, describe, expect, it, vi } from 'vitest';
import oracledb from 'oracledb';
import { validarEntorno } from '../../config/env.schema.js';
import { crearBaseDatos } from './pool.js';

const dobles = vi.hoisted(() => ({
  close: vi.fn().mockResolvedValue(undefined),
  getConnection: vi.fn(),
  cerrarConexion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('oracledb', () => ({
  default: {
    thin: true,
    createPool: vi
      .fn()
      .mockResolvedValue({ close: dobles.close, getConnection: dobles.getConnection }),
  },
}));

const config = validarEntorno({
  DB_USER: 'NOMINA2',
  DB_PASSWORD: 'clave-solo-pruebas',
  DB_CONNECT_STRING: 'db/XEPDB1',
});

beforeEach(() => {
  dobles.getConnection.mockResolvedValue({ close: dobles.cerrarConexion, callTimeout: 0 });
});

describe('pool thin de Oracle', () => {
  it('configura límites y timeouts sin cargar Instant Client', async () => {
    const db = await crearBaseDatos(config);
    expect(oracledb.createPool).toHaveBeenCalledWith(
      expect.objectContaining({ poolMax: 5, connectTimeout: 10, queueTimeout: 5000 }),
    );
    await db.cerrar();
    expect(dobles.close).toHaveBeenCalledWith(5);
  });

  it('devuelve la conexión al pool después de una consulta exitosa', async () => {
    const db = await crearBaseDatos(config);
    const valor = await db.conConexion(async (conexion) => conexion.callTimeout);
    expect(valor).toBe(5000);
    expect(dobles.cerrarConexion).toHaveBeenCalledOnce();
  });

  it('devuelve la conexión al pool aunque falle la consulta', async () => {
    const db = await crearBaseDatos(config);
    await expect(
      db.conConexion(() => Promise.reject(new Error('consulta fallida'))),
    ).rejects.toThrow('consulta fallida');
    expect(dobles.cerrarConexion).toHaveBeenCalledOnce();
  });
});
