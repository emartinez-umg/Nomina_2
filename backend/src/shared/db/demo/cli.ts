import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import oracledb from 'oracledb';
import { z } from 'zod';
import { crearLogger } from '../../../config/logger.js';
import { validarEntornoSeeds } from '../seeds.env.js';
import { cargarSeeds, aplicarSeeds } from '../seeds.js';
import { crearSeedsRepository } from '../seeds.repository.js';
import { cargarMigraciones } from '../migraciones.archivos.js';
import { aplicarMigraciones } from '../migraciones.js';
import { crearMigracionesRepository } from '../migraciones.repository.js';
import { politicaContrasena } from '../../security/credenciales.js';
import { cargarDataset, exigir } from './datos.js';
import { cargarDemo, opcionesDemo } from './service.js';
import { escalar } from './repository.js';

dotenv.config({
  path: fileURLToPath(new URL('../../../../../.env', import.meta.url)),
  quiet: true,
});
process.env.TZ = 'America/Guatemala';
export async function ejecutarCli(destino: 'local' | 'remoto' = 'local') {
  let conexion: oracledb.Connection | undefined;
  try {
    const opciones = opcionesDemo(process.argv.slice(2));
    if (destino === 'remoto')
      exigir(
        Boolean(process.env.DEST_DB_USER?.trim()) &&
          Boolean(process.env.DEST_DB_PASSWORD) &&
          Boolean(process.env.DEST_DB_CONNECT_STRING?.trim()),
        'Define DEST_DB_USER, DEST_DB_PASSWORD y DEST_DB_CONNECT_STRING: el destino remoto no usa valores locales.',
      );
    const entorno = z
      .object({
        DB_USER: z.string().min(1),
        DB_PASSWORD: z.string().min(1),
        DB_CONNECT_STRING: z.string().min(1).default('localhost:1521/XEPDB1'),
        SEED_DEFAULT_PASSWORD: z.string().optional(),
      })
      .parse(
        destino === 'remoto'
          ? {
              DB_USER: process.env.DEST_DB_USER,
              DB_PASSWORD: process.env.DEST_DB_PASSWORD,
              DB_CONNECT_STRING: process.env.DEST_DB_CONNECT_STRING || undefined,
              SEED_DEFAULT_PASSWORD: process.env.SEED_DEFAULT_PASSWORD,
            }
          : process.env,
      );
    exigir(oracledb.thin, 'El cargador requiere node-oracledb en modo thin.');
    if (!opciones.dryRun && !opciones.resetDemo)
      exigir(
        politicaContrasena.safeParse(entorno.SEED_DEFAULT_PASSWORD).success,
        'Define SEED_DEFAULT_PASSWORD en .env: 10–128 caracteres, mayúscula, minúscula, número y símbolo.',
      );
    const dataset = await cargarDataset();
    conexion = await oracledb.getConnection({
      user: entorno.DB_USER,
      password: entorno.DB_PASSWORD,
      connectString: entorno.DB_CONNECT_STRING,
      connectTimeout: 10,
    });
    conexion.callTimeout = 30000;
    const vacia = (await escalar(conexion, 'SELECT COUNT(*) FROM USER_TABLES')) === 0;
    if (vacia) {
      exigir(
        opciones.applySchema,
        'El esquema está vacío. Usa --apply-schema para instalar las migraciones antes de cargar.',
      );
      const admin = validarEntornoSeeds(process.env);
      const migraciones = await cargarMigraciones(
        fileURLToPath(new URL('../../../../../db/migrations', import.meta.url)),
      );
      await aplicarMigraciones(
        migraciones,
        crearMigracionesRepository(conexion),
        crearLogger('silent'),
      );
      await aplicarSeeds(await cargarSeeds(), crearSeedsRepository(conexion), admin);
      process.stdout.write(
        'Migraciones y catálogos instalados como etapa previa; el DDL no se puede revertir junto con la carga.\n',
      );
    }
    if (opciones.dryRun) await conexion.execute('SET TRANSACTION READ ONLY');
    const resultado = await cargarDemo(
      conexion,
      dataset,
      opciones,
      entorno.SEED_DEFAULT_PASSWORD ?? '',
    );
    if (opciones.dryRun) await conexion.rollback();
    else await conexion.commit();
    process.stdout.write(`${JSON.stringify(resultado, null, 2)}\n`);
  } catch (error) {
    if (conexion) await conexion.rollback();
    const num =
      error && typeof error === 'object' && 'errorNum' in error ? error.errorNum : undefined;
    const driver =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      /^(NJS|DPI|ORA)-/.test(String(error.code));
    const mensaje =
      error instanceof z.ZodError
        ? 'Datos o configuración inválidos. Revisa las variables de entorno y los JSON del dataset.'
        : num === 942 || num === 904
          ? 'Falta una tabla o columna requerida. El cargador no modificó el esquema.'
          : num === 1
            ? 'Conflicto de unicidad: no se sobrescribió ningún registro.'
            : num === 2292
              ? 'Hay referencias ajenas al conjunto; se revirtió la operación completa.'
              : num || driver
                ? 'Oracle rechazó la carga; se revirtió la transacción de datos.'
                : error instanceof Error
                  ? error.message
                  : 'No se pudo completar la carga demo.';
    // Los errores del driver pueden contener SQL o datos privados; nunca se imprimen completos.
    process.stderr.write(`No se completó el seed demo: ${mensaje}\n`);
    process.exitCode = 1;
  } finally {
    await conexion?.close();
  }
}
