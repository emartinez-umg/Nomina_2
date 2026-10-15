import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Solo administra un esquema desechable. No lee ni altera las credenciales de aplicación.
const usuario = `N2SEC_${randomBytes(6).toString('hex').toUpperCase()}`;
const clave = `T${randomBytes(12).toString('hex')}`;
assert.match(usuario, /^N2SEC_[A-F0-9]{12}$/);
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
    throw new Error('No se pudo administrar Oracle temporal. Comprueba Docker y Oracle.');
}
let creado = false;
try {
  administrar(
    `CREATE USER ${usuario} IDENTIFIED BY "${clave}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS;\nGRANT CONNECT, RESOURCE TO ${usuario};`,
  );
  creado = true;
  const enDocker = process.argv.includes('--docker');
  const argumentosVitest = [
    '../node_modules/vitest/vitest.mjs',
    'run',
    '--config',
    'vitest.oracle.config.ts',
    process.argv.includes('--empleados')
      ? 'src/modules/empleados/empleados.oracle.ts'
      : process.argv.includes('--horarios')
        ? 'src/modules/catalogos/horarios.oracle.ts'
        : process.argv.includes('--empresa')
          ? 'src/modules/empresa/empresa.oracle.ts'
          : process.argv.includes('--ubicaciones')
            ? 'src/modules/ubicaciones/ubicaciones.oracle.ts'
            : process.argv.includes('--codigos')
              ? 'src/modules/codigos/codigos.oracle.ts'
              : process.argv.includes('--comunicacion')
                ? 'src/modules/comunicacion/comunicacion.oracle.ts'
                : process.argv.includes('--solicitudes')
                  ? 'src/modules/solicitudes/solicitudes.oracle.ts'
                  : process.argv.includes('--prestaciones')
                    ? 'src/modules/prestaciones/prestaciones.oracle.ts'
                    : 'src/modules/auth/seguridad.oracle.ts',
  ];
  const entornoPrueba = {
    ...process.env,
    NODE_ENV: 'test',
    TZ: 'America/Guatemala',
    DB_USER: usuario,
    DB_PASSWORD: clave,
    DB_CONNECT_STRING: enDocker
      ? 'nomina2-db:1521/XEPDB1'
      : (process.env.DB_CONNECT_STRING ?? 'localhost:1521/XEPDB1'),
    DB_CALL_TIMEOUT_MS: '30000',
    DB_POOL_MIN: '1',
    DB_POOL_MAX: '5',
    ADMIN_USER: 'admin.prueba',
    ADMIN_EMAIL: 'admin@example.test',
    ADMIN_PASSWORD: `Aa!${randomBytes(20).toString('hex')}`,
  };
  const r = spawnSync(
    enDocker ? 'docker' : process.execPath,
    enDocker
      ? [
          'run',
          '--rm',
          '--network',
          'nomina2_default',
          '--workdir',
          '/app/backend',
          '--mount',
          `type=bind,source=${fileURLToPath(new URL('../db', import.meta.url))},target=/app/db,readonly`,
          ...[
            'NODE_ENV',
            'TZ',
            'DB_USER',
            'DB_PASSWORD',
            'DB_CONNECT_STRING',
            'DB_CALL_TIMEOUT_MS',
            'DB_POOL_MIN',
            'DB_POOL_MAX',
            'ADMIN_USER',
            'ADMIN_EMAIL',
            'ADMIN_PASSWORD',
          ].flatMap((nombre) => ['--env', nombre]),
          'nomina2-security-tests',
          'node',
          ...argumentosVitest,
        ]
      : argumentosVitest,
    {
      cwd: new URL('../backend/', import.meta.url),
      stdio: 'inherit',
      timeout: 240000,
      env: entornoPrueba,
    },
  );
  if (r.error) throw new Error('No se pudo completar Vitest/Oracle dentro del tiempo permitido.');
  process.exitCode = r.status ?? 1;
} finally {
  if (creado) {
    administrar(`DROP USER ${usuario} CASCADE;`);
    console.log('✓ Esquema de seguridad temporal eliminado.');
  }
}
