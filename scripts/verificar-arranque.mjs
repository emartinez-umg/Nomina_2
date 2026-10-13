import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { chromium } from '@playwright/test';
const proyecto = `nomina2-aceptacion-${randomBytes(4).toString('hex')}`;
const carpeta = await mkdtemp(join(tmpdir(), 'nomina2-aceptacion-'));
const archivo = join(carpeta, '.env');
const puerto = () =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
const [DB_PORT, API_PORT, WEB_PORT, WEB_HTTPS_PORT] = await Promise.all([
  puerto(),
  puerto(),
  puerto(),
  puerto(),
]);
const contrasena = `Aa!${randomBytes(16).toString('hex')}`;
await writeFile(
  archivo,
  Object.entries({
    ORACLE_PASSWORD: `T${randomBytes(12).toString('hex')}`,
    DB_USER: 'NOMINA2',
    DB_PASSWORD: `T${randomBytes(12).toString('hex')}`,
    ADMIN_USER: 'admin.instalacion',
    ADMIN_EMAIL: 'admin@example.test',
    ADMIN_PASSWORD: contrasena,
    DB_PORT,
    API_PORT,
    WEB_PORT,
    WEB_HTTPS_PORT,
    TZ: 'America/Guatemala',
  })
    .map(([k, v]) => `${k}=${v}`)
    .join('\n'),
  { mode: 0o600 },
);
async function compose(args) {
  await new Promise((resolve, reject) => {
    const p = spawn(
      'docker',
      ['compose', '--project-name', proyecto, '--env-file', archivo, ...args],
      { stdio: 'inherit', env: { ...process.env, NOMINA2_ENV_FILE: archivo } },
    );
    p.on('error', reject);
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Compose terminó con código ${code}.`)),
    );
  });
}
let navegador;
try {
  assert.match(proyecto, /^nomina2-aceptacion-[a-f0-9]{8}$/);
  console.log('Verificando instalación aislada con Oracle y volúmenes nuevos.');
  await compose(['up', '--build', '-d', '--wait', '--wait-timeout', '900']);
  const http = await fetch(`http://127.0.0.1:${WEB_PORT}/login`, { redirect: 'manual' });
  assert.equal(http.status, 308);
  assert.equal(http.headers.get('location'), `https://127.0.0.1:${WEB_HTTPS_PORT}/login`);
  navegador = await chromium.launch();
  const contexto = await navegador.newContext({ ignoreHTTPSErrors: true });
  const page = await contexto.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto(`https://127.0.0.1:${WEB_HTTPS_PORT}/login`);
  await page.getByLabel('Usuario', { exact: true }).fill('admin.instalacion');
  await page.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  if (await page.getByRole('button', { name: 'Ahora no', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Ahora no', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL('**/cambiar-contrasena');
  await page.getByLabel('Contraseña actual', { exact: true }).fill(contrasena);
  const nueva = `Aa!${randomBytes(16).toString('hex')}`;
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(nueva);
  await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(nueva);
  if (await page.getByRole('button', { name: 'Ahora no', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Ahora no', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click();
  await page.waitForURL('**/admin');
  const cookies = await contexto.cookies();
  assert.ok(cookies.some((c) => c.httpOnly && c.secure && c.sameSite === 'Strict'));
  await page.reload();
  await page.getByRole('heading', { level: 1 }).waitFor();
  const salud = await contexto.request.get(`https://127.0.0.1:${WEB_HTTPS_PORT}/api/salud`);
  assert.equal(salud.status(), 200);
  assert.equal((await salud.json()).data.modo, 'thin');
  assert.deepEqual(errores, []);
  await page.goto(`https://127.0.0.1:${WEB_HTTPS_PORT}/admin/usuarios`);
  await page.getByRole('heading', { name: 'Usuarios y roles' }).waitFor();
  console.log(
    '✓ Instalación vacía: migraciones/seeds, nginx TLS, login, cambio obligatorio, sesión Secure y administración funcionan.',
  );
} catch (error) {
  await compose(['logs', '--tail', '120', 'nomina2-db', 'nomina2-api', 'nomina2-web']);
  throw error;
} finally {
  await navegador?.close();
  // Solo retira el proyecto de aceptación generado en esta ejecución.
  await compose(['down', '--volumes', '--remove-orphans']);
  await rm(carpeta, { recursive: true, force: true });
}
