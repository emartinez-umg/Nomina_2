import process from 'node:process';
import console from 'node:console';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
const produccion = process.argv.includes('--production');
const imagen = `nomina2-r2-e2e-${randomBytes(6).toString('hex')}`;
const argumentos = process.argv.slice(2).filter((a) => a !== '--production');
const explicitos = argumentos.filter((a) => a.endsWith('.spec.ts'));
const archivos = explicitos.length
  ? explicitos
  : readdirSync('e2e')
      .filter((n) => n.endsWith('.spec.ts'))
      .sort();
const opciones = argumentos.filter((a) => !explicitos.includes(a));
const resultados = [];
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
function limpiarServicios() {
  if (!produccion) return;
  for (const nombre of [`${imagen}-web`, `${imagen}-api`])
    spawnSync('docker', ['rm', '-f', nombre], { stdio: 'ignore' });
  spawnSync('docker', ['volume', 'rm', `${imagen}-api-expedientes`], { stdio: 'ignore' });
}
try {
  if (produccion) {
    for (const [archivo, etiqueta] of [
      ['backend/Dockerfile', `${imagen}-api`],
      ['frontend/Dockerfile', imagen],
    ]) {
      const build = spawnSync('docker', ['build', '-f', archivo, '-t', etiqueta, '.'], {
        stdio: 'inherit',
      });
      if (build.status !== 0) throw new Error(`No se pudo construir ${archivo}.`);
    }
  }
  // Cada spec conserva sus flujos seriales, con BD/API/archivos nuevos entre specs.
  // Una baja o cierre de otro módulo no puede alterar las precondiciones de este archivo.
  for (const archivo of archivos) {
    const usuario = `N2E2E_${randomBytes(6).toString('hex').toUpperCase()}`;
    const clave = `T${randomBytes(12).toString('hex')}`;
    const reporte = `tmp/e2e/${archivo.split('/').at(-1)}`;
    mkdirSync(reporte, { recursive: true });
    rmSync(`${reporte}/resultados.json`, { force: true });
    let creado = false;
    try {
      administrar(
        `CREATE USER ${usuario} IDENTIFIED BY "${clave}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS;\nGRANT CONNECT, RESOURCE TO ${usuario};`,
      );
      creado = true;
      console.log(`Aceptación aislada: ${archivo}`);
      const r = spawnSync(
        process.execPath,
        [
          'node_modules/@playwright/test/cli.js',
          'test',
          archivo,
          ...opciones,
          '--pass-with-no-tests',
        ],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            NODE_ENV: 'test',
            E2E_PRODUCTION: produccion ? '1' : '0',
            E2E_WEB_IMAGE: imagen,
            TZ: 'America/Guatemala',
            DB_USER: usuario,
            DB_PASSWORD: clave,
            DB_CALL_TIMEOUT_MS: '30000',
            DB_CONNECT_STRING: process.env.DB_CONNECT_STRING ?? 'localhost:1521/XEPDB1',
            ADMIN_USER: 'admin.e2e',
            ADMIN_EMAIL: 'admin@example.test',
            ADMIN_PASSWORD: `Aa!${randomBytes(16).toString('hex')}`,
            E2E_PASSWORD: `Aa!${randomBytes(16).toString('hex')}`,
            E2E_REPORT_FILE: `${reporte}/resultados.json`,
            PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/${archivo.split('/').at(-1)}`,
          },
        },
      );
      let estadisticas;
      try {
        estadisticas = JSON.parse(readFileSync(`${reporte}/resultados.json`, 'utf8')).stats;
      } catch {
        /* Un arranque fallido puede no producir informe. */
      }
      resultados.push({ archivo, codigo: r.status ?? 1, estadisticas });
    } finally {
      limpiarServicios();
      if (creado) {
        administrar(`DROP USER ${usuario} CASCADE;`);
        console.log('✓ Esquema E2E temporal eliminado.');
      }
    }
  }
  const total = resultados.reduce((n, r) => n + (r.estadisticas?.expected ?? 0), 0);
  process.exitCode = total > 0 && resultados.every((r) => r.codigo === 0) ? 0 : 1;
  console.log(
    `Aceptación: ${total} pruebas aprobadas; ${resultados.filter((r) => r.codigo !== 0).length} archivos con fallos.`,
  );
} finally {
  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/e2e-resumen.json', JSON.stringify(resultados, null, 2));
  limpiarServicios();
  if (produccion)
    spawnSync('docker', ['image', 'rm', imagen, `${imagen}-api`], { stdio: 'ignore' });
}
