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
  listar: (q: AuditoriaQuery) => db.conConexion((c) => listarAuditoria(c, q)),
});
