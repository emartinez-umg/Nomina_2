import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
const imagen = process.env.E2E_WEB_IMAGE;
if (!/^nomina2-r2-e2e-[a-f0-9]{12}$/.test(imagen ?? ''))
  throw new Error('Se requiere una imagen exclusiva de pruebas.');
const nombre = `${imagen}-web`;
const proceso = spawn(
  'docker',
  [
    'run',
    '--rm',
    '--name',
    nombre,
    '-p',
    '127.0.0.1:8448:443',
    '-e',
    'WEB_HTTPS_PORT=8448',
    '-e',
    'API_UPSTREAM=host.docker.internal:3018',
    imagen,
  ],
  { stdio: 'inherit' },
);
const cerrar = () => spawnSync('docker', ['rm', '-f', nombre], { stdio: 'ignore' });
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
proceso.on('exit', (codigo) => {
  process.exitCode = codigo ?? 1;
});
