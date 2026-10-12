import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ErrorProhibido } from '../errors/errors.js';

export const COOKIE_SESION = 'nomina2_sesion';
export const COOKIE_CSRF = 'nomina2_csrf';
export const COOKIE_PRELOGIN = 'nomina2_prelogin';

// Doble envío firmado para proteger también el login antes de que exista una sesión.
export function crearCsrfPrelogin() {
  const clave = randomBytes(32);
  const firmar = (dato: string) => createHmac('sha256', clave).update(dato).digest('hex');
  return {
    emitir() {
      const dato = `${Date.now()}.${randomBytes(32).toString('hex')}`;
      return `${dato}.${firmar(dato)}`;
    },
    verificar: ((req, _res, next) => {
      const token = req.get('X-CSRF-Token');
      const cookie: unknown = req.cookies?.[COOKIE_PRELOGIN];
      if (
        typeof token !== 'string' ||
        token !== cookie ||
        !/^\d{13}\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token)
      ) {
        throw new ErrorProhibido('Obtén un token CSRF antes de iniciar sesión.', 'CSRF_INVALIDO');
      }
      const [fecha, nonce, firma] = token.split('.') as [string, string, string];
      const edad = Date.now() - Number(fecha);
      if (
        edad < 0 ||
        edad > 600000 ||
        !timingSafeEqual(Buffer.from(firma, 'hex'), Buffer.from(firmar(`${fecha}.${nonce}`), 'hex'))
      ) {
        throw new ErrorProhibido(
          'El token CSRF venció o es inválido. Solicita uno nuevo.',
          'CSRF_INVALIDO',
        );
      }
      next();
    }) satisfies RequestHandler,
  };
}
