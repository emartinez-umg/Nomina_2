import { describe, expect, it } from 'vitest';
import {
  recortarNombreCatalogo,
  normalizarNombreCatalogo,
  validarNombreCatalogo,
} from './nombre.js';
describe('Nombre de catálogo compartido', () => {
  it.each([
    '',
    '   ',
    'A',
    '123456',
    '/*%$#&/@#^',
    'Ventas!',
    'Soporte+ventas',
    'Área\\nueva',
    'Nombre\u0000',
    'a#',
    '<script>',
  ])('rechaza %j con orientación', (nombre) => {
    expect(validarNombreCatalogo(nombre)).toBeTypeOf('string');
  });
  it.each(['I+D', 'Ventas@'])('rechaza símbolos fuera de la lista explícita: %s', (nombre) => {
    expect(validarNombreCatalogo(nombre)).toContain('permiten');
  });
  it.each([
    "Área (A) / B & C - D, S.A. 'Central'",
    'Niñez',
    'Pingüino 2',
    '  A  B  ',
    'Cafe\u0301',
  ])('acepta letras, composición y puntuación permitida: %s', (nombre) => {
    expect(validarNombreCatalogo(nombre)).toBeUndefined();
  });
  it('colapsa antes de medir y comparar, respetando la grafía guardada', () => {
    expect(recortarNombreCatalogo('  Área   de\tIngeniería  ')).toBe('Área de Ingeniería');
    expect(validarNombreCatalogo('  A    B  ', 3)).toBeUndefined();
    expect(validarNombreCatalogo(' Área ', 3)).toContain('3 caracteres');
    expect(normalizarNombreCatalogo(' INGENIERÍA ')).toBe(normalizarNombreCatalogo('ingenieria'));
    expect(normalizarNombreCatalogo(' PINGÜINO / NIÑEZ ')).toBe('pinguino / ninez');
  });
});
