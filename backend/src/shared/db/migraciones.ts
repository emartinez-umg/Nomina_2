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
  let preparacionCatalogos: Migracion | undefined;
  for (const migracion of pendientes) {
    if (migracion === reparacionAnticipada || migracion === preparacionCatalogos) continue;
    await repository.iniciar(migracion);
    try {
      // V031 conserva su checksum aplicado. Se retiran antes sus UNIQUE exactos redundantes,
      // porque el DDL de ese bloque no puede revertirse/repetirse después de una colisión.
      const prepararNombres = pendientes.find(
        (m) => m.version === 32 && m.archivo === 'V032__preparar_nombres_catalogos.sql',
      );
      if (
        migracion.version === 31 &&
        migracion.archivo === 'V031__reglas_comunes_catalogos.sql' &&
        migracion.checksum === 'a45e338a8583252d32c997ac6a7c9c3ac5eac48f688e7f8f9906f3444c955fb2' &&
        prepararNombres
      ) {
        preparacionCatalogos = prepararNombres;
        await repository.iniciar(prepararNombres);
        for (const sql of prepararNombres.sentencias) await repository.ejecutar(sql);
      }
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
      if (preparacionCatalogos && migracion.version === 31) {
        await repository.completar(preparacionCatalogos.version);
        logger.info({ archivo: preparacionCatalogos.archivo }, 'Preparación de nombres aplicada');
      }
      if (reparacionAnticipada && migracion.version === 27) {
        await repository.completar(reparacionAnticipada.version);
        logger.info({ archivo: reparacionAnticipada.archivo }, 'Reparación aplicada');
      }
    } catch (error) {
      await repository.fallar(migracion.version);
      if (preparacionCatalogos && migracion.version === 31)
        await repository.fallar(preparacionCatalogos.version);
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
