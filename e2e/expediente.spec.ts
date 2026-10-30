import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import PDFDocument from 'pdfkit';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=',
  'base64',
);
async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill(usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(usuario === 'revisor.pruebas' ? '/rh' : '/mis-gestiones');
}
const pdf = () =>
  new Promise<Buffer>((resolve) => {
    const d = new PDFDocument(),
      partes: Buffer[] = [];
    d.on('data', (p) => partes.push(p));
    d.on('end', () => resolve(Buffer.concat(partes)));
    d.text('Documento de aceptación del expediente C7');
    d.end();
  });
let empleado: number, documento: number;
test.describe.serial('R3-11: expediente privado de extremo a extremo', () => {
  test('RH completa, visualiza, reemplaza y da de baja con trazabilidad', async ({
    page,
    request,
  }) => {
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await entrar(page, 'revisor.pruebas');
    const personas = (await (await page.request.get('/api/empleados?limite=100')).json()).data
      .registros as { id: number; nombre: string }[];
    empleado = personas.find((e) => e.nombre === 'Persona E2E')!.id;
    await page.goto(`/empleados/${empleado}?tab=documentos`);
    await expect(page.getByRole('heading', { name: 'Generados por el sistema' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Expediente 0 de 4' })).toBeVisible();
    const tipos = (await (await page.request.get(`/api/expedientes/empleados/${empleado}`)).json())
      .data.tipos as {
      id: number;
      nombre: string;
      obligatorio: boolean;
      requiereVencimiento: boolean;
    }[];
    for (const tipo of tipos.filter((t) => t.obligatorio)) {
      const card = page
        .locator('[data-tour="expediente-tipos"] > section')
        .filter({ has: page.getByRole('heading', { name: new RegExp('^' + tipo.nombre) }) });
      await card.getByRole('button', { name: 'Cargar', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(/^Archivo del expediente/).setInputFiles({
        name: tipo.nombre === 'Contrato firmado' ? 'contrato.pdf' : 'respaldo.png',
        mimeType: tipo.nombre === 'Contrato firmado' ? 'application/pdf' : 'image/png',
        buffer: tipo.nombre === 'Contrato firmado' ? await pdf() : png,
      });
      if (tipo.requiereVencimiento)
        await dialog.getByRole('textbox', { name: /^Fecha de vencimiento/ }).fill('31/12/2029');
      const transferencia = page.waitForResponse(
        (r) => r.url().includes('/api/expedientes/empleados/') && r.request().method() === 'POST',
      );
      await dialog.getByRole('button', { name: 'Guardar archivo' }).click();
      const respuestaCarga = await transferencia;
      expect(respuestaCarga.status(), await respuestaCarga.text()).toBe(201);
      await expect(dialog).not.toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Expediente 4 de 4' })).toBeVisible();
    const dpi = page
      .locator('[data-tour="expediente-tipos"] > section')
      .filter({ has: page.getByRole('heading', { name: /^DPI / }) });
    await dpi.getByRole('button', { name: 'Ver', exact: true }).click();
    const vista = page.getByRole('dialog');
    await expect(vista.getByRole('img', { name: 'Documento: respaldo.png' })).toBeVisible();
    expect(
      await vista
        .getByRole('img', { name: 'Documento: respaldo.png' })
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    ).toBeGreaterThan(0);
    await vista.getByRole('button', { name: 'Cerrar ventana' }).click();
    const contrato = page
      .locator('[data-tour="expediente-tipos"] > section')
      .filter({ has: page.getByRole('heading', { name: /^Contrato firmado/ }) });
    await contrato.getByRole('button', { name: 'Ver', exact: true }).click();
    await expect(page.getByRole('img', { name: /Documento PDF, página 1 de 1/ })).toBeVisible();
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
    expect((await descarga).suggestedFilename()).toBe('contrato.pdf');
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar ventana' }).click();
    await dpi.getByRole('button', { name: 'Reemplazar' }).click();
    await page
      .getByRole('dialog')
      .getByLabel(/^Archivo del expediente/)
      .setInputFiles({ name: 'dpi-v2.png', mimeType: 'image/png', buffer: png });
    await page
      .getByRole('dialog')
      .getByRole('textbox', { name: /^Fecha de vencimiento/ })
      .fill('31/12/2029');
    await page.getByRole('button', { name: 'Guardar archivo' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(dpi.getByText(/Versión 2/)).toBeVisible();
    await dpi.getByRole('button', { name: 'Historial' }).click();
    await expect(page.getByRole('dialog').getByText('respaldo.png', { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar ventana' }).click();
    await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).click();
    await expect(page.locator('.driver-popover-title')).toHaveText('Expediente X de Y');
    await page.locator('.driver-popover-close-btn').click();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({ path: 'tmp/pdfs/r3-11-expediente-escritorio.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'tmp/pdfs/r3-11-expediente-movil.png', fullPage: true });
    const ficha = (await (await page.request.get(`/api/expedientes/empleados/${empleado}`)).json())
      .data;
    documento = ficha.actuales.find((x: { idTipo: number }) => x.idTipo === tipos[0]!.id).id;
    for (const archivo of ficha.actuales as { id: number }[]) {
      for (const sufijo of ['', '?vista=1']) {
        const privado = await request.get(`/api/expedientes/documentos/${archivo.id}${sufijo}`);
        expect(privado.status()).toBe(401);
        expect(privado.headers()['content-type']).toContain('application/json');
      }
    }
    await dpi.getByRole('button', { name: 'Dar de baja' }).click();
    await page
      .getByRole('dialog')
      .getByRole('textbox', { name: /^Motivo/ })
      .fill('Corrección del respaldo documental C7');
    await page.getByRole('checkbox', { name: 'Confirmo el cambio indicado' }).check();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Expediente 3 de 4' })).toBeVisible();
    await page.goto('/empleados?expedienteIncompleto=1');
    await expect(page.getByRole('button', { name: 'Expediente 3 de 4' })).toBeVisible();
    expect(errores).toEqual([]);
  });
  test('empleado consulta lo propio y rechaza expediente ajeno', async ({ page }) => {
    await entrar(page, 'persona.pruebas');
    await page.goto('/mis-gestiones/datos');
    await page.getByRole('button', { name: 'Consultar mi expediente' }).click();
    await expect(page.getByRole('heading', { name: 'Expediente 3 de 4' })).toBeVisible();
    const panel = page.getByRole('region', { name: 'Expediente digital' });
    await expect(panel.getByRole('button', { name: 'Cargar', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Configurar tipo' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Dar de baja' })).toHaveCount(0);
    const propio = await page.request.get(`/api/expedientes/empleados/${empleado}`);
    expect(propio.status()).toBe(200);
    expect((await page.request.get(`/api/expedientes/documentos/${documento}`)).status()).toBe(404);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'tmp/pdfs/r3-11-mi-expediente-movil.png', fullPage: true });
    await page.context().clearCookies();
    await entrar(page, 'ajeno.pruebas');
    expect((await page.request.get(`/api/expedientes/empleados/${empleado}`)).status()).toBe(403);
    expect(
      (await page.request.get(`/api/expedientes/documentos/${documento}?vista=1`)).status(),
    ).toBe(403);
  });
});
