import type { RequestHandler } from 'express';
import type { AuthService } from '../../modules/auth/auth.service.js';
import { COOKIE_SESION } from './csrf.js';

export function autenticar(service: AuthService): RequestHandler {
  return async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const csrf = ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      ? undefined
      : (req.get('X-CSRF-Token') ?? '');
    req.autenticacion = await service.autenticar(req.cookies?.[COOKIE_SESION], csrf);
    next();
  };
}
