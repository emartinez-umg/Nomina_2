import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guatemala' }).format(new Date());
const visible = (iso: string) => iso.split('-').reverse().join('/');
async function oferta(page: Page) {
  const dialogos = page.locator('dialog[open]');
  const alcance = (await dialogos.count()) ? dialogos.last() : page;
  const b = alcance.getByRole('button', { name: 'Ahora no', exact: true }).last();
  if (await b.isVisible()) await b.click();
}
async function entrar(page: Page, rol: 'ADMIN' | 'RH' | 'EMPLEADO') {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/login');
  await oferta(page);
  await page
    .getByLabel('Usuario', { exact: true })
    .fill(rol === 'ADMIN' ? 'admin.e2e' : rol === 'RH' ? 'revisor.pruebas' : 'persona.pruebas');
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill(rol === 'ADMIN' ? process.env.ADMIN_PASSWORD! : process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(
    rol === 'ADMIN' ? /\/admin$/ : rol === 'RH' ? /\/rh$/ : /\/mis-gestiones$/,
  );
  await oferta(page);
}
async function salir(page: Page) {
  const token = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
  expect(
    (
      await page.request.post('/api/auth/logout', { headers: { 'X-CSRF-Token': token }, data: {} })
    ).status(),
  ).toBe(200);
  await page.goto('/login');
}
async function clavesBorradores(page: Page) {
  return page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('nomina2:borrador:')),
  );
}
async function elegir(page: Page, label: string, texto?: string) {
  const campo = page.getByRole('combobox', { name: label, exact: true });
  await campo.click();
  if (texto) await campo.fill(texto);
  const opcion = texto
    ? page.getByRole('option', { name: texto, exact: true })
    : page.getByRole('option').first();
  await expect(opcion).toBeVisible();
  await opcion.click();
}
async function tour(page: Page, ventana = false) {
  if (!ventana) await oferta(page);
  const activador = page
    .getByRole('button', {
      name: ventana ? 'Ayuda de esta ventana' : 'Ayuda de esta página',
      exact: true,
    })
    .last();
  await activador.click();
  await expect(page.locator('.driver-popover-description')).toBeVisible();
  expect((await page.locator('.driver-popover-description').innerText()).length).toBeGreaterThan(
    80,
  );
  await page.getByRole('button', { name: 'Cerrar recorrido', exact: true }).click();
  await expect(activador).toBeFocused();
}
async function revisarUi(page: Page) {
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('[role="status"]').filter({ hasText: 'Cargando' })).toHaveCount(0);
  const faltas = await page
    .locator('.campo:visible')
    .evaluateAll((campos) =>
      campos
        .filter(
          (c) =>
            !!c.querySelector('input:not([type=hidden]), textarea') &&
            (!c.querySelector('.campo-hint')?.textContent?.trim() || !c.querySelector('label')),
        )
        .map((c) => c.textContent),
    );
  expect(faltas).toEqual([]);
  const ancho = await page.evaluate(() => ({
    pagina: document.documentElement.scrollWidth,
    pantalla: innerWidth,
  }));
  expect(ancho.pagina).toBeLessThanOrEqual(ancho.pantalla);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => ({ id: v.id, nodos: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  await tour(page);
}

test.describe('Cierre del proyecto con API y Oracle reales', () => {
  test.describe.configure({ mode: 'serial' });
  for (const rol of ['ADMIN', 'RH', 'EMPLEADO'] as const)
    test(`login real de ${rol} y aislamiento de navegación`, async ({ page }) => {
      await entrar(page, rol);
      await revisarUi(page);
      const cookies = await page.context().cookies();
      expect(cookies.some((c) => c.httpOnly && c.sameSite === 'Strict')).toBe(true);
      if (rol !== 'ADMIN') {
        await page.goto('/admin/usuarios');
        await expect(page).toHaveURL(rol === 'RH' ? /\/rh$/ : /\/mis-gestiones$/);
      }
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  for (const rol of ['ADMIN', 'RH', 'EMPLEADO'] as const)
    test(`navegación horizontal y Ctrl/⌘ K de ${rol} en escritorio y móvil`, async ({ page }) => {
      await entrar(page, rol);
      const menu = page.getByRole('navigation', { name: 'Secciones del sistema' });
      const inicio = menu.getByRole('button', { name: 'Inicio', exact: true });
      await inicio.focus();
      await page.keyboard.press('Enter');
      await expect(inicio).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Space');
      await expect(inicio).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('ArrowDown');
      await expect(menu.getByRole('link', { name: /^Resumen/ })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(inicio).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(
        menu.getByRole('button', {
          name: rol === 'EMPLEADO' ? 'Mis gestiones' : 'Personal',
          exact: true,
        }),
      ).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('End');
      await expect(menu.getByRole('link').last()).toBeFocused();
      await page.keyboard.press('Escape');
      // Los grupos pueden ocupar varias filas: cada panel debe permanecer dentro de la pantalla.
      for (const grupo of await menu.getByRole('button').all()) {
        await grupo.click();
        const limites = await menu.locator('.grupo-panel:visible').boundingBox();
        expect(limites).not.toBeNull();
        expect(limites!.x).toBeGreaterThanOrEqual(8);
        expect(limites!.x + limites!.width).toBeLessThanOrEqual(1280);
        await page.keyboard.press('Escape');
      }
      const buscar = page.getByRole('button', { name: 'Buscar sección o acción', exact: true });
      await buscar.focus();
      await page.keyboard.press('Control+k');
      const dialogo = page.getByRole('dialog', { name: 'Buscar en el sistema' });
      await expect(dialogo).toBeVisible();
      const entrada = dialogo.getByRole('combobox');
      await expect(entrada).toBeFocused();
      await expect(dialogo.getByRole('option', { name: /^Usuarios/ })).toHaveCount(
        rol === 'ADMIN' ? 1 : 0,
      );
      await expect(dialogo.getByRole('option', { name: /^Nuevo empleado/ })).toHaveCount(
        rol === 'EMPLEADO' ? 0 : 1,
      );
      await mkdir('tmp/pdfs', { recursive: true });
      await page.screenshot({ path: `tmp/pdfs/paleta-${rol}.png` });
      await entrada.fill('boltea');
      await expect(dialogo.getByRole('option')).toHaveCount(1);
      await expect(dialogo.getByRole('option')).toContainText(
        rol === 'EMPLEADO' ? 'Mis gestiones' : 'Nómina',
      );
      const a11y = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        a11y.violations.map((v) => ({ id: v.id, nodos: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(
        rol === 'EMPLEADO' ? /\/mis-gestiones\/boletas$/ : /\/planilla$/,
      );
      await oferta(page);
      await page.keyboard.press('Meta+k');
      await expect(dialogo.getByText('Recientes', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await page.reload();
      await buscar.click();
      await expect(dialogo.getByText('Recientes', { exact: true })).toBeVisible();
      await entrada.fill(rol === 'EMPLEADO' ? 'Actualizar mi contacto' : 'Cargar comisión');
      await dialogo.getByRole('option').click();
      await expect(page).toHaveURL(
        rol === 'EMPLEADO' ? /\/mis-gestiones\/datos$/ : /\/novedades\/comisiones\/nuevo$/,
      );
      await oferta(page);
      await mkdir('tmp/pdfs', { recursive: true });
      await page.screenshot({ path: `tmp/pdfs/navegacion-${rol}-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      const abrir = page.getByRole('button', { name: 'Abrir menú de navegación', exact: true });
      await abrir.click();
      const categoria = menu.getByRole('button', {
        name: rol === 'EMPLEADO' ? 'Anuncios y eventos' : 'Comunicación',
        exact: true,
      });
      await categoria.click();
      await expect(categoria).toHaveAttribute('aria-expanded', 'true');
      await expect(menu.getByRole('link', { name: /^Eventos/ })).toBeVisible();
      const ancho = await page.evaluate(() => ({
        pagina: document.documentElement.scrollWidth,
        pantalla: innerWidth,
      }));
      expect(ancho.pagina).toBeLessThanOrEqual(ancho.pantalla);
      const movilA11y = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(movilA11y.violations.map((v) => v.id)).toEqual([]);
      await page.screenshot({ path: `tmp/pdfs/navegacion-${rol}-movil.png`, fullPage: true });
      await menu.getByRole('link', { name: /^Eventos/ }).click();
      await expect(page).toHaveURL(
        rol === 'EMPLEADO' ? /\/mis-gestiones\/eventos$/ : /\/comunicacion\/eventos$/,
      );
      await expect(abrir).toHaveAttribute('aria-expanded', 'false');
      await buscar.click();
      await expect(entrada).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(buscar).toBeFocused();
    });
  test('FASE V1-7: alta guiada de empleado y validaciones de formato/fechas', async ({ page }) => {
    await entrar(page, 'RH');
    await page.goto('/empleados/nuevo');
    await oferta(page);
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Código', { exact: true })).toHaveAttribute('readonly');
    await page.getByLabel('Nombres', { exact: true }).fill('Nueva123 Persona');
    expect(await page.getByLabel('Nombres', { exact: true }).inputValue()).toBe('Nueva Persona');
    await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
    await page.getByLabel('DPI', { exact: true }).fill('2345678901234');
    expect((await page.getByLabel('DPI', { exact: true }).inputValue()).replace(/\s/g, '')).toBe(
      '2345678901234',
    );
    await page.getByLabel('NIT', { exact: true }).fill('5489360-7');
    await page.getByLabel('Fecha de nacimiento', { exact: true }).fill('01/01/1995');
    await elegir(page, 'Sexo', 'Femenino');
    await elegir(page, 'Estado civil', 'SOLTERO');
    await elegir(page, 'Zona', 'Zona 1');
    await page.getByLabel('Número de casa/vivienda', { exact: true }).fill('12-A');
    await page.getByLabel('Teléfono', { exact: true }).fill('55552222');
    await page.getByLabel('Correo', { exact: true }).fill('alta@example.test');
    await elegir(page, 'Departamento', 'Departamento E2E');
    await elegir(page, 'Puesto', 'Analista E2E');
    await expect(page.getByLabel('Fecha de ingreso', { exact: true })).toHaveValue(visible(hoy));
    await elegir(page, 'Tipo de contrato', 'A plazo fijo');
    await expect(page.getByLabel('Fin de contrato', { exact: true })).toBeEnabled();
    await page.getByLabel('Fin de contrato', { exact: true }).fill('01/01/2027');
    await elegir(page, 'Tipo de contrato', 'Por tiempo indefinido');
    await expect(page.getByLabel('Fin de contrato', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Fin de contrato', { exact: true })).toHaveValue('');
    await elegir(page, 'Centro de trabajo', 'Centro E2E');
    await elegir(page, 'Horario', 'Horario E2E');
    await page.getByLabel('Fecha de ingreso', { exact: true }).fill(visible(hoy));
    await page.getByLabel('Salario base mensual', { exact: true }).fill('5000');
    await page.getByLabel('Nombre del contacto', { exact: true }).fill('Contacto Prueba');
    await elegir(page, 'Parentesco', 'Hermano/a');
    await page.getByLabel('Teléfono de emergencia', { exact: true }).fill('55553333');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const accesibilidad = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accesibilidad.violations.map((v) => v.id)).toEqual([]);
    await mkdir('tmp/pdfs', { recursive: true });
    await page.screenshot({ path: 'tmp/pdfs/empleado-v1-7-movil.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Guardar empleado', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Contraseñas temporales · entrega privada' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar entrega', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('dialog', { name: 'Contraseñas temporales · entrega privada' }),
    ).toBeVisible();
    const descargaCredenciales = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
    expect((await descargaCredenciales).suggestedFilename()).toBe('credenciales-temporales.pdf');
    await expect(page.getByRole('button', { name: 'Descargar PDF', exact: true })).toBeDisabled();
    await tour(page, true);
    await page.bringToFront();
    await page.getByRole('button', { name: 'Copiar credenciales', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Credenciales copiadas.' }),
    ).toBeVisible();
    await page.getByLabel('Ya copié o descargué las credenciales').check();
    await page.getByRole('button', { name: 'Cerrar entrega', exact: true }).click();
    await expect(page).toHaveURL(/\/empleados\/\d+$/);
    await expect(page.getByText('Nueva Persona Prueba', { exact: false }).first()).toBeVisible();
    const id = Number(page.url().split('/').pop());
    const previo = (await (await page.request.get(`/api/empleados/${id}`)).json()).data;
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await oferta(page);
    await expect(page.getByLabel('Código', { exact: true })).toHaveValue(previo.codigo);
    await expect(page.getByLabel('Código', { exact: true })).toHaveAttribute('readonly');
    await expect(page.getByRole('combobox', { name: 'Municipio', exact: true })).toHaveValue(
      'Guatemala',
    );
    await page.getByLabel('Número de casa/vivienda', { exact: true }).fill('12-B');
    await page
      .getByLabel('Motivo de edición', { exact: true })
      .fill('Corrección de vivienda del empleado');
    await page.getByRole('button', { name: 'Guardar empleado', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/empleados/${id}$`));
    const posterior = (await (await page.request.get(`/api/empleados/${id}`)).json()).data;
    expect(posterior.codigo).toBe(previo.codigo);
    expect(posterior.numeroCasa).toBe('12-B');
    await page.getByRole('button', { name: 'Restablecer contraseña', exact: true }).click();
    await page
      .getByLabel('Motivo del restablecimiento', { exact: true })
      .fill('Entrega de credencial nueva solicitada');
    await page.getByRole('button', { name: 'Revisar restablecimiento', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar restablecimiento', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Contraseñas temporales · entrega privada' }),
    ).toBeVisible();
    await page.bringToFront();
    await page.getByRole('button', { name: 'Copiar credenciales', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Credenciales copiadas.' }),
    ).toBeVisible();
    await page.getByLabel('Ya copié o descargué las credenciales').check();
    await page.getByRole('button', { name: 'Cerrar entrega', exact: true }).click();
  });
  test('FASE V1-7: CSV automatizado y un solo PDF privado del lote', async ({ page }) => {
    await entrar(page, 'RH');
    const lista = (await (await page.request.get('/api/empleados?nombre=Persona%20E2E')).json())
      .data;
    const base = (await (await page.request.get(`/api/empleados/${lista.registros[0].id}`)).json())
      .data;
    const municipios = (await (await page.request.get('/api/ubicaciones/municipios')).json()).data;
    const lugar = municipios.find((m: { codigo: string }) => m.codigo === '0101');
    const horario = (
      await (await page.request.get(`/api/catalogos/horarios/${base.idHorario}`)).json()
    ).data;
    const plantilla = (await (await page.request.get('/api/empleados/cargas/plantilla')).json())
      .data as string;
    const encabezado = plantilla.replace(/^\uFEFF/, '').split('\r\n')[0]!;
    const columnas = encabezado.split(',').map((v) => v.replaceAll('"', ''));
    const filas = [
      { nombres: 'Carga', dpi: '3456789012345', nit: '6-K', sexo: 'F' },
      { nombres: 'Otra', dpi: '3456789012346', nit: '12-4', sexo: 'M' },
    ].map(
      (d, index) =>
        ({
          ...base,
          ...d,
          apellidos: 'Masiva',
          correo: `masiva${index}@example.test`,
          afiliacionIgss: null,
          idDepartamentoGt: lugar.idDepartamentoGt,
          idMunicipioGt: lugar.id,
          zona: 1,
          numeroCasa: '13-A',
          codigoHorario: horario.codigo,
          fechaIngreso: hoy,
          fechaFinContrato: null,
          contactoNombre: 'Contacto Masiva',
          contactoParentesco: 'Madre',
          contactoTelefono: '55554321',
        }) as Record<string, unknown>,
    );
    const csv = [
      encabezado,
      ...filas.map((d) =>
        columnas.map((k) => `"${String(d[k] ?? '').replaceAll('"', '""')}"`).join(','),
      ),
    ].join('\r\n');
    await page.goto('/empleados/carga-masiva');
    await oferta(page);
    await page
      .locator('input[name="csv"]')
      .setInputFiles({ name: 'v17.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByRole('button', { name: 'Validar y ver vista previa', exact: true }).click();
    await expect(
      page.getByText('2 filas · 2 válidas · 0 con errores.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Importar empleados', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    const entrega = page.getByRole('dialog', { name: 'Contraseñas temporales · entrega privada' });
    await expect(entrega).toBeVisible();
    await expect(entrega.getByRole('row')).toHaveCount(3);
    const descarga = page.waitForEvent('download');
    await entrega.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
    await descarga;
    await expect(
      entrega.getByRole('button', { name: 'Descargar PDF', exact: true }),
    ).toBeDisabled();
    await entrega.getByLabel('Ya copié o descargué las credenciales').check();
    await entrega.getByRole('button', { name: 'Cerrar entrega', exact: true }).click();
    await expect(page.getByText('Importación completada', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Descargar reporte de resultados', exact: true }),
    ).toBeVisible();
  });
  test('solicitud de vacaciones, aprobación RH y descuento propio', async ({ browser }) => {
    const empleado = await browser.newContext(),
      rh = await browser.newContext();
    const p = await empleado.newPage(),
      r = await rh.newPage();
    await entrar(p, 'EMPLEADO');
    await p.goto('/mis-gestiones/vacaciones');
    await oferta(p);
    const calendario = p.locator('.calendario');
    await expect(calendario.getByRole('button').first()).toBeVisible();
    const dias = calendario.locator('button.rdp-day_button:enabled');
    const futuro = dias.filter({ hasText: /^\d+$/ });
    await futuro.first().click();
    await futuro.nth(1).click();
    await expect(p.getByText('El saldo alcanza.', { exact: true })).toBeVisible();
    await p.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
    await tour(p, true);
    await p.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(p.getByText('Solicitud enviada a RRHH.', { exact: true })).toBeVisible();
    await entrar(r, 'RH');
    await r.goto('/vacaciones');
    await oferta(r);
    const fila = r.getByRole('row').filter({ hasText: 'Persona E2E' });
    await expect(fila).toHaveCount(1);
    await fila.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await tour(r, true);
    await r.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      r.getByText('Vacaciones aprobadas; saldo actualizado.', { exact: true }),
    ).toBeVisible();
    await p.reload();
    await expect(p.getByText('APROBADA', { exact: true }).first()).toBeVisible();
    await empleado.close();
    await rh.close();
  });
  test('FASE V1-8: solicitables enteros, revisión actual y cancelación con devolución', async ({
    browser,
  }) => {
    const ec = await browser.newContext(),
      rc = await browser.newContext();
    const p = await ec.newPage(),
      r = await rc.newPage();
    await entrar(p, 'EMPLEADO');
    await entrar(r, 'RH');
    const saldo = (await (await p.request.get('/api/vacaciones/mi-saldo')).json()).data;
    const token = (await (await r.request.get('/api/auth/csrf')).json()).data.csrfToken;
    const quitar = Number(saldo.disponible) - 6.25;
    expect(quitar).toBeGreaterThan(0);
    expect(
      (
        await r.request.post(`/api/vacaciones/empleados/${saldo.idEmpleado}/cargar`, {
          headers: { 'X-CSRF-Token': token },
          data: {
            tipo: 'TOMADAS',
            dias: quitar.toFixed(2),
            referencia: 'E2E_V18',
            motivo: 'Vacaciones previas verificadas para prueba',
            confirmado: true,
          },
        })
      ).status(),
    ).toBe(201);
    await p.goto('/mis-gestiones/vacaciones');
    await oferta(p);
    const tarjeta = p.locator('[data-tour="vacaciones-saldo"]');
    await expect(tarjeta.getByText('Disponibles').locator('..')).toContainText('6.25');
    await expect(tarjeta.getByText('Solicitables', { exact: true }).locator('..')).toContainText(
      '6 días',
    );
    const calendario = p.locator('.calendario');
    await calendario.locator('.rdp-button_next').click();
    const dia = (fecha: string) => calendario.locator('[data-day="' + fecha + '"] button').first();
    await dia('2026-11-01').click();
    await dia('2026-11-15').click();
    await expect(p.getByText('10.00 días laborales', { exact: true })).toBeVisible();
    await expect(p.getByRole('button', { name: 'Enviar solicitud', exact: true })).toBeDisabled();
    await expect(
      p.getByText(/Puedes solicitar 6 días completos/, { exact: false }).first(),
    ).toBeVisible();
    await p.getByRole('button', { name: 'Limpiar rango', exact: true }).click();
    await dia('2026-11-02').click();
    await dia('2026-11-09').click();
    await expect(p.getByText('6.00 días laborales', { exact: true })).toBeVisible();
    await p.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
    await p.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(p.getByText('Solicitud enviada a RRHH.', { exact: true })).toBeVisible();
    await r.goto('/vacaciones');
    await oferta(r);
    const fila = r
      .getByRole('row')
      .filter({ hasText: 'Persona E2E' })
      .filter({ hasText: '02/11/2026' });
    await fila.getByRole('button', { name: 'Aprobar', exact: true }).click();
    let modal = r.locator('dialog[open]');
    await expect(modal.getByText('Solicitables', { exact: true }).locator('..')).toContainText(
      '6 días',
    );
    await tour(r, true);
    await modal.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      r.getByText('Vacaciones aprobadas; saldo actualizado.', { exact: true }),
    ).toBeVisible();
    await p.reload();
    await oferta(p);
    await expect(tarjeta.getByText('Disponibles').locator('..')).toContainText('0.25');
    await expect(tarjeta.getByText('Solicitables', { exact: true }).locator('..')).toContainText(
      '0 días',
    );
    const propia = p.getByRole('row').filter({ hasText: '02/11/2026' });
    await propia.getByRole('button', { name: 'Cancelar vacaciones', exact: true }).click();
    modal = p.locator('dialog[open]');
    await modal.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      modal.getByText('Explica el motivo con al menos 10 caracteres.', { exact: true }).first(),
    ).toBeVisible();
    await modal
      .getByLabel('Motivo de cancelación', { exact: true })
      .fill('Cambio de fechas solicitado por el empleado');
    await tour(p, true);
    await modal.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      p.getByText('Vacaciones canceladas; días devueltos al saldo.', { exact: true }),
    ).toBeVisible();
    await expect(tarjeta.getByText('Disponibles').locator('..')).toContainText('6.25');
    await propia.getByRole('button', { name: 'Ver solicitud', exact: true }).click();
    await expect(p.locator('dialog[open]').getByText(/Cancelado por:/)).toBeVisible();
    await expect(p.locator('dialog[open]').getByText(/Resuelto por:/)).toBeVisible();
    await p
      .locator('dialog[open]')
      .getByRole('button', { name: 'Cerrar ventana', exact: true })
      .click();
    await p.setViewportSize({ width: 390, height: 844 });
    await revisarUi(p);
    await mkdir('tmp/pdfs', { recursive: true });
    const avisos = p.getByRole('button', { name: 'Cerrar aviso', exact: true });
    while (await avisos.count()) await avisos.first().click();
    await p.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await p.screenshot({
      path: 'tmp/pdfs/vacaciones-v1-8-movil.png',
      fullPage: true,
      animations: 'disabled',
    });
    await ec.close();
    await rc.close();
  });
  test('FASE V1-10: simulación, pago mensual, PDF, portal y cierre', async ({ page }) => {
    await entrar(page, 'RH');
    for (const tipo of ['Anticipo', 'Pago del mes']) {
      await page.goto('/nomina/simular');
      await oferta(page);
      await page.getByRole('combobox', { name: 'Mes del pago', exact: true }).selectOption('01');
      if (tipo === 'Pago del mes') await elegir(page, 'Tipo de pago', tipo);
      await page.getByRole('button', { name: 'Simular', exact: true }).click();
      await expect(page.getByRole('table')).toContainText('Persona E2E');
      await expect(page.getByRole('table')).toContainText(
        tipo === 'Anticipo' ? '2,750.00' : '2,208.07',
      );
      await expect(
        page.getByRole('button', { name: 'Confirmar y pagar', exact: true }),
      ).toBeDisabled();
      if (tipo === 'Anticipo') {
        await page.setViewportSize({ width: 390, height: 844 });
        await revisarUi(page);
        await mkdir('tmp/pdfs', { recursive: true });
        await page.screenshot({ path: 'tmp/pdfs/pago-v1-10-movil.png', fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await page
        .getByRole('checkbox', { name: 'Confirmo que las novedades del mes están completas' })
        .check();
      await page.getByRole('button', { name: 'Confirmar y pagar', exact: true }).click();
      const respuesta = page.waitForResponse(
        (r) => r.url().endsWith('/api/nomina/pagar') && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
      const respuestaPago = await respuesta;
      expect(respuestaPago.status()).toBe(201);
      const pago = (await respuestaPago.json()).data;
      await expect(page.getByText('Pagados: 2.', { exact: false })).toBeVisible();
      const descarga = page.waitForEvent('download');
      await page.getByRole('button', { name: 'ZIP de boletas por departamento' }).click();
      expect((await descarga).suggestedFilename()).toBe('boletas-2026-01.zip');
      const estadoPeriodo = await page.request.get(`/api/nomina/periodos/${pago.idPeriodo}`);
      expect(estadoPeriodo.status()).toBe(200);
      const filasPeriodo = await page.request.get(
        `/api/nomina/periodos/${pago.idPeriodo}/planilla`,
      );
      expect(filasPeriodo.status()).toBe(200);
      await page.goto(`/planilla?periodo=${pago.idPeriodo}`);
      await oferta(page);
      for (const [boton, accion] of [
        ['Marcar revisada', 'revisar'],
        ['Aprobar', 'aprobar'],
        ['Cerrar', 'cerrar'],
      ] as const) {
        await page.getByRole('button', { name: boton, exact: true }).click();
        await page.getByRole('button', { name: `Confirmar ${accion}`, exact: true }).click();
        await expect(
          page.getByRole('button', { name: `Confirmar ${accion}`, exact: true }),
        ).toHaveCount(0);
      }
      await expect(page.getByRole('heading', { name: /· CERRADO$/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Recalcular', exact: true })).toHaveCount(0);
    }
    await salir(page);
    await entrar(page, 'EMPLEADO');
    await page.goto('/mis-gestiones/boletas');
    await oferta(page);
    await expect(page.getByRole('table')).toContainText('2,750.00');
    await expect(page.getByRole('table')).toContainText('2,208.07');
  });
  test('constancia laboral: solicitud, vista previa, entrega y descarga propia', async ({
    browser,
  }) => {
    const empleado = await browser.newContext(),
      rh = await browser.newContext();
    const p = await empleado.newPage(),
      r = await rh.newPage();
    await entrar(p, 'EMPLEADO');
    await p.goto('/mis-gestiones/solicitudes');
    await oferta(p);
    await p
      .getByRole('heading', { name: 'Constancia laboral', exact: true })
      .locator('..')
      .getByRole('button', { name: 'Solicitar', exact: true })
      .click();
    await p.getByRole('button', { name: 'Revisar y enviar', exact: true }).click();
    await p.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      p.getByText('Solicitud enviada. RRHH recibió una notificación.', { exact: true }),
    ).toBeVisible();
    await entrar(r, 'RH');
    await r.goto('/solicitudes');
    await oferta(r);
    await r
      .getByRole('row')
      .filter({ hasText: 'Persona E2E' })
      .getByRole('button', { name: 'Ver solicitud', exact: true })
      .click();
    await r.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await r.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await r.getByRole('button', { name: 'Vista previa del PDF', exact: true }).click();
    await expect(r.locator('canvas').first()).toBeVisible();
    await r.getByRole('button', { name: 'Enviar y entregar documento', exact: true }).click();
    await r.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(r.getByText('Entregada', { exact: true }).first()).toBeVisible();
    await p.reload();
    await p.getByRole('button', { name: 'Ver solicitud', exact: true }).first().click();
    await p.getByRole('button', { name: 'Ver y descargar documento', exact: true }).click();
    await expect(p.locator('canvas').first()).toBeVisible();
    const descarga = p.waitForEvent('download');
    await p.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
    expect((await descarga).suggestedFilename()).toMatch(/\.pdf$/);
    await empleado.close();
    await rh.close();
  });
  test('administración completa de accesos y datos de empresa con API protegida', async ({
    page,
  }) => {
    await entrar(page, 'ADMIN');
    await page.goto('/admin/usuarios');
    await oferta(page);
    await page.getByRole('button', { name: 'Crear acceso', exact: true }).click();
    await tour(page, true);
    await page.getByLabel('Nombre', { exact: true }).fill('Julia');
    await page.getByLabel('Apellido', { exact: true }).fill('Accesos');
    await page
      .getByRole('dialog', { name: 'Crear acceso administrativo', exact: true })
      .getByLabel('Correo', { exact: true })
      .fill('julia@example.test');
    await page.getByLabel('Motivo', { exact: true }).fill('Alta autorizada para verificación E2E');
    await page.getByRole('button', { name: 'Revisar cambio de acceso', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Contraseñas temporales · entrega privada' }),
    ).toBeVisible();
    await page.bringToFront();
    await page.getByRole('button', { name: 'Copiar credenciales', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Credenciales copiadas.' }),
    ).toBeVisible();
    await page.getByLabel('Ya copié o descargué las credenciales').check();
    await page.getByRole('button', { name: 'Cerrar entrega', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: 'julia.accesos' })).toHaveCount(1);
    const sinCsrf = await page.request.post('/api/usuarios', { data: {} });
    expect(sinCsrf.status()).toBe(403);
    const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
    const usuarios = (await (await page.request.get('/api/usuarios')).json()).data.usuarios;
    const admin = usuarios.find((u: { usuario: string }) => u.usuario === 'admin.e2e');
    const ultimo = await page.request.patch(`/api/usuarios/${admin.idUsuario}/estado`, {
      headers: { 'X-CSRF-Token': csrf },
      data: { activo: false, motivo: 'No debe desactivar último ADMIN' },
    });
    expect(ultimo.status()).toBe(409);
    await page.goto('/catalogos/empresa');
    await oferta(page);
    await expect(
      page.getByRole('heading', { name: 'Configuración de empresa', exact: true }),
    ).toBeVisible();
    await tour(page);
    await page.getByLabel('Teléfono', { exact: true }).fill('55551234');
    await page.getByLabel('Nombre comercial', { exact: true }).fill('Empresa Pruebas');
    await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
    await expect(
      page.getByText('Configuración de empresa guardada.', { exact: true }),
    ).toBeVisible();
    const empresa = (await (await page.request.get('/api/empresa')).json()).data;
    expect(empresa.telefono).toBe('55551234');
    expect(empresa.nombreComercial).toBe('Empresa Pruebas');
  });
  test('FASE V1-5: logo privado, borrador y membrete en documentos', async ({ page }) => {
    await entrar(page, 'RH');
    await page.goto('/catalogos/empresa');
    await oferta(page);
    await page.getByLabel('Nombre comercial', { exact: true }).fill('Identidad v1');
    await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible();
    await page.reload();
    await oferta(page);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByLabel('Nombre comercial', { exact: true })).toHaveValue('Identidad v1');
    await page.getByLabel('Logo', { exact: true }).setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="60"><rect width="180" height="60" fill="#213F60"/><text x="15" y="40" fill="white" font-size="30">EMPRESA</text></svg>',
      ),
    });
    await expect(page.getByAltText('Vista previa del logo')).toBeVisible();
    await revisarUi(page);
    await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
    await expect(
      page.getByText('Configuración de empresa guardada.', { exact: true }),
    ).toBeVisible();
    await expect.poll(() => clavesBorradores(page)).toEqual([]);
    const empresa = (await (await page.request.get('/api/empresa')).json()).data;
    expect(empresa.logo.mime).toBe('image/png');
    await mkdir('tmp/pdfs', { recursive: true });
    await page.screenshot({ path: 'tmp/pdfs/empresa-v1-5.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await revisarUi(page);
    await salir(page);
    await entrar(page, 'EMPLEADO');
    expect((await page.request.get('/api/empresa')).status()).toBe(403);
    const token = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
    const solicitud = await page.request.post('/api/solicitudes', {
      headers: { 'X-CSRF-Token': token },
      data: { tipo: 'CONSTANCIA_LABORAL', confirmado: true },
    });
    expect(solicitud.status()).toBe(201);
    const id = (await solicitud.json()).data.id;
    await salir(page);
    await entrar(page, 'RH');
    const csrfRh = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
    expect(
      (
        await page.request.post(`/api/solicitudes/${id}/resolver`, {
          headers: { 'X-CSRF-Token': csrfRh },
          data: { estado: 'APROBADA', confirmado: true },
        })
      ).status(),
    ).toBe(200);
    const documento = (await (await page.request.get(`/api/solicitudes/${id}/documento`)).json())
      .data;
    const bytes = Buffer.from(documento.base64, 'base64');
    expect(bytes.toString('latin1')).toContain('/Subtype /Image');
    await writeFile('tmp/pdfs/empresa-solicitud-v1-5.pdf', bytes);
    expect(
      (
        await page.request.post(`/api/solicitudes/${id}/entregar`, {
          headers: { 'X-CSRF-Token': csrfRh },
          data: { confirmado: true, sha256: documento.sha256 },
        })
      ).status(),
    ).toBe(200);
    await salir(page);
    await entrar(page, 'EMPLEADO');
    expect((await page.request.get(`/api/solicitudes/${id}/documento`)).status()).toBe(200);
  });
  test('RBAC, recursos propios y tiempos de consultas reales', async ({ page, browser }) => {
    const anon = await browser.newContext();
    for (const ruta of [
      '/usuarios',
      '/auditoria',
      '/empleados',
      '/catalogos',
      '/novedades/descuentos',
      '/nomina/periodos',
      '/prestaciones',
      '/solicitudes',
      '/vacaciones/solicitudes',
      '/notificaciones',
      '/comunicacion/anuncios',
      '/tableros/admin',
    ])
      expect((await anon.request.get(`http://127.0.0.1:5178/api${ruta}`)).status()).toBe(401);
    await anon.close();
    await entrar(page, 'EMPLEADO');
    for (const ruta of [
      '/usuarios',
      '/auditoria',
      '/empleados',
      '/catalogos',
      '/novedades/descuentos',
      '/nomina/periodos',
      '/prestaciones',
      '/solicitudes/plantillas',
      '/vacaciones/empleados/2/saldo',
      '/tableros/admin',
    ])
      expect((await page.request.get(`/api${ruta}`)).status()).toBe(403);
    const propias = (await (await page.request.get('/api/solicitudes')).json()).data.registros;
    const documento = propias.find((s: { tipo: string }) => s.tipo === 'CONSTANCIA_LABORAL').id;
    expect((await page.request.get(`/api/solicitudes/${documento}/documento`)).status()).toBe(200);
    const ajeno = await browser.newContext();
    const r = await ajeno.request.get('http://127.0.0.1:5178/api/auth/csrf');
    const login = await ajeno.request.post('http://127.0.0.1:5178/api/auth/login', {
      headers: { 'X-CSRF-Token': (await r.json()).data.csrfToken },
      data: { usuario: 'ajeno.pruebas', contrasena: process.env.E2E_PASSWORD },
    });
    expect(login.status()).toBe(200);
    expect(
      (
        await ajeno.request.get(`http://127.0.0.1:5178/api/solicitudes/${documento}/documento`)
      ).status(),
    ).toBe(403);
    await ajeno.close();
    await page.context().clearCookies();
    await entrar(page, 'ADMIN');
    const tiempos = [];
    for (const ruta of [
      '/usuarios?rol=RH&activo=1',
      '/empleados?limite=10',
      '/solicitudes?estado=ENTREGADA',
      '/comunicacion/eventos',
      '/tableros/admin',
      '/auditoria?limite=10',
    ]) {
      const muestras = [];
      for (let i = 0; i < 3; i++) {
        const inicio = performance.now();
        const res = await page.request.get(`/api${ruta}`);
        expect(res.status()).toBe(200);
        await res.body();
        muestras.push(Math.round(performance.now() - inicio));
      }
      tiempos.push({ ruta, minimoMs: Math.min(...muestras), maximoMs: Math.max(...muestras) });
      expect(Math.max(...muestras)).toBeLessThan(5000);
    }
    await mkdir('tmp', { recursive: true });
    await writeFile('tmp/rendimiento.json', JSON.stringify(tiempos, null, 2));
  });
  test('todas las páginas por rol, ayuda, hints, teclado, accesibilidad y móvil', async ({
    page,
  }) => {
    test.setTimeout(480000);
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await entrar(page, 'ADMIN');
    const token = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
    const opcion = async (ref: string) =>
      Number(
        (await (await page.request.get(`/api/novedades/opciones/${ref}`)).json()).data[0].value,
      );
    const muestras: Record<string, Record<string, unknown>> = {
      descuentos: {
        idTipo: await opcion('descuentos'),
        modalidad: 'FIJO',
        monto: '10.00',
        cuotas: null,
        fechaInicio: hoy,
        fechaFin: null,
      },
      prestamos: {
        idTipo: await opcion('prestamos'),
        monto: '100.00',
        cuotas: 2,
        fechaInicio: hoy,
        fechaDesembolso: hoy,
        referencia: 'AUDITORIA_PRESTAMO',
      },
      comisiones: { mes: '2026-02', monto: '100.00', referencia: 'AUDITORIA_COMISION' },
      'horas-extra': { mes: '2026-02', horas: '1.00' },
      ausencias: {
        idTipo: await opcion('ausencias'),
        fechaInicio: '2026-02-04',
        fechaFin: '2026-02-04',
        estado: 'PENDIENTE',
      },
    };
    const detalles: string[] = [];
    for (const [tipo, datos] of Object.entries(muestras)) {
      const res = await page.request.post(`/api/novedades/${tipo}`, {
        headers: { 'X-CSRF-Token': token },
        data: {
          idEmpleado: 1,
          motivo: 'Registro aislado para auditoría de pantallas',
          confirmado: true,
          ...datos,
        },
      });
      expect(res.status()).toBe(201);
      const id = (await res.json()).data.id;
      detalles.push(`/novedades/${tipo}/${id}`, `/novedades/${tipo}/${id}/editar`);
    }
    for (const rol of ['ADMIN', 'RH', 'EMPLEADO'] as const) {
      await page.context().clearCookies();
      await entrar(page, rol);
      const rutas =
        rol === 'EMPLEADO'
          ? [
              '/mis-gestiones',
              '/mis-gestiones/boletas',
              '/mis-gestiones/vacaciones',
              '/mis-gestiones/solicitudes',
              '/mis-gestiones/datos',
              '/mis-gestiones/anuncios',
              '/mis-gestiones/eventos',
            ]
          : [
              rol === 'ADMIN' ? '/admin' : '/rh',
              '/catalogos',
              '/empleados',
              '/empleados/nuevo',
              '/empleados/1',
              '/empleados/1/editar',
              '/empleados/carga-masiva',
              '/novedades',
              '/planilla',
              '/nomina/simular',
              '/prestaciones',
              '/vacaciones',
              '/solicitudes',
              '/comunicacion/anuncios',
              '/comunicacion/eventos',
              ...(rol === 'ADMIN' ? ['/admin/usuarios', '/admin/bitacora'] : []),
            ];
      if (rol !== 'EMPLEADO') {
        const cs = await page.request.get('/api/catalogos');
        const cats = (await cs.json()).data as { slug: string }[];
        rutas.push(...cats.map((c) => `/catalogos/${c.slug}`), ...detalles);
        for (const tipo of ['descuentos', 'prestamos', 'comisiones', 'horas-extra', 'ausencias'])
          rutas.push(`/novedades/${tipo}`, `/novedades/${tipo}/nuevo`);
      }
      for (const ruta of rutas) {
        await page.goto(ruta);
        await revisarUi(page);
        if (ruta === '/mis-gestiones/solicitudes')
          await expect(page.getByLabel('Buscar empleado', { exact: true })).toHaveCount(0);
        if (ruta.startsWith('/catalogos/') && ruta !== '/catalogos/empresa') {
          await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
          await tour(page, true);
          const a11y = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
          expect(a11y.violations.map((v) => v.id)).toEqual([]);
          await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).last().click();
        }
      }
      if (rol === 'EMPLEADO') {
        await page.setViewportSize({ width: 390, height: 844 });
        for (const ruta of rutas) {
          await page.goto(ruta);
          await revisarUi(page);
          // Una captura completa debe comenzar arriba para ubicar correctamente elementos sticky.
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: `tmp/pdfs/${ruta.split('/').pop()}-movil.png`,
            fullPage: true,
          });
        }
        await page.getByRole('button', { name: 'Abrir menú de navegación', exact: true }).click();
        await expect(page.getByRole('navigation', { name: 'Secciones del sistema' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('button', { name: 'Abrir menú de navegación', exact: true }),
        ).toHaveAttribute('aria-expanded', 'false');
        await page.goto('/mis-gestiones');
        await revisarUi(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: 'tmp/pdfs/portal-movil.png', fullPage: true });
        await page.setViewportSize({ width: 1280, height: 900 });
      }
    }
    expect(errores).toEqual([]);
  });
});

test.describe('FASE V1-2: borradores con API y Oracle reales', () => {
  test('cierra la pestaña y retoma empleado; descartar y cerrar sesión limpian', async ({
    page,
    context,
  }) => {
    await entrar(page, 'RH');
    await page.goto('/empleados/nuevo');
    await oferta(page);
    await page.getByLabel('Nombres', { exact: true }).fill('Borrador Persona');
    await page.getByLabel('Nombre del contacto', { exact: true }).fill('Contacto Borrador');
    await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible();
    await page.close();
    const volver = await context.newPage();
    await volver.goto('/empleados/nuevo');
    await expect(volver.getByText(/Tienes un borrador guardado hace/)).toBeVisible();
    await expect(volver.getByLabel('Nombres', { exact: true })).toHaveValue('');
    await volver.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(volver.getByLabel('Nombres', { exact: true })).toHaveValue('Borrador Persona');
    await expect(volver.getByLabel('Nombre del contacto', { exact: true })).toHaveValue(
      'Contacto Borrador',
    );
    const axe = await new AxeBuilder({ page: volver })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    await volver.evaluate(() => window.scrollTo(0, 0));
    await volver.screenshot({ path: 'tmp/pdfs/borrador-empleado.png', fullPage: true });
    await volver.getByRole('button', { name: 'Descartar borrador', exact: true }).click();
    let dialogo = volver.getByRole('dialog', { name: 'Descartar borrador', exact: true });
    await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(await clavesBorradores(volver)).toHaveLength(1);
    await volver.getByRole('button', { name: 'Descartar borrador', exact: true }).click();
    dialogo = volver.getByRole('dialog', { name: 'Descartar borrador', exact: true });
    await dialogo.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(volver.getByLabel('Nombres', { exact: true })).toHaveValue('');
    expect(await clavesBorradores(volver)).toHaveLength(0);
    await volver.getByLabel('Nombres', { exact: true }).fill('Borrador Final');
    await expect(volver.getByText('Borrador guardado', { exact: true })).toBeVisible();
    await volver.getByRole('button', { name: /^Mi cuenta:/ }).click();
    await volver.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(volver).toHaveURL(/\/login$/);
    expect(await clavesBorradores(volver)).toHaveLength(0);
    await entrar(volver, 'RH');
    await volver.goto('/empleados/nuevo');
    await expect(volver.getByLabel('Nombres', { exact: true })).toHaveValue('');
    await expect(volver.getByText(/Tienes un borrador guardado hace/)).toHaveCount(0);
  });
  test('catálogo restaura, genera código y limpia al guardar y editar', async ({ page }) => {
    await entrar(page, 'RH');
    await page.goto('/catalogos/departamentos');
    await oferta(page);
    await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
    await expect(page.getByLabel('Código', { exact: true })).toHaveAttribute('readonly');
    await page.getByLabel('Nombre', { exact: true }).fill('Departamento Borrador');
    await page.reload();
    await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Departamento Borrador');
    await expect(page.getByLabel('Código', { exact: true })).toHaveValue('DB');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Registro guardado y auditado.', { exact: true })).toBeVisible();
    expect(await clavesBorradores(page)).toHaveLength(0);
    const fila = page.getByRole('row').filter({ hasText: 'Departamento Borrador' });
    await fila.getByRole('button', { name: /^Editar registro/ }).click();
    await page.getByLabel('Descripción', { exact: true }).fill('Descripción retomada');
    await page.reload();
    await fila.getByRole('button', { name: /^Editar registro/ }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByLabel('Descripción', { exact: true })).toHaveValue(
      'Descripción retomada',
    );
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Registro guardado y auditado.', { exact: true })).toBeVisible();
    expect(await clavesBorradores(page)).toHaveLength(0);
  });
  test('IGSS retoma sección y fila parcial; entrar con otra cuenta purga borradores', async ({
    page,
    context,
  }) => {
    await entrar(page, 'RH');
    await page.goto('/planilla');
    await oferta(page);
    await page.getByRole('button', { name: 'Configurar IGSS', exact: true }).click();
    await page.getByLabel('Número patronal', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Asignación de empleados', exact: true }).click();
    await page.getByLabel('Primer nombre', { exact: true }).fill('Nombre pendiente');
    await page.reload();
    await page.getByRole('button', { name: 'Configurar IGSS', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByLabel('Número patronal', { exact: true })).toHaveValue('123456');
    await expect(page.getByLabel('Primer nombre', { exact: true })).toHaveValue('Nombre pendiente');
    expect(await clavesBorradores(page)).toHaveLength(1);
    // Quitar la cookie representa sesión perdida; no es el cierre explícito que elimina borradores.
    await context.clearCookies();
    await entrar(page, 'EMPLEADO');
    expect(await clavesBorradores(page)).toHaveLength(0);
  });
});

test.describe('FASE V1-3: códigos automáticos con API real', () => {
  test('vista previa, colisiones, búsqueda e inmutabilidad en formularios', async ({ page }) => {
    await entrar(page, 'RH');
    await page.goto('/catalogos/departamentos');
    await oferta(page);
    const codigos: string[] = [];
    for (const esperado of ['VC', 'VNT', 'VC2']) {
      await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
      const codigo = page.getByLabel('Código', { exact: true });
      await expect(codigo).toHaveAttribute('readonly');
      await page.getByLabel('Nombre', { exact: true }).fill('Ventas de códigos');
      await expect(codigo).toHaveValue(esperado);
      const respuesta = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith('/catalogos/departamentos'),
      );
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      const guardado = await respuesta;
      expect(guardado.status()).toBe(201);
      codigos.push((await guardado.json()).data.codigo);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    expect(new Set(codigos).size).toBe(3);
    await page.getByLabel('Buscar', { exact: true }).fill('VC2');
    await page.getByRole('button', { name: 'Aplicar búsqueda y filtros', exact: true }).click();
    const fila = page.getByRole('row').filter({ hasText: 'Ventas de códigos' });
    await expect(fila).toHaveCount(1);
    await fila.getByRole('button', { name: /^Editar registro/ }).click();
    await page.getByLabel('Nombre', { exact: true }).fill('Nombre renombrado');
    await expect(page.getByLabel('Código', { exact: true })).toHaveValue('VC2');
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    await tour(page, true);
    await mkdir('tmp/pdfs', { recursive: true });
    await page.screenshot({ path: 'tmp/pdfs/codigos-automaticos.png', fullPage: true });
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Nombre renombrado' })).toContainText(
      'VC2',
    );
  });
});
test.describe('FASE V1-4: ubicaciones oficiales', () => {
  test('centros con ubicación oficial, cascada, borrador y ayuda', async ({ page }) => {
    await entrar(page, 'RH');
    await page.goto('/catalogos/centros-trabajo');
    await oferta(page);
    await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
    await oferta(page);
    await expect(
      page.getByRole('combobox', { name: 'Departamento de Guatemala', exact: true }),
    ).toHaveValue('Guatemala');
    await expect(page.getByRole('combobox', { name: 'Municipio', exact: true })).toHaveValue(
      'Guatemala',
    );
    await page.getByLabel('Nombre', { exact: true }).fill('Sede de ubicaciones');
    await elegir(page, 'Departamento de Guatemala', 'El Progreso');
    await expect(page.getByRole('combobox', { name: 'Municipio', exact: true })).toHaveValue('');
    await elegir(page, 'Municipio', 'Guastatoya');
    await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    await tour(page, true);
    await mkdir('tmp/pdfs', { recursive: true });
    await page.getByRole('combobox', { name: 'Municipio', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'tmp/pdfs/ubicaciones-centro.png', fullPage: true });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Municipio', exact: true })).toHaveValue(
      'Guastatoya',
    );
    const guardado = page.waitForResponse(
      (r) => r.url().includes('/api/catalogos/centros-trabajo') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    const respuesta = await guardado;
    expect(respuesta.status()).toBe(201);
    const centro = (await respuesta.json()).data;
    expect(centro.idDepartamentoGtEtiqueta).toBe('El Progreso');
    expect(centro.idMunicipioGtEtiqueta).toBe('Guastatoya');
    const fila = page.getByRole('row').filter({ hasText: 'Sede de ubicaciones' });
    await expect(fila).toContainText('Guastatoya');
    expect(
      (await clavesBorradores(page)).filter((k) => k.includes('catalogo-centros-trabajo')),
    ).toEqual([]);
    const detalleCentro = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/catalogos/centros-trabajo/${centro.id}`) &&
        r.request().method() === 'GET',
    );
    await fila.getByRole('button', { name: /^Editar registro/ }).click();
    expect((await detalleCentro).status()).toBe(200);
    await expect(
      page.getByRole('dialog', { name: 'Editar · Centros de trabajo', exact: true }),
    ).toBeVisible();
    await oferta(page);
    await expect(page.getByRole('combobox', { name: 'Municipio', exact: true })).toHaveValue(
      'Guastatoya',
    );
    await elegir(page, 'Departamento de Guatemala', 'Guatemala');
    await expect(page.getByRole('combobox', { name: 'Municipio', exact: true })).toHaveValue('');
    await elegir(page, 'Municipio', 'Mixco');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(fila).toContainText('Mixco');
  });
});

test('FASE V1-6: bloques, borrador, duplicado y horario desde empleado', async ({ page }) => {
  await entrar(page, 'RH');
  await page.goto('/catalogos/horarios');
  await oferta(page);
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
  await oferta(page);
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Horario por bloques');
  await page.getByRole('button', { name: 'Agregar bloque', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar bloque', exact: true }).click();
  const segundo = page.getByRole('region', { name: 'Bloque 2', exact: true });
  await segundo.getByRole('button', { name: 'Fin de semana', exact: true }).click();
  await segundo.getByRole('button', { name: 'Domingo', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Salida · bloque 2', exact: true })
    .selectOption('12:30');
  await page.getByRole('combobox', { name: 'Descanso · bloque 2', exact: true }).selectOption('30');
  await expect(page.getByText('Horas semanales: 44.00 · Jornada diurna')).toBeVisible();
  await expect(page.locator('[data-tour="horario-totales"]')).toContainText('Domingo');
  expect(
    await page
      .getByRole('combobox', { name: 'Entrada · bloque 1', exact: true })
      .locator('option')
      .count(),
  ).toBe(48);
  await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('Horas semanales: 44.00 · Jornada diurna')).toBeVisible();
  await oferta(page);
  await tour(page, true);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => ({ id: v.id, nodos: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  await mkdir('tmp/pdfs', { recursive: true });
  await page.screenshot({ path: 'tmp/pdfs/horarios-bloques.png', fullPage: true });
  await page.locator('[data-tour="horario-totales"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/pdfs/horarios-constructor.png' });
  const respuesta = page.waitForResponse(
    (r) => r.url().endsWith('/api/catalogos/horarios') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  const guardado = await respuesta;
  expect(guardado.status()).toBe(201);
  const horario = (await guardado.json()).data;
  expect(horario.bloques).toHaveLength(2);
  expect((await clavesBorradores(page)).filter((k) => k.includes('catalogo-horarios'))).toEqual([]);
  const fila = page.getByRole('row').filter({ hasText: 'Horario por bloques' });
  await fila.getByRole('button', { name: `Duplicar horario ${horario.id}`, exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Duplicar · Horarios laborales', exact: true }),
  ).toBeVisible();
  await oferta(page);
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Horario duplicado');
  const copia = page.waitForResponse(
    (r) => r.url().endsWith('/api/catalogos/horarios') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  const duplicado = await copia;
  expect(duplicado.status()).toBe(201);
  expect((await duplicado.json()).data.codigo).not.toBe(horario.codigo);
  await page.goto('/empleados/nuevo');
  await oferta(page);
  await page.getByRole('textbox', { name: 'Nombres', exact: true }).fill('Ficha en progreso');
  await page.getByRole('button', { name: 'Crear horario personalizado', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Crear · Horarios laborales', exact: true });
  await expect(modal).toBeVisible();
  await oferta(page);
  await modal
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Horario dentro expediente');
  await modal.getByRole('button', { name: 'Agregar bloque', exact: true }).click();
  await tour(page, true);
  const desdeFicha = page.waitForResponse(
    (r) => r.url().endsWith('/api/catalogos/horarios') && r.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  expect((await desdeFicha).status()).toBe(201);
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Nombres', exact: true })).toHaveValue(
    'Ficha en progreso',
  );
  await expect(page.getByRole('combobox', { name: 'Horario', exact: true })).toHaveValue(
    'Horario dentro expediente',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Crear horario personalizado', exact: true }).click();
  await oferta(page);
  await page.getByRole('button', { name: 'Agregar bloque', exact: true }).click();
  const ancho = await page.evaluate(() => ({
    pagina: document.documentElement.scrollWidth,
    pantalla: innerWidth,
  }));
  expect(ancho.pagina).toBeLessThanOrEqual(ancho.pantalla);
  await page
    .getByRole('combobox', { name: 'Entrada · bloque 1', exact: true })
    .scrollIntoViewIfNeeded();
  const anchoModal = await page
    .locator('dialog[open]')
    .evaluate((d) => ({ contenido: d.scrollWidth, visible: d.clientWidth }));
  expect(anchoModal.contenido).toBeLessThanOrEqual(anchoModal.visible);
  await page.screenshot({ path: 'tmp/pdfs/horarios-bloques-movil.png' });
  const axeMovil = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeMovil.violations.map((v) => v.id)).toEqual([]);
});

test('FASE V1-9: novedades mensuales, tarifas y ciclo de parqueo con ayuda y móvil', async ({
  page,
}) => {
  await entrar(page, 'RH');
  await page.goto('/configuracion/parqueo');
  await oferta(page);
  for (const vehiculo of ['Carro', 'Moto']) {
    await elegir(page, 'Vehículo', vehiculo);
    await page
      .getByLabel('Tarifa mensual', { exact: true })
      .fill(vehiculo === 'Carro' ? '150.00' : '75.00');
    await page
      .getByLabel('Motivo del cambio', { exact: true })
      .fill('Tarifa mensual aprobada para pruebas');
    await page.getByRole('button', { name: 'Revisar y guardar tarifa', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Confirmar tarifa mensual' })).not.toBeVisible();
  }
  await revisarUi(page);
  const empleadoLabel = (
    await (await page.request.get('/api/novedades/opciones/empleados?buscar=Persona')).json()
  ).data[0].label as string;
  await page.goto('/novedades/horas-extra/nuevo');
  await oferta(page);
  await elegir(page, 'Empleado', empleadoLabel);
  await page.getByLabel('Horas registradas', { exact: true }).fill('2.5');
  await page
    .getByLabel('Motivo o descripción', { exact: true })
    .fill('Horas adicionales del mes con respaldo');
  await page.getByRole('button', { name: 'Revisar cálculo', exact: true }).click();
  await expect(page.getByText(/Total estimado:/)).toBeVisible();
  await page.getByRole('button', { name: 'Revisar y guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page).toHaveURL(/\/novedades\/horas-extra\/\d+$/);
  await oferta(page);
  await revisarUi(page);
  for (const tipo of ['comisiones', 'consumo-tienda']) {
    await page.goto(`/novedades/${tipo}/nuevo`);
    await oferta(page);
    await elegir(page, 'Empleado', empleadoLabel);
    await page
      .getByLabel(tipo === 'comisiones' ? 'Comisión' : 'Consumo en tienda', { exact: true })
      .fill('123.45');
    await page.getByLabel('Referencia', { exact: true }).fill(`E2E_V19_${tipo}`);
    await page
      .getByLabel('Motivo o descripción', { exact: true })
      .fill('Carga manual del mes con respaldo');
    await page.getByRole('button', { name: 'Revisar y guardar', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/novedades/${tipo}/\\d+$`));
    await oferta(page);
  }
  await page.goto('/novedades/pendientes');
  await oferta(page);
  await revisarUi(page);
  await expect(page.getByRole('table', { name: 'Resumen por departamento' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await revisarUi(page);
  await mkdir('tmp/pdfs', { recursive: true });
  await page.screenshot({ path: 'tmp/pdfs/novedades-v1-9-movil.png' });
  await salir(page);
  await entrar(page, 'EMPLEADO');
  await page.goto('/mis-gestiones/solicitudes');
  await oferta(page);
  await page
    .locator('.gestiones-tarjeta')
    .filter({ has: page.getByRole('heading', { name: 'Parqueo', exact: true }) })
    .getByRole('button', { name: 'Solicitar', exact: true })
    .click();
  const modal = page.getByRole('dialog', { name: 'Solicitar Parqueo' });
  await oferta(page);
  await elegir(page, 'Tipo de vehículo', 'Carro');
  await page.getByLabel('Placa (opcional)', { exact: true }).fill('P123ABC');
  await modal.getByRole('button', { name: 'Revisar y enviar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await salir(page);
  await entrar(page, 'RH');
  const solicitudes = (
    await (await page.request.get('/api/solicitudes?tipo=PARQUEO&estado=EN_PROCESO')).json()
  ).data.registros;
  expect(solicitudes.length).toBe(1);
  await page.goto(`/solicitudes?solicitud=${solicitudes[0].id}`);
  await oferta(page);
  const detalle = page.getByRole('dialog', {
    name: `Solicitud #${solicitudes[0].id}`,
    exact: true,
  });
  await expect(detalle.getByRole('button', { name: 'Aprobar', exact: true })).toBeEnabled();
  await detalle.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Aprobar solicitud' })).toContainText(
    'tarifa mensual de Q 150.00',
  );
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(detalle.getByRole('button', { name: 'Aprobar', exact: true })).toHaveCount(0);
  await salir(page);
  await entrar(page, 'EMPLEADO');
  await page.goto('/mis-gestiones/parqueo');
  await oferta(page);
  await revisarUi(page);
  await page.getByRole('button', { name: 'Solicitar baja', exact: true }).click();
  await page.getByLabel('Motivo', { exact: true }).fill('Ya no utilizaré el parqueo');
  await page.getByRole('button', { name: 'Revisar cambio', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Solicitar baja', exact: true })).toBeDisabled();
  await salir(page);
  await entrar(page, 'RH');
  await page.goto('/novedades/parqueo');
  await oferta(page);
  await page.getByRole('button', { name: 'Dar de baja', exact: true }).click();
  await page.getByLabel('Motivo', { exact: true }).fill('Baja solicitada por el empleado');
  await page.getByRole('button', { name: 'Revisar cambio', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dar de baja', exact: true })).toBeDisabled();
  await revisarUi(page);
});

test('FASE V1-10: pagar departamento, revertir como ADMIN y volver a pagar empleado', async ({
  page,
}) => {
  await entrar(page, 'RH');
  await page.goto('/nomina/simular');
  await oferta(page);
  await page.getByRole('combobox', { name: 'Mes del pago', exact: true }).selectOption('02');
  await elegir(page, 'Objetivo', 'Un departamento');
  await elegir(page, 'Departamento', 'Departamento E2E');
  await page.getByRole('button', { name: 'Simular', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Persona E2E');
  await page
    .getByRole('checkbox', { name: 'Confirmo que las novedades del mes están completas' })
    .check();
  await page.getByRole('button', { name: 'Confirmar y pagar', exact: true }).click();
  const respuesta = page.waitForResponse(
    (r) => r.url().endsWith('/api/nomina/pagar') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  const rp = await respuesta;
  expect(rp.status()).toBe(201);
  const pago = (await rp.json()).data;
  await salir(page);
  await entrar(page, 'ADMIN');
  const cargaPlanilla = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/nomina/periodos/${pago.idPeriodo}/planilla`) &&
      r.request().method() === 'GET',
  );
  await page.goto(`/planilla?periodo=${pago.idPeriodo}`);
  const tablaPago = await cargaPlanilla;
  expect(tablaPago.status()).toBe(200);
  await oferta(page);
  const fila = page.getByRole('row').filter({ hasText: 'Ajeno E2E' });
  await fila.getByRole('button', { name: 'Revertir', exact: true }).click();
  const modal = page.locator('dialog[open]');
  await expect(
    modal.getByRole('button', { name: 'Confirmar reversión', exact: true }),
  ).toBeDisabled();
  await modal
    .getByLabel('Motivo de reversión', { exact: true })
    .fill('Corrección de novedades antes del cierre');
  await tour(page, true);
  await modal.getByRole('button', { name: 'Confirmar reversión', exact: true }).click();
  await expect(
    page.getByText('Pago revertido; cuotas y novedades devueltas.', { exact: true }),
  ).toBeVisible();
  await page.goto('/nomina/simular');
  await oferta(page);
  await page.getByRole('combobox', { name: 'Mes del pago', exact: true }).selectOption('02');
  await elegir(page, 'Objetivo', 'Un empleado');
  const campo = page.getByRole('combobox', { name: 'Empleado', exact: true });
  await campo.fill('Ajeno E2E');
  await page.getByRole('option').filter({ hasText: 'Ajeno E2E' }).click();
  await page.getByRole('button', { name: 'Simular', exact: true }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
  await page
    .getByRole('checkbox', { name: 'Confirmo que las novedades del mes están completas' })
    .check();
  await page.getByRole('button', { name: 'Confirmar y pagar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText('Pagados: 1.', { exact: false })).toBeVisible();
});
