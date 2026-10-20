import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { personalesEmpleado, laboralesEmpleado, elegirEmpleadoCampo } from './empleado.helpers.js';

async function revisarAyuda(page: Page) {
  await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Asistente de cuatro pasos');
  await page.getByRole('button', { name: 'Cerrar recorrido', exact: true }).click();
}

test('R2-6: asistente, borrador, alta mínima, credenciales y edición con grupos opcionales', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill('revisor.pruebas');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/rh');
  await page.goto('/empleados/nuevo');
  const pasos = page.getByRole('navigation', { name: 'Pasos del expediente' });
  await expect(pasos.getByRole('button', { name: /2\. Datos laborales/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Guardar empleado', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(pasos.getByRole('button', { name: /1\. Datos personales/ })).toContainText(
    'Con errores',
  );
  await personalesEmpleado(page);
  await revisarAyuda(page);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Paso 2 de 4/ })).toBeVisible();
  await laboralesEmpleado(page);
  await revisarAyuda(page);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: 'tmp/pdfs/r2-6-asistente-escritorio.png', fullPage: true });
  await expect(page.getByLabel('Código', { exact: true })).toHaveValue(/^EMP_/);
  await expect(page.getByRole('button', { name: 'Guardar empleado', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await revisarAyuda(page);
  await page.getByLabel('Salario base mensual', { exact: true }).fill('5000');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(pasos.getByRole('button', { name: /3\. Datos salariales y banco/ })).toContainText(
    'Con errores',
  );
  await page.getByLabel('Salario base mensual', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await revisarAyuda(page);
  await page.getByLabel('Nombre del contacto', { exact: true }).fill('Persona Contacto');
  await page.getByRole('button', { name: 'Guardar empleado', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Revisar empleado antes de guardar' })).toHaveCount(
    0,
  );
  await expect(pasos.getByRole('button', { name: /4\. Contacto de emergencia/ })).toContainText(
    'Con errores',
  );
  await page.getByLabel('Nombre del contacto', { exact: true }).fill('');
  await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Paso 4 de 4/ })).toBeVisible();
  await pasos.getByRole('button', { name: /1\. Datos personales/ }).click();
  await expect(page.getByLabel('Dirección', { exact: true })).toHaveValue(
    'Colonia Peña, calle #12-A / 3°',
  );
  await page.getByLabel('Dirección', { exact: true }).fill('Peña@!<>, #12-A / 3°');
  await expect(page.getByLabel('Dirección', { exact: true })).toHaveValue('Peña, #12-A / 3°');
  await page.getByRole('button', { name: 'Guardar empleado', exact: true }).click();
  const revision = page.getByRole('dialog', { name: 'Revisar empleado antes de guardar' });
  await expect(revision).toContainText('Sin salario: perfil incompleto');
  await expect(revision).toContainText('Sin contacto de emergencia');
  await page.getByRole('button', { name: 'Confirmar y guardar empleado', exact: true }).click();
  const credenciales = page.getByRole('dialog', {
    name: 'Contraseñas temporales · entrega privada',
  });
  await expect(credenciales).toBeVisible();
  const descarga = page.waitForEvent('download');
  await credenciales.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  expect((await descarga).suggestedFilename()).toBe('credenciales-temporales.pdf');
  await credenciales.getByLabel('Ya copié o descargué las credenciales').check();
  await credenciales.getByRole('button', { name: 'Cerrar entrega', exact: true }).click();
  await expect(page).toHaveURL(/\/empleados\/\d+$/);
  await expect(page.getByText('Perfil incompleto', { exact: true })).toBeVisible();
  const id = Number(page.url().split('/').pop());
  const previo = (await (await page.request.get(`/api/empleados/${id}`)).json()).data;
  expect(previo.salarioBase).toBeNull();
  expect(previo.contactoNombre).toBeNull();
  await page.goto('/rh');
  await expect(page.locator('[data-tour="alertas"]')).toContainText(
    'Perfil incompleto: falta salario base',
  );
  await page.goto('/empleados');
  await page.getByLabel('Buscar empleado', { exact: true }).fill('Asistente');
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(page.locator('[data-tour="empleados-tabla"]')).toContainText('Perfil incompleto');
  await page.goto(`/empleados/${id}/editar`);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByLabel('Salario base mensual', { exact: true }).fill('5000');
  await elegirEmpleadoCampo(page, 'Banco', 'Banco E2E');
  await page.getByLabel('Cuenta bancaria', { exact: true }).fill('12345678');
  await elegirEmpleadoCampo(page, 'Tipo de cuenta', 'AHORRO');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByLabel('Nombre del contacto', { exact: true }).fill('Persona Contacto');
  await elegirEmpleadoCampo(page, 'Parentesco', 'Madre');
  await page.getByLabel('Teléfono de emergencia', { exact: true }).fill('55554321');
  await page
    .getByLabel('Motivo de edición', { exact: true })
    .fill('Completar salario banco y contacto');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: 'tmp/pdfs/r2-6-asistente-movil.png', fullPage: true });
  await page.getByRole('button', { name: 'Guardar empleado', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y guardar empleado', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/empleados/${id}$`));
  await expect(page.getByText('Perfil incompleto', { exact: true })).toHaveCount(0);
  expect((await (await page.request.get(`/api/empleados/${id}`)).json()).data.codigo).toBe(
    previo.codigo,
  );
});
