import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

export function registrarPeticiones(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    const inicio = performance.now();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      logger.info(
        {
          requestId,
          metodo: req.method,
          // La URL puede contener datos personales incluso en una ruta inexistente.
          ruta: typeof req.route?.path === 'string' ? req.route.path : '(sin coincidencia)',
          estado: res.statusCode,
          duracionMs: Math.round(performance.now() - inicio),
        },
        'Petición completada',
      );
    });
    next();
  };
}
