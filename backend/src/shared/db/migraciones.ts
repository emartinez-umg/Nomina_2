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
  let reparacionAnticipada: Migracion | undefined;
  for (const migracion of pendientes) {
    if (migracion === reparacionAnticipada) continue;
    await repository.iniciar(migracion);
    try {
      for (const sql of migracion.sentencias) {
        try {
          await repository.ejecutar(sql);
        } catch (error) {
          const reparacion = pendientes.find(
            (m) => m.version === 28 && m.archivo === 'V028__referencias_novedades.sql',
          );
          // Oracle revierte el bloque fallido entero. V028 permite repetirlo intacto,
          // sin modificar el archivo/checksum V027 ni los registros fuente v0.
          const referenciaV027 =
            migracion.version === 27 &&
            migracion.checksum ===
              'fb6c2d96373bc6e5f866cedfc3bf7b3210946e54dc7fb28b52052352cc262620' &&
            sql.includes('FOR G IN (SELECT C.*,TRUNC(P.FECHA_INICIO') &&
            error instanceof Error &&
            'errorNum' in error &&
            error.errorNum === 1 &&
            /\bUQ_NOV_MES_REFERENCIA\b/.test(error.message);
          if (!referenciaV027 || !reparacion || reparacionAnticipada) throw error;
          reparacionAnticipada = reparacion;
          await repository.iniciar(reparacion);
          for (const sentencia of reparacion.sentencias) await repository.ejecutar(sentencia);
          logger.warn(
            { archivo: reparacion.archivo },
            'Reparación de referencias v0 antes de repetir el bloque V027',
          );
          await repository.ejecutar(sql);
        }
      }
      await repository.completar(migracion.version);
      logger.info({ archivo: migracion.archivo }, 'Migración aplicada');
      if (reparacionAnticipada && migracion.version === 27) {
        await repository.completar(reparacionAnticipada.version);
        logger.info({ archivo: reparacionAnticipada.archivo }, 'Reparación aplicada');
      }
    } catch (error) {
      await repository.fallar(migracion.version);
      if (reparacionAnticipada && migracion.version === 27)
        await repository.fallar(reparacionAnticipada.version);
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
