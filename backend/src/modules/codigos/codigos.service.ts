import type { BaseDatos } from '../../shared/db/pool.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../../shared/errors/errors.js';
import type { VistaPrevia } from './codigos.schemas.js';
import { generarCodigoGenerico } from './codigos.generador.js';
import * as repository from './codigos.repository.js';
export function crearCodigosService(db: BaseDatos) {
  return {
    async vistaPrevia(q: VistaPrevia) {
      if (
        !['empleados', 'solicitudes', 'prestamos', 'descuentos', 'eventos', 'anuncios'].includes(
          q.entidad,
        ) &&
        !generarCodigoGenerico(q.palabra ?? '')
      )
        throw new ErrorValidacion({
          palabra: ['Escribe un nombre con al menos una palabra significativa.'],
        });
      try {
        return {
          codigo: await db.conConexion((c) => repository.vistaPrevia(c, q)),
          definitivo: false,
        };
      } catch (e) {
        if (e && typeof e === 'object' && 'errorNum' in e && e.errorNum === 1403)
          throw new ErrorNoEncontrado();
        throw e;
      }
    },
  };
}
