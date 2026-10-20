import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { catalogos } from '../backend/src/modules/catalogos/catalogos.definiciones.js';
import { datosCatalogoQa, nombresInvalidosQa } from '../backend/src/shared/catalogos/qa.fixture.js';

const editables = catalogos.filter((c) => c.slug !== 'empresa');
async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill('revisor.pruebas');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/rh');
}
async function abrirAlta(page: Page, slug: string, titulo: string) {
  await page.goto(`/catalogos/${slug}`);
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
  return page.getByRole('dialog', { name: `Crear · ${titulo}`, exact: true });
}
async function descartarSalir(page: Page, modal: Locator) {
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const salir = page.getByRole('dialog', { name: 'Salir del formulario', exact: true });
  if (await salir.isVisible())
    await salir.getByRole('button', { name: 'Descartar y salir', exact: true }).click();
  await expect(modal).toHaveCount(0);
}
async function rechazoNombre(modal: Locator, nombre: string) {
  const campo = modal.getByRole('textbox', { name: 'Nombre', exact: true });
  await campo.fill(nombre);
  await campo.blur();
  await modal.getByRole('button', { name: /^(Guardar|Revisar cambio)$/ }).click();
  await expect(campo).toHaveAttribute('aria-invalid', 'true');
  await expect(modal.getByRole('dialog', { name: /ADVERTENCIA/ })).toHaveCount(0);
}

for (const cat of editables) {
  test(`R2-5 QA: ${cat.slug}, acciones, nombres negativos y descarte`, async ({ page }) => {
    await entrar(page);
    const api = (await (await page.request.get('/api/catalogos')).json()).data as {
      slug: string;
    }[];
    expect(api.map((c) => c.slug).sort()).toEqual(catalogos.map((c) => c.slug).sort());
    const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
    const headers = { 'X-CSRF-Token': csrf };
    const deps = (await (await page.request.get('/api/catalogos/departamentos')).json()).data
      .registros;
    // Resuelve IDs reales; no confunde códigos INE con claves primarias.
    const departamentosGt = (
      await (await page.request.get('/api/ubicaciones/departamentos')).json()
    ).data;
    const depGt = departamentosGt.find((d: { codigo: string }) => d.codigo === '01');
    const municipios = (
      await (
        await page.request.get(`/api/ubicaciones/municipios?idDepartamentoGt=${depGt.id}`)
      ).json()
    ).data;
    const municipio = municipios.find((m: { codigo: string }) => m.codigo === '0101');
    const body = datosCatalogoQa(cat, '  Gerente  ', {
      departamento: deps[0].id,
      departamentoGt: depGt.id,
      municipioGt: municipio.id,
    });
    const alta =
      cat.slug === 'tramos-isr'
        ? await page.request.get(`/api/catalogos/${cat.slug}`)
        : await page.request.post(`/api/catalogos/${cat.slug}`, { headers, data: body });
    expect(alta.status(), await alta.text()).toBe(cat.slug === 'tramos-isr' ? 200 : 201);
    const resultadoAlta = (await alta.json()).data;
    const fila = cat.slug === 'tramos-isr' ? resultadoAlta.registros[0] : resultadoAlta;
    if ('nombre' in body) expect(fila.nombre).toBe('Gerente');
    await page.goto(`/catalogos/${cat.slug}`);
    if ('nombre' in body) {
      await page.getByRole('textbox', { name: 'Buscar', exact: true }).fill('Gerente');
      if (cat.slug === 'feriados') {
        await page.getByRole('button', { name: 'Filtros', exact: true }).click();
        await page.getByRole('textbox', { name: 'Año del calendario', exact: true }).fill('2099');
      }
      await page.getByRole('button', { name: 'Aplicar búsqueda y filtros', exact: true }).click();
    }
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: `Ver registro ${fila.id}`, exact: true }) });
    for (const accion of ['Ver', 'Editar', 'Inactivar', 'Historial del', 'Eliminar']) {
      const boton = row.getByRole('button', { name: `${accion} registro ${fila.id}`, exact: true });
      await expect(boton).toBeEnabled();
      await expect(boton.locator('svg')).toHaveCount(1);
    }
    await row.getByRole('button', { name: `Editar registro ${fila.id}`, exact: true }).click();
    let modal = page.getByRole('dialog', { name: `Editar · ${cat.titulo}`, exact: true });
    const escrituras: string[] = [];
    page.on('request', (r) => {
      if (['POST', 'PATCH'].includes(r.method()) && r.url().includes(`/api/catalogos/${cat.slug}`))
        escrituras.push(r.url());
    });
    if ('nombre' in body)
      for (const nombre of nombresInvalidosQa) await rechazoNombre(modal, nombre);
    expect(escrituras).toEqual([]);
    await descartarSalir(page, modal);
    if ('nombre' in body) {
      const cambio = await page.request.patch(`/api/catalogos/${cat.slug}/${fila.id}`, {
        headers,
        data: { ...body, nombre: 'Ingeniería' },
      });
      expect(cambio.status(), await cambio.text()).toBe(200);
      for (const nombre of ['Ingeniería', 'ingenieria', ' INGENIERÍA ']) {
        const duplicado = await page.request.post(`/api/catalogos/${cat.slug}`, {
          headers,
          data: { ...body, nombre },
        });
        expect(duplicado.status()).toBe(409);
        expect((await duplicado.json()).error).toMatchObject({
          codigo: 'DUPLICADO',
          campos: { nombre: expect.any(Array) },
        });
      }
    }
    modal = await abrirAlta(page, cat.slug, cat.titulo);
    if ('nombre' in body)
      for (const nombre of nombresInvalidosQa) await rechazoNombre(modal, nombre);
    const campoParcial =
      'nombre' in body
        ? modal.getByRole('textbox', { name: 'Nombre', exact: true })
        : modal.getByRole('textbox', { name: 'Límite inferior', exact: true });
    await campoParcial.fill('nombre' in body ? 'Borrador parcial' : '123');
    // Descarta antes de los 500 ms del debounce y comprueba después de recargar.
    await descartarSalir(page, modal);
    await page.reload();
    await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
    modal = page.getByRole('dialog', { name: `Crear · ${cat.titulo}`, exact: true });
    await expect(modal.getByRole('button', { name: 'Continuar', exact: true })).toHaveCount(0);
    await expect(
      'nombre' in body
        ? modal.getByRole('textbox', { name: 'Nombre', exact: true })
        : modal.getByRole('textbox', { name: 'Límite inferior', exact: true }),
    ).toHaveValue('');
    await expect
      .poll(() =>
        page.evaluate(
          (slug) => Object.keys(localStorage).filter((k) => k.includes(`:catalogo-${slug}:`)),
          cat.slug,
        ),
      )
      .toEqual([]);
  });
}

