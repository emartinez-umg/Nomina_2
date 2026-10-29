import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test('R3-6: RRHH revisa colisiones, confirma con copia y el empleado conserva su privacidad', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill('revisor.pruebas');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/rh');
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
  const headers = { 'X-CSRF-Token': csrf };
  const originales = (await (await page.request.get('/api/empleados?nombre=Persona')).json()).data
    .registros;
  const origen = (await (await page.request.get(`/api/empleados/${originales[0].id}`)).json()).data;
  const depGt = (await (await page.request.get('/api/ubicaciones/departamentos')).json()).data.find(
    (d: { codigo: string }) => d.codigo === '01',
  );
  const munGt = (
    await (
      await page.request.get(`/api/ubicaciones/municipios?idDepartamentoGt=${depGt.id}`)
    ).json()
  ).data.find((m: { codigo: string }) => m.codigo === '0101');
  const fecha = new Date('2094-11-01T12:00:00Z');
  while ([0, 6].includes(fecha.getUTCDay())) fecha.setUTCDate(fecha.getUTCDate() + 1);
  const inicio = fecha.toISOString().slice(0, 10);
  const contextos = [];
  const solicitudes: { id: number; codigo: string }[] = [];
  for (const i of [0, 1]) {
    const alta = await page.request.post('/api/empleados', {
      headers,
      data: {
        nombres: i ? 'Segunda' : 'Primera',
        apellidos: 'Colision',
        dpi: `873456789012${i}`,
        nit: `87345678${i}`,
        afiliacionIgss: null,
        fechaNacimiento: '1995-01-01',
        sexo: 'F',
        estadoCivil: 'SOLTERO',
        idDepartamentoGt: depGt.id,
        idMunicipioGt: munGt.id,
        zona: 1,
        direccion: 'Calle 1',
        telefono: '55551234',
        correo: `colision${i}@example.test`,
        idDepartamento: origen.idDepartamento,
        idPuesto: origen.idPuesto,
        idJefatura: null,
        idTipoContrato: origen.idTipoContrato,
        idCentroTrabajo: origen.idCentroTrabajo,
        idHorario: origen.idHorario,
        fechaIngreso: '2020-01-01',
        fechaFinContrato: null,
      },
    });
    expect(alta.status(), await alta.text()).toBe(201);
    const { credenciales } = (await alta.json()).data;
    const contexto = await browser.newContext({ baseURL: baseURL!, ignoreHTTPSErrors: true });
    contextos.push(contexto);
    const previo = (await (await contexto.request.get('/api/auth/csrf')).json()).data.csrfToken;
    const login = await contexto.request.post('/api/auth/login', {
      headers: { 'X-CSRF-Token': previo },
      data: { usuario: credenciales.usuario, contrasena: credenciales.contrasenaTemporal },
    });
    expect(login.status()).toBe(200);
    const cambio = await contexto.request.post('/api/auth/cambiar-contrasena', {
      headers: { 'X-CSRF-Token': (await login.json()).data.csrfToken },
      data: {
        contrasenaActual: credenciales.contrasenaTemporal,
        contrasenaNueva: process.env.E2E_PASSWORD!,
      },
    });
    expect(cambio.status(), await cambio.text()).toBe(200);
    const solicitud = await contexto.request.post('/api/vacaciones/solicitudes', {
      headers: { 'X-CSRF-Token': (await cambio.json()).data.csrfToken },
      data: { inicio, fin: inicio },
    });
    expect(solicitud.status(), await solicitud.text()).toBe(201);
    solicitudes.push((await solicitud.json()).data);
  }
  await page.goto('/vacaciones');
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  const filtro = page.getByRole('combobox', { name: 'Colisiones', exact: true });
  await filtro.click();
  await page.getByRole('option', { name: 'Con colisiones', exact: true }).click();
  const fila = page.getByRole('row').filter({ hasText: solicitudes[0]!.codigo });
  await expect(fila.getByText('⚠ 1 colisiones', { exact: true })).toBeVisible();
  await fila.getByRole('button', { name: 'Aprobar', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Aprobar de todos modos', exact: true });
  await expect(
    modal.getByRole('region', { name: 'Advertencia de colisiones', exact: true }),
  ).toContainText('Segunda Colision');
  await expect(modal.getByText(/Máximo de personas ausentes: 2 de/)).toBeVisible();
  await expect(modal.getByRole('figure', { name: 'Línea de tiempo de colisiones' })).toBeVisible();
  await modal.getByRole('button', { name: 'Ayuda de esta ventana', exact: true }).click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Revisa antes de confirmar');
  await page.locator('.driver-popover-next-btn').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Ausencias que coinciden');
  await page.locator('.driver-popover-close-btn').click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.mouse.move(4, 4);
  await modal
    .getByRole('figure', { name: 'Línea de tiempo de colisiones' })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/pdfs/r3-6-colisiones-movil.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await modal
    .getByRole('region', { name: 'Advertencia de colisiones', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/pdfs/r3-6-colisiones-desktop.png' });
  await modal.getByRole('button', { name: 'Aprobar de todos modos', exact: true }).click();
  await expect(
    page.getByText('Vacaciones aprobadas; saldo actualizado.', { exact: true }),
  ).toBeVisible();
  const copia = (
    await (
      await page.request.get(`/api/vacaciones/solicitudes/${solicitudes[0]!.id}/colisiones`)
    ).json()
  ).data.aprobacion;
  expect(copia.colisiones).toHaveLength(1);
  expect(copia.colisiones[0].empleado).toBe('Segunda Colision');
  const propia = contextos[0]!;
  expect(
    (
      await propia.request.get(`/api/vacaciones/solicitudes/${solicitudes[0]!.id}/colisiones`)
    ).status(),
  ).toBe(403);
  const datosPropios = await (
    await propia.request.get(`/api/vacaciones/solicitudes/${solicitudes[0]!.id}`)
  ).text();
  expect(datosPropios).not.toMatch(
    /Segunda Colision|cantidadColisiones|colisionesAprobacion|tamanoEquipo/,
  );
  const portal = await propia.newPage();
  await portal.goto('/mis-gestiones/vacaciones');
  await portal
    .getByRole('row')
    .filter({ hasText: solicitudes[0]!.codigo })
    .getByRole('button', { name: 'Ver solicitud', exact: true })
    .click();
  await expect(
    portal.getByRole('dialog', { name: 'Detalle de vacaciones', exact: true }),
  ).toBeVisible();
  await expect(portal.getByText('Segunda Colision', { exact: false })).toHaveCount(0);
  await expect(portal.locator('[data-tour="vacaciones-colisiones"]')).toHaveCount(0);
  for (const contexto of contextos) await contexto.close();
});
