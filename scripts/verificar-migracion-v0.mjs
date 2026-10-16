import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import oracledb from 'oracledb';
import { crearBaseDatos } from '../backend/src/shared/db/pool.ts';
import { validarEntorno } from '../backend/src/config/env.schema.ts';
import { crearLogger } from '../backend/src/config/logger.ts';
import { ejecutarMigraciones } from '../backend/src/shared/db/migraciones.ts';
import { ejecutarSeeds } from '../backend/src/shared/db/seeds.ts';

// Reconstruye una copia aislada de v0.0. Nunca conecta con el esquema de aplicación.
const raiz = fileURLToPath(new URL('../', import.meta.url));
await mkdir(join(raiz, 'tmp'), { recursive: true });
const carpeta = await mkdtemp(join(raiz, 'tmp/migracion-v0-'));
const usuario = `N2MIG_${randomBytes(6).toString('hex').toUpperCase()}`;
assert.match(usuario, /^N2MIG_[A-F0-9]{12}$/);
const entorno = {
  ...process.env,
  NODE_ENV: 'test',
  TZ: 'America/Guatemala',
  DB_USER: usuario,
  DB_PASSWORD: `T${randomBytes(12).toString('hex')}`,
  DB_CONNECT_STRING: process.env.DB_CONNECT_STRING ?? 'localhost:1521/XEPDB1',
  DB_CALL_TIMEOUT_MS: '30000',
  DB_POOL_MIN: '1',
  DB_POOL_MAX: '1',
  ADMIN_USER: 'admin.e2e',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: `Aa!${randomBytes(16).toString('hex')}`,
  E2E_PASSWORD: `Aa!${randomBytes(16).toString('hex')}`,
};
const admin = Object.fromEntries(
  ['ADMIN_USER', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'].map((k) => [k, entorno[k]]),
);
const logger = crearLogger('silent');
oracledb.fetchAsString = [oracledb.CLOB];
oracledb.fetchAsBuffer = [oracledb.BLOB];
function administrar(sql) {
  const r = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'nomina2-db', 'sqlplus', '-s', '/', 'as', 'sysdba'],
    {
      input: `WHENEVER SQLERROR EXIT FAILURE\nALTER SESSION SET CONTAINER=XEPDB1;\n${sql}\nEXIT;\n`,
      encoding: 'utf8',
      timeout: 120000,
    },
  );
  assert.ok(!r.error && r.status === 0, 'No se pudo administrar el esquema de migración temporal.');
}
let creado = false,
  db;
