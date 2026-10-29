import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
test('R3-8: jefatura concede y revoca acceso al equipo manteniendo el rol Empleado', async ({
  page,
  browser,
}) => {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill('revisor.pruebas');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/rh');
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
  const personas = (await (await page.request.get('/api/empleados?limite=100')).json()).data
    .registros as { id: number; nombre: string; idDepartamento: number }[];
  const jefe = personas.find((e) => e.nombre === 'Persona E2E')!,
    miembro = personas.find((e) => e.nombre === 'Ajeno E2E')!;
  const alta = await page.request.post('/api/catalogos/jefaturas', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      nombre: 'Gerencia Comercial',
      idDepartamento: jefe.idDepartamento,
      idEmpleadoResponsable: jefe.id,
      idJefaturaSuperior: null,
    },
  });
  expect(alta.status()).toBe(201);
  const id = (await alta.json()).data.id;
  expect(
    (
      await page.request.post('/api/catalogos/jefaturas/asignaciones', {
        headers: { 'X-CSRF-Token': csrf },
        data: {
          idJefatura: id,
          empleados: [miembro.id],
          motivo: 'Equipo comercial de aceptación',
          confirmado: true,
        },
      })
    ).status(),
  ).toBe(200);
  const contexto = await browser.newContext({ ignoreHTTPSErrors: true }),
    empleada = await contexto.newPage();
  try {
    await empleada.goto('/login');
    await empleada.getByLabel('Usuario', { exact: true }).fill('persona.pruebas');
    await empleada.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
    await empleada.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(empleada).toHaveURL('/mis-gestiones');
    await expect(empleada.getByRole('button', { name: 'Mi equipo', exact: true })).toHaveCount(0);
    expect((await empleada.request.get('/api/equipo/personas')).status()).toBe(403);
    await page.goto('/catalogos/jefaturas');
    await page.getByRole('tab', { name: 'Permisos', exact: true }).click();
    const selector = page.getByRole('combobox', { name: 'Jefatura', exact: true });
    await selector.click();
    await selector.fill('Gerencia Comercial');
    await page.getByRole('option', { name: 'Gerencia Comercial', exact: true }).click();
    await expect(page.getByText('Equipo: 1 personas')).toBeVisible();
    for (const nombre of ['Ver equipo', 'Ver vacaciones del equipo'])
      await page.getByRole('switch', { name: nombre, exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Motivo del cambio' })
      .fill('Consulta del equipo comercial');
    await page.getByRole('button', { name: 'Revisar permisos' }).click();
    await page
      .getByRole('dialog', { name: 'Confirmar permisos de jefatura' })
      .getByRole('button', { name: 'Confirmar', exact: true })
      .click();
    await expect(page.getByText('Permisos actualizados y auditados.')).toBeVisible();
    await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).click();
    await expect(page.locator('.driver-popover-title')).toHaveText('Selecciona la jefatura');
    await page.locator('.driver-popover-close-btn').click();
    await page.getByRole('tab', { name: 'Permisos', exact: true }).focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'tmp/pdfs/r3-8-permisos.png', fullPage: true });
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    await empleada.reload();
    await empleada.getByRole('button', { name: 'Mi equipo', exact: true }).click();
    await empleada.getByRole('link', { name: /^Mi equipo/ }).click();
    await expect(empleada.getByRole('cell', { name: 'Ajeno E2E', exact: true })).toBeVisible();
    await expect(empleada.getByRole('cell', { name: 'Destinatario E2E', exact: true })).toHaveCount(
      0,
    );
    await expect(
      empleada.getByRole('columnheader', { name: /Salario|DPI|NIT|Banco|Expediente|Actas/ }),
    ).toHaveCount(0);
    expect((await (await empleada.request.get('/api/auth/sesion')).json()).data.rol).toBe(
      'EMPLEADO',
    );
    expect((await empleada.request.get(`/api/empleados/${miembro.id}`)).status()).toBe(403);
    await empleada.screenshot({ path: 'tmp/pdfs/r3-8-directorio.png', fullPage: true });
    await empleada.bringToFront();
    await empleada.getByRole('button', { name: 'Buscar sección o acción', exact: true }).focus();
    await empleada.keyboard.press('Meta+k');
    const paleta = empleada.getByRole('dialog', { name: 'Buscar en el sistema' });
    await expect(paleta).toBeVisible();
    await paleta.getByRole('combobox').fill('vacaciones equipo');
    await expect(
      empleada.getByRole('option').filter({ hasText: 'Vacaciones del equipo' }),
    ).toBeVisible();
    await empleada.keyboard.press('Escape');
    await empleada.getByRole('link', { name: 'Saldos de vacaciones del equipo' }).click();
    await expect(empleada.getByRole('cell', { name: 'Ajeno E2E', exact: true })).toBeVisible();
    await expect(empleada.getByRole('button', { name: 'Configurar umbral' })).toHaveCount(0);
    await empleada.getByRole('button', { name: 'Filtros', exact: true }).click();
    await expect(
      empleada.getByRole('combobox', { name: 'Departamento', exact: true }),
    ).toBeVisible();
    await expect(empleada.getByRole('cell', { name: 'Destinatario E2E', exact: true })).toHaveCount(
      0,
    );
    await empleada.screenshot({ path: 'tmp/pdfs/r3-8-equipo-escritorio.png', fullPage: true });
    await empleada.setViewportSize({ width: 390, height: 844 });
    expect(await empleada.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(
      (await new AxeBuilder({ page: empleada }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    await empleada.screenshot({ path: 'tmp/pdfs/r3-8-equipo-movil.png', fullPage: true });
    for (const nombre of ['Ver equipo', 'Ver vacaciones del equipo'])
      await page.getByRole('switch', { name: nombre, exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Motivo del cambio' })
      .fill('Retiro del acceso de consulta');
    await page.getByRole('button', { name: 'Revisar permisos' }).click();
    await page
      .getByRole('dialog', { name: 'Confirmar permisos de jefatura' })
      .getByRole('button', { name: 'Confirmar', exact: true })
      .click();
    await expect
      .poll(async () =>
        (
          await (await page.request.get(`/api/equipo/jefaturas/${id}/permisos`)).json()
        ).data.permisos.some((p: { activo: boolean }) => p.activo),
      )
      .toBe(false);
    await expect(page.getByText('Permisos actualizados y auditados.').last()).toBeVisible();
    expect((await empleada.request.get('/api/equipo/personas')).status()).toBe(403);
    expect((await empleada.request.get('/api/equipo/saldos')).status()).toBe(403);
    await empleada.reload();
    await expect(empleada.getByText('Sin permiso de equipo')).toBeVisible();
    await expect(empleada.getByRole('button', { name: 'Mi equipo', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver auditoría' }).click();
    await expect(page.getByRole('dialog').getByText('Retiro del acceso de consulta')).toBeVisible();
  } finally {
    await contexto.close();
  }
});
