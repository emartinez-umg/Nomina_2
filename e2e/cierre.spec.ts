import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guatemala' }).format(new Date());
const visible = (iso: string) => iso.split('-').reverse().join('/');
async function oferta(page: Page) {
  const b = page.getByRole('button', { name: 'Ahora no', exact: true });
  if (await b.isVisible()) await b.click();
}
async function entrar(page: Page, rol: 'ADMIN' | 'RH' | 'EMPLEADO') {
  await page.goto('/login');
  await oferta(page);
  await page
    .getByLabel('Usuario', { exact: true })
    .fill(rol === 'ADMIN' ? 'admin.e2e' : rol === 'RH' ? 'revisor.pruebas' : 'persona.pruebas');
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill(rol === 'ADMIN' ? process.env.ADMIN_PASSWORD! : process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(
    rol === 'ADMIN' ? /\/admin$/ : rol === 'RH' ? /\/rh$/ : /\/mis-gestiones$/,
  );
  await oferta(page);
}
async function clavesBorradores(page: Page) {
  return page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('nomina2:borrador:')),
  );
}
async function elegir(page: Page, label: string, texto?: string) {
  const campo = page.getByRole('combobox', { name: label, exact: true });
  await campo.click();
  if (texto) await campo.fill(texto);
  const opcion = texto
    ? page.getByRole('option', { name: texto, exact: true })
    : page.getByRole('option').first();
  await expect(opcion).toBeVisible();
  await opcion.click();
}
async function tour(page: Page, ventana = false) {
  if (!ventana) await oferta(page);
  const activador = page
    .getByRole('button', {
      name: ventana ? 'Ayuda de esta ventana' : 'Ayuda de esta página',
      exact: true,
    })
    .last();
  await activador.click();
  await expect(page.locator('.driver-popover-description')).toBeVisible();
  expect((await page.locator('.driver-popover-description').innerText()).length).toBeGreaterThan(
    80,
  );
  await page.getByRole('button', { name: 'Cerrar recorrido', exact: true }).click();
  await expect(activador).toBeFocused();
}
async function revisarUi(page: Page) {
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('[role="status"]').filter({ hasText: 'Cargando' })).toHaveCount(0);
  const faltas = await page
    .locator('.campo:visible')
    .evaluateAll((campos) =>
      campos
        .filter(
          (c) =>
            !!c.querySelector('input:not([type=hidden]), textarea') &&
            (!c.querySelector('.campo-hint')?.textContent?.trim() || !c.querySelector('label')),
        )
        .map((c) => c.textContent),
    );
  expect(faltas).toEqual([]);
  const ancho = await page.evaluate(() => ({
    pagina: document.documentElement.scrollWidth,
    pantalla: innerWidth,
  }));
  expect(ancho.pagina).toBeLessThanOrEqual(ancho.pantalla);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => ({ id: v.id, nodos: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  await tour(page);
}

test.describe('Cierre del proyecto con API y Oracle reales', () => {
  test.describe.configure({ mode: 'serial' });
  for (const rol of ['ADMIN', 'RH', 'EMPLEADO'] as const)
    test(`login real de ${rol} y aislamiento de navegación`, async ({ page }) => {
      await entrar(page, rol);
      await revisarUi(page);
      const cookies = await page.context().cookies();
      expect(cookies.some((c) => c.httpOnly && c.sameSite === 'Strict')).toBe(true);
      if (rol !== 'ADMIN') {
        await page.goto('/admin/usuarios');
        await expect(page).toHaveURL(rol === 'RH' ? /\/rh$/ : /\/mis-gestiones$/);
      }
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  for (const rol of ['ADMIN', 'RH', 'EMPLEADO'] as const)
    test(`navegación horizontal y Ctrl/⌘ K de ${rol} en escritorio y móvil`, async ({ page }) => {
      await entrar(page, rol);
      const menu = page.getByRole('navigation', { name: 'Secciones del sistema' });
      const inicio = menu.getByRole('button', { name: 'Inicio', exact: true });
      await inicio.focus();
      await page.keyboard.press('Enter');
      await expect(inicio).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Space');
      await expect(inicio).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('ArrowDown');
      await expect(menu.getByRole('link', { name: /^Resumen/ })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(inicio).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(
        menu.getByRole('button', {
          name: rol === 'EMPLEADO' ? 'Mis gestiones' : 'Personal',
          exact: true,
        }),
      ).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('End');
      await expect(menu.getByRole('link').last()).toBeFocused();
      await page.keyboard.press('Escape');
      // Los grupos pueden ocupar varias filas: cada panel debe permanecer dentro de la pantalla.
      for (const grupo of await menu.getByRole('button').all()) {
        await grupo.click();
        const limites = await menu.locator('.grupo-panel:visible').boundingBox();
        expect(limites).not.toBeNull();
        expect(limites!.x).toBeGreaterThanOrEqual(8);
        expect(limites!.x + limites!.width).toBeLessThanOrEqual(1280);
        await page.keyboard.press('Escape');
      }
      const buscar = page.getByRole('button', { name: 'Buscar sección o acción', exact: true });
      await buscar.focus();
      await page.keyboard.press('Control+k');
      const dialogo = page.getByRole('dialog', { name: 'Buscar en el sistema' });
      await expect(dialogo).toBeVisible();
      const entrada = dialogo.getByRole('combobox');
      await expect(entrada).toBeFocused();
      await expect(dialogo.getByRole('option', { name: /^Usuarios/ })).toHaveCount(
        rol === 'ADMIN' ? 1 : 0,
      );
      await expect(dialogo.getByRole('option', { name: /^Nuevo empleado/ })).toHaveCount(
        rol === 'EMPLEADO' ? 0 : 1,
      );
      await mkdir('tmp/pdfs', { recursive: true });
      await page.screenshot({ path: `tmp/pdfs/paleta-${rol}.png` });
      await entrada.fill('boltea');
      await expect(dialogo.getByRole('option')).toHaveCount(1);
      await expect(dialogo.getByRole('option')).toContainText(
        rol === 'EMPLEADO' ? 'Mis gestiones' : 'Nómina',
      );
      const a11y = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        a11y.violations.map((v) => ({ id: v.id, nodos: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(
        rol === 'EMPLEADO' ? /\/mis-gestiones\/boletas$/ : /\/planilla$/,
      );
      await oferta(page);
      await page.keyboard.press('Meta+k');
      await expect(dialogo.getByText('Recientes', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await page.reload();
      await buscar.click();
      await expect(dialogo.getByText('Recientes', { exact: true })).toBeVisible();
      await entrada.fill(rol === 'EMPLEADO' ? 'Actualizar mi contacto' : 'Cargar comisión');
      await dialogo.getByRole('option').click();
      await expect(page).toHaveURL(
        rol === 'EMPLEADO' ? /\/mis-gestiones\/datos$/ : /\/novedades\/comisiones\/nuevo$/,
      );
      await oferta(page);
      await mkdir('tmp/pdfs', { recursive: true });
      await page.screenshot({ path: `tmp/pdfs/navegacion-${rol}-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      const abrir = page.getByRole('button', { name: 'Abrir menú de navegación', exact: true });
      await abrir.click();
      const categoria = menu.getByRole('button', {
        name: rol === 'EMPLEADO' ? 'Anuncios y eventos' : 'Comunicación',
        exact: true,
      });
      await categoria.click();
      await expect(categoria).toHaveAttribute('aria-expanded', 'true');
      await expect(menu.getByRole('link', { name: /^Eventos/ })).toBeVisible();
      const ancho = await page.evaluate(() => ({
        pagina: document.documentElement.scrollWidth,
        pantalla: innerWidth,
      }));
      expect(ancho.pagina).toBeLessThanOrEqual(ancho.pantalla);
      const movilA11y = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(movilA11y.violations.map((v) => v.id)).toEqual([]);
      await page.screenshot({ path: `tmp/pdfs/navegacion-${rol}-movil.png`, fullPage: true });
      await menu.getByRole('link', { name: /^Eventos/ }).click();
      await expect(page).toHaveURL(
        rol === 'EMPLEADO' ? /\/mis-gestiones\/eventos$/ : /\/comunicacion\/eventos$/,
      );
      await expect(abrir).toHaveAttribute('aria-expanded', 'false');
      await buscar.click();
      await expect(entrada).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(buscar).toBeFocused();
    });
  test('alta guiada de empleado y validaciones de formato/fechas', async ({ page }) => {
    await entrar(page, 'RH');
    await page.goto('/empleados/nuevo');
    await oferta(page);
    await expect(page.getByLabel('Código', { exact: true })).toBeVisible();
    await page.getByLabel('Código', { exact: true }).fill('E2E_ALTA');
    await page.getByLabel('Nombres', { exact: true }).fill('Nueva123 Persona');
    expect(await page.getByLabel('Nombres', { exact: true }).inputValue()).toBe('Nueva Persona');
    await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
    await page.getByLabel('DPI', { exact: true }).fill('2345678901234');
    expect((await page.getByLabel('DPI', { exact: true }).inputValue()).replace(/\s/g, '')).toBe(
      '2345678901234',
    );
    await page.getByLabel('NIT', { exact: true }).fill('5489360-7');
    await page.getByLabel('Fecha de nacimiento', { exact: true }).fill('01/01/1995');
    await elegir(page, 'Sexo', 'Femenino');
    await elegir(page, 'Estado civil', 'SOLTERO');
    await page.getByLabel('Dirección', { exact: true }).fill('Dirección de pruebas E2E');
    await page.getByLabel('Teléfono', { exact: true }).fill('55552222');
    await page.getByLabel('Correo', { exact: true }).fill('alta@example.test');
    await elegir(page, 'Departamento', 'Departamento E2E');
    await elegir(page, 'Puesto', 'Analista E2E');
    await elegir(page, 'Tipo de contrato', 'Por tiempo indefinido');
    await elegir(page, 'Centro de trabajo', 'Centro E2E');
    await elegir(page, 'Horario', 'Horario E2E');
    await page.getByLabel('Fecha de ingreso', { exact: true }).fill(visible(hoy));
    await page.getByLabel('Salario base mensual', { exact: true }).fill('5000');
    await page.getByLabel('Nombre del contacto', { exact: true }).fill('Contacto Prueba');
    await page.getByLabel('Parentesco', { exact: true }).fill('Hermana');
    await page.getByLabel('Teléfono de emergencia', { exact: true }).fill('55553333');
    await page.getByRole('button', { name: 'Guardar empleado', exact: true }).click();
    await expect(page).toHaveURL(/\/empleados\/\d+$/);
    await expect(page.getByText('Nueva Persona Prueba', { exact: false }).first()).toBeVisible();
  });
  test('solicitud de vacaciones, aprobación RH y descuento propio', async ({ browser }) => {
    const empleado = await browser.newContext(),
      rh = await browser.newContext();
    const p = await empleado.newPage(),
      r = await rh.newPage();
    await entrar(p, 'EMPLEADO');
    await p.goto('/mis-gestiones/vacaciones');
    await oferta(p);
    const calendario = p.locator('.calendario');
    await expect(calendario.getByRole('button').first()).toBeVisible();
    const dias = calendario.locator('button.rdp-day_button:enabled');
    const futuro = dias.filter({ hasText: /^\d+$/ });
    await futuro.first().click();
    await futuro.nth(1).click();
    await expect(p.getByText('El saldo alcanza.', { exact: true })).toBeVisible();
    await p.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
    await tour(p, true);
    await p.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(p.getByText('Solicitud enviada a RRHH.', { exact: true })).toBeVisible();
    await entrar(r, 'RH');
    await r.goto('/vacaciones');
    await oferta(r);
    const fila = r.getByRole('row').filter({ hasText: 'Persona E2E' });
    await expect(fila).toHaveCount(1);
    await fila.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await tour(r, true);
    await r.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      r.getByText('Vacaciones aprobadas; saldo actualizado.', { exact: true }),
    ).toBeVisible();
    await p.reload();
    await expect(p.getByText('APROBADA', { exact: true }).first()).toBeVisible();
    await empleado.close();
    await rh.close();
  });
  test('cálculo, revisión, aprobación y cierre de una quincena', async ({ page }) => {
    await entrar(page, 'RH');
    await page.goto('/planilla');
    await oferta(page);
    await page.getByLabel('Fecha de la quincena', { exact: true }).fill('02/01/2026');
    await page.getByRole('button', { name: 'Crear periodo', exact: true }).click();
    await expect(page).toHaveURL(/periodo=/);
    for (const [boton, accion] of [
      ['Calcular', 'calcular'],
      ['Marcar revisada', 'revisar'],
      ['Aprobar', 'aprobar'],
      ['Cerrar', 'cerrar'],
    ] as const) {
      await page.getByRole('button', { name: boton, exact: true }).click();
      await page.getByRole('button', { name: `Confirmar ${accion}`, exact: true }).click();
      await expect(
        page.getByRole('button', { name: `Confirmar ${accion}`, exact: true }),
      ).toHaveCount(0);
    }
    await expect(page.getByRole('heading', { name: /· CERRADO$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recalcular', exact: true })).toBeDisabled();
  });
  test('constancia laboral: solicitud, vista previa, entrega y descarga propia', async ({
    browser,
  }) => {
    const empleado = await browser.newContext(),
      rh = await browser.newContext();
    const p = await empleado.newPage(),
      r = await rh.newPage();
    await entrar(p, 'EMPLEADO');
    await p.goto('/mis-gestiones/solicitudes');
    await oferta(p);
    await p
      .getByRole('heading', { name: 'Constancia laboral', exact: true })
      .locator('..')
      .getByRole('button', { name: 'Solicitar', exact: true })
      .click();
    await p.getByRole('button', { name: 'Revisar y enviar', exact: true }).click();
    await p.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      p.getByText('Solicitud enviada. RRHH recibió una notificación.', { exact: true }),
    ).toBeVisible();
    await entrar(r, 'RH');
    await r.goto('/solicitudes');
    await oferta(r);
    await r
      .getByRole('row')
      .filter({ hasText: 'Persona E2E' })
      .getByRole('button', { name: 'Ver solicitud', exact: true })
      .click();
    await r.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await r.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await r.getByRole('button', { name: 'Vista previa del PDF', exact: true }).click();
    await expect(r.locator('canvas').first()).toBeVisible();
    await r.getByRole('button', { name: 'Enviar y entregar documento', exact: true }).click();
    await r.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(r.getByText('Entregada', { exact: true }).first()).toBeVisible();
    await p.reload();
    await p.getByRole('button', { name: 'Ver solicitud', exact: true }).first().click();
    await p.getByRole('button', { name: 'Ver y descargar documento', exact: true }).click();
    await expect(p.locator('canvas').first()).toBeVisible();
    const descarga = p.waitForEvent('download');
    await p.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
    expect((await descarga).suggestedFilename()).toMatch(/\.pdf$/);
    await empleado.close();
    await rh.close();
  });
  test('administración completa de accesos y datos de empresa con API protegida', async ({
    page,
  }) => {
    await entrar(page, 'ADMIN');
    await page.goto('/admin/usuarios');
    await oferta(page);
    await page.getByRole('button', { name: 'Crear acceso', exact: true }).click();
    await tour(page, true);
    await page.getByLabel('Nombre', { exact: true }).fill('Julia');
    await page.getByLabel('Apellido', { exact: true }).fill('Accesos');
    await page
      .getByRole('dialog', { name: 'Crear acceso administrativo', exact: true })
      .getByLabel('Correo', { exact: true })
      .fill('julia@example.test');
    await page.getByLabel('Motivo', { exact: true }).fill('Alta autorizada para verificación E2E');
    await page.getByRole('button', { name: 'Revisar cambio de acceso', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Contraseñas temporales · entrega privada' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ya las guardé · cerrar', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: 'julia.accesos' })).toHaveCount(1);
    const sinCsrf = await page.request.post('/api/usuarios', { data: {} });
    expect(sinCsrf.status()).toBe(403);
    const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
    const usuarios = (await (await page.request.get('/api/usuarios')).json()).data.usuarios;
    const admin = usuarios.find((u: { usuario: string }) => u.usuario === 'admin.e2e');
    const ultimo = await page.request.patch(`/api/usuarios/${admin.idUsuario}/estado`, {
      headers: { 'X-CSRF-Token': csrf },
      data: { activo: false, motivo: 'No debe desactivar último ADMIN' },
    });
    expect(ultimo.status()).toBe(409);
    const redEmpresa = page.waitForResponse((r) => r.url().includes('/api/catalogos/empresa?'));
    await page.goto('/catalogos/empresa');
    const recibidaEmpresa = await redEmpresa;
    expect((await recibidaEmpresa.json()).data.total, new URL(recibidaEmpresa.url()).search).toBe(
      1,
    );
    await oferta(page);
    const comprobacionEmpresa = (
      await (await page.request.get('/api/catalogos/empresa?activo=1')).json()
    ).data;
    expect(comprobacionEmpresa.total).toBe(1);
    await page
      .getByRole('button', { name: /^Editar registro / })
      .first()
      .click();
    await tour(page, true);
    await page.getByLabel('Representante', { exact: true }).fill('Representante Pruebas');
    await page.getByLabel('Teléfono de empresa', { exact: true }).fill('55551234');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(
      page.getByRole('dialog').filter({ has: page.getByLabel('Representante', { exact: true }) }),
    ).toHaveCount(0);
    const empresa = (await (await page.request.get('/api/catalogos/empresa')).json()).data
      .registros[0];
    expect(empresa.telefono).toBe('55551234');
    expect(empresa.representante).toBe('Representante Pruebas');
  });
  test('RBAC, recursos propios y tiempos de consultas reales', async ({ page, browser }) => {
    const anon = await browser.newContext();
    for (const ruta of [
      '/usuarios',
      '/auditoria',
      '/empleados',
      '/catalogos',
      '/novedades/descuentos',
      '/nomina/periodos',
      '/prestaciones',
      '/solicitudes',
      '/vacaciones/solicitudes',
      '/notificaciones',
      '/comunicacion/anuncios',
      '/tableros/admin',
    ])
      expect((await anon.request.get(`http://127.0.0.1:5178/api${ruta}`)).status()).toBe(401);
    await anon.close();
    await entrar(page, 'EMPLEADO');
    for (const ruta of [
      '/usuarios',
      '/auditoria',
      '/empleados',
      '/catalogos',
      '/novedades/descuentos',
      '/nomina/periodos',
      '/prestaciones',
      '/solicitudes/plantillas',
      '/vacaciones/empleados/2/saldo',
      '/tableros/admin',
    ])
      expect((await page.request.get(`/api${ruta}`)).status()).toBe(403);
    const propias = (await (await page.request.get('/api/solicitudes')).json()).data.registros;
    const documento = propias.find((s: { tipo: string }) => s.tipo === 'CONSTANCIA_LABORAL').id;
    expect((await page.request.get(`/api/solicitudes/${documento}/documento`)).status()).toBe(200);
    const ajeno = await browser.newContext();
    const r = await ajeno.request.get('http://127.0.0.1:5178/api/auth/csrf');
    const login = await ajeno.request.post('http://127.0.0.1:5178/api/auth/login', {
      headers: { 'X-CSRF-Token': (await r.json()).data.csrfToken },
      data: { usuario: 'ajeno.pruebas', contrasena: process.env.E2E_PASSWORD },
    });
    expect(login.status()).toBe(200);
    expect(
      (
        await ajeno.request.get(`http://127.0.0.1:5178/api/solicitudes/${documento}/documento`)
      ).status(),
    ).toBe(403);
    await ajeno.close();
    await page.context().clearCookies();
    await entrar(page, 'ADMIN');
    const tiempos = [];
    for (const ruta of [
      '/usuarios?rol=RH&activo=1',
      '/empleados?limite=10',
      '/solicitudes?estado=ENTREGADA',
      '/comunicacion/eventos',
      '/tableros/admin',
      '/auditoria?limite=10',
    ]) {
      const muestras = [];
      for (let i = 0; i < 3; i++) {
        const inicio = performance.now();
        const res = await page.request.get(`/api${ruta}`);
        expect(res.status()).toBe(200);
        await res.body();
        muestras.push(Math.round(performance.now() - inicio));
      }
      tiempos.push({ ruta, minimoMs: Math.min(...muestras), maximoMs: Math.max(...muestras) });
      expect(Math.max(...muestras)).toBeLessThan(5000);
    }
    await mkdir('tmp', { recursive: true });
    await writeFile('tmp/rendimiento.json', JSON.stringify(tiempos, null, 2));
  });
  test('todas las páginas por rol, ayuda, hints, teclado, accesibilidad y móvil', async ({
    page,
  }) => {
    test.setTimeout(480000);
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await entrar(page, 'ADMIN');
    const token = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
    const opcion = async (ref: string) =>
      Number(
        (await (await page.request.get(`/api/novedades/opciones/${ref}`)).json()).data[0].value,
      );
    const muestras: Record<string, Record<string, unknown>> = {
      descuentos: {
        idTipo: await opcion('descuentos'),
        modalidad: 'FIJO',
        monto: '10.00',
        cuotas: null,
        fechaInicio: hoy,
        fechaFin: null,
      },
      prestamos: {
        idTipo: await opcion('prestamos'),
        monto: '100.00',
        cuotas: 2,
        fechaInicio: hoy,
        fechaDesembolso: hoy,
        referencia: 'AUDITORIA_PRESTAMO',
      },
      comisiones: { fecha: '2026-02-03', monto: '100.00', referencia: 'AUDITORIA_COMISION' },
      'horas-extra': { fecha: '2026-02-03', horas: '1.00', jornada: 'DIURNA', estado: 'PENDIENTE' },
      ausencias: {
        idTipo: await opcion('ausencias'),
        fechaInicio: '2026-02-04',
        fechaFin: '2026-02-04',
        estado: 'PENDIENTE',
      },
    };
    const detalles: string[] = [];
    for (const [tipo, datos] of Object.entries(muestras)) {
      const res = await page.request.post(`/api/novedades/${tipo}`, {
        headers: { 'X-CSRF-Token': token },
        data: {
          idEmpleado: 1,
          motivo: 'Registro aislado para auditoría de pantallas',
          confirmado: true,
          ...datos,
        },
      });
      expect(res.status()).toBe(201);
      const id = (await res.json()).data.id;
      detalles.push(`/novedades/${tipo}/${id}`, `/novedades/${tipo}/${id}/editar`);
    }
    for (const rol of ['ADMIN', 'RH', 'EMPLEADO'] as const) {
      await page.context().clearCookies();
      await entrar(page, rol);
      const rutas =
        rol === 'EMPLEADO'
          ? [
              '/mis-gestiones',
              '/mis-gestiones/boletas',
              '/mis-gestiones/vacaciones',
              '/mis-gestiones/solicitudes',
              '/mis-gestiones/datos',
              '/mis-gestiones/anuncios',
              '/mis-gestiones/eventos',
            ]
          : [
              rol === 'ADMIN' ? '/admin' : '/rh',
              '/catalogos',
              '/empleados',
              '/empleados/nuevo',
              '/empleados/1',
              '/empleados/1/editar',
              '/empleados/carga-masiva',
              '/novedades',
              '/planilla',
              '/prestaciones',
              '/vacaciones',
              '/solicitudes',
              '/comunicacion/anuncios',
              '/comunicacion/eventos',
              ...(rol === 'ADMIN' ? ['/admin/usuarios', '/admin/bitacora'] : []),
            ];
      if (rol !== 'EMPLEADO') {
        const cs = await page.request.get('/api/catalogos');
        const cats = (await cs.json()).data as { slug: string }[];
        rutas.push(...cats.map((c) => `/catalogos/${c.slug}`), ...detalles);
        for (const tipo of ['descuentos', 'prestamos', 'comisiones', 'horas-extra', 'ausencias'])
          rutas.push(`/novedades/${tipo}`, `/novedades/${tipo}/nuevo`);
      }
      for (const ruta of rutas) {
        await page.goto(ruta);
        await revisarUi(page);
        if (ruta === '/mis-gestiones/solicitudes')
          await expect(page.getByLabel('Buscar empleado', { exact: true })).toHaveCount(0);
        if (ruta.startsWith('/catalogos/')) {
          await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
          await tour(page, true);
          const a11y = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
          expect(a11y.violations.map((v) => v.id)).toEqual([]);
          await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).last().click();
        }
      }
      if (rol === 'EMPLEADO') {
        await page.setViewportSize({ width: 390, height: 844 });
        for (const ruta of rutas) {
          await page.goto(ruta);
          await revisarUi(page);
          // Una captura completa debe comenzar arriba para ubicar correctamente elementos sticky.
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: `tmp/pdfs/${ruta.split('/').pop()}-movil.png`,
            fullPage: true,
          });
        }
        await page.getByRole('button', { name: 'Abrir menú de navegación', exact: true }).click();
        await expect(page.getByRole('navigation', { name: 'Secciones del sistema' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('button', { name: 'Abrir menú de navegación', exact: true }),
        ).toHaveAttribute('aria-expanded', 'false');
        await page.goto('/mis-gestiones');
        await revisarUi(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: 'tmp/pdfs/portal-movil.png', fullPage: true });
        await page.setViewportSize({ width: 1280, height: 900 });
      }
    }
    expect(errores).toEqual([]);
  });
});

test.describe('FASE V1-2: borradores con API y Oracle reales', () => {
  test('cierra la pestaña y retoma empleado; descartar y cerrar sesión limpian', async ({
    page,
    context,
  }) => {
    await entrar(page, 'RH');
    await page.goto('/empleados/nuevo');
    await oferta(page);
    await page.getByLabel('Nombres', { exact: true }).fill('Borrador Persona');
    await page.getByLabel('Nombre del contacto', { exact: true }).fill('Contacto Borrador');
    await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible();
    await page.close();
    const volver = await context.newPage();
    await volver.goto('/empleados/nuevo');
    await expect(volver.getByText(/Tienes un borrador guardado hace/)).toBeVisible();
    await expect(volver.getByLabel('Nombres', { exact: true })).toHaveValue('');
    await volver.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(volver.getByLabel('Nombres', { exact: true })).toHaveValue('Borrador Persona');
    await expect(volver.getByLabel('Nombre del contacto', { exact: true })).toHaveValue(
      'Contacto Borrador',
    );
    const axe = await new AxeBuilder({ page: volver })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    await volver.evaluate(() => window.scrollTo(0, 0));
    await volver.screenshot({ path: 'tmp/pdfs/borrador-empleado.png', fullPage: true });
    await volver.getByRole('button', { name: 'Descartar borrador', exact: true }).click();
    let dialogo = volver.getByRole('dialog', { name: 'Descartar borrador', exact: true });
    await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(await clavesBorradores(volver)).toHaveLength(1);
    await volver.getByRole('button', { name: 'Descartar borrador', exact: true }).click();
    dialogo = volver.getByRole('dialog', { name: 'Descartar borrador', exact: true });
    await dialogo.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(volver.getByLabel('Nombres', { exact: true })).toHaveValue('');
    expect(await clavesBorradores(volver)).toHaveLength(0);
    await volver.getByLabel('Nombres', { exact: true }).fill('Borrador Final');
    await expect(volver.getByText('Borrador guardado', { exact: true })).toBeVisible();
    await volver.getByRole('button', { name: /^Mi cuenta:/ }).click();
    await volver.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(volver).toHaveURL(/\/login$/);
    expect(await clavesBorradores(volver)).toHaveLength(0);
    await entrar(volver, 'RH');
    await volver.goto('/empleados/nuevo');
    await expect(volver.getByLabel('Nombres', { exact: true })).toHaveValue('');
    await expect(volver.getByText(/Tienes un borrador guardado hace/)).toHaveCount(0);
  });
  test('catálogo restaura, conserva ante conflicto y limpia al guardar y editar', async ({
    page,
  }) => {
    await entrar(page, 'RH');
    await page.goto('/catalogos/departamentos');
    await oferta(page);
    await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
    await page.getByLabel('Código', { exact: true }).fill('E2E');
    await page.getByLabel('Nombre', { exact: true }).fill('Departamento Borrador');
    await page.reload();
    await page.getByRole('button', { name: 'Crear registro', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Departamento Borrador');
    const conflicto = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/catalogos/departamentos'),
    );
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    expect((await conflicto).status()).toBe(409);
    expect(await clavesBorradores(page)).toHaveLength(1);
    await page.getByLabel('Código', { exact: true }).fill('E2E_BORRADOR');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Registro guardado y auditado.', { exact: true })).toBeVisible();
    expect(await clavesBorradores(page)).toHaveLength(0);
    const fila = page.getByRole('row').filter({ hasText: 'Departamento Borrador' });
    await fila.getByRole('button', { name: /^Editar registro/ }).click();
    await page.getByLabel('Descripción', { exact: true }).fill('Descripción retomada');
    await page.reload();
    await fila.getByRole('button', { name: /^Editar registro/ }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByLabel('Descripción', { exact: true })).toHaveValue(
      'Descripción retomada',
    );
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Registro guardado y auditado.', { exact: true })).toBeVisible();
    expect(await clavesBorradores(page)).toHaveLength(0);
  });
  test('IGSS retoma sección y fila parcial; entrar con otra cuenta purga borradores', async ({
    page,
    context,
  }) => {
    await entrar(page, 'RH');
    await page.goto('/planilla');
    await oferta(page);
    await page.getByRole('button', { name: 'Configurar IGSS', exact: true }).click();
    await page.getByLabel('Número patronal', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Asignación de empleados', exact: true }).click();
    await page.getByLabel('Primer nombre', { exact: true }).fill('Nombre pendiente');
    await page.reload();
    await page.getByRole('button', { name: 'Configurar IGSS', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByLabel('Número patronal', { exact: true })).toHaveValue('123456');
    await expect(page.getByLabel('Primer nombre', { exact: true })).toHaveValue('Nombre pendiente');
    expect(await clavesBorradores(page)).toHaveLength(1);
    // Quitar la cookie representa sesión perdida; no es el cierre explícito que elimina borradores.
    await context.clearCookies();
    await entrar(page, 'EMPLEADO');
    expect(await clavesBorradores(page)).toHaveLength(0);
  });
});
