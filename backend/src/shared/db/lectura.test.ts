import { it, expect, vi, afterEach } from 'vitest';
import type { Connection } from 'oracledb';
import { conLecturaConsistente } from './lectura.js';
afterEach(() => vi.useRealTimers());
it('reintenta únicamente ORA-01466 en otra lectura y conserva el resultado', async () => {
  vi.useFakeTimers();
  const db = {
    conConexion: vi.fn().mockRejectedValueOnce({ errorNum: 1466 }).mockResolvedValue('datos'),
    cerrar: vi.fn(),
  };
  const p = conLecturaConsistente(db, async () => 'datos');
  await vi.advanceTimersByTimeAsync(1000);
  expect(await p).toBe('datos');
  expect(db.conConexion).toHaveBeenCalledTimes(2);
});
it('abre una transacción de solo lectura y no reintenta otros fallos', async () => {
  const execute = vi.fn(),
    c = { execute } as unknown as Connection,
    leer = vi.fn().mockResolvedValue('ok');
  const db = {
    conConexion: async <T>(fn: (c: Connection) => Promise<T>) => fn(c),
    cerrar: vi.fn(),
  };
  expect(await conLecturaConsistente(db, leer)).toBe('ok');
  expect(execute).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
  leer.mockRejectedValueOnce({ errorNum: 1 });
  await expect(conLecturaConsistente(db, leer)).rejects.toEqual({ errorNum: 1 });
  expect(leer).toHaveBeenCalledTimes(2);
});
it('limita ORA-01466 a tres lecturas y propaga el error', async () => {
  vi.useFakeTimers();
  const e = { errorNum: 1466 },
    db = { conConexion: vi.fn().mockRejectedValue(e), cerrar: vi.fn() };
  const p = expect(conLecturaConsistente(db, async () => 'datos')).rejects.toBe(e);
  await vi.advanceTimersByTimeAsync(2000);
  await p;
  expect(db.conConexion).toHaveBeenCalledTimes(3);
});
