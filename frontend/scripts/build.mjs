import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const entorno = { ...process.env, NODE_ENV: 'production' };
// El .env compartido de desarrollo no debe incorporar React de desarrollo al build final.
for (const [paquete, archivo, argumentos] of [
  ['typescript', 'bin/tsc', ['--noEmit']],
  ['vite', 'bin/vite.js', ['build']],
]) {
  const cli = join(dirname(require.resolve(`${paquete}/package.json`)), archivo);
  const r = spawnSync(process.execPath, [cli, ...argumentos], { stdio: 'inherit', env: entorno });
  if (r.error || r.status !== 0) process.exit(r.status ?? 1);
}
