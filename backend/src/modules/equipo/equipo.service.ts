import { createHash } from 'node:crypto';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorProhibido } from '../../shared/errors/errors.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { revalidarActor } from '../auth/auth.service.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { equipo } from '../jefaturas/jefaturas.repository.js';
import { crearSaldosVacacionesService } from '../vacaciones/vacaciones.saldos.service.js';
import { equipoQuerySchema, permisosEquipo } from './equipo.schemas.js';
import type { PermisoEquipo, EquipoQuery, cambiosPermisosSchema } from './equipo.schemas.js';
import type { z } from 'zod';
import * as repo from './equipo.repository.js';

export async function resolverAlcanceEquipo(
  c: Connection,
  sesion: Autenticacion,
  permiso?: PermisoEquipo,
) {
  if (sesion.rol !== 'EMPLEADO' || sesion.cambioObligatorio) throw new ErrorProhibido();
  const id = await repo.empleadoSesion(c, sesion.idUsuario);
  if (!id) throw new ErrorProhibido();
  const concesiones = await repo.concesiones(c, id);
  const permisos = [...new Set(concesiones.map((p) => p.permiso))].sort();
  if (!permisos.length || (permiso && !permisos.includes(permiso)))
    throw new ErrorProhibido('No tienes este permiso de equipo. Consulta a Recursos Humanos.');
  const raices = [
    ...new Set(concesiones.filter((p) => !permiso || p.permiso === permiso).map((p) => p.jefatura)),
  ];
  return { permisos, empleados: await equipo(c, id, raices) };
}
export function crearEquipoService(db: BaseDatos) {
  async function leer<T>(
    auth: Autenticacion,
    permiso: PermisoEquipo | undefined,
    fn: (c: Connection, alcance: Awaited<ReturnType<typeof resolverAlcanceEquipo>>) => Promise<T>,
  ) {
    return db.conConexion(async (c) => {
      await c.execute('SET TRANSACTION READ ONLY');
      try {
        return await fn(c, await resolverAlcanceEquipo(c, auth, permiso));
      } finally {
        await c.rollback();
      }
    });
  }
  const saldos = crearSaldosVacacionesService(
    db,
    async (c, auth) => (await resolverAlcanceEquipo(c, auth, 'VER_VACACIONES_EQUIPO')).empleados,
  );
  async function configuracion(c: Connection, id: number) {
    const j = await repo.jefatura(c, id);
    if (!j) throw new ErrorNoEncontrado();
    const catalogo = (await repo.catalogoPermisos(c, id)).map((p) => ({
      ...p,
      activo: p.activo === 1,
    }));
    const revision = createHash('sha256').update(JSON.stringify({ j, catalogo })).digest('hex');
    return {
      jefatura: j.nombre,
      equipo: j.responsable && j.activo ? (await equipo(c, j.responsable, [id])).length : 0,
      permisos: catalogo,
      revision,
    };
  }
  function administrar(auth: Autenticacion) {
    if (!['RH', 'ADMIN'].includes(auth.rol)) throw new ErrorProhibido();
  }
  return {
    autorizar: (auth: Autenticacion, permiso: PermisoEquipo) =>
      leer(auth, permiso, async () => undefined),
    resumen: (auth: Autenticacion) =>
      leer(auth, undefined, async (_c, a) => ({ permisos: a.permisos, total: a.empleados.length })),
    listar: (auth: Autenticacion, q: EquipoQuery) =>
      leer(auth, 'VER_EQUIPO', async (c, a) => {
        const filas = await repo.personas(c, a.empleados, q);
        const comparador = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
        filas.sort(
          (a, b) =>
            (comparador.compare(a[q.ordenarPor] ?? '', b[q.ordenarPor] ?? '') || a.id - b.id) *
            (q.direccion === 'asc' ? 1 : -1),
        );
        return {
          registros: filas
            .slice((q.pagina - 1) * q.limite, q.pagina * q.limite)
            .map(({ id, codigo, nombre, puesto, departamento, centro }) => ({
              id,
              codigo,
              nombre,
              puesto,
              departamento,
              centro,
            })),
          total: filas.length,
          equipo: a.empleados.length,
          pagina: q.pagina,
          limite: q.limite,
        };
      }),
    opciones: (auth: Autenticacion, permiso: PermisoEquipo) =>
      leer(auth, permiso, async (c, a) => {
        const filas = await repo.personas(c, a.empleados, equipoQuerySchema.parse({}));
        const opciones = (
          id: 'idDepartamento' | 'idCentroTrabajo' | 'idJefatura',
          nombre: 'departamento' | 'centro' | 'jefatura',
        ) =>
          [
            ...new Map(
              filas
                .filter((f) => f[id] !== null)
                .map((f) => [f[id], { id: f[id]!, nombre: f[nombre]! }]),
            ).values(),
          ].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return {
          departamentos: opciones('idDepartamento', 'departamento'),
          centros: opciones('idCentroTrabajo', 'centro'),
          jefaturas: opciones('idJefatura', 'jefatura'),
        };
      }),
    saldos,
    permisos: (auth: Autenticacion, id: number) => {
      administrar(auth);
      return db.conConexion((c) => configuracion(c, id));
    },
    guardarPermisos: (
      auth: Autenticacion,
      ip: string,
      id: number,
      d: z.infer<typeof cambiosPermisosSchema>,
    ) => {
      administrar(auth);
      return enTransaccion(db, async (c) => {
        const actor = await revalidarActor(c, auth);
        administrar(actor);
        if (!(await repo.jefatura(c, id, true))) throw new ErrorNoEncontrado();
        const antes = await configuracion(c, id);
        if (antes.revision !== d.revision)
          throw new ErrorConflicto(
            'La jefatura o sus permisos cambiaron. Recarga y revisa de nuevo.',
          );
        for (const p of permisosEquipo)
          if (antes.permisos.find((v) => v.codigo === p)?.activo !== d.permisos.includes(p))
            await repo.guardarPermiso(c, id, p, d.permisos.includes(p), actor.idUsuario);
        const despues = await configuracion(c, id);
        await registrarAuditoria(c, {
          actor: { ...actor, ip },
          accion: 'CAMBIAR_PERMISOS_JEFATURA',
          entidad: 'JEFATURAS',
          idEntidad: id,
          antes: { permisos: antes.permisos },
          despues: { permisos: despues.permisos },
          motivo: d.motivo,
        });
        return despues;
      });
    },
  };
}
