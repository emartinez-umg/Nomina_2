import process from 'node:process';
import { URL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
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

// Verifica también imports dinámicos: una imagen incompleta no debe publicarse.
const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('.vite/manifest.json', dist), 'utf8'));
for (const entrada of Object.values(manifest)) {
  for (const archivo of [entrada.file, ...(entrada.css ?? []), ...(entrada.assets ?? [])]) {
    if (!existsSync(new URL(archivo, dist)))
      throw new Error(`Falta un archivo del build: ${archivo}`);
  }
  for (const dependencia of [...(entrada.imports ?? []), ...(entrada.dynamicImports ?? [])]) {
    if (!manifest[dependencia]) throw new Error(`Falta un módulo del build: ${dependencia}`);
  }
}
