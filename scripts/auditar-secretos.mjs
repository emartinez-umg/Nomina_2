import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const archivos = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
assert.ok(
  !archivos.some((p) => /^\.env(?:\..*)?$/.test(p) && p !== '.env.example'),
  'Hay un .env privado versionado.',
);
const hallazgos = [];
for (const path of archivos) {
  if (/\.(pdf|png|jpe?g|ico|woff2?)$/i.test(path) || path === 'scripts/auditar-secretos.mjs')
    continue;
  const contenido = await readFile(path, 'utf8');
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|sk-proj-[A-Za-z0-9_-]{30,})/.test(
      contenido,
    )
  )
    hallazgos.push(path);
}
assert.deepEqual(
  hallazgos,
  [],
  'Se encontraron firmas de secretos. Revisa los archivos indicados.',
);
const historia = execFileSync(
  'git',
  ['log', '--all', '--format=', '--name-only', '--', '.env', '.env.local', '.env.production'],
  { encoding: 'utf8' },
).trim();
assert.equal(historia, '', 'Un archivo .env privado figura en el historial.');
console.log(
  '✓ Sin .env privado en Git/historial ni firmas de claves privadas o tokens en archivos versionados.',
);
