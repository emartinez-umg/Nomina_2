import type { CookieOptions, Request, Response } from 'express';
import type { AuthService, ConfigSeguridad } from './auth.service.js';
import { usuarioPublico } from './auth.types.js';
import { cambioSchema, loginSchema, sinDatos } from './auth.schemas.js';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { coincideToken } from '../../shared/security/credenciales.js';
import { COOKIE_CSRF, COOKIE_PRELOGIN, COOKIE_SESION } from '../../shared/security/csrf.js';
import type { crearCsrfPrelogin } from '../../shared/security/csrf.js';
import { ErrorNoAutorizado, ErrorProhibido } from '../../shared/errors/errors.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';

export const contextoDe = (req: Request) => ({
  ip: req.ip ?? '',
  agente: (req.get('User-Agent') ?? '').slice(0, 500),
});
export function crearAuthController(
  service: AuthService,
  config: ConfigSeguridad,
  csrf: ReturnType<typeof crearCsrfPrelogin>,
) {
  const opciones: CookieOptions = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
  };
  const entregar = (res: Response, resultado: Awaited<ReturnType<AuthService['login']>>) => {
    // Cookie de navegador; la vigencia por inactividad se comprueba y renueva exclusivamente en Oracle.
    res.cookie(COOKIE_SESION, resultado.token, opciones);
    res.cookie(COOKIE_CSRF, resultado.csrf, opciones);
    res.clearCookie(COOKIE_PRELOGIN, opciones);
    res.json(respuestaOk({ usuario: resultado.usuario, csrfToken: resultado.csrf }));
  };
  return {
    async csrf(req: Request, res: Response) {
      sinDatos.parse(req.query);
      res.setHeader('Cache-Control', 'no-store');
      if (req.cookies?.[COOKIE_SESION]) {
        let auth;
        try {
          auth = await service.autenticar(req.cookies[COOKIE_SESION]);
        } catch (error) {
          if (error instanceof ErrorNoAutorizado) {
            res.clearCookie(COOKIE_SESION, opciones);
            res.clearCookie(COOKIE_CSRF, opciones);
          }
          throw error;
        }
        const token: unknown = req.cookies?.[COOKIE_CSRF];
        if (!coincideToken(token, auth.csrfHash)) {
          res.clearCookie(COOKIE_SESION, opciones);
          res.clearCookie(COOKIE_CSRF, opciones);
          throw new ErrorProhibido(
            'Inicia sesión de nuevo para recuperar el token CSRF.',
            'CSRF_INVALIDO',
          );
        }
        res.json(respuestaOk({ csrfToken: token }));
      } else {
        const token = csrf.emitir();
        res.cookie(COOKIE_PRELOGIN, token, { ...opciones, maxAge: 600000 });
        res.json(respuestaOk({ csrfToken: token }));
      }
    },
    async login(req: Request, res: Response) {
      sinDatos.parse(req.query);
      const datos = loginSchema.parse(req.body);
      entregar(res, await service.login(datos.usuario, datos.contrasena, contextoDe(req)));
    },
    sesion(req: Request, res: Response) {
      sinDatos.parse(req.query);
      res.json(respuestaOk(usuarioPublico(autenticacionDe(req))));
    },
    async logout(req: Request, res: Response) {
      sinDatos.parse(req.query);
      sinDatos.parse(req.body ?? {});
      await service.logout(autenticacionDe(req), contextoDe(req).ip);
      res.clearCookie(COOKIE_SESION, opciones);
      res.clearCookie(COOKIE_CSRF, opciones);
      res.json(respuestaOk({ mensaje: 'Sesión cerrada.' }));
    },
    async cambiar(req: Request, res: Response) {
      sinDatos.parse(req.query);
      const datos = cambioSchema.parse(req.body);
      entregar(
        res,
        await service.cambiarContrasena(
          autenticacionDe(req),
          datos.contrasenaActual,
          datos.contrasenaNueva,
          contextoDe(req),
        ),
      );
    },
  };
}
