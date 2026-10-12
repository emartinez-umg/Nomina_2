import { config } from '../../config/env.js';
import { crearLogger } from '../../config/logger.js';
import { crearBaseDatos } from './pool.js';
import type { BaseDatos } from './pool.js';
import { ejecutarSeeds } from './seeds.js';
import { validarEntornoSeeds } from './seeds.env.js';

const logger = crearLogger(config.LOG_LEVEL);
let db: BaseDatos | undefined;
try {
  const admin = validarEntornoSeeds(process.env);
  db = await crearBaseDatos(config);
  await ejecutarSeeds(db, logger, admin);
} catch (error) {
  logger.fatal(
    { err: error },
    'No se pudieron aplicar los seeds. Revisa Oracle y ADMIN_* en .env.',
  );
  process.exitCode = 1;
} finally {
  await db?.cerrar();
}
