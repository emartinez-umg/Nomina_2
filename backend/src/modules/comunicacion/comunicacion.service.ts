import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import type { Autenticacion, ActorAuditoria } from '../auth/auth.types.js';
import { revalidarActor } from '../auth/auth.service.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import {
  ErrorNegocio,
  ErrorNoEncontrado,
  ErrorProhibido,
  ErrorConflicto,
} from '../../shared/errors/errors.js';
import { escribirCsv } from '../empleados/empleados.csv.js';
import { datosSchema, fechaSchema, instanteSchema, borrarSchema } from './comunicacion.schemas.js';
import type { Tipo, Datos, Query } from './comunicacion.schemas.js';
import * as repo from './comunicacion.repository.js';
const rh = (a: ActorAuditoria) => {
  if (!['ADMIN', 'RH'].includes(a.rol)) throw new ErrorProhibido();
};
export function validarFechas(tipo: Tipo, d: Datos, ahora: string) {
  const schema = tipo === 'anuncios' ? fechaSchema : instanteSchema;
  for (const campo of ['inicio', 'fin'] as const)
    if (!schema.safeParse(d[campo]).success)
      throw new ErrorNegocio('Revisa las fechas y horas.', 422, 'VALIDACION', {
        [campo]: ['Ingresa una fecha y hora válidas.'],
      });
  if (d.fin < d.inicio)
    throw new ErrorNegocio('El fin debe ser posterior al inicio.', 422, 'VALIDACION', {
      fin: ['Selecciona un fin igual o posterior al inicio.'],
    });
  if (tipo === 'eventos' && d.inicio <= ahora.slice(0, 16))
    throw new ErrorNegocio('El evento debe iniciar en el futuro.', 422, 'VALIDACION', {
      inicio: ['Elige una fecha y hora posteriores a la hora actual de Guatemala.'],
    });
  if (tipo === 'eventos' && !d.lugar)
    throw new ErrorNegocio('Indica dónde se realizará el evento.', 422, 'VALIDACION', {
      lugar: ['Escribe el lugar o enlace de la actividad.'],
    });
  if (tipo === 'anuncios' && d.fin < ahora.slice(0, 10))
    throw new ErrorNegocio('La vigencia ya terminó.', 422, 'VALIDACION', {
      fin: ['Elige hoy o una fecha posterior.'],
    });
}
export function crearComunicacionService(db: BaseDatos) {
  const lectura = <T>(fn: (c: Connection) => Promise<T>) =>
    db.conConexion(async (c) => {
      await c.execute('SET TRANSACTION READ ONLY');
      try {
        return await fn(c);
      } finally {
        await c.rollback();
      }
    });
  return {
    listar: (auth: Autenticacion, tipo: Tipo, q: Query) =>
      lectura((c) => repo.listar(c, tipo, q, auth.rol === 'EMPLEADO' ? auth.idUsuario : null)),
    detalle: (auth: Autenticacion, tipo: Tipo, id: number) =>
      lectura(async (c) => {
        const fila = await repo.detalle(
          c,
          tipo,
          id,
          auth.rol === 'EMPLEADO' ? auth.idUsuario : null,
        );
        if (!fila) throw new ErrorNoEncontrado();
        return {
          ...fila,
          destinatarios: auth.rol === 'EMPLEADO' ? [] : await repo.destinatarios(c, tipo, id),
        };
      }),
    guardar: (auth: Autenticacion, ip: string, tipo: Tipo, raw: unknown, id?: number) =>
      enTransaccion(db, async (c) => {
        await bloquearCatalogos(c, true);
        const a = { ...(await revalidarActor(c, auth)), ip };
        rh(a);
        const d = datosSchema.parse(raw);
        validarFechas(tipo, d, await repo.reloj(c));
        await repo.validarGrupos(c, d);
        const antes = id ? await repo.detalle(c, tipo, id, null) : null;
        if (id && !antes) throw new ErrorNoEncontrado();
        if (antes && !antes.activo) throw new ErrorConflicto('La publicación está eliminada.');
        const anterior = antes
          ? { ...antes, destinatarios: await repo.destinatarios(c, tipo, id!) }
          : null;
        const nuevo = await repo.guardar(c, tipo, d, a.idUsuario, id);
        await repo.notificar(c, tipo, nuevo, a.idUsuario);
        await registrarAuditoria(c, {
          actor: a,
          accion: id ? 'EDITAR' : 'CREAR',
          entidad: repo.config[tipo].tabla,
          idEntidad: nuevo,
          antes: anterior,
          despues: { ...d, version: antes ? antes.version + 1 : 1 },
        });
        return { id: nuevo };
      }),
    eliminar: (auth: Autenticacion, ip: string, tipo: Tipo, id: number, raw: unknown) =>
      enTransaccion(db, async (c) => {
        await bloquearCatalogos(c, true);
        const a = { ...(await revalidarActor(c, auth)), ip };
        rh(a);
        const d = borrarSchema.parse(raw),
          antes = await repo.detalle(c, tipo, id, null);
        if (!antes) throw new ErrorNoEncontrado();
        await repo.eliminar(c, tipo, id, d.version, a.idUsuario);
        await registrarAuditoria(c, {
          actor: a,
          accion: 'ELIMINAR',
          entidad: repo.config[tipo].tabla,
          idEntidad: id,
          antes,
          despues: { activo: 0 },
          motivo: d.motivo,
        });
        return { id };
      }),
    exportar: (auth: Autenticacion, tipo: Tipo, q: Query) =>
      lectura(async (c) => {
        const primera = await repo.listar(
          c,
          tipo,
          { ...q, pagina: 1, limite: 100 },
          auth.rol === 'EMPLEADO' ? auth.idUsuario : null,
        );
        if (primera.total > 10000)
          throw new ErrorConflicto(
            'Filtra la consulta a 10,000 publicaciones o menos para exportar.',
          );
        const filas = [...primera.registros];
        for (let p = 2; filas.length < primera.total; p++)
          filas.push(
            ...(
              await repo.listar(
                c,
                tipo,
                { ...q, pagina: p, limite: 100 },
                auth.rol === 'EMPLEADO' ? auth.idUsuario : null,
              )
            ).registros,
          );
        return escribirCsv([
          ['Código', 'Título', 'Contenido', 'Inicio', 'Fin', 'Lugar', 'Todos', 'Activo'],
          ...filas.map((f) => [
            f.codigo,
            f.titulo,
            f.contenido,
            f.inicio,
            f.fin,
            f.lugar,
            String(f.paraTodos),
            String(f.activo),
          ]),
        ]);
      }),
  };
}
