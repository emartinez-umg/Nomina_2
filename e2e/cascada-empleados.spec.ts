import { test, expect, type Page, type Locator } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
async function elegir(scope: Locator, label: string, texto: string) {
  const campo = scope.getByRole('combobox', { name: label, exact: true });
  await campo.click();
  await campo.fill(texto);
  await scope.getByRole('option').filter({ hasText: texto }).click();
}
async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill('revisor.pruebas');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/rh');
}
test('R2-7: cascada real en Bono 14, aguinaldo, finiquito, constancias, historial y planilla', async ({
  page,
}) => {
  await entrar(page);
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
  const headers = { 'X-CSRF-Token': csrf };
  const crear = async (ruta: string, data: object) => {
    const r = await page.request.post(`/api/${ruta}`, { headers, data });
    expect(r.status(), await r.text()).toBe(201);
    return (await r.json()).data;
  };
  const ventas = await crear('catalogos/departamentos', { nombre: 'Cascada Comercial' });
  const vacio = await crear('catalogos/departamentos', { nombre: 'Cascada Vacía' });
  const puesto = await crear('catalogos/puestos', {
    nombre: 'Analista Cascada',
    idDepartamento: ventas.id,
    salarioMinimo: null,
    salarioMaximo: null,
  });
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
  const reglas = (await (await page.request.get('/api/empleados/reglas')).json()).data;
  const alta = await crear('empleados', {
    nombres: 'Venta',
    apellidos: 'Cascada',
    dpi: '9776655443321',
    nit: '975312468',
    afiliacionIgss: null,
    fechaNacimiento: '1995-01-01',
    sexo: 'F',
    estadoCivil: 'SOLTERO',
    idDepartamentoGt: depGt.id,
    idMunicipioGt: munGt.id,
    zona: 1,
    direccion: 'Calle 1',
    telefono: '55551234',
    correo: 'venta.cascada@example.test',
    idDepartamento: ventas.id,
    idPuesto: puesto.id,
    idJefatura: null,
    idTipoContrato: origen.idTipoContrato,
    idCentroTrabajo: origen.idCentroTrabajo,
    idHorario: origen.idHorario,
    fechaIngreso: reglas.hoy,
    fechaFinContrato: null,
  });
  const codigo = alta.empleado.codigo as string;
  const comprobar = async (
    scope: Locator,
    etiquetaEmpleado = 'Empleado',
    quitarDepartamento = true,
  ) => {
    await elegir(scope, 'Departamento', 'Departamento E2E');
    const empleado = scope.getByRole('combobox', { name: etiquetaEmpleado, exact: true });
    await empleado.click();
    await expect(scope.getByRole('option').filter({ hasText: originales[0].codigo })).toBeVisible();
    await expect(scope.getByRole('option').filter({ hasText: codigo })).toHaveCount(0);
    await scope.getByRole('option').filter({ hasText: originales[0].codigo }).click();
    await empleado.blur();
    await expect(empleado).toHaveValue(new RegExp(originales[0].codigo));
    const filtrada = page.waitForResponse(
      (r) =>
        r.url().includes('/api/empleados/selector?') &&
        new URL(r.url()).searchParams.get('departamentoId') === String(ventas.id) &&
        !new URL(r.url()).searchParams.has('seleccionado') &&
        r.status() === 200,
    );
    await elegir(scope, 'Departamento', 'Cascada Comercial');
    const respuesta = (await (await filtrada).json()).data;
    expect(
      respuesta.registros.every((e: { idDepartamento: number }) => e.idDepartamento === ventas.id),
    ).toBe(true);
    await expect(empleado).toHaveValue('');
    await empleado.click();
    await expect(scope.getByRole('option').filter({ hasText: codigo })).toBeVisible();
    await expect(scope.getByRole('option').filter({ hasText: originales[0].codigo })).toHaveCount(
      0,
    );
    await scope.getByRole('option').filter({ hasText: codigo }).click();
    await elegir(scope, 'Departamento', 'Cascada Vacía');
    await expect(empleado).toHaveValue('');
    await expect(scope.getByText(/Este departamento no tiene empleados/)).toBeVisible();
    if (quitarDepartamento) {
      // Quitar departamento recupera la búsqueda global y muestra el departamento de cada persona.
      await scope.getByRole('button', { name: 'Quitar selección', exact: true }).click();
      await empleado.click();
      await empleado.fill(codigo);
      await expect(scope.getByRole('option').filter({ hasText: codigo })).toContainText(
        'Cascada Comercial',
      );
      await empleado.blur();
    }
  };
  await page.goto('/prestaciones');
  const objetivo = page.locator('[data-tour="pago-objetivo"]');
  await elegir(objetivo, 'Objetivo', 'Un empleado');
  for (const tipo of ['Bono 14', 'Aguinaldo']) {
    await elegir(objetivo, 'Tipo de pago', tipo);
    await comprobar(objetivo);
  }
  for (const [boton, tour] of [
    ['Indemnización y finiquito', 'prestaciones-finiquito'],
    ['Constancias de salario', 'prestaciones-constancia'],
  ] as const) {
    await page.getByRole('button', { name: boton, exact: true }).click();
    await comprobar(page.locator(`[data-tour="${tour}"]`));
  }
  const historial = page.locator('[data-tour="prestaciones-filtros"]');
  await historial.getByRole('button', { name: 'Filtros', exact: true }).click();
  await comprobar(historial);
  await page.goto('/nomina/simular');
  await elegir(page.locator('[data-tour="pago-objetivo"]'), 'Objetivo', 'Un empleado');
  await comprobar(page.locator('[data-tour="pago-objetivo"]'));
  await page.goto('/planilla');
  await page.getByRole('button', { name: 'Historial por mes y año', exact: true }).click();
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await comprobar(page.locator('[data-tour="nomina-filtros"]'));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'tmp/pdfs/r2-7-cascada-movil.png', fullPage: true });
  await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).click();
  await expect(page.locator('.driver-popover-title')).toHaveText(
    'Buscar empleados por departamento',
  );
  await page.getByRole('button', { name: 'Cerrar recorrido', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/catalogos/jefaturas');
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
  const jefatura = page.getByRole('dialog', { name: 'Crear · Jefaturas', exact: true });
  await comprobar(jefatura, 'Jefe responsable', false);
  await jefatura.getByLabel('Nombre', { exact: true }).fill('Jefatura de cascada');
  await jefatura.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Descartar y salir', exact: true }).click();
  expect(vacio.id).not.toBe(ventas.id);
});
