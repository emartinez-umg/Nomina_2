import { estados } from '../backend/src/shared/presentacion/estados.js';
import { mkdir } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
const cuentas = {
  ADMIN: ['admin.e2e', '/admin'],
  RH: ['revisor.pruebas', '/rh'],
  EMPLEADO: ['persona.pruebas', '/mis-gestiones'],
} as const;
async function entrar(page: Page, rol: keyof typeof cuentas) {
  await page.goto('/login');
  await expect(page).toHaveTitle('Iniciar sesión | nomina2');
  await page.getByLabel('Usuario', { exact: true }).fill(cuentas[rol][0]);
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill(rol === 'ADMIN' ? process.env.ADMIN_PASSWORD! : process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(cuentas[rol][1]);
}
/** Se admiten únicamente identificadores públicos del registro, que C2 exige mantener visibles. */
async function sinCodigosInternos(page: Page) {
  const texto = await page.locator('body').innerText();
  const tokens = texto.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\b/g) ?? [];
  expect(
    tokens.filter(
      (c) =>
        (c.includes('_') || Object.hasOwn(estados, c)) &&
        !/^(?:EMP_[A-Z0-9]+_\d+|(?:SOL|PRE|DES|EVT|ANU|ACT)_\d{4}_\d+)$/.test(c),
    ),
    `Códigos visibles en ${page.url()}`,
  ).toEqual([]);
}
const rutas = {
  ADMIN: [
    ['/admin', 'Inicio'],
    ['/admin/usuarios', 'Usuarios'],
    ['/admin/bitacora', 'Bitácora'],
    ['/salud', 'Estado del sistema'],
  ],
  RH: [
    ['/rh', 'Inicio'],
    ['/empleados', 'Empleados'],
    ['/empleados/nuevo', 'Nuevo empleado'],
    ['/catalogos/departamentos', 'Departamentos'],
    ['/novedades/comisiones', 'Comisiones'],
    ['/novedades/ausencias', 'Ausencias, permisos e incapacidades'],
    ['/nomina/simular', 'Simular pago'],
    ['/planilla', 'Planilla'],
    ['/vacaciones', 'Vacaciones'],
    ['/solicitudes', 'Solicitudes'],
    ['/prestaciones', 'Prestaciones'],
    ['/comunicacion/eventos', 'Eventos'],
  ],
  EMPLEADO: [
    ['/mis-gestiones', 'Mis gestiones'],
    ['/mis-gestiones/boletas', 'Mis boletas'],
    ['/mis-gestiones/vacaciones', 'Mis vacaciones'],
    ['/mis-gestiones/solicitudes', 'Mis solicitudes'],
    ['/mis-gestiones/datos', 'Mis datos'],
    ['/mis-gestiones/parqueo', 'Mi parqueo'],
  ],
} as const;
for (const rol of ['ADMIN', 'RH', 'EMPLEADO'] as const) {
  test(`R3-4: títulos y texto visible de pantallas principales ${rol}`, async ({ page }) => {
    await mkdir('tmp/pdfs', { recursive: true });
    await entrar(page, rol);
    for (const [ruta, titulo] of rutas[rol]) {
      await page.goto(ruta);
      await expect(page).toHaveTitle(`${titulo} | nomina2`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: /Cargando/ })).toHaveCount(0);
      await sinCodigosInternos(page);
      if (ruta === '/vacaciones') {
        await expect(page.getByRole('button', { name: /Estado: En proceso/ })).toBeVisible();
      }
      if (ruta === '/vacaciones' || ruta === '/rh')
        await page.screenshot({
          path: `tmp/pdfs/r34-${ruta === '/rh' ? 'inicio' : 'vacaciones'}.png`,
          fullPage: true,
        });
      if (ruta === '/rh') {
        const r = await page.request.get('/api/tableros/anios?fuente=planillas');
        expect(r.ok()).toBe(true);
        const { data } = await r.json();
        await expect(page.getByLabel('Año de mes de remuneraciones').locator('option')).toHaveText(
          [...data.anios].reverse().map(String),
        );
      }
    }
    if (rol === 'RH') {
      const r = await page.request.get('/api/empleados?limite=1');
      const { data } = await r.json();
      const e = data.registros[0];
      await page.goto(`/empleados/${e.id}`);
      await expect(page).toHaveTitle(`Empleado ${e.codigo} | nomina2`);
      await sinCodigosInternos(page);
      await page.goto(`/empleados/${e.id}/editar`);
      await expect(page).toHaveTitle(`Editar empleado ${e.codigo} | nomina2`);
      await page.goto('/solicitudes');
      await expect(page).toHaveTitle('Solicitudes | nomina2');
    }
  });
}
