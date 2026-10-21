import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import oracledb from 'oracledb';
import { z } from 'zod';
import { cargarDataset, exigir } from './datos.js';
import { politicaContrasena } from '../../security/credenciales.js';
import {
  opcionesVerificacion,
  verificarIntegridad,
  comprobarIdempotencia,
} from './verificar.service.js';

export async function verificarCli() {
  dotenv.config({
    path: fileURLToPath(new URL('../../../../../.env', import.meta.url)),
    quiet: true,
  });
  process.env.TZ = 'America/Guatemala';
  let c: oracledb.Connection | undefined;
  try {
    const opciones = opcionesVerificacion(process.argv.slice(2));
    const prefijo = opciones.remoto ? 'DEST_DB_' : 'DB_';
    if (opciones.remoto)
      exigir(
        ['USER', 'PASSWORD', 'CONNECT_STRING'].every((k) =>
          Boolean(process.env[`${prefijo}${k}`]?.trim()),
        ),
        'Define DEST_DB_USER, DEST_DB_PASSWORD y DEST_DB_CONNECT_STRING. El verificador remoto no usa la base local.',
      );
    const env = z
      .object({
        usuario: z.string().min(1),
        contrasena: z.string().min(1),
        conexion: z.string().min(1),
      })
      .parse({
        usuario: process.env[`${prefijo}USER`],
        contrasena: process.env[`${prefijo}PASSWORD`],
        conexion: process.env[`${prefijo}CONNECT_STRING`] ?? 'localhost:1521/XEPDB1',
      });
    const contrasena = process.env.SEED_DEFAULT_PASSWORD ?? '';
    if (opciones.idempotencia)
      exigir(
        politicaContrasena.safeParse(contrasena).success,
        'La repetición del cargador exige SEED_DEFAULT_PASSWORD conforme a la política de la app.',
      );
    exigir(oracledb.thin, 'El verificador requiere node-oracledb en modo thin.');
    const dataset = await cargarDataset();
    c = await oracledb.getConnection({
      user: env.usuario,
      password: env.contrasena,
      connectString: env.conexion,
      connectTimeout: 10,
    });
    c.callTimeout = 30000;
    await c.execute('SET TRANSACTION READ ONLY');
    const informe = await verificarIntegridad(c, dataset, opciones, contrasena);
    await c.rollback();
    await comprobarIdempotencia(c, dataset, opciones, contrasena, informe);
    await c.rollback();
    process.stdout.write(`${JSON.stringify(informe, null, 2)}\n`);
    if (!informe.ok) process.exitCode = 1;
  } catch (error) {
    if (c) await c.rollback();
    const interno = error && typeof error === 'object' && ('errorNum' in error || 'code' in error);
    const mensaje =
      error instanceof z.ZodError
        ? 'Revisa las variables de entorno y la estructura de los JSON.'
        : interno
          ? 'Oracle no pudo completar la lectura. Revisa conexión, tablas, columnas y permisos; no se aplicaron cambios.'
          : error instanceof Error
            ? error.message
            : 'No se pudo completar la verificación.';
    process.stderr.write(`No se completó la verificación demo: ${mensaje}\n`);
    process.exitCode = 1;
  } finally {
    await c?.close();
  }
}
