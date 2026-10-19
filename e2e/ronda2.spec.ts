import { test, expect, type Page } from '@playwright/test';

const destino = { ADMIN: '/admin', RH: '/rh', EMPLEADO: '/mis-gestiones' };
type Rol = keyof typeof destino;
async function entrar(page: Page, rol: Rol) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Iniciar Sesión' })).toBeVisible();
  await page
    .getByLabel('Usuario', { exact: true })
    .fill(rol === 'ADMIN' ? 'admin.e2e' : rol === 'RH' ? 'revisor.pruebas' : 'persona.pruebas');
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
