import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import type { ActorAuditoria } from '../auth/auth.types.js';
import { ErrorNegocio } from '../../shared/errors/errors.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import * as repo from './jefaturas.repository.js';
export function validarJerarquia(
  filas: { id: number; superior: number | null }[],
  id: number,
  superior: number | null,
) {
  const padres = new Map(filas.map((f) => [f.id, f.superior]));
  const vistos = new Set<number>([id]);
  let actual = superior;
  while (actual !== null) {
    if (vistos.has(actual))
      throw new ErrorNegocio(
        'La jefatura superior formaría un ciclo. Selecciona otra rama de la organización.',
        409,
        'CICLO_JEFATURA',
        {
          idJefaturaSuperior: [
            'La jefatura no puede depender de sí misma ni de sus descendientes.',
          ],
        },
      );
    vistos.add(actual);
    actual = padres.get(actual) ?? null;
  }
}
export async function validarSuperior(c: Connection, id: number, superior: number | null) {
  validarJerarquia(await repo.jerarquia(c), id, superior);
}
export const obtenerEquipoDeJefe = (db: BaseDatos, idEmpleado: number) =>
  db.conConexion((c) => repo.equipo(c, idEmpleado));
export async function asignarJefaturaMasiva(
  c: Connection,
  actor: ActorAuditoria,
  d: { idJefatura: number; empleados: number[]; motivo: string },
) {
  const j = await repo.destino(c, d.idJefatura);
  if (!j)
    throw new ErrorNegocio('Selecciona una jefatura activa.', 409, 'CONFLICTO', {
      idJefatura: ['La jefatura no existe o está inactiva.'],
    });
  let asignados = 0;
  for (const id of [...d.empleados].sort((a, b) => a - b)) {
    const e = await repo.miembro(c, id);
    if (!e || !e.activo || e.estado !== 'ACTIVO' || e.departamento !== j.departamento)
      throw new ErrorNegocio(
        'Todos los empleados deben estar activos y pertenecer al departamento de la jefatura. Recarga la selección.',
        409,
        'CONFLICTO',
      );
    if (e.idJefatura === j.id) continue;
    await repo.asignar(c, id, j.id, actor.idUsuario);
    await registrarAuditoria(c, {
      actor,
      accion: 'ASIGNAR_JEFATURA',
      entidad: 'EMPLEADOS',
      idEntidad: id,
      antes: { idJefatura: e.idJefatura },
      despues: { idJefatura: j.id },
      motivo: d.motivo,
    });
    asignados++;
  }
  return { asignados, sinCambios: d.empleados.length - asignados };
}
