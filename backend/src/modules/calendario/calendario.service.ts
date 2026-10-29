import type { BaseDatos } from '../../shared/db/pool.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { ErrorProhibido } from '../../shared/errors/errors.js';
import { reloj } from '../comunicacion/comunicacion.repository.js';
import { aniosConDatos } from './calendario.repository.js';
import type { FuenteAnios } from './calendario.schemas.js';
import { crearComisionesService } from '../tableros/comisiones.service.js';
export function crearCalendarioService(db: BaseDatos) {
  return {
    consultar(auth: Autenticacion, fuente: FuenteAnios) {
      if (fuente === 'comisiones') return crearComisionesService(db).anios(auth);
      if (auth.rol === 'EMPLEADO' && !['planillas', 'vacaciones', 'parqueo'].includes(fuente))
        throw new ErrorProhibido();
      return db.conConexion(async (c) => {
        await c.execute('SET TRANSACTION READ ONLY');
        try {
          const anioActual = Number((await reloj(c)).slice(0, 4));
          const anios = [
            ...new Set([
              anioActual,
              ...(await aniosConDatos(c, fuente, auth.rol === 'EMPLEADO' ? auth.idUsuario : null)),
            ]),
          ].sort((a, b) => a - b);
          return { fuente, anioActual, anioMin: anios[0]!, anioMax: anios.at(-1)!, anios };
        } finally {
          await c.rollback();
        }
      });
    },
  };
}
