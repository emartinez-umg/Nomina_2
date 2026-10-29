import { test, expect, type Locator } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
async function elegir(scope: Locator, nombre: string, texto: string) {
  const campo = scope.getByRole('combobox', { name: nombre, exact: true });
  await campo.click();
  await campo.fill(texto);
  await scope.getByRole('option').filter({ hasText: texto }).click();
}
test('R3-5: catálogo vacío, crear, asignar en bloque y consultar jefe inmediato con Oracle real', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill('revisor.pruebas');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/rh');
  await expect(page.getByText(/empleado\(s\) sin jefatura activa/)).toBeVisible();
  await page.goto('/catalogos/jefaturas');
  await expect(
    page.getByRole('heading', { name: 'Configurar jefaturas', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Configurar jefaturas', exact: true }).click();
  let modal = page.getByRole('dialog', { name: 'Crear · Jefaturas', exact: true });
  await modal
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Supervisión de Operaciones');
  await elegir(modal, 'Departamento', 'Departamento E2E');
  await elegir(modal, 'Jefe responsable', 'Persona E2E');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Asignar jefatura a empleados', exact: true });
  await expect(modal).toBeVisible();
  await elegir(modal, 'Centro de trabajo', 'Centro E2E');
  await modal.getByRole('checkbox', { name: 'Seleccionar Ajeno E2E', exact: true }).check();
  await modal.getByRole('checkbox', { name: 'Seleccionar Destinatario E2E', exact: true }).check();
  await expect(modal.getByText(/2 empleado\(s\) seleccionados/)).toBeVisible();
  await modal
    .getByRole('textbox', { name: 'Motivo de asignación', exact: true })
    .fill('Organización real del equipo de prueba');
  await modal.getByRole('button', { name: 'Ayuda de esta ventana', exact: true }).click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Revisa antes de confirmar');
  await page.locator('.driver-popover-next-btn').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Destino del equipo');
  for (let i = 0; i < 2; i++) await page.locator('.driver-popover-next-btn').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Revisar y confirmar');
  await page.locator('.driver-popover-close-btn').click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'tmp/pdfs/r3-5-asignacion-movil.png', fullPage: true });
  await modal.getByRole('button', { name: 'Revisar asignación', exact: true }).click();
  const confirmacion = page.getByRole('dialog', {
    name: 'Confirmar asignación de jefatura',
    exact: true,
  });
  await expect(confirmacion.getByText(/Se asignarán 2 empleados/)).toBeVisible();
  await confirmacion.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const listado = (await (await page.request.get('/api/empleados?nombre=Ajeno')).json()).data
    .registros;
  expect(listado).toHaveLength(1);
  expect(listado[0].jefeInmediato).toBe('Persona E2E');
  await page.goto(`/empleados/${listado[0].id}`);
  await expect(page.getByText('Jefe inmediato:', { exact: true })).toBeVisible();
  await expect(page.locator('[data-tour="empleado-resumen"]')).toContainText('Persona E2E');
  await expect(page.locator('[data-tour="empleado-resumen"]')).toContainText(
    'Supervisión de Operaciones',
  );
  await page.goto('/empleados');
  await page.getByText('Filtros avanzados', { exact: true }).click();
  await elegir(
    page.locator('[data-tour="empleados-filtros"]'),
    'Jefatura',
    'Supervisión de Operaciones',
  );
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Ajeno E2E' })).toContainText('Persona E2E');
  await expect(page.getByRole('row').filter({ hasText: 'Destinatario E2E' })).toContainText(
    'Persona E2E',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'tmp/pdfs/r3-5-empleados.png', fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});
