import { expect, type Page } from '@playwright/test';
import { estados } from '../backend/src/shared/presentacion/estados.js';

/** Los códigos públicos identifican registros; los estados internos nunca son etiquetas. */
export async function sinCodigosInternos(page: Page) {
  const texto = await page.locator('body').innerText();
  const tokens = texto.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\b/g) ?? [];
  expect(
    tokens.filter(
      (c) =>
        (c.includes('_') || Object.hasOwn(estados, c)) &&
        !/^(?:EMP_[A-Z0-9]+_\d+|(?:SOL|PRE|DES|EVT|ANU|ACT)_\d{4}_\d+)$/.test(c),
    ),
    `Códigos visibles en ${page.url()}`,
  ).toEqual([]);
}
