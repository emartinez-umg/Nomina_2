import { config } from '../../config/env.js';
import { crearLogger } from '../../config/logger.js';
import { ejecutarMigraciones } from './migraciones.js';
import { ErrorMigracion } from './migraciones.archivos.js';
import { crearBaseDatos } from './pool.js';
import type { BaseDatos } from './pool.js';

const logger = crearLogger(config.LOG_LEVEL);
let db: BaseDatos | undefined;
try {
  db = await crearBaseDatos(config);
  await ejecutarMigraciones(db, logger);
} catch (error) {
  logger.fatal(
    {
      err: error,
      detalle: error instanceof ErrorMigracion ? error.message : 'Revisa Oracle y .env.',
    },
    'No se pudieron aplicar las migraciones',
  );
  process.exitCode = 1;
} finally {
  await db?.cerrar();
}
