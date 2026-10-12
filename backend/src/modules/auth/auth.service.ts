import { verify } from 'argon2';
import type { Connection } from 'oracledb';
import type { Config } from '../../config/env.schema.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { ErrorNegocio, ErrorNoAutorizado, ErrorProhibido } from '../../shared/errors/errors.js';
import {
  coincideToken,
  generarToken,
  hashToken,
  hashearContrasena,
  politicaContrasena,
  tokenValido,
} from '../../shared/security/credenciales.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import * as repository from './auth.repository.js';
import { usuarioPublico } from './auth.types.js';
import type { Autenticacion, ContextoPeticion } from './auth.types.js';

export type ConfigSeguridad = Pick<
  Config,
  | 'NODE_ENV'
  | 'SESSION_IDLE_MINUTES'
  | 'LOGIN_RATE_LIMIT'
  | 'LOGIN_RATE_WINDOW_MINUTES'
  | 'TRUST_PROXY_CIDRS'
>;
const errorCredenciales = () =>
  new ErrorNegocio('Usuario o contraseña incorrectos.', 401, 'CREDENCIALES_INVALIDAS');
const errorBloqueo = () =>
  new ErrorNegocio(
    'La cuenta está bloqueada durante 15 minutos. Intenta más tarde.',
    423,
    'CUENTA_BLOQUEADA',
  );