test('R2-5 QA: postal e ISO, ancho 30/50/100, ayuda y uso por empleado', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill('admin.e2e');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/admin');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const anchos: number[] = [];
  for (const [slug, titulo, maximo] of [
    ['zonas', 'Zonas', '30'],
    ['motivos-baja', 'Motivos de baja', '50'],
    ['paises', 'Países', '100'],
  ]) {
    const modal = await abrirAlta(page, slug!, titulo!);
    const nombre = modal.getByRole('textbox', { name: 'Nombre', exact: true });
    await expect(nombre).toHaveAttribute('maxlength', maximo!);
    anchos.push(
      await nombre.evaluate((e) => e.closest('.control-grupo')!.getBoundingClientRect().width),
    );
    if (slug !== 'motivos-baja') {
      const postal = slug === 'zonas';
      const campo = modal.getByRole('textbox', {
        name: postal ? 'Código postal' : 'Código ISO',
        exact: true,
      });
      await expect(campo).toHaveAttribute('inputmode', postal ? 'numeric' : 'text');
      await campo.pressSequentially(postal ? 'nohio' : '***');
      await expect(campo).toHaveValue('');
      await campo.pressSequentially(postal ? '01a001' : 'g*t');
      await expect(campo).toHaveValue(postal ? '01001' : 'GT');
      await campo.fill(postal ? '0100' : 'g');
      await campo.blur();
      await expect(campo).toHaveAttribute('aria-invalid', 'true');
      await expect(
        modal.locator('.campo-error').filter({
          hasText: postal ? /debe tener exactamente 5 dígitos/ : /debe tener exactamente 2 letras/,
        }),
      ).toBeVisible();
      const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
      const invalido = await page.request.post(`/api/catalogos/${slug}`, {
        headers: { 'X-CSRF-Token': csrf },
        data: {
          nombre: 'Formato inválido QA',
          descripcion: null,
          [postal ? 'codigoPostal' : 'codigoIso']: postal ? 'nohio' : '***',
        },
      });
      expect(invalido.status()).toBe(400);
      await modal.getByRole('button', { name: 'Ayuda de esta ventana' }).click();
      await expect(page.locator('.driver-popover')).toBeVisible();
      for (let paso = 0; paso < 20; paso++) {
        if (
          (await page.locator('.driver-popover-title').innerText()) ===
          (postal ? 'Código postal' : 'Código ISO')
        )
          break;
        await page.locator('.driver-popover-next-btn').click();
      }
      await expect(page.locator('.driver-popover-description')).toContainText(
        postal ? 'conservar ceros iniciales' : 'Solo admite letras A–Z',
      );
      await page.getByRole('button', { name: 'Cerrar recorrido' }).click();
    }
    const { AxeBuilder } = await import('@axe-core/playwright');
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await mkdir('tmp/pdfs', { recursive: true });
    await page.screenshot({ path: `tmp/pdfs/r2-5-${slug}-escritorio.png`, fullPage: true });
    if (slug === 'paises') {
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: 'tmp/pdfs/r2-5-paises-movil.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await descartarSalir(page, modal);
  }
  expect(anchos[0]).toBeLessThan(anchos[1]!);
  expect(anchos[1]).toBeLessThan(anchos[2]!);
  await test
    .info()
    .attach('anchos-30-50-100', { body: JSON.stringify(anchos), contentType: 'application/json' });
  const empleado = (await (await page.request.get('/api/empleados/1')).json()).data;
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
  for (const [slug, id] of [
    ['departamentos', empleado.idDepartamento],
    ['puestos', empleado.idPuesto],
    ['tipos-contrato', empleado.idTipoContrato],
    ['centros-trabajo', empleado.idCentroTrabajo],
  ]) {
    for (const fisica of [false, true]) {
      const r = await page.request.delete(`/api/catalogos/${slug}/${id}`, {
        headers: { 'X-CSRF-Token': csrf },
        data: { motivo: 'No debe eliminarse en uso', confirmado: true, fisica },
      });
      expect(r.status()).toBe(409);
      expect((await r.json()).error).toMatchObject({
        codigo: 'REGISTRO_EN_USO',
        mensaje: expect.stringMatching(/No se puede eliminar:.*Puedes inactivarlo/),
      });
    }
    await page.goto(`/catalogos/${slug}`);
    await expect(
      page.getByRole('button', { name: `Eliminar registro ${id}`, exact: true }),
    ).toBeDisabled();
  }
});
