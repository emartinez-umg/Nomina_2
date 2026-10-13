import { escribirCsv } from '../empleados/empleados.csv.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { insertarAuditoria, listarAuditoria } from './auditoria.repository.js';
import type { RegistroAuditoria } from './auditoria.repository.js';
import type { AuditoriaQuery } from './auditoria.schemas.js';

export function depurarAuditoria(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(depurarAuditoria);
  if (valor && typeof valor === 'object') {
    if (valor instanceof Date) return valor.toISOString();
    return Object.fromEntries(
      Object.entries(valor)
        .filter(
          ([clave]) =>
            !/contras|password|token|csrf|cookie|authorization|dpi|nit|cuenta.?banc|afiliacion/i.test(
              clave,
            ),
        )
        .map(([clave, dato]) => [clave, depurarAuditoria(dato)]),
    );
  }
  return valor;
}
// Recibe la conexión de la operación de negocio; nunca confirma una transacción por su cuenta.
export function registrarAuditoria(c: Connection, registro: RegistroAuditoria) {
  return insertarAuditoria(c, {
    ...registro,
    antes: depurarAuditoria(registro.antes),
    despues: depurarAuditoria(registro.despues),
  });
}
export const crearAuditoriaService = (db: BaseDatos) => ({
  exportar: (q: AuditoriaQuery) =>
    db.conConexion(async (c) => {
      await c.execute('SET TRANSACTION READ ONLY');
      try {
        const primera = await listarAuditoria(c, { ...q, pagina: 1, limite: 100 });
        if (primera.total > 10000)
          throw new ErrorConflicto('Filtra a 10,000 acciones o menos antes de exportar.');
        const filas = [...primera.registros];
        for (let pagina = 2; filas.length < primera.total; pagina++)
          filas.push(...(await listarAuditoria(c, { ...q, pagina, limite: 100 })).registros);
        return escribirCsv([
          ['Fecha', 'Usuario', 'Rol', 'Acción', 'Entidad', 'ID entidad', 'Motivo', 'IP'],
          ...filas.map((f) => [
            f.fecha,
            f.idUsuario,
            f.rol,
            f.accion,
            f.entidad,
            f.idEntidad,
            f.motivo,
            f.ip,
          ]),
        ]);
      } finally {
        await c.rollback();
      }
    }),
  listar: (q: AuditoriaQuery) => db.conConexion((c) => listarAuditoria(c, q)),
});
