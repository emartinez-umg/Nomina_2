import type { Connection } from 'oracledb';
import type { BaseDatos } from './pool.js';

export function enTransaccion<T>(db: BaseDatos, operacion: (c: Connection) => Promise<T>) {
  return db.conConexion(async (c) => {
    try {
      const resultado = await operacion(c);
      await c.commit();
      return resultado;
    } catch (error) {
      await c.rollback();
      throw error;
    }
  });
}
