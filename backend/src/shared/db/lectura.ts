import { setTimeout } from 'node:timers/promises';
import type { Connection } from 'oracledb';
import type { BaseDatos } from './pool.js';
// Oracle puede rechazar un snapshot iniciado en el mismo segundo que el DDL de migración.
// Solo se repiten consultas: nunca una transacción de negocio ni sus efectos externos.
export async function conLecturaConsistente<T>(
  db: BaseDatos,
  leer: (c: Connection) => Promise<T>,
): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await db.conConexion(async (c) => {
        await c.execute('SET TRANSACTION READ ONLY');
        return leer(c);
      });
    } catch (error) {
      if (
        intento >= 2 ||
        !error ||
        typeof error !== 'object' ||
        !('errorNum' in error) ||
        error.errorNum !== 1466
      )
        throw error;
      await setTimeout(1000);
    }
  }
}
