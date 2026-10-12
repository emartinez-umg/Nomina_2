import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import type { BaseDatos } from './pool.js';
import { cargarMigraciones, ErrorMigracion } from './migraciones.archivos.js';
import type { Migracion } from './migraciones.archivos.js';
import { crearMigracionesRepository } from './migraciones.repository.js';
import type { MigracionesRepository } from './migraciones.repository.js';

export async function aplicarMigraciones(
  migraciones: Migracion[],
  repository: MigracionesRepository,
  logger: Logger,
): Promise<number> {
  await repository.preparar();
  const historial = await repository.listar();
  for (const [version, archivo, checksum, estado] of historial) {
    const local = migraciones.find((migracion) => migracion.version === version);
    if (!local || local.checksum !== checksum.trim() || local.archivo !== archivo) {
      throw new ErrorMigracion(`La migración V${version} falta o cambió después de registrarse.`);
    }
    if (estado !== 'APLICADA') {
      throw new ErrorMigracion(`La migración ${archivo} está ${estado}. Requiere revisión manual.`);
    }
  }
  const versiones = new Set(historial.map(([version]) => version));
  const ultimaVersion = Math.max(-1, ...versiones);
  const pendientes = migraciones.filter((migracion) => !versiones.has(migracion.version));
  if (pendientes.some((migracion) => migracion.version < ultimaVersion)) {
    throw new ErrorMigracion('No se permiten migraciones anteriores a la última versión aplicada.');
  }
  for (const migracion of pendientes) {
    await repository.iniciar(migracion);
    try {
      for (const sql of migracion.sentencias) await repository.ejecutar(sql);
      await repository.completar(migracion.version);
      logger.info({ archivo: migracion.archivo }, 'Migración aplicada');
    } catch (error) {
      await repository.fallar(migracion.version);
      throw error;
    }
  }
  logger.info({ aplicadas: pendientes.length }, 'Esquema actualizado');
  return pendientes.length;
}

export async function ejecutarMigraciones(db: BaseDatos, logger: Logger): Promise<number> {
  const directorio = fileURLToPath(new URL('../../../../db/migrations/', import.meta.url));
  const migraciones = await cargarMigraciones(directorio);
  return db.conConexion((conexion) =>
    aplicarMigraciones(migraciones, crearMigracionesRepository(conexion), logger),
  );
}
