import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { writeFile, mkdir } from 'node:fs/promises';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=',
  'base64',
);
async function entrar(page: Page, usuario = 'revisor.pruebas') {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill(usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(usuario === 'revisor.pruebas' ? '/rh' : '/mis-gestiones');
}
let acta: number, persona: number, codigo: string;
test.describe.serial('R3-12: actas, firma, suspensión y consulta propia', () => {
  test('RH registra, adjunta evidencia, emite con ausencia, imprime y firma', async ({
    page,
    request,
  }) => {
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await entrar(page);
    const personas = (await (await page.request.get('/api/empleados?limite=100')).json()).data
      .registros as { id: number; nombre: string }[];
    persona = personas.find((p) => p.nombre === 'Persona E2E')!.id;
    await page.goto(`/actas/nueva?empleado=${persona}`);
    await expect(page.getByRole('heading', { name: 'Nueva acta administrativa' })).toBeVisible();
    await expect(page.getByText('No hay actas en este intervalo.')).toBeVisible();
    await page.getByRole('combobox', { name: 'Tipo de acta', exact: true }).click();
    await page.getByRole('option', { name: 'Suspensión sin goce de sueldo', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Lugar del hecho', exact: true })
      .fill('Oficina de operaciones');
    await page
      .getByRole('textbox', { name: 'Descripción de los hechos', exact: true })
      .fill(
        'Se documenta el hecho observado, las circunstancias y las explicaciones recabadas para su revisión.',
      );
    await page
      .getByRole('textbox', { name: 'Norma o reglamento aplicado', exact: true })
      .fill('Reglamento interno de trabajo');
    await page
      .getByRole('textbox', { name: 'Medida adoptada', exact: true })
      .fill('Suspensión de dos días con seguimiento');
    await page.getByRole('textbox', { name: 'Días de suspensión', exact: true }).fill('2');
    await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
    await expect(page).toHaveURL(/\/actas\/\d+$/);
    acta = Number(new URL(page.url()).pathname.split('/').at(-1));
    codigo = (await (await page.request.get(`/api/actas/${acta}`)).json()).data.codigo;
    await page.getByRole('button', { name: 'Adjuntar evidencia', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog
      .getByLabel(/^Archivo de evidencia/)
      .setInputFiles({ name: 'evidencia.png', mimeType: 'image/png', buffer: png });
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Guardar evidencia', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'Emitir acta', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Registrar también la ausencia sin goce para nómina').check();
    await dialog.getByLabel(/Confirmo que revisé/).check();
    await dialog.getByRole('button', { name: 'Emitir acta', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Consultar ausencia' })).toBeVisible();
    const pdf = await page.request.get(`/api/actas/${acta}/pdf`);
    expect(pdf.status()).toBe(200);
    await mkdir('tmp/pdfs', { recursive: true });
    await writeFile('tmp/pdfs/r3-12-acta.pdf', await pdf.body());
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Imprimir PDF', exact: true }).click();
    const impresion = await popup;
    await expect(impresion.getByRole('img', { name: /Acta, página 1 de/ })).toBeVisible();
    await impresion.close();
    await page.getByRole('button', { name: 'Ver PDF', exact: true }).click();
    await expect(page.getByRole('img', { name: /Documento PDF, página/ })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar ventana' }).click();
    await page.getByRole('button', { name: 'Adjuntar firma', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByLabel(/^Escaneo del acta firmada/)
      .setInputFiles({ name: 'acta-firmada.png', mimeType: 'image/png', buffer: png });
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Guardar firma', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.locator('[data-tour="actas-acciones"]').getByText('Firmada', { exact: true }),
    ).toBeVisible();
    const detalle = (await (await page.request.get(`/api/actas/${acta}`)).json()).data;
    for (const ruta of [
      `/api/actas/${acta}/pdf`,
      ...detalle.adjuntos.map((a: { id: number }) => `/api/actas/adjuntos/${a.id}?vista=1`),
    ]) {
      const privado = await request.get(ruta);
      expect(privado.status()).toBe(401);
      expect(privado.headers()['content-type']).toContain('application/json');
    }
    await page.getByRole('button', { name: 'Ayuda de esta página' }).click();
    await expect(page.locator('.driver-popover')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    await page.screenshot({ path: 'tmp/pdfs/r3-12-detalle.png', fullPage: true });
    await page.goto(`/empleados/${persona}?tab=actas`);
    await expect(page.getByRole('tab', { name: 'Actas' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: `Consultar ${codigo}` })).toBeVisible();
    await page.goto('/actas?estado=FIRMADA');
    await page.getByText('Filtros de actas', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Buscar acta', exact: true }).fill(codigo);
    await expect(page).toHaveURL(new RegExp('buscar=' + codigo));
    await page.getByRole('button', { name: `Consultar ${codigo}` }).click();
    await expect(page.getByRole('heading', { name: `Acta ${codigo}` })).toBeVisible();
    expect(errores).toEqual([]);
  });
  test('empleado consulta en móvil, recibe aviso y rechaza lectura ajena', async ({ page }) => {
    await entrar(page, 'persona.pruebas');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/mis-gestiones/actas');
    await expect(page.getByRole('heading', { name: 'Mis actas', exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Consultar ${codigo}` }).click();
    await expect(page.getByRole('heading', { name: `Acta ${codigo}` })).toBeVisible();
    expect(await page.getByRole('button', { name: 'Adjuntar firma' }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Anular acta' }).count()).toBe(0);
    await expect(page.getByRole('button', { name: 'Ver PDF' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    await page.screenshot({ path: 'tmp/pdfs/r3-12-empleado-movil.png', fullPage: true });
    const listado = (await (await page.request.get('/api/notificaciones')).json()).data
      .registros as { clave: string }[];
    expect(listado.some((n) => n.clave === `ACTA:${acta}:EMITIDA`)).toBe(true);
    await page.getByRole('button', { name: /Mi cuenta/ }).click();
    await page.getByRole('button', { name: /Cerrar sesión/ }).click();
    await expect(page).toHaveURL('/login');
    await entrar(page, 'ajeno.pruebas');
    expect((await page.request.get(`/api/actas/${acta}`)).status()).toBe(403);
    expect((await page.request.get(`/api/actas/${acta}/pdf`)).status()).toBe(403);
  });
});
