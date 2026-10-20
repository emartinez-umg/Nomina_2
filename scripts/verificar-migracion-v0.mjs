import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';
import oracledb from 'oracledb';
import { crearBaseDatos } from '../backend/src/shared/db/pool.ts';
import { validarEntorno } from '../backend/src/config/env.schema.ts';
import { crearLogger } from '../backend/src/config/logger.ts';
import { ejecutarMigraciones } from '../backend/src/shared/db/migraciones.ts';
import { ejecutarSeeds } from '../backend/src/shared/db/seeds.ts';

// Reconstruye una copia aislada del corte Git. Nunca conecta con el esquema de aplicación.
const desdeV1 = process.argv.includes('--from-v1');
const origen = desdeV1 ? 'v1' : 'v0.0';
const versionOrigen = desdeV1 ? 30 : 20;
const raiz = fileURLToPath(new URL('../', import.meta.url));
const versiones = (await readdir(join(raiz, 'db/migrations')))
  .map((n) => /^V(\d+)__.*\.sql$/.exec(n))
  .filter(Boolean)
  .map((m) => Number(m[1]));
const destino = `V${String(Math.max(...versiones)).padStart(3, '0')}`;
await mkdir(join(raiz, 'tmp'), { recursive: true });
const carpeta = await mkdtemp(join(raiz, `tmp/migracion-${origen.replaceAll('.', '-')}-`));
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
  const archivo = join(carpeta, 'origen.tar');
  execFileSync(
    'git',
    ['archive', '--format=tar', '--output', archivo, origen, 'backend', 'db', 'package.json'],
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
  if (r.status !== 0) throw new Error(`No se pudo preparar la copia ${origen}: ${r.stderr}`);
  db = await crearBaseDatos(validarEntorno(entorno));
  await db.conConexion(async (c) => {
    for (const sql of (
      await readFile(new URL('../db/fixtures/migracion_v0.sql', import.meta.url), 'utf8')
    )
      .split(/\n\/\s*(?:\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean))
      await c.execute(
        (desdeV1
          ? sql.replace(
              /FROM TIPOS_(DESCUENTO|SOLICITUD) WHERE CODIGO=/g,
              'FROM TIPOS_$1 WHERE CODIGO_ANTERIOR=',
            )
          : sql
        ).replace(/;\s*$/, ''),
      );
    if (desdeV1) {
      // Reproduce equivalencias, sufijo ocupado y colisión del UNIQUE exacto antiguo.
      for (const nombre of [
        'Ingeniería migrada',
        ' ingenieria   migrada ',
        'INGENIERÍA MIGRADA',
        'Ingeniería migrada (duplicado 2)',
      ])
        await c.execute('INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES(:nombre)', { nombre });
      for (const nombre of [' Parentesco migrado ', 'Parentesco migrado'])
        await c.execute('INSERT INTO PARENTESCOS(NOMBRE) VALUES(:nombre)', { nombre });
      await c.execute(
        "INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) SELECT 'Puesto de referencia migrada',ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NOMBRE=' ingenieria   migrada '",
      );
      await c.execute(
        "UPDATE EMPLEADOS SET (ID_PUESTO,ID_DEPARTAMENTO)=(SELECT ID_PUESTO,ID_DEPARTAMENTO FROM PUESTOS WHERE NOMBRE='Puesto de referencia migrada') WHERE ID_EMPLEADO=1",
      );
      await c.execute(
        "UPDATE EMPLEADOS SET NUMERO_CASA='Casa-17',DIRECCION_ANTERIOR='Dirección original conservada' WHERE ID_EMPLEADO=1",
      );
      await c.execute(
        "INSERT INTO PAGOS_NOMINA(ID_EMPLEADO,MES,TIPO_PAGO,ID_NOMINA_EMPLEADO) VALUES(1,DATE '2026-01-01','ANTICIPO',1)",
      );
      await c.execute(
        "INSERT INTO BOLETAS_PAGO(ID_NOMINA_EMPLEADO,CONTENIDO_PDF,SHA256) VALUES(1,TO_BLOB(UTL_RAW.CAST_TO_RAW('%PDF-1.4')),RPAD('ab',64,'ab'))",
      );
      await c.execute(
        "INSERT INTO NOVEDADES_MENSUALES(ID_EMPLEADO,TIPO,MES,MONTO,DESCRIPCION,REFERENCIA) VALUES(1,'COMISION',DATE '2026-02-01',125.25,'Novedad pendiente v1','MIGRACION_V1')",
      );
    }
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
    versionOrigen,
  );
  assert.equal(
    await ejecutarMigraciones(db, logger),
    versiones.filter((v) => v > versionOrigen).length,
  );
  await ejecutarSeeds(db, logger, admin);
  const despues = await fotografia();
  const correcciones = despues.CATALOGOS_NOMBRES_CORREGIDOS.filas;
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
        if (tabla === 'SECUENCIAS_CODIGOS' && columna === 'ULTIMO_NUMERO') {
          const nuevasReservas = despues.REGISTRO_CODIGOS.filas.filter(
            (f) =>
              f.ENTIDAD === original.ENTIDAD &&
              !antes.REGISTRO_CODIGOS.filas.some(
                (a) => a.ID_REGISTRO_CODIGO === f.ID_REGISTRO_CODIGO,
              ),
          );
          assert.equal(
            actual[columna],
            original[columna] + nuevasReservas.length,
            'El contador solo avanza por nuevas reservas de la migración.',
          );
          continue;
        }
        if (
          !desdeV1 &&
          columna === 'CODIGO' &&
          actual.CODIGO !== original.CODIGO &&
          'CODIGO_ANTERIOR' in actual
        )
          destino = 'CODIGO_ANTERIOR';
        if (tabla === 'EMPLEADOS') {
          if (!desdeV1 && columna === 'SEXO') destino = 'SEXO_ANTERIOR';
          if (columna === 'DIRECCION') destino = 'DIRECCION_COMPLETA';
          if (columna === 'NUMERO_CASA') destino = 'DIRECCION';
        }
        const correccion = correcciones.find(
          (f) => f.TABLA === tabla && f.ID_REGISTRO === original[datos.pk],
        );
        if (columna === 'NOMBRE' && correccion) {
          assert.equal(correccion.NOMBRE_ANTERIOR, original.NOMBRE);
          assert.equal(actual.NOMBRE, correccion.NOMBRE_NUEVO);
          assert.match(actual.NOMBRE, /\(duplicado \d+\)$/);
          continue;
        }
        if (columna === 'ACTIVO' && correccion) {
          assert.equal(actual.ACTIVO, 0);
          continue;
        }
        if (columna === 'NOMBRE' && 'NOMBRE_NORMALIZADO' in actual) {
          assert.equal(actual.NOMBRE, original.NOMBRE.trim().replace(/\s+/g, ' '));
          continue;
        }
        if (
          !desdeV1 &&
          tabla === 'DESCUENTOS_CUOTAS' &&
          columna === 'FECHA_VENCIMIENTO' &&
          actual.FECHA_VENCIMIENTO_ANTERIOR
        )
          destino = 'FECHA_VENCIMIENTO_ANTERIOR';
        if (
          !desdeV1 &&
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
          !desdeV1 &&
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
  if (desdeV1) {
    assert.equal(
      correcciones.length,
      3,
      'Dos departamentos duplicados y un parentesco corregidos.',
    );
    const departamentos = despues.DEPARTAMENTOS.filas.filter((f) => /migrada/i.test(f.NOMBRE));
    assert.equal(departamentos.length, 4);
    assert.equal(departamentos[0].NOMBRE, 'Ingeniería migrada');
    assert.equal(departamentos[0].ACTIVO, 1);
    assert.deepEqual(
      departamentos.slice(1, 3).map((f) => f.NOMBRE),
      ['ingenieria migrada (duplicado 3)', 'INGENIERÍA MIGRADA (duplicado 4)'],
    );
  }
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
    if (!desdeV1)
      assert.equal(
        (await c.execute("SELECT COUNT(*) FROM NOVEDADES_MENSUALES WHERE TIPO='COMISION'"))
          .rows[0][0],
        2,
        'Referencias repetidas v0 conservadas.',
      );
  });
  const resumen = {
    origen,
    destino,
    tablas: informe,
    duplicadosCorregidos: correcciones.map(
      ({ TABLA, ID_REGISTRO, NOMBRE_ANTERIOR, NOMBRE_NUEVO }) => ({
        tabla: TABLA,
        id: ID_REGISTRO,
        anterior: NOMBRE_ANTERIOR,
        nuevo: NOMBRE_NUEVO,
      }),
    ),
    huellaOrigen: createHash('sha256').update(JSON.stringify(antes)).digest('hex'),
  };
  await writeFile(
    join(raiz, desdeV1 ? 'tmp/migracion-v1-v1.1.json' : 'tmp/migracion-v0-v1.json'),
    JSON.stringify(resumen, null, 2),
  );
  console.table(informe);
  console.log(
    `✓ ${origen} → ${destino}: PK, valores, snapshots, documentos y saldos conservados; seeds y migración repetibles.`,
  );
} finally {
  await db?.cerrar();
  if (creado) administrar(`DROP USER ${usuario} CASCADE;`);
  await rm(carpeta, { recursive: true, force: true });
  console.log(`✓ Copia ${origen} y esquema de migración temporales retirados.`);
}