// Revalidar dentro de la transacción evita usar permisos revocados entre middleware y servicio.
export async function revalidarActor(c: Connection, auth: Autenticacion, permitirTemporal = false) {
  const usuario = await repository.buscarUsuario(c, { id: auth.idUsuario });
  if (!usuario?.activo) throw new ErrorNoAutorizado();
  const sesion = await repository.sesionVigente(c, usuario.idUsuario, { id: auth.idSesion });
  if (!sesion || !sesion.csrfHash.equals(auth.csrfHash)) throw new ErrorNoAutorizado();
  if (!permitirTemporal && usuario.cambioObligatorio) {
    throw new ErrorProhibido(
      'Cambia tu contraseña temporal para continuar.',
      'CAMBIO_CONTRASENA_OBLIGATORIO',
    );
  }
  return { ...usuarioPublico(usuario), ...sesion };
}
export async function crearAuthService(db: BaseDatos, config: ConfigSeguridad) {
  // La verificación ficticia evita omitir Argon2 para un usuario inexistente.
  const hashInexistente = await hashearContrasena(generarToken());
  return {
    async login(usuario: string, contrasena: string, ctx: ContextoPeticion) {
      const resultado = await enTransaccion(db, async (c) => {
        const u = await repository.buscarUsuario(c, { usuario });
        const coincide = await verify(u?.contrasenaHash ?? hashInexistente, contrasena);
        if (!u?.activo || !coincide || u.bloqueado) {
          const bloqueado =
            u?.activo && !u.bloqueado
              ? await repository.registrarFallo(c, u.idUsuario)
              : u?.bloqueado;
          await registrarAuditoria(c, {
            actor: u ? { ...u, ip: ctx.ip } : null,
            accion: bloqueado ? 'LOGIN_BLOQUEADO' : 'LOGIN_FALLIDO',
            entidad: 'USUARIOS',
            idEntidad: u?.idUsuario ?? null,
            ip: ctx.ip,
          });
          // El fallo se confirma antes de producir el error HTTP, conservando el contador y la auditoría.
          return { error: bloqueado ? errorBloqueo() : errorCredenciales() };
        }
        await repository.registrarAcceso(c, u.idUsuario);
        const token = generarToken();
        const csrf = generarToken();
        await repository.crearSesion(
          c,
          u.idUsuario,
          hashToken(token),
          hashToken(csrf),
          config.SESSION_IDLE_MINUTES,
          ctx,
        );
        await registrarAuditoria(c, {
          actor: { ...u, ip: ctx.ip },
          accion: 'LOGIN',
          entidad: 'USUARIOS',
          idEntidad: u.idUsuario,
        });
        return { usuario: usuarioPublico(u), token, csrf };
      });
      if ('error' in resultado) throw resultado.error;
      return resultado;
    },
    async autenticar(token: unknown, csrf?: unknown) {
      if (!tokenValido(token)) throw new ErrorNoAutorizado();
      return enTransaccion(db, async (c): Promise<Autenticacion> => {
        const id = await repository.usuarioDeToken(c, hashToken(token));
        if (!id) throw new ErrorNoAutorizado();
        const u = await repository.buscarUsuario(c, { id });
        if (!u?.activo) throw new ErrorNoAutorizado();
        const sesion = await repository.sesionVigente(c, id, { token: hashToken(token) });
        if (!sesion) throw new ErrorNoAutorizado();
        if (csrf !== undefined && !coincideToken(csrf, sesion.csrfHash)) {
          throw new ErrorProhibido(
            'El token CSRF es inválido. Actualiza la sesión e intenta de nuevo.',
            'CSRF_INVALIDO',
          );
        }
        await repository.renovarActividad(c, sesion.idSesion, config.SESSION_IDLE_MINUTES);
        return { ...usuarioPublico(u), ...sesion };
      });
    },
    async logout(auth: Autenticacion, ip: string) {
      await enTransaccion(db, async (c) => {
        const u = await revalidarActor(c, auth, true);
        await repository.revocarSesiones(c, u.idUsuario, u.idUsuario, u.idSesion);
        await registrarAuditoria(c, {
          actor: { ...u, ip },
          accion: 'LOGOUT',
          entidad: 'USUARIOS',
          idEntidad: u.idUsuario,
        });
      });
    },
    async cambiarContrasena(
      auth: Autenticacion,
      actual: string,
      nueva: string,
      ctx: ContextoPeticion,
    ) {
      politicaContrasena.parse(nueva);
      const hash = await hashearContrasena(nueva);
      const resultado = await enTransaccion(db, async (c) => {
        const actor = await revalidarActor(c, auth, true);
        const u = (await repository.buscarUsuario(c, { id: actor.idUsuario }))!;
        if (!(await verify(u.contrasenaHash, actual))) {
          await registrarAuditoria(c, {
            actor: { ...actor, ip: ctx.ip },
            accion: 'CAMBIO_CONTRASENA_FALLIDO',
            entidad: 'USUARIOS',
            idEntidad: u.idUsuario,
          });
          return { error: errorCredenciales() };
        }
        if (await verify(u.contrasenaHash, nueva)) {
          throw new ErrorNegocio(
            'La contraseña nueva debe ser diferente de la actual.',
            422,
            'CONTRASENA_REUTILIZADA',
            { contrasenaNueva: ['Elige una contraseña diferente.'] },
          );
        }
        await repository.cambiarCredencial(c, u.idUsuario, hash, false, u.idUsuario);
        await repository.revocarSesiones(c, u.idUsuario, u.idUsuario);
        const token = generarToken();
        const csrf = generarToken();
        await repository.crearSesion(
          c,
          u.idUsuario,
          hashToken(token),
          hashToken(csrf),
          config.SESSION_IDLE_MINUTES,
          ctx,
        );
        await registrarAuditoria(c, {
          actor: { ...actor, ip: ctx.ip },
          accion: 'CAMBIO_CONTRASENA',
          entidad: 'USUARIOS',
          idEntidad: u.idUsuario,
          antes: { cambioObligatorio: u.cambioObligatorio },
          despues: { cambioObligatorio: false },
        });
        return {
          token,
          csrf,
          usuario: { ...usuarioPublico(u), cambioObligatorio: false },
        };
      });
      if ('error' in resultado) throw resultado.error;
      return resultado;
    },
  };
}
export type AuthService = Awaited<ReturnType<typeof crearAuthService>>;
