import type { BaseDatos } from '../../shared/db/pool.js';
import type { SaludRepository } from './salud.types.js';

export function crearSaludRepository(db: BaseDatos): SaludRepository {
  return {
    async verificarConexion() {
      await db.conConexion(async (conexion) => {
        const resultado = await conexion.execute<[number]>('SELECT 1 FROM DUAL');
        if (resultado.rows?.[0]?.[0] !== 1) {
          throw new Error('Oracle no respondió correctamente a la consulta de salud.');
        }
      });
    },
  };
}
