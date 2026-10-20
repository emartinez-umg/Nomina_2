import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { prepararDashboard } from './dashboard.fixture.js';

function contraste(a: string, b: string) {
  const luminancia = (color: string) => {
    const canales = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((n) => {
        const v = n / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return canales[0]! * 0.2126 + canales[1]! * 0.7152 + canales[2]! * 0.0722;
  };
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

let fixture: Awaited<ReturnType<typeof prepararDashboard>>;
test.beforeAll(async () => {
  fixture = await prepararDashboard();
});
test.afterAll(async () => {
  await fixture?.limpiar();
});
async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill('revisor.pruebas');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/rh');
  await expect(page.getByRole('heading', { name: 'Hola, ZZ Pruebas' })).toBeVisible();
}
test('R2-9: cuatro recuadros primero, alternancias y enlaces filtrados con Oracle real', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await entrar(page);
  const tablero = page.getByRole('region', { name: 'Estadísticas de Recursos Humanos' });
  await expect(tablero.locator(':scope > section')).toHaveCount(4);
  await expect(page.getByRole('region', { name: 'Indicadores de Recursos Humanos' })).toBeVisible();
  expect(
    await tablero.evaluate(
      (e) =>
        !!(
          e.compareDocumentPosition(document.querySelector('[data-tour="indicadores"]')!) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true);
  const top = tablero.getByRole('region', { name: 'Top 5 de remuneraciones' });
  await top.getByLabel('Año de mes de remuneraciones').selectOption('2024');
  await top.getByLabel('Mes de remuneraciones', { exact: true }).selectOption('09');
  await expect(top.getByRole('link', { name: /Ana Ejemplo: Q 12,750.00/ })).toBeVisible();
  for (const [metrica, importe] of [
    ['salarioBase', '12,000.00'],
    ['comisiones', '350.00'],
    ['horasExtra', '150.00'],
    ['totalDevengado', '12,750.00'],
  ]) {
    await top.getByLabel('Métrica', { exact: true }).selectOption(metrica!);
    await expect(
      top.getByRole('link', { name: `1. Ana Ejemplo: Q ${importe}. Ver pagos` }),
    ).toBeVisible();
  }
  await top.getByRole('button', { name: 'Departamentos', exact: true }).click();
  await expect(top.getByRole('link', { name: /Equipo dashboard QA/ })).toBeVisible();
  await top.getByRole('link', { name: /Equipo dashboard QA/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`planilla[?]historial=1&anio=2024&mes=9&idDepartamento=${fixture.dep}`),
  );
  await expect(page.getByRole('row').filter({ hasText: 'Ana Ejemplo' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Persona E2E' })).toHaveCount(0);
  await page.goto('/rh');
  const aus = page.getByRole('region', { name: 'Inasistencias' });
  const persona = aus.getByRole('link', { name: /Ana Ejemplo/ });
  await expect(persona).toBeVisible();
  await persona.hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'IGSS: 1.00 días' })).toBeVisible();
  await page.keyboard.press('Escape');
  for (const periodo of ['trimestre', 'anio', 'mes']) {
    await aus.getByLabel('Periodo de inasistencias', { exact: true }).selectOption(periodo);
    await expect(persona).toBeVisible();
  }
  await aus.getByRole('button', { name: 'Departamentos', exact: true }).click();
  await aus.getByRole('link', { name: /Equipo dashboard QA/ }).click();
  await expect(page).toHaveURL(new RegExp(`ausencias[?]idDepartamento=${fixture.dep}`));
  await expect(page.getByRole('row').filter({ hasText: 'Ana Ejemplo' })).toHaveCount(4);
  await page.goto('/rh');
  await page
    .getByRole('region', { name: 'Inasistencias' })
    .getByRole('link', { name: /Ana Ejemplo/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`idEmpleado=${fixture.ana}`));
  await expect(page.getByRole('row').filter({ hasText: 'Ana Ejemplo' })).toHaveCount(4);
  await page.goto('/rh');
  const vac = page.getByRole('region', { name: 'Vacaciones' });
  await expect(vac.getByRole('link', { name: /Ana Ejemplo/ })).toBeVisible();
  await vac.getByRole('tab', { name: /Próximas/ }).click();
  await vac.getByLabel('Próximas vacaciones', { exact: true }).selectOption('60');
  await expect(vac.getByRole('link', { name: /Luis Dashboard/ })).toBeVisible();
  await vac.getByLabel('Próximas vacaciones', { exact: true }).selectOption('90');
  await expect(vac.getByRole('link', { name: /Luis Dashboard/ })).toBeVisible();
  await vac.getByRole('link', { name: /Luis Dashboard/ }).click();
  await expect(page).toHaveURL(new RegExp(`vacaciones[?]empleado=${fixture.luis}&estado=`));
  await expect(page.getByRole('row').filter({ hasText: 'Luis Dashboard' })).toBeVisible();
  await page.goto('/rh');
  const cel = page.getByRole('region', { name: 'Cumpleaños y aniversarios' });
  await expect(cel.getByRole('link', { name: /Ana Ejemplo.*¡Hoy!/ })).toBeVisible();
  await expect(cel.getByText(/\d+ años/)).toHaveCount(0);
  await cel.getByRole('tab', { name: 'Aniversarios', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(cel.getByRole('tab', { name: 'Aniversarios', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(cel.getByRole('link', { name: /Ana Ejemplo.*en el equipo/ })).toBeVisible();
  await page.keyboard.press('Home');
  await cel.getByRole('link', { name: /Ana Ejemplo/ }).click();
  await expect(page).toHaveURL(`/empleados/${fixture.ana}`);
  await page.goto('/rh');
  await expect(tablero.locator('section').first()).toHaveCSS('opacity', '1');
  await top.getByLabel('Año de mes de remuneraciones').selectOption('2024');
  await top.getByLabel('Mes de remuneraciones', { exact: true }).selectOption('09');
  await expect(top.getByRole('link', { name: /Ana Ejemplo: Q 12,750.00/ })).toBeVisible();
  await expect(page.getByText(/Actualizado hace/)).toHaveCount(4);
  // Axe no resuelve texto sobre background-image: medimos también los colores efectivos.
  const muestras = await page.locator('.rh-muestra').evaluateAll((elementos) =>
    elementos.map((e) => {
      const texto = e.querySelector('span') ?? e;
      const estilo = getComputedStyle(texto);
      return {
        texto: texto.textContent,
        color: estilo.color,
        fondo:
          estilo.backgroundColor === 'rgba(0, 0, 0, 0)'
            ? getComputedStyle(e).backgroundColor
            : estilo.backgroundColor,
      };
    }),
  );
  expect(muestras).toHaveLength(4);
  for (const muestra of muestras)
    expect(
      contraste(muestra.color, muestra.fondo),
      `Contraste AA de ${muestra.texto}`,
    ).toBeGreaterThanOrEqual(4.5);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: 'tmp/pdfs/r2-9-dashboard-escritorio.png', fullPage: true });
  await page.getByRole('button', { name: 'Ayuda de esta página', exact: true }).click();
  await expect(page.locator('.driver-popover-title')).toHaveText(
    'Comparar remuneraciones confirmadas',
  );
  for (const titulo of [
    'Distinguir días de inasistencia',
    'Organizar las vacaciones del equipo',
    'Celebrar cumpleaños y aniversarios',
  ]) {
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await expect(page.locator('.driver-popover-title')).toHaveText(titulo);
  }
  await page.getByRole('button', { name: 'Cerrar recorrido', exact: true }).click();
});
test('R2-9: móvil, movimiento reducido y vacío de remuneraciones con API real', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page);
  const tablero = page.getByRole('region', { name: 'Estadísticas de Recursos Humanos' });
  const top = tablero.getByRole('region', { name: 'Top 5 de remuneraciones' });
  await top.getByLabel('Año de mes de remuneraciones').selectOption('1900');
  await expect(top.getByRole('heading', { name: 'Sin pagos para esta métrica' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const rects = await tablero.locator(':scope > section').evaluateAll((es) =>
    es.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, bottom: r.bottom, transform: getComputedStyle(e).transform };
    }),
  );
  for (let i = 1; i < 4; i++) {
    expect(rects[i]!.x).toBe(rects[0]!.x);
    expect(rects[i]!.y).toBeGreaterThan(rects[i - 1]!.bottom);
  }
  expect(rects.every((r) => r.transform === 'none')).toBe(true);
  await page.screenshot({ path: 'tmp/pdfs/r2-9-dashboard-movil.png', fullPage: true });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
});
