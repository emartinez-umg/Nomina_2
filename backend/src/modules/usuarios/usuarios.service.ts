import type { Connection } from 'oracledb';
import type { z } from 'zod';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorProhibido } from '../../shared/errors/errors.js';
import {
  baseNombreUsuario,
  generarContrasenaTemporal,
  hashearContrasena,
} from '../../shared/security/credenciales.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { buscarUsuario, cambiarCredencial, revocarSesiones } from '../auth/auth.repository.js';
import { revalidarActor } from '../auth/auth.service.js';
import { usuarioPublico } from '../auth/auth.types.js';
import type { ActorAuditoria, Autenticacion, Rol } from '../auth/auth.types.js';
import * as repository from './usuarios.repository.js';
import { nuevoUsuarioInternoSchema, crearUsuarioSchema } from './usuarios.schemas.js';
import type { UsuariosQuery } from './usuarios.schemas.js';

export async function generarNombreUsuario(c: Connection, nombre: string, apellido: string) {
  const base = baseNombreUsuario(nombre, apellido);
  let usuario = base;
  let sufijo = 2;
  while (await repository.existeUsuario(c, usuario)) usuario = `${base}${sufijo++}`;
  return usuario;
}
// Alta reutilizable para Fase 5; el servicio llamador confirma o revierte toda su transacción.
export async function crearUsuarioInterno(
  c: Connection,
  actor: ActorAuditoria,
  entrada: z.input<typeof nuevoUsuarioInternoSchema>,
) {
  const datos = nuevoUsuarioInternoSchema.parse(entrada);
  if (actor.rol === 'EMPLEADO' || (actor.rol === 'RH' && datos.rol === 'ADMIN'))
    throw new ErrorProhibido();
  await repository.bloquearAdministracion(c);
  const rol = await repository.buscarIdRol(c, datos.rol);
  if (!rol) throw new ErrorNoEncontrado();
  const usuario = await generarNombreUsuario(c, datos.nombre, datos.apellido);
  const contrasenaTemporal = generarContrasenaTemporal();
  let id: number;
  try {
    id = await repository.insertarUsuario(
      c,
      usuario,
      datos.correo,
      await hashearContrasena(contrasenaTemporal),
      rol,
      actor.idUsuario,
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'errorNum' in error && error.errorNum === 1)
      throw new ErrorConflicto('El usuario o correo ya está registrado.');
    throw error;
  }
  await registrarAuditoria(c, {
    actor,
    accion: 'CREAR_USUARIO',
    entidad: 'USUARIOS',
    idEntidad: id,
    despues: { usuario, rol: datos.rol, activo: true, cambioObligatorio: true },
  });
  return { idUsuario: id, usuario, contrasenaTemporal };
}
export function crearUsuariosService(db: BaseDatos) {
  async function modificar(
    auth: Autenticacion,
    id: number,
    ip: string,
    motivo: string,
    cambio: { activo: boolean } | { rol: Rol } | { restablecer: true },
  ) {
    return enTransaccion(db, async (c) => {
      await repository.bloquearAdministracion(c);
      const actor = await revalidarActor(c, auth);
      if (actor.rol !== 'ADMIN') throw new ErrorProhibido();
      const usuario = await buscarUsuario(c, { id });
      if (!usuario) throw new ErrorNoEncontrado();
      const quitarAdmin =
        ('activo' in cambio && !cambio.activo) || ('rol' in cambio && cambio.rol !== 'ADMIN');
      if (
        usuario.rol === 'ADMIN' &&
        usuario.activo &&
        quitarAdmin &&
        (await repository.contarAdmins(c)) <= 1
      ) {
        throw new ErrorConflicto(
          'Debe quedar al menos un administrador activo. Crea o activa otro antes de continuar.',
        );
      }
      const antes = usuarioPublico(usuario);
      let accion: string;
      let contrasenaTemporal: string | undefined;
      if ('activo' in cambio) {
        if (cambio.activo === usuario.activo)
          throw new ErrorConflicto('El usuario ya tiene ese estado.');
        await repository.cambiarEstado(c, id, cambio.activo, actor.idUsuario);
        usuario.activo = cambio.activo;
        accion = cambio.activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO';
      } else if ('rol' in cambio) {
        if (cambio.rol === usuario.rol) throw new ErrorConflicto('El usuario ya tiene ese rol.');
        const rol = await repository.buscarIdRol(c, cambio.rol);
        if (!rol) throw new ErrorNoEncontrado();
        await repository.cambiarRol(c, id, rol, actor.idUsuario);
        usuario.rol = cambio.rol;
        usuario.idRol = rol;
        accion = 'CAMBIAR_ROL';
      } else {
        contrasenaTemporal = generarContrasenaTemporal();
        await cambiarCredencial(
          c,
          id,
          await hashearContrasena(contrasenaTemporal),
          true,
          actor.idUsuario,
        );
        usuario.cambioObligatorio = true;
        accion = 'RESTABLECER_CONTRASENA';
      }
      await revocarSesiones(c, id, actor.idUsuario);
      await registrarAuditoria(c, {
        actor: { ...actor, ip },
        accion,
        entidad: 'USUARIOS',
        idEntidad: id,
        antes,
        despues: usuarioPublico(usuario),
        motivo,
      });
      return {
        usuario: usuarioPublico(usuario),
        ...(contrasenaTemporal ? { contrasenaTemporal } : {}),
      };
    });
  }
  return {
    crear: (auth: Autenticacion, ip: string, entrada: z.infer<typeof crearUsuarioSchema>) =>
      enTransaccion(db, async (c) => {
        await repository.bloquearAdministracion(c);
        const actor = await revalidarActor(c, auth);
        if (actor.rol !== 'ADMIN') throw new ErrorProhibido();
        const { motivo, nombre, apellido, correo, rol } = crearUsuarioSchema.parse(entrada);
        const datos = { nombre, apellido, correo, rol };
        const creado = await crearUsuarioInterno(c, { ...actor, ip }, datos);
        await registrarAuditoria(c, {
          actor: { ...actor, ip },
          accion: 'AUTORIZAR_ALTA_USUARIO',
          entidad: 'USUARIOS',
          idEntidad: creado.idUsuario,
          motivo,
        });
        return creado;
      }),
    listar: (q: UsuariosQuery) => db.conConexion((c) => repository.listarUsuarios(c, q)),
    modificar,
  };
}
