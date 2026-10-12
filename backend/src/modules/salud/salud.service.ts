import type { Logger } from 'pino';
import { ErrorServicioNoDisponible } from '../../shared/errors/errors.js';
import type { SaludRepository, SaludService } from './salud.types.js';

export function crearSaludService(repository: SaludRepository, logger: Logger): SaludService {
  return {
    async consultar() {
      try {
        await repository.verificarConexion();
      } catch (error) {
        logger.error({ err: error }, 'Falló la comprobación de Oracle');
        throw new ErrorServicioNoDisponible();
      }
      return {
        estado: 'OK',
        baseDatos: 'CONECTADA',
        modo: 'thin',
        fecha: new Date().toISOString(),
      };
    },
  };
}
