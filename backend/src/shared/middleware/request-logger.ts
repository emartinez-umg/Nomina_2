import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

export function registrarPeticiones(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    const inicio = performance.now();
    const ruta = req.path;
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      logger.info(
        {
          requestId,
          metodo: req.method,
          ruta,
          estado: res.statusCode,
          duracionMs: Math.round(performance.now() - inicio),
        },
        'Petición completada',
      );
    });
    next();
  };
}
