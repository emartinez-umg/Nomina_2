import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const usuario = `N2E2E_${randomBytes(6).toString('hex').toUpperCase()}`;
const clave = `T${randomBytes(12).toString('hex')}`;
function administrar(sql) {
  const r = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'nomina2-db', 'sqlplus', '-s', '/', 'as', 'sysdba'],
    {
      input: `WHENEVER SQLERROR EXIT FAILURE\nALTER SESSION SET CONTAINER = XEPDB1;\n${sql}\nEXIT;\n`,
      encoding: 'utf8',
      timeout: 60000,
    },
  );
  if (r.error || r.status !== 0)
    throw new Error('No se pudo administrar el esquema E2E temporal. Comprueba Oracle en Docker.');
}
let creado = false;
try {
  administrar(
    `CREATE USER ${usuario} IDENTIFIED BY "${clave}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS;\nGRANT CONNECT, RESOURCE TO ${usuario};`,
  );
  creado = true;
  const r = spawnSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TZ: 'America/Guatemala',
        DB_USER: usuario,
        DB_PASSWORD: clave,
        DB_CALL_TIMEOUT_MS: '30000',
        DB_CONNECT_STRING: process.env.DB_CONNECT_STRING ?? 'localhost:1521/XEPDB1',
        ADMIN_USER: 'admin.e2e',
        ADMIN_EMAIL: 'admin@example.test',
        ADMIN_PASSWORD: `Aa!${randomBytes(16).toString('hex')}`,
        E2E_PASSWORD: `Aa!${randomBytes(16).toString('hex')}`,
      },
    },
  );
  process.exitCode = r.status ?? 1;
} finally {
  if (creado) {
    administrar(`DROP USER ${usuario} CASCADE;`);
    console.log('✓ Esquema E2E temporal eliminado.');
  }
}
