import { test, expect, type Page } from '@playwright/test';
const tipos = [
  'descuentos',
  'prestamos',
  'comisiones',
  'horas-extra',
  'ausencias',
  'consumo-tienda',
] as const;

async function entrar(page: Page, empleado = false) {
  await page.goto('/login');
  await page
    .getByLabel('Usuario', { exact: true })
    .fill(empleado ? 'persona.pruebas' : 'revisor.pruebas');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(empleado ? '/mis-gestiones' : '/rh');
}

async function comprobarLayout(page: Page, ancho: number) {
  await page.setViewportSize({ width: ancho, height: 1000 });
  const tarjeta = page.locator('main .tarjeta').first();
  await expect(tarjeta).toBeVisible();
  const medidas = await tarjeta.evaluate((elemento) => {
    const caja = elemento.getBoundingClientRect();
    const main = document.querySelector('main')!.getBoundingClientRect();
    const pagina = document.querySelector('.form-page');
    const contenido = pagina?.getBoundingClientRect();
    const estilos = pagina ? getComputedStyle(pagina) : null;
    const limiteIzquierdo = contenido
      ? contenido.left + parseFloat(estilos!.paddingLeft)
      : caja.left;
    const limiteDerecho = contenido
      ? contenido.right - parseFloat(estilos!.paddingRight)
      : caja.right;
    const alineados = [
      document.querySelector('main h1'),
      document.querySelector('[data-tour="novedades-tipos"]'),
      document.querySelector('[data-tour="borrador-formulario"]'),
      document.querySelector('[data-tour="codigo-automatico"] [data-campo]'),
    ].filter((n): n is Element => !!n && !n.closest('.tarjeta'));
    const fuera = [...document.querySelectorAll('main input, main textarea, main button')]
      .filter((n) => !n.closest('dialog') && n.getClientRects().length > 0)
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return r.left < main.left - 1 || r.right > main.right + 1;
      })
      .map((n) => n.getAttribute('aria-label') ?? n.textContent);
    const codigo = document.querySelector<HTMLInputElement>('main input[name="codigo"]');
    let codigoCabe = true;
    if (codigo?.value) {
      const estilo = getComputedStyle(codigo);
      const canvas = document.createElement('canvas').getContext('2d')!;
      canvas.font = `${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
      codigoCabe =
        canvas.measureText(codigo.value).width <=
        codigo.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
    }
    return {
      diferenciaMargenes: Math.abs(caja.left - main.left - (main.right - caja.right)),
      anchoTarjeta: caja.width,
      alineacion: alineados.map((n) => {
        const r = n.getBoundingClientRect();
        return {
          izquierda: Math.abs(r.left - limiteIzquierdo),
          derecha: r.right <= limiteDerecho + 1,
        };
      }),
      scroll: document.documentElement.scrollWidth,
      barra: document.querySelector('.barra-superior')!.getBoundingClientRect().width,
      fuera,
      codigoCabe,
    };
  });
  expect(medidas.diferenciaMargenes, `márgenes a ${ancho}px`).toBeLessThanOrEqual(2);
  expect(medidas.anchoTarjeta).toBeLessThanOrEqual(1280);
  expect(medidas.scroll).toBe(ancho);
  expect(medidas.barra).toBe(ancho);
  expect(medidas.fuera).toEqual([]);
  expect(medidas.codigoCabe, 'el código se muestra completo').toBe(true);
  for (const alineacion of medidas.alineacion) {
    expect(alineacion.izquierda).toBeLessThanOrEqual(1);
    expect(alineacion.derecha).toBe(true);
  }
}

test('formularios: bloque centrado, código completo y sin desbordamiento en cinco anchos', async ({
  page,
}) => {
  await entrar(page);
  for (const ruta of [
    '/novedades/prestamos/nuevo',
    ...tipos.filter((t) => t !== 'prestamos').map((t) => `/novedades/${t}/nuevo`),
    '/empleados/nuevo',
    '/empleados/1/editar',
    '/empleados/carga-masiva',
    '/catalogos/empresa',
    '/configuracion/parqueo',
    '/nomina/simular',
  ]) {
    await test.step(ruta, async () => {
      await page.goto(ruta);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('main .tarjeta').first()).toBeVisible();
      if (ruta.includes('/prestamos/') || ruta.includes('/descuentos/'))
        await expect(page.getByLabel('Código', { exact: true })).toHaveValue(
          /^[A-Z]+_\d{4}_\d{4}$/,
        );
      for (const ancho of [1920, 2560, 1366, 768, 390]) {
        await comprobarLayout(page, ancho);
        if (ruta === '/novedades/prestamos/nuevo' && ancho === 1920)
          await page.screenshot({
            path: 'tmp/pdfs/formulario-centrado-escritorio.png',
            fullPage: true,
          });
      }
      if (ruta === '/novedades/prestamos/nuevo')
        await page.screenshot({ path: 'tmp/pdfs/formulario-centrado-movil.png', fullPage: true });
    });
  }
});

test('formularios: Mis datos comparte el contenedor y los borradores y validación se conservan', async ({
  page,
}) => {
  await entrar(page, true);
  await page.goto('/mis-gestiones/datos');
  for (const ancho of [1920, 2560, 1366, 768, 390]) await comprobarLayout(page, ancho);
  await page.getByLabel('Teléfono', { exact: true }).fill('55554321');
  await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Tienes un borrador guardado/)).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveValue('5555 4321');
  const contacto = page.locator('[data-tour="mis-datos-contacto"]');
  await contacto.getByLabel('Correo electrónico', { exact: true }).fill('correo-invalido');
  await contacto.getByLabel('Correo electrónico', { exact: true }).blur();
  await expect(contacto.locator('[data-campo="Correo electrónico"] [role="alert"]')).toBeVisible();
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveValue('5555 4321');
});

test('formularios: las seis ediciones de novedades usan el mismo bloque centrado', async ({
  page,
}) => {
  await entrar(page);
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
  const hoy = (await (await page.request.get('/api/novedades/reglas')).json()).data.hoy as string;
  const opciones = async (tipo: string) => {
    const respuesta = await page.request.get(`/api/novedades/opciones/${tipo}`);
    expect(respuesta.ok()).toBe(true);
    return ((await respuesta.json()).data as { value: string }[])[0]!.value;
  };
  for (const tipo of tipos) {
    const base = { idEmpleado: 1, motivo: 'Verificación visual de edición', confirmado: true };
    const valores =
      tipo === 'descuentos'
        ? {
            idTipo: Number(await opciones(tipo)),
            modalidad: 'CUOTAS',
            monto: '100.00',
            cuotas: 2,
            fechaInicio: hoy,
            fechaFin: null,
          }
        : tipo === 'prestamos'
          ? {
              idTipo: Number(await opciones(tipo)),
              monto: '100.00',
              cuotas: 2,
              fechaInicio: hoy,
              fechaDesembolso: hoy,
              referencia: 'Prestamo layout',
            }
          : tipo === 'ausencias'
            ? {
                idTipo: Number(await opciones(tipo)),
                fechaInicio: hoy,
                fechaFin: hoy,
                estado: 'PENDIENTE',
              }
            : tipo === 'horas-extra'
              ? { mes: hoy.slice(0, 7), horas: '2.5' }
              : { mes: hoy.slice(0, 7), monto: '100.00', referencia: `Layout ${tipo}` };
    const respuesta = await page.request.post(`/api/novedades/${tipo}`, {
      headers: { 'X-CSRF-Token': csrf },
      data: { ...base, ...valores },
    });
    expect(respuesta.status(), await respuesta.text()).toBe(201);
    const id = (await respuesta.json()).data.id as number;
    await page.goto(`/novedades/${tipo}/${id}/editar`);
    await expect(page.locator('main h1')).toContainText('Editar');
    for (const ancho of [1920, 2560, 1366, 768, 390]) await comprobarLayout(page, ancho);
    await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).click();
    await expect(page.locator('.driver-popover-title')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar recorrido', exact: true }).click();
  }
});

test('formularios: validar, guardar una comisión y limpiar su borrador conserva el flujo real', async ({
  page,
}) => {
  await entrar(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/novedades/comisiones/nuevo');
  await page.getByRole('button', { name: 'Revisar y guardar', exact: true }).click();
  await expect(
    page.getByText('Completa este campo antes de continuar.', { exact: true }).first(),
  ).toBeVisible();
  const empleado = page.getByRole('combobox', { name: 'Empleado', exact: true });
  await empleado.click();
  await empleado.fill('Persona');
  await page.getByRole('option').filter({ hasText: 'Persona' }).first().click();
  await page.getByLabel('Comisión', { exact: true }).fill('123.45');
  await page.getByLabel('Referencia', { exact: true }).fill('Comision layout guardado');
  await page
    .getByLabel('Motivo o descripción', { exact: true })
    .fill('Comisión de prueba de guardado');
  await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar y guardar', exact: true }).click();
  const respuesta = page.waitForResponse(
    (r) => r.url().endsWith('/api/novedades/comisiones') && r.request().method() === 'POST',
  );
  await page
    .getByRole('dialog', { name: 'Confirmar novedad', exact: true })
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click();
  const guardado = await respuesta;
  expect(guardado.status(), await guardado.text()).toBe(201);
  const id = (await guardado.json()).data.id as number;
  await expect(page).toHaveURL(`/novedades/comisiones/${id}`);
  await page.goto('/novedades/comisiones/nuevo');
  await expect(page.getByText('Autoguardado de borrador activado', { exact: true })).toBeVisible();
  await expect(page.getByText(/Tienes un borrador guardado/)).toHaveCount(0);
});
