import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { crearSaludRouter } from './modules/salud/salud.routes.js';
import type { SaludService } from './modules/salud/salud.types.js';
import { ErrorNoEncontrado } from './shared/errors/errors.js';
import { manejarErrores } from './shared/middleware/error-handler.js';
import { registrarPeticiones } from './shared/middleware/request-logger.js';

export function crearApp(service: SaludService, logger: Logger) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(registrarPeticiones(logger));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/salud', crearSaludRouter(service));
  app.use(() => {
    throw new ErrorNoEncontrado();
  });
  app.use(manejarErrores(logger));
  return app;
}
