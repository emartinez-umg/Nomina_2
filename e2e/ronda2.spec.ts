import { test, expect, type Page } from '@playwright/test';

const destino = { ADMIN: '/admin', RH: '/rh', EMPLEADO: '/mis-gestiones' };
type Rol = keyof typeof destino;
async function entrar(page: Page, rol: Rol, cuenta?: string) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Iniciar Sesión' })).toBeVisible();
  await page
    .getByLabel('Usuario', { exact: true })
    .fill(
      cuenta ??
        (rol === 'ADMIN' ? 'admin.e2e' : rol === 'RH' ? 'revisor.pruebas' : 'persona.pruebas'),
    );
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill(rol === 'ADMIN' ? process.env.ADMIN_PASSWORD! : process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(destino[rol]);
  await expect(page.locator('h1')).toBeVisible();
}
async function nuevoCatalogo(page: Page) {
  await page.goto('/catalogos/departamentos');
  await expect(page.getByRole('heading', { name: 'Departamentos', exact: true })).toBeVisible();
  await expect(page.locator('[role="status"]').filter({ hasText: 'Cargando' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
}
const claves = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.includes(':catalogo-departamentos:')),
  );

test('R2-3: campos proporcionales en escritorio y sin desbordamiento en móvil', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await entrar(page, 'RH');
  await page.goto('/empleados/nuevo');
  await expect(
    page.getByRole('combobox', { name: 'Departamento de Guatemala', exact: true }),
  ).toHaveValue('Guatemala');
  await expect(page.getByText('Cargando opciones…', { exact: true })).toHaveCount(0);
  const anchos = [];
  for (const label of ['Número de casa/vivienda', 'Cuenta bancaria', 'Nombres']) {
    const input = page.getByLabel(label, { exact: true });
    await expect(input).toBeVisible();
    anchos.push(
      await input.evaluate((e) => e.closest('.control-grupo')!.getBoundingClientRect().width),
    );
  }
  expect(anchos[0]).toBeLessThan(anchos[1]!);
  expect(anchos[1]).toBeLessThan(anchos[2]!);
  expect(Math.max(...anchos)).toBeLessThan(640);
  await test.info().attach('anchos-escritorio', {
    body: JSON.stringify({ maxLength: [20, 34, 100], anchos }),
    contentType: 'application/json',
  });
  const compartenFila = await page.locator('.form-fields').evaluateAll((grupos) =>
    grupos.some((grupo) => {
      const cortos = [...grupo.querySelectorAll('.campo')]
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.width < 230);
      return cortos.some((a, i) =>
        cortos.slice(i + 1).some((b) => Math.abs(a.top - b.top) < 1 && a.left !== b.left),
      );
    }),
  );
  expect(compartenFila).toBe(true);
  const compuesto = page.locator('.campo-con-acciones').first();
  const espacioAdicional = await compuesto.evaluate(
    (e) =>
      e.getBoundingClientRect().width -
      Math.max(...[...e.children].map((h) => h.getBoundingClientRect().width)),
  );
  expect(espacioAdicional).toBeLessThan(2);
  await page.screenshot({ path: 'tmp/pdfs/r2-3-empleado-escritorio.png', fullPage: true });
  await page.setViewportSize({ width: 1024, height: 900 });
  for (const label of ['Fecha de nacimiento', 'Fecha de ingreso']) {
    await page.getByRole('button', { name: `Seleccionar ${label}`, exact: true }).click();
    const calendario = page.getByRole('dialog', { name: `Calendario: ${label}`, exact: true });
    const caja = await calendario.boundingBox();
    expect(caja!.x).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(1024);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);
    await calendario.getByRole('button', { name: 'Cerrar calendario', exact: true }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'tmp/pdfs/r2-3-empleado-movil.png', fullPage: true });
});

