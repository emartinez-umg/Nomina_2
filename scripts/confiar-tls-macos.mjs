import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

assert.equal(process.platform, 'darwin', 'Este comando es para el llavero de macOS.');
const carpeta = await mkdtemp(join(tmpdir(), 'nomina2-certificado-'));
const archivo = join(carpeta, 'localhost.crt');
function ejecutar(comando, argumentos) {
  const r = spawnSync(comando, argumentos, { stdio: 'inherit' });
  if (r.error || r.status !== 0)
    throw new Error(`No se completó ${comando}. Revisa la autorización del llavero y Docker.`);
}
try {
  ejecutar('docker', ['compose', 'cp', 'nomina2-web:/etc/nginx/tls/localhost.crt', archivo]);
  const certificado = new X509Certificate(await readFile(archivo));
  assert.equal(certificado.subject, 'CN=localhost');
  assert.equal(certificado.issuer, certificado.subject);
  assert.equal(
    certificado.ca,
    false,
    'Reconstruye nomina2-web: el certificado debe ser de servidor, sin CA.',
  );
  assert.equal(certificado.subjectAltName, 'DNS:localhost, IP Address:127.0.0.1');
  assert.ok(certificado.verify(certificado.publicKey), 'La firma del certificado no es válida.');
  assert.equal(certificado.checkHost('localhost'), 'localhost');
  assert.equal(certificado.checkIP('127.0.0.1'), '127.0.0.1');
  assert.ok(Date.parse(certificado.validFrom) <= Date.now(), 'El certificado aún no es válido.');
  assert.ok(Date.parse(certificado.validTo) > Date.now(), 'El certificado está vencido.');
  console.log(`Certificado local de nomina2 · SHA-256: ${certificado.fingerprint256}`);
  console.log(
    'macOS puede pedir autorización. Se confía en este certificado de servidor para SSL local; no es una autoridad certificadora.',
  );
  ejecutar('/usr/bin/security', [
    'add-trusted-cert',
    '-r',
    'trustRoot',
    '-p',
    'ssl',
    '-k',
    join(homedir(), 'Library/Keychains/login.keychain-db'),
    archivo,
  ]);
  ejecutar('/usr/bin/security', [
    'verify-cert',
    '-c',
    archivo,
    '-p',
    'ssl',
    '-n',
    'localhost',
    '-L',
  ]);
  console.log('✓ Confianza local verificada. Cierra y vuelve a abrir la pestaña de localhost.');
} finally {
  // Solo el certificado público temporal; la clave privada permanece en Docker.
  await rm(carpeta, { recursive: true, force: true });
}
