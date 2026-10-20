import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';

const imagen = process.env.E2E_WEB_IMAGE;
if (
  !/^nomina2-r2-e2e-[a-f0-9]{12}$/.test(imagen ?? '') ||
  !/^N2E2E_[A-F0-9]{12}$/.test(process.env.DB_USER ?? '')
)
  throw new Error('La API E2E exige imagen y esquema exclusivos de pruebas.');

// La preparación termina y cierra su pool antes de arrancar la imagen de producción.
const preparacion = spawnSync(process.execPath, ['--import', 'tsx', 'backend/e2e/server.ts'], {
  stdio: 'inherit',
  env: { ...process.env, E2E_PREPARE_ONLY: '1' },
  timeout: 120000,
});
if (preparacion.error || preparacion.status !== 0)
  throw new Error('No se pudo preparar la base E2E.');

const nombre = `${imagen}-api`;
const variables = {
  ...process.env,
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  PORT: '3000',
  DB_CONNECT_STRING: 'nomina2-db:1521/XEPDB1',
  LOGIN_RATE_LIMIT: '1000',
  LOG_LEVEL: 'silent',
};
const proceso = spawn(
  'docker',
  [
    'run',
    '--rm',
    '--name',
    nombre,
    '--network',
    'nomina2_default',
    '-p',
    '127.0.0.1:3018:3000',
    ...[
      'NODE_ENV',
      'HOST',
      'PORT',
      'TZ',
      'DB_USER',
      'DB_PASSWORD',
      'DB_CONNECT_STRING',
      'DB_CALL_TIMEOUT_MS',
      'ADMIN_USER',
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD',
      'LOGIN_RATE_LIMIT',
      'LOG_LEVEL',
    ].flatMap((clave) => ['--env', clave]),
    nombre,
  ],
  { stdio: 'inherit', env: variables },
);
const cerrar = () => spawnSync('docker', ['rm', '-f', nombre], { stdio: 'ignore' });
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
proceso.on('exit', (codigo) => {
  process.exitCode = codigo ?? 1;
});
