import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guatemala' }).format(new Date());
const mes = hoy.slice(0, 7);
const anterior = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 2, 1))
  .toISOString()
  .slice(0, 7);
async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill(usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(usuario === 'revisor.pruebas' ? '/rh' : '/mis-gestiones');
}
async function permisos(request: APIRequestContext, jefatura: number, activos: string[]) {
  const csrf = (await (await request.get('/api/auth/csrf')).json()).data.csrfToken;
  const antes = (await (await request.get(`/api/equipo/jefaturas/${jefatura}/permisos`)).json())
    .data;
  expect(
    (
      await request.patch(`/api/equipo/jefaturas/${jefatura}/permisos`, {
        headers: { 'X-CSRF-Token': csrf },
        data: {
          permisos: activos,
          revision: antes.revision,
          motivo: 'Consulta comercial de aceptación C6',
          confirmado: true,
        },
      })
    ).status(),
  ).toBe(200);
}
let jefatura: number, miembro: number, fuera: number, responsable: number;
test.describe.serial('R3-10: estadísticas de comisiones con Oracle real', () => {
  test('RH filtra, compara, consulta historial y exporta con accesibilidad y móvil', async ({
    page,
  }) => {
    await entrar(page, 'revisor.pruebas');
    const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
    const personas = (await (await page.request.get('/api/empleados?limite=100')).json()).data
      .registros as { id: number; nombre: string; idDepartamento: number }[];
    const jefe = personas.find((p) => p.nombre === 'Persona E2E')!;
    responsable = jefe.id;
    miembro = personas.find((p) => p.nombre === 'Ajeno E2E')!.id;
    fuera = personas.find((p) => p.nombre === 'Destinatario E2E')!.id;
    const alta = await page.request.post('/api/catalogos/jefaturas', {
      headers: { 'X-CSRF-Token': csrf },
      data: {
        nombre: 'Gerencia Comercial C6',
        idDepartamento: jefe.idDepartamento,
        idEmpleadoResponsable: responsable,
        idJefaturaSuperior: null,
      },
    });
    expect(alta.status()).toBe(201);
    jefatura = (await alta.json()).data.id;
    expect(
      (
        await page.request.post('/api/catalogos/jefaturas/asignaciones', {
          headers: { 'X-CSRF-Token': csrf },
          data: {
            idJefatura: jefatura,
            empleados: [miembro],
            motivo: 'Equipo comercial de aceptación C6',
            confirmado: true,
          },
        })
      ).status(),
    ).toBe(200);
    await permisos(page.request, jefatura, ['VER_COMISIONES_EQUIPO']);
    for (const [id, fecha, monto] of [
      [miembro, mes, '300.10'],
      [miembro, anterior, '100.00'],
      [fuera, mes, '900.00'],
      [responsable, mes, '9000.00'],
    ] as const) {
      const r = await page.request.post('/api/novedades/comisiones', {
        headers: { 'X-CSRF-Token': csrf },
        data: {
          idEmpleado: id,
          mes: fecha,
          monto,
          referencia: 'VENTA C6',
          motivo: 'Comisión de aceptación estadística',
          confirmado: true,
        },
      });
      expect(r.status(), `Registrar comisión ${fecha}: ${r.status()}`).toBe(201);
    }
    await page.getByRole('button', { name: 'Estadísticas', exact: true }).click();
    await page.getByRole('link', { name: /^Estadísticas de comisiones/ }).click();
    await expect(page).toHaveTitle('Estadísticas de comisiones | nomina2');
    await expect(page.getByText('Alcance: toda la empresa')).toBeVisible();
    const matriz = page.getByRole('region', { name: 'Matriz mensual de comisiones', exact: true });
    await expect(matriz.getByRole('button', { name: 'Destinatario E2E' })).toBeVisible();
    await page.getByRole('switch', { name: 'Comparar con el periodo anterior' }).check();
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page.getByText('Anterior: Q 100.00', { exact: true })).toBeVisible();
    await page.getByText('Ver datos: Tendencia mensual', { exact: true }).click();
    await expect(page.getByRole('table', { name: 'Tendencia mensual · GTQ' })).toBeVisible();
    await page.getByLabel('Mostrar por vendedor', { exact: true }).check();
    await matriz.getByRole('button', { name: 'Ajeno E2E', exact: true }).click();
    await expect(page.getByText('Detalle de vendedor: Ajeno E2E')).toBeVisible();
    await expect(page.getByText('Promedio mensual del equipo', { exact: true })).toBeVisible();
    await page.getByText('Ver datos: Evolución del vendedor', { exact: true }).click();
    await expect(page.getByRole('table', { name: 'Evolución del vendedor · GTQ' })).toBeVisible();
    const csvPendiente = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
    const csv = await readFile(await (await csvPendiente).path(), 'utf8');
    expect(csv).toContain('Destinatario E2E');
    expect(csv).toContain('10200.10');
    await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).click();
    await expect(page.locator('.driver-popover-title')).toHaveText(
      'Elige el rango y los vendedores',
    );
    await page.locator('.driver-popover-close-btn').click();
    await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1700);
    await page.screenshot({ path: 'tmp/pdfs/r3-10-rh-escritorio.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    await page.waitForTimeout(1700);
    await page.screenshot({ path: 'tmp/pdfs/r3-10-rh-movil.png', fullPage: true });
    await page.getByRole('button', { name: 'Últimos 3 meses', exact: true }).click();
    await expect(page).toHaveURL(/desde=.*hasta=/);
    await page.getByText('Vendedores: todos', { exact: true }).click();
    await page.getByLabel(/^Ajeno E2E · EMP_/).check();
    await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await expect(matriz.getByRole('button', { name: 'Destinatario E2E' })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Estado de la comisión', exact: true }).click();
    await page.getByRole('option', { name: 'Aplicadas', exact: true }).click();
    await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await expect(page.getByText(/^Sin comisiones registradas en/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cargar comisiones', exact: true })).toBeVisible();
  });
  test('jefe con permiso solo analiza y exporta su equipo; filtros manipulados y revocación devuelven 403', async ({
    page,
    browser,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await entrar(page, 'persona.pruebas');
    await page.getByRole('button', { name: 'Buscar sección o acción', exact: true }).focus();
    await page.keyboard.press('Meta+k');
    const paleta = page.getByRole('dialog', { name: 'Buscar en el sistema' });
    await paleta.getByRole('combobox').fill('vendedores');
    await page.getByRole('option').filter({ hasText: 'Estadísticas de comisiones' }).click();
    await expect(page).toHaveURL('/mi-equipo/comisiones');
    await expect(page.getByText('Equipo: tus jefaturas autorizadas, 1 personas')).toBeVisible();
    const matriz = page.getByRole('region', { name: 'Matriz mensual de comisiones', exact: true });
    await expect(matriz.getByRole('button', { name: 'Ajeno E2E' })).toBeVisible();
    await expect(matriz.getByRole('button', { name: 'Destinatario E2E' })).toHaveCount(0);
    await expect(matriz.getByRole('button', { name: 'Persona E2E' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Cargar comisiones' })).toHaveCount(0);
    await matriz.getByRole('button', { name: 'Ajeno E2E', exact: true }).click();
    await expect(page.getByText('Detalle de vendedor: Ajeno E2E')).toBeVisible();
    const xp = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar Excel', exact: true }).click();
    const archivo = unzipSync(await readFile(await (await xp).path()));
    const hoja = strFromU8(archivo['xl/worksheets/sheet1.xml']!);
    expect(hoja).toContain('Ajeno E2E');
    expect(hoja).not.toMatch(/Destinatario|Persona E2E|Salario|DPI|Banco/);
    for (const ruta of [
      'resumen',
      'ranking',
      'tabla',
      'opciones',
      'exportar/csv',
      'exportar/excel',
    ])
      expect(
        (
          await page.request.get(
            `/api/tableros/comisiones/${ruta}?desde=${mes}&hasta=${mes}&vendedores=${miembro},${fuera}`,
          )
        ).status(),
      ).toBe(403);
    expect(
      (
        await page.request.get(
          `/api/tableros/comisiones/vendedores/${fuera}/historial?desde=${mes}&hasta=${mes}`,
        )
      ).status(),
    ).toBe(403);
    expect((await page.request.get('/api/equipo/personas')).status()).toBe(403);
    await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'tmp/pdfs/r3-10-jefe-escritorio.png', fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    await page.screenshot({ path: 'tmp/pdfs/r3-10-jefe-movil.png', fullPage: true });
    const contexto = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const rh = await contexto.newPage();
      await entrar(rh, 'revisor.pruebas');
      await permisos(rh.request, jefatura, []);
      await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: /Estadísticas no disponibles|Sin permiso de equipo/ }),
      ).toBeVisible();
      await expect(page.getByText('Detalle de vendedor: Ajeno E2E')).toHaveCount(0);
      expect(
        (
          await page.request.get(
            `/api/tableros/comisiones/exportar/excel?desde=${mes}&hasta=${mes}`,
          )
        ).status(),
      ).toBe(403);
      await page.reload();
      await expect(page.getByText('Sin permiso de equipo')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mi equipo', exact: true })).toHaveCount(0);
    } finally {
      await contexto.close();
    }
  });
});
