import { expect, type Page } from '@playwright/test';
export async function elegirEmpleadoCampo(page: Page, label: string, texto?: string) {
  const campo = page.getByRole('combobox', { name: label, exact: true });
  await campo.click();
  if (texto) await campo.fill(texto);
  await (
    texto
      ? page.getByRole('option', { name: texto, exact: true })
      : page.getByRole('option').first()
  ).click();
}
export async function personalesEmpleado(
  page: Page,
  nombres = 'Asistente Persona',
  nit = '91827364',
) {
  await expect(page.getByRole('combobox', { name: 'Municipio', exact: true })).toHaveValue(
    'Guatemala',
  );
  await page.getByLabel('Nombres', { exact: true }).fill(nombres);
  await page.getByLabel('Apellidos', { exact: true }).fill('Peña');
  await page.getByLabel('DPI', { exact: true }).fill('9988776655443');
  await page.getByLabel('NIT', { exact: true }).fill(nit);
  await page.getByLabel('Fecha de nacimiento', { exact: true }).fill('01/01/1995');
  await elegirEmpleadoCampo(page, 'Sexo', 'Femenino');
  await elegirEmpleadoCampo(page, 'Estado civil', 'SOLTERO');
  await elegirEmpleadoCampo(page, 'Zona', 'Zona 1');
  await page.getByLabel('Dirección', { exact: true }).fill('Colonia Peña, calle #12-A / 3°');
  await page.getByLabel('Teléfono', { exact: true }).fill('55551234');
  await page.getByLabel('Correo', { exact: true }).fill('asistente@example.test');
}
export async function laboralesEmpleado(page: Page) {
  await elegirEmpleadoCampo(page, 'Departamento', 'Departamento E2E');
  await elegirEmpleadoCampo(page, 'Puesto', 'Analista E2E');
  await elegirEmpleadoCampo(page, 'Tipo de contrato', 'Por tiempo indefinido');
  await elegirEmpleadoCampo(page, 'Horario', 'Horario E2E');
  await elegirEmpleadoCampo(page, 'Centro de trabajo', 'Centro E2E');
}