try {
  const archivo = join(carpeta, 'v0.tar');
  execFileSync(
    'git',
    ['archive', '--format=tar', '--output', archivo, 'v0.0', 'backend', 'db', 'package.json'],
    { cwd: raiz },
  );
  execFileSync('tar', ['-xf', archivo, '-C', carpeta]);
  await symlink(join(raiz, 'node_modules'), join(carpeta, 'node_modules'), 'dir');
  await symlink(join(raiz, 'backend/node_modules'), join(carpeta, 'backend/node_modules'), 'dir');
  const servidor = join(carpeta, 'backend/e2e/server.ts');
  const fuente = await readFile(servidor, 'utf8');
  assert.ok(fuente.includes('const salud = crearSaludService'));
  // Utiliza los servicios, seeds y fixtures originales, sin abrir puertos ni iniciar la API v0.
  await writeFile(
    servidor,
    fuente.split('const salud = crearSaludService')[0] + '\nawait db.cerrar();\n',
  );
  administrar(
    `CREATE USER ${usuario} IDENTIFIED BY "${entorno.DB_PASSWORD}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS;\nGRANT CONNECT, RESOURCE TO ${usuario};`,
  );
  creado = true;
  // La fixture v0 exige este prefijo; el identificador sigue siendo exclusivamente temporal.
  const fixture = (await readFile(servidor, 'utf8')).replace('N2E2E_', 'N2MIG_');
  await writeFile(servidor, fixture);
  const r = spawnSync(process.execPath, ['--import', 'tsx', servidor], {
    cwd: raiz,
    env: entorno,
    encoding: 'utf8',
    timeout: 120000,
  });
  if (r.status !== 0) throw new Error(`No se pudo preparar la copia v0: ${r.stderr}`);
  db = await crearBaseDatos(validarEntorno(entorno));
  await db.conConexion(async (c) => {
    for (const sql of (
      await readFile(new URL('../db/fixtures/migracion_v0.sql', import.meta.url), 'utf8')
    )
      .split(/\n\/\s*(?:\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean))
      await c.execute(sql.replace(/;\s*$/, ''));
    await c.commit();
  });
  // Oracle no admite binds de identificadores; se validan los nombres del diccionario.
  const identificador = (nombre) => {
    assert.match(nombre, /^[A-Z][A-Z0-9_]*$/);
    return nombre;
  };
  const fotografia = () =>
    db.conConexion(async (c) => {
      const tablas = (await c.execute('SELECT TABLE_NAME FROM USER_TABLES ORDER BY TABLE_NAME'))
        .rows;
      const resultado = {};
      for (const [tabla] of tablas) {
        if (tabla === 'VERSION_ESQUEMA') continue;
        const columnas = (
          await c.execute(
            'SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME=:tabla ORDER BY COLUMN_ID',
            { tabla },
          )
        ).rows.map(([n]) => n);
        const pk = (
          await c.execute(
            "SELECT CC.COLUMN_NAME FROM USER_CONSTRAINTS C JOIN USER_CONS_COLUMNS CC ON CC.CONSTRAINT_NAME=C.CONSTRAINT_NAME WHERE C.TABLE_NAME=:tabla AND C.CONSTRAINT_TYPE='P' ORDER BY CC.POSITION",
            { tabla },
          )
        ).rows.map(([n]) => n);
        assert.equal(pk.length, 1, `${tabla}: PK única conocida.`);
        const filas = (
          await c.execute(`SELECT * FROM ${identificador(tabla)} ORDER BY ${identificador(pk[0])}`)
        ).rows;
        resultado[tabla] = {
          columnas,
          pk: pk[0],
          filas: filas.map((f) =>
            Object.fromEntries(
              columnas.map((n, i) => [n, Buffer.isBuffer(f[i]) ? f[i].toString('base64') : f[i]]),
            ),
          ),
        };
      }
      return resultado;
    });
  const antes = await fotografia();
  assert.equal(
    await db.conConexion(
      async (c) => (await c.execute('SELECT MAX(VERSION) FROM VERSION_ESQUEMA')).rows[0][0],
    ),
    20,
  );
  assert.equal(await ejecutarMigraciones(db, logger), 10);
  await ejecutarSeeds(db, logger, admin);
  const despues = await fotografia();
  const informe = [];
  // Únicos cambios intencionales: códigos archivados, sexo O archivado, contratos,
  // fechas de cuotas archivadas, inactivación de plantilla versionada y fechas de auditoría.
  for (const [tabla, datos] of Object.entries(antes)) {
    const nuevos = new Map(despues[tabla].filas.map((f) => [f[datos.pk], f]));
    assert.ok(nuevos.size >= datos.filas.length, `${tabla}: pérdida de filas.`);
    for (const original of datos.filas) {
      const actual = nuevos.get(original[datos.pk]);
      assert.ok(actual, `${tabla}: falta una PK original.`);
      for (const columna of datos.columnas) {
        if (columna === 'FECHA_MODIFICACION') continue;
        let destino = columna;
        if (columna === 'CODIGO' && 'CODIGO_ANTERIOR' in actual) destino = 'CODIGO_ANTERIOR';
        if (tabla === 'EMPLEADOS' && columna === 'SEXO') destino = 'SEXO_ANTERIOR';
        if (
          tabla === 'DESCUENTOS_CUOTAS' &&
          columna === 'FECHA_VENCIMIENTO' &&
          actual.FECHA_VENCIMIENTO_ANTERIOR
        )
          destino = 'FECHA_VENCIMIENTO_ANTERIOR';
        if (
          tabla === 'DESCUENTOS_EMPLEADO' &&
          columna === 'FECHA_FIN' &&
          despues.DESCUENTOS_CUOTAS.filas.some(
            (c) =>
              c.ID_DESCUENTO_EMPLEADO === original[datos.pk] &&
              c.FECHA_VENCIMIENTO_ANTERIOR !== null,
          )
        )
          destino = 'FECHA_FIN_ANTERIOR';
        if (
          tabla === 'TIPOS_CONTRATO' &&
          columna === 'REQUIERE_FIN' &&
          original.CODIGO === 'OBRA_DETERMINADA'
        ) {
          assert.equal(actual.REQUIERE_FIN, 1);
          continue;
        }
        if (
          tabla === 'PLANTILLAS_DOCUMENTO' &&
          columna === 'ACTIVO' &&
          actual.ACTIVO !== original.ACTIVO
        ) {
          assert.equal(actual.ACTIVO, 0);
          assert.ok(
            despues[tabla].filas.some(
              (f) => f.CODIGO === original.CODIGO && f.VERSION > original.VERSION && f.ACTIVO === 1,
            ),
          );
          continue;
        }
        assert.deepEqual(
          actual[destino],
          original[columna],
          `${tabla}.${columna}: valor original perdido.`,
        );
      }
    }
    informe.push({
      tabla,
      antes: datos.filas.length,
      despues: despues[tabla].filas.length,
      originalesConservados: datos.filas.length,
    });
  }
  assert.equal(await ejecutarMigraciones(db, logger), 0);
  await ejecutarSeeds(db, logger, admin);
  assert.deepEqual(
    await fotografia(),
    despues,
    'Reejecución debe conservar exactamente todos los datos.',
  );
  await db.conConexion(async (c) => {
    assert.equal(
      (await c.execute("SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'")).rows[0][0],
      0,
    );
    assert.equal(
      (
        await c.execute(
          "SELECT COUNT(*) FROM USER_CONSTRAINTS WHERE STATUS<>'ENABLED' OR VALIDATED<>'VALIDATED'",
        )
      ).rows[0][0],
      0,
    );
    assert.equal(
      (await c.execute("SELECT COUNT(*) FROM NOVEDADES_MENSUALES WHERE TIPO='COMISION'"))
        .rows[0][0],
      2,
      'Referencias repetidas v0 conservadas.',
    );
  });
  const resumen = {
    origen: 'v0.0',
    destino: 'V030',
    tablas: informe,
    huellaOrigen: createHash('sha256').update(JSON.stringify(antes)).digest('hex'),
  };
  await writeFile(join(raiz, 'tmp/migracion-v0-v1.json'), JSON.stringify(resumen, null, 2));
  console.table(informe);
  console.log(
    '✓ v0.0 → V030: PK, valores, snapshots, documentos y saldos conservados; seeds y migración repetibles.',
  );
} finally {
  await db?.cerrar();
  if (creado) administrar(`DROP USER ${usuario} CASCADE;`);
  await rm(carpeta, { recursive: true, force: true });
  console.log('✓ Copia v0 y esquema de migración temporales retirados.');
}
