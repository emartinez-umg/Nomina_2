import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argon2id, hash } from 'argon2';
import type { Logger } from 'pino';
import { dividirSql } from './migraciones.archivos.js';
import type { BaseDatos } from './pool.js';
import type { CredencialesAdmin } from './seeds.env.js';
import { crearSeedsRepository } from './seeds.repository.js';
import type { SeedsRepository } from './seeds.repository.js';

export async function cargarSeeds(): Promise<string[]> {
  const directorio = fileURLToPath(new URL('../../../../db/seeds/', import.meta.url));
  const archivos = (await readdir(directorio)).filter((archivo) => archivo.endsWith('.sql')).sort();
  if (!archivos.length || archivos.some((archivo) => !/^S\d{3}__[a-z0-9_]+\.sql$/.test(archivo))) {
    throw new Error('No hay seeds SQL válidos.');
  }
  const versiones = archivos.map((archivo) => archivo.slice(1, 4));
  if (new Set(versiones).size !== versiones.length) throw new Error('Hay seeds duplicados.');
  const sql = await Promise.all(
    archivos.map((archivo) => readFile(join(directorio, archivo), 'utf8')),
  );
  return sql.flatMap(dividirSql);
}

export async function aplicarSeeds(
  sentencias: string[],
  repository: SeedsRepository,
  admin: CredencialesAdmin,
): Promise<void> {
  try {
    for (const sql of sentencias) await repository.ejecutar(sql);
    const existente = await repository.buscarAdmin(admin.ADMIN_USER);
    if (existente && existente[1] !== 'ADMIN') {
      throw new Error('El usuario inicial ya existe con otro rol. No se elevarán sus permisos.');
    }
    if (!existente) {
      const credencial = await hash(admin.ADMIN_PASSWORD, {
        type: argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
      await repository.crearAdmin(admin.ADMIN_USER, admin.ADMIN_EMAIL, credencial);
    }
    await repository.confirmar();
  } catch (error) {
    await repository.revertir();
    throw error;
  }
}

export async function ejecutarSeeds(
  db: BaseDatos,
  logger: Logger,
  admin: CredencialesAdmin,
): Promise<void> {
  const sentencias = await cargarSeeds();
  await db.conConexion((conexion) =>
    aplicarSeeds(sentencias, crearSeedsRepository(conexion), admin),
  );
  logger.info('Seeds aplicados sin sobrescribir configuraciones ni credenciales existentes');
}