test.describe('R2-1: correcciones críticas con API real', () => {
  for (const rol of ['ADMIN', 'RH', 'EMPLEADO'] as const) {
    for (const vencida of [false, true]) {
      test(`login ${rol} sin avisos${vencida ? ' con cookie vencida' : ''}`, async ({
        page,
        baseURL,
      }) => {
        if (vencida)
          await page.context().addCookies([
            {
              name: 'nomina2_sesion',
              value: 'a'.repeat(64),
              domain: new URL(baseURL!).hostname,
              path: '/api',
              httpOnly: true,
              sameSite: 'Strict',
              secure: baseURL!.startsWith('https'),
            },
          ]);
        // Observa también avisos transitorios; comprobar solo el dashboard final no basta.
        await page.addInitScript(() => {
          const avisos: string[] = [];
          Object.assign(window, { avisosSesionR2: avisos });
          new MutationObserver(() => {
            document.querySelectorAll('[role="alert"], .toast').forEach((n) => {
              if (/Inicia sesión para continuar|Tu sesión expiró/.test(n.textContent ?? ''))
                avisos.push(n.textContent ?? '');
            });
          }).observe(document, { childList: true, subtree: true, characterData: true });
        });
        await entrar(page, rol);
        expect(
          await page.evaluate(
            () => (window as unknown as { avisosSesionR2: string[] }).avisosSesionR2,
          ),
        ).toEqual([]);
        await expect(page.getByText(/Inicia sesión para continuar|Tu sesión expiró/)).toHaveCount(
          0,
        );
      });
    }
  }
  test('descartar definitivamente, cancelar conservando o descartando y guardar con éxito', async ({
    page,
  }) => {
    await entrar(page, 'RH');
    await nuevoCatalogo(page);
    // Sin datos sale directamente.
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await nuevoCatalogo(page);
    await page.getByLabel('Nombre', { exact: true }).fill('Borrador que se elimina');
    await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible();
    // Otra tecla mantiene un debounce pendiente al confirmar el descarte.
    await page.getByLabel('Nombre', { exact: true }).fill('Cambio pendiente');
    await page.getByRole('button', { name: 'Descartar borrador', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Descartar borrador', exact: true })
      .getByRole('button', { name: 'Confirmar', exact: true })
      .click();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await nuevoCatalogo(page);
    await expect(page.getByText(/Tienes un borrador/)).toHaveCount(0);
    expect(await claves(page)).toEqual([]);
    await page.getByLabel('Nombre', { exact: true }).fill('Conservar al salir');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Conservar borrador y salir', exact: true }).click();
    await nuevoCatalogo(page);
    await expect(page.getByText(/Tienes un borrador/)).toBeVisible();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Conservar al salir');
    await page.getByLabel('Nombre', { exact: true }).fill('Descartar antes del debounce');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar y salir', exact: true }).click();
    await nuevoCatalogo(page);
    await expect(page.getByText(/Tienes un borrador/)).toHaveCount(0);
    await page.getByLabel('Nombre', { exact: true }).fill(`Departamento ronda dos ${Date.now()}`);
    await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await claves(page)).toEqual([]);
    await nuevoCatalogo(page);
    await expect(page.getByText(/Tienes un borrador/)).toHaveCount(0);
  });
});

test.describe('R2-1: nginx y módulos del build de producción Docker', () => {
  test.skip(process.env.E2E_PRODUCTION !== '1', 'Ejecutar con npm run test:e2e -- --production');
  test('assets ausentes son 404 de texto; index sin caché y grafo de chunks íntegro e inmutable', async ({
    request,
  }) => {
    for (const ruta of [
      '/assets/inexistente.js',
      '/assets/inexistente.mjs',
      '/assets/inexistente.css',
    ]) {
      const r = await request.get(ruta);
      expect(r.status()).toBe(404);
      expect(r.headers()['content-type']).toContain('text/plain');
      expect(await r.text()).not.toMatch(/<html|<!doctype/i);
      expect(r.headers()['cache-control']).toBe('no-store');
    }
    for (const ruta of ['/index.html', '/comunicacion/anuncios']) {
      const r = await request.get(ruta);
      expect(r.status()).toBe(200);
      expect(r.headers()['cache-control']).toBe('no-store');
    }
    const manifest = (await (await request.get('/.vite/manifest.json')).json()) as Record<
      string,
      { file: string; isDynamicEntry?: boolean }
    >;
    expect(
      Object.values(manifest).some((e) => /ComunicacionPage-/.test(e.file) && e.isDynamicEntry),
    ).toBe(true);
    for (const entrada of Object.values(manifest)) {
      const r = await request.get(`/${entrada.file}`);
      expect(r.status(), entrada.file).toBe(200);
      expect(r.headers()['content-type']).toMatch(/javascript/);
      expect(r.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
    }
  });
  test('Anuncios/Eventos y todas las rutas lazy por rol cargan sin errores de consola ni de red', async ({
    page,
  }) => {
    const rutas: Record<Rol, string[]> = {
      ADMIN: ['/admin', '/admin/usuarios', '/admin/bitacora'],
      RH: [
        '/rh',
        '/comunicacion/anuncios',
        '/comunicacion/eventos',
        '/planilla',
        '/prestaciones',
        '/solicitudes',
        '/novedades/pendientes',
        '/novedades/parqueo',
        '/configuracion/parqueo',
      ],
      EMPLEADO: [
        '/mis-gestiones',
        '/mis-gestiones/anuncios',
        '/mis-gestiones/eventos',
        '/mis-gestiones/boletas',
        '/mis-gestiones/solicitudes',
        '/mis-gestiones/parqueo',
        '/mis-gestiones/datos',
      ],
    };
    for (const rol of ['ADMIN', 'RH', 'EMPLEADO'] as const) {
      await page.context().clearCookies();
      await entrar(page, rol);
      const errores: string[] = [];
      const consola = (m: { type: () => string; text: () => string }) => {
        if (m.type() === 'error') errores.push(m.text());
      };
      const pagina = (e: Error) => errores.push(e.message);
      page.on('console', consola);
      page.on('pageerror', pagina);
      for (const ruta of rutas[rol]) {
        await page.goto(ruta);
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Algo salió mal' })).toHaveCount(0);
        await expect(page.locator('[role="status"]').filter({ hasText: 'Cargando' })).toHaveCount(
          0,
        );
      }
      page.off('console', consola);
      page.off('pageerror', pagina);
      expect(errores, rol).toEqual([]);
    }
  });
  test('chunk perdido recarga solo una vez y ofrece recuperación amigable ante fallo persistente', async ({
    page,
  }) => {
    await entrar(page, 'RH');
    let documentos = 0;
    page.on('request', (r) => {
      if (r.resourceType() === 'document') documentos++;
    });
    await page.route('**/assets/ComunicacionPage-*.js', (r) => r.abort('failed'));
    await page.getByRole('button', { name: 'Comunicación', exact: true }).click();
    await page.getByRole('link', { name: /Anuncios/ }).click();
    await expect(page.getByRole('heading', { name: 'Algo salió mal' })).toBeVisible();
    expect(documentos).toBe(1);
    await expect(page.getByRole('button', { name: 'Recargar', exact: true })).toBeVisible();
    const errorAnterior = await page
      .getByRole('heading', { name: 'Algo salió mal' })
      .elementHandle();
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await errorAnterior!.waitForElementState('hidden');
    await expect(page.getByRole('heading', { name: 'Algo salió mal' })).toBeVisible();
    expect(documentos).toBe(1);
    await page.unroute('**/assets/ComunicacionPage-*.js');
    await page.getByRole('button', { name: 'Recargar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Anuncios', exact: true })).toBeVisible();
    expect(documentos).toBe(2);
  });
});

test.describe('R2-2: estructura visual compartida', () => {
  for (const rol of ['ADMIN', 'RH', 'EMPLEADO'] as const) {
    test(`barra azul, Inicio directo, nombre y ayuda manual de ${rol}`, async ({ page }) => {
      await entrar(page, rol);
      const nombre = rol === 'EMPLEADO' ? 'Persona E2E' : 'ZZ Pruebas';
      const barra = page.locator('header.barra-superior');
      await expect(barra).toHaveCSS('background-color', 'rgb(29, 57, 94)');
      await expect(page.locator('.banda-informativa')).toContainText(`Bienvenido, ${nombre}`);
      const cuenta = page.getByRole('button', { name: new RegExp(`^Mi cuenta: ${nombre}`) });
      await cuenta.click();
      await expect(page.getByRole('region', { name: 'Mi cuenta' })).toContainText(nombre);
      await page.keyboard.press('Escape');
      const inicio = page
        .getByRole('navigation', { name: 'Secciones del sistema' })
        .getByRole('link', { name: 'Inicio', exact: true });
      await expect(inicio).not.toHaveAttribute('aria-expanded');
      await expect(inicio).toHaveAttribute('aria-current', 'page');
      await expect(page.getByText('Conoce esta página', { exact: true })).toHaveCount(0);
      await expect(page.locator('.driver-popover')).toHaveCount(0);
      await page.evaluate(() => localStorage.setItem('nomina2:ayuda:antigua:RH:v1-12', 'vista'));
      await page.reload();
      await expect(cuenta).toBeVisible();
      expect(
        await page.evaluate(() =>
          Object.keys(localStorage).filter((k) => k.startsWith('nomina2:ayuda:')),
        ),
      ).toEqual([]);
      await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).click();
      await expect(page.locator('.driver-popover-description')).toBeVisible();
      await page.getByRole('button', { name: 'Cerrar recorrido', exact: true }).click();
      await page.getByRole('button', { name: 'Buscar sección o acción', exact: true }).click();
      const dialogo = page.getByRole('dialog', { name: 'Buscar en el sistema' });
      await dialogo.getByRole('combobox').fill('inicio');
      await expect(dialogo.getByRole('option', { name: /^Inicio/ })).toHaveCount(1);
      await expect(dialogo.getByRole('option', { name: /Resumen/ })).toHaveCount(0);
      await dialogo.getByRole('option', { name: /^Inicio/ }).click();
      await expect(page).toHaveURL(destino[rol]);
      for (const ancho of [1280, 390]) {
        await page.setViewportSize({ width: ancho, height: 844 });
        if (ancho === 390)
          await page.getByRole('button', { name: 'Abrir menú de navegación', exact: true }).click();
        await expect(inicio).toBeVisible();
        const { AxeBuilder } = await import('@axe-core/playwright');
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(
          axe.violations.map((v) => ({ id: v.id, nodos: v.nodes.map((n) => n.target) })),
        ).toEqual([]);
        await inicio.click();
        if (ancho === 390)
          await expect(
            page.getByRole('button', { name: 'Abrir menú de navegación', exact: true }),
          ).toHaveAttribute('aria-expanded', 'false');
        await mkdirCaptura(page, `r2-2-barra-${rol}-${ancho}`);
      }
    });
  }
  test('borrar una/todas, marcar leída, contador e independencia de destinatarios', async ({
    page,
    browser,
    baseURL,
  }) => {
    await entrar(page, 'RH');
    const token = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
    const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guatemala' }).format(
      new Date(),
    );
    for (const titulo of ['Aviso R2 primero', 'Aviso R2 segundo']) {
      const r = await page.request.post('/api/comunicacion/anuncios', {
        headers: { 'X-CSRF-Token': token },
        data: {
          titulo,
          contenido: 'Aviso para verificar notificaciones propias.',
          inicio: hoy,
          fin: hoy,
          paraTodos: true,
          destinatarios: [],
        },
      });
      expect(r.status()).toBe(201);
    }
    const contexto = await browser.newContext({ baseURL: baseURL!, ignoreHTTPSErrors: true });
    const contextoAjeno = await browser.newContext({ baseURL: baseURL!, ignoreHTTPSErrors: true });
    try {
      const empleado = await contexto.newPage();
      await entrar(empleado, 'EMPLEADO');
      const ajeno = await contextoAjeno.newPage();
      await entrar(ajeno, 'EMPLEADO', 'ajeno.pruebas');
      const consulta = async () =>
        (await (await empleado.request.get('/api/notificaciones')).json()).data;
      const previas = await consulta();
      const n = previas.registros.find((r: { titulo: string }) => r.titulo === 'Aviso R2 primero');
      const rhToken = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
      expect(
        (
          await page.request.delete(`/api/notificaciones/${n.id}`, {
            headers: { 'X-CSRF-Token': rhToken },
            data: {},
          })
        ).status(),
      ).toBe(404);
      await empleado.getByRole('button', { name: /^Notificaciones/ }).click();
      const panel = empleado.getByRole('region', { name: 'Notificaciones', exact: true });
      const { AxeBuilder } = await import('@axe-core/playwright');
      expect(
        (
          await new AxeBuilder({ page: empleado })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations.map((v) => v.id),
      ).toEqual([]);
      await mkdirCaptura(empleado, 'r2-2-notificaciones');
      const aviso = panel.locator('article').filter({ hasText: 'Aviso R2 primero' });
      await aviso.getByRole('button', { name: 'Marcar como leída', exact: true }).click();
      await expect(
        empleado.getByRole('button', {
          name: `Notificaciones: ${previas.pendientes - 1} sin leer`,
          exact: true,
        }),
      ).toBeVisible();
      await panel
        .getByRole('button', { name: 'Borrar notificación: Aviso R2 segundo', exact: true })
        .click();
      await expect(panel.getByText('Aviso R2 segundo', { exact: true })).toHaveCount(0);
      const restantes = previas.pendientes - 2;
      await expect(
        empleado.getByRole('button', {
          name: restantes ? `Notificaciones: ${restantes} sin leer` : 'Notificaciones',
          exact: true,
        }),
      ).toBeVisible();
      await panel.getByRole('button', { name: 'Borrar todas', exact: true }).click();
      let confirmar = empleado.getByRole('dialog', {
        name: 'Borrar todas las notificaciones',
        exact: true,
      });
      expect(
        (
          await new AxeBuilder({ page: empleado })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations.map((v) => v.id),
      ).toEqual([]);
      await confirmar.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(panel.getByText('Aviso R2 primero', { exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Borrar todas', exact: true }).click();
      confirmar = empleado.getByRole('dialog', {
        name: 'Borrar todas las notificaciones',
        exact: true,
      });
      await confirmar.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(panel.getByText('Sin notificaciones', { exact: true })).toBeVisible();
      await expect(
        empleado.getByRole('button', { name: 'Notificaciones', exact: true }),
      ).toBeVisible();
      expect(await consulta()).toEqual({ pendientes: 0, registros: [] });
      const otros = (await (await ajeno.request.get('/api/notificaciones')).json()).data;
      expect(otros.registros.some((r: { titulo: string }) => r.titulo === 'Aviso R2 segundo')).toBe(
        true,
      );
      await empleado.reload();
      await empleado.getByRole('button', { name: 'Notificaciones', exact: true }).click();
      await expect(empleado.getByText('Sin notificaciones', { exact: true })).toBeVisible();
    } finally {
      await contexto.close();
      await contextoAjeno.close();
    }
  });
});
async function mkdirCaptura(page: Page, nombre: string) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir('tmp/pdfs', { recursive: true });
  await page.screenshot({ path: `tmp/pdfs/${nombre}.png`, fullPage: true });
}

test('R2-4: nombres, duplicados inactivos, reactivación y bloqueo por uso con API real', async ({
  page,
}) => {
  await entrar(page, 'RH');
  await nuevoCatalogo(page);
  let modal = page.getByRole('dialog', { name: 'Crear · Departamentos' });
  const nombre = modal.getByRole('textbox', { name: 'Nombre', exact: true });
  await nombre.pressSequentially('123@%$#');
  await expect(nombre).toHaveValue('123');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(nombre).toHaveAttribute('aria-invalid', 'true');
  await nombre.fill('  Área   común Ronda dos  ');
  const creado = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/catalogos/departamentos'),
  );
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  const alta = await creado;
  expect(alta.status()).toBe(201);
  const fila = (await alta.json()).data;
  expect(fila.nombre).toBe('Área común Ronda dos');
  await expect(modal).toHaveCount(0);
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
  const dependencia = await page.request.post('/api/catalogos/puestos', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      nombre: 'Puesto común Ronda dos',
      idDepartamento: fila.id,
      salarioMinimo: null,
      salarioMaximo: null,
      descripcion: null,
    },
  });
  expect(dependencia.status()).toBe(201);
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: 'Área común Ronda dos' });
  await expect(row.getByText('1 registro(s)', { exact: true })).toBeVisible();
  await expect(
    row.getByRole('button', { name: `Eliminar registro ${fila.id}`, exact: true }),
  ).toBeDisabled();
  await row.getByRole('button', { name: `Desactivar registro ${fila.id}`, exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Desactivar registro', exact: true });
  await expect(modal.getByText(/Advertencia: lo usan 1 registro/)).toBeVisible();
  await modal.getByRole('button', { name: 'Ayuda de esta ventana' }).click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Revisa antes de confirmar');
  await page.locator('.driver-popover-next-btn').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Revisa el registro y su uso');
  await page.getByRole('button', { name: 'Cerrar recorrido' }).click();
  await modal
    .getByRole('textbox', { name: 'Motivo', exact: true })
    .fill('Inactivar y preservar asignaciones');
  await modal.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Crear · Departamentos' });
  await modal
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill(' AREA   COMUN RONDA DOS ');
  const conflicto = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/catalogos/departamentos'),
  );
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  expect((await conflicto).status()).toBe(409);
  await expect(modal.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await modal.getByRole('button', { name: 'Reactivar registro existente' }).click();
  const activar = page.getByRole('dialog', { name: 'Activar registro', exact: true });
  await activar
    .getByRole('textbox', { name: 'Motivo', exact: true })
    .fill('Recuperar departamento existente');
  await activar.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await row.getByRole('button', { name: `Historial del registro ${fila.id}`, exact: true }).click();
  const historia = page.getByRole('dialog', { name: 'Historial · Área común Ronda dos' });
  await expect(
    historia.getByText('Recuperar departamento existente', { exact: true }),
  ).toBeVisible();
  await historia.getByRole('button', { name: 'Ayuda de esta ventana' }).click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Revisa antes de confirmar');
  await page.locator('.driver-popover-next-btn').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Cambios de este registro');
  await page.getByRole('button', { name: 'Cerrar recorrido' }).click();
  const { AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await historia.getByRole('button', { name: 'Cerrar historial' }).click();
  await page.getByRole('heading', { name: 'Departamentos', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'tmp/pdfs/r2-4-catalogos-escritorio.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'tmp/pdfs/r2-4-catalogos-movil.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
