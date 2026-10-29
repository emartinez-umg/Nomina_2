import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
test('R3-7: RH ve saldos, alertas, filtra, exporta y configura el umbral', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill('revisor.pruebas');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/rh');
  const aviso = page.getByText(/\d+ empleados con más de 15 días/);
  await expect(aviso).toBeVisible();
  await page.getByRole('button', { name: 'Revisar saldos de vacaciones' }).click();
  await expect(page).toHaveURL(/\/vacaciones\/saldos\?soloAlerta=true&activos=true/);
  await expect(page).toHaveTitle('Saldos de vacaciones | nomina2');
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  const saldo = (await (await page.request.get('/api/vacaciones/saldos?activos=todos')).json())
    .data;
  expect(saldo.total).toBeGreaterThan(0);
  const codigo = saldo.registros[0].codigo;
  await page.getByLabel('Buscar nombre o código', { exact: true }).fill(codigo);
  const fila = page.getByRole('row').filter({ hasText: codigo });
  await expect(fila).toBeVisible();
  expect(saldo.registros[0].alerta).toBe(true);
  await expect(fila).toHaveClass('saldo-vacaciones-alerta');
  await expect(fila.getByText('Más de 15 días', { exact: true })).toBeVisible();
  await fila.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/pdfs/r3-7-saldos-alerta-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await fila.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'tmp/pdfs/r3-7-saldos-alerta-movil.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await expect(
    page.getByRole('region', { name: 'Saldos de vacaciones', exact: true }),
  ).toContainText('1 registros');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar Excel', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('saldos-vacaciones.xlsx');
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Jefatura', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Saldo de todos los resultados');
  await page.locator('.driver-popover-close-btn').click();
  await page.getByRole('button', { name: 'Configurar umbral', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Editar · Parámetros legales', exact: true });
  await expect(modal.getByLabel('Valor', { exact: true })).toHaveValue('15');
  await modal.getByLabel('Valor', { exact: true }).fill('20');
  const vigencia = modal.getByRole('textbox', { name: 'Vigente desde', exact: true });
  await vigencia.fill(saldo.corte.split('-').reverse().join('/'));
  await modal.getByRole('button', { name: 'Revisar cambio', exact: true }).click();
  const revision = page.getByRole('dialog', {
    name: 'ADVERTENCIA · Cambio de parametrización legal',
    exact: true,
  });
  await expect(revision.getByRole('table')).toContainText('15');
  await expect(revision.getByRole('table')).toContainText('20');
  await revision
    .getByLabel('Motivo del cambio', { exact: true })
    .fill('Planificación del descanso en prueba R3-7');
  await revision.getByRole('button', { name: 'Confirmar cambio legal', exact: true }).click();
  await expect(
    page.getByText(/Más de 20 días: disponible estrictamente mayor que 20/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Saldo de todos los resultados');
  await page.locator('.driver-popover-close-btn').click();
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole('heading', { name: 'Saldos de vacaciones', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/pdfs/r3-7-saldos-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'tmp/pdfs/r3-7-saldos-movil.png' });
});
