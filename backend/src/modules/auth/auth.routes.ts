import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { autenticar } from '../../shared/security/autenticar.js';
import { crearCsrfPrelogin } from '../../shared/security/csrf.js';
import { permitirRoles } from '../../shared/security/rbac.js';
import { ErrorNegocio } from '../../shared/errors/errors.js';
import { crearAuthController } from './auth.controller.js';
import type { AuthService, ConfigSeguridad } from './auth.service.js';

export function crearAuthRouter(service: AuthService, config: ConfigSeguridad) {
  const router = Router();
  const csrf = crearCsrfPrelogin();
  const controller = crearAuthController(service, config, csrf);
  const limitar = rateLimit({
    windowMs: config.LOGIN_RATE_WINDOW_MINUTES * 60000,
    limit: config.LOGIN_RATE_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Sin proxies configurados se usa exclusivamente la IP del socket, incluso si llega X-Forwarded-For.
    validate: { xForwardedForHeader: Boolean(config.TRUST_PROXY_CIDRS) },
    handler: (_req, _res, next) =>
      next(
        new ErrorNegocio(
          'Demasiados intentos. Espera unos minutos e intenta nuevamente.',
          429,
          'LIMITE_INTENTOS',
        ),
      ),
  });
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/csrf', controller.csrf);
  router.post('/login', limitar, csrf.verificar, controller.login);
  router.use(autenticar(service), permitirRoles('ADMIN', 'RH', 'EMPLEADO'));
  router.get('/sesion', controller.sesion);
  router.post('/logout', controller.logout);
  router.post('/cambiar-contrasena', limitar, controller.cambiar);
  return router;
}
