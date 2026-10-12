import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export class ErrorMigracion extends Error {}

export interface Migracion {
  version: number;
  archivo: string;
  checksum: string;
  sentencias: string[];
}

export function dividirSql(sql: string): string[] {
  const bloques = sql.split(/^[\t ]*\/[\t ]*\r?$/m);
  const sentencias = bloques.flatMap((bloque) => {
    const limpio = bloque.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, '').trim();
    if (!limpio) return [];
    const plsql =
      /^(BEGIN|DECLARE|CREATE\s+(OR\s+REPLACE\s+)?(PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE))\b/i.test(
        limpio,
      );
    return [plsql ? limpio : limpio.replace(/;\s*$/, '')];
  });
  if (!sentencias.length) throw new ErrorMigracion('Una migración no puede estar vacía.');
  if (!/\n[\t ]*\/[\t ]*(?:\r?\n)?\s*$/.test(sql)) {
    throw new ErrorMigracion('Cada sentencia debe terminar con / en una línea independiente.');
  }
  return sentencias;
}

export async function cargarMigraciones(directorio: string): Promise<Migracion[]> {
  const archivos = (await readdir(directorio)).filter((archivo) => archivo.endsWith('.sql'));
  const migraciones = await Promise.all(
    archivos.map(async (archivo): Promise<Migracion> => {
      const coincidencia = /^V(\d{3,6})__[a-z0-9_]+\.sql$/.exec(archivo);
      if (!coincidencia?.[1] || archivo.length > 200) {
        throw new ErrorMigracion(`Nombre de migración inválido: ${archivo}.`);
      }
      const sql = await readFile(join(directorio, archivo), 'utf8');
      return {
        version: Number(coincidencia[1]),
        archivo,
        checksum: createHash('sha256').update(sql).digest('hex'),
        sentencias: dividirSql(sql),
      };
    }),
  );
  if (!migraciones.length) throw new ErrorMigracion('No se encontraron migraciones SQL.');
  migraciones.sort((a, b) => a.version - b.version);
  if (new Set(migraciones.map((migracion) => migracion.version)).size !== migraciones.length) {
    throw new ErrorMigracion('Hay versiones de migración duplicadas.');
  }
  return migraciones;
}
