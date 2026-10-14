import { describe, it, expect } from 'vitest';
import { generarCodigoGenerico, resolverCodigoGenerico } from './codigos.generador.js';
describe('Algoritmo A4', () => {
  it.each([
    ['Ingeniería', 3, 'ING'],
    ['Recursos Humanos', 3, 'RH'],
    ['Ñandú Ünico', 4, 'NU'],
    ['Dirección de Tecnología y de la Información', 3, 'DTI'],
    ['de Ingeniería', 3, 'ING'],
    ['  ¡Niñez! @2026# ', 4, 'N2'],
    ['Áéíóúñü', 7, 'AEIOUNU'],
    ['A1', 3, 'A1'],
    ['de la y', 3, ''],
    ['!!!', 3, ''],
    ['Uno Dos Tres Cuatro', 3, 'UDT'],
  ])('normaliza %s', (palabra, longitud, esperado) =>
    expect(generarCodigoGenerico(palabra, longitud)).toBe(esperado),
  );
  it('usa longitud 3 por defecto', () => expect(generarCodigoGenerico('Ventas')).toBe('VEN'));
  it('prueba opción B ante colisión simple', async () => {
    expect(await resolverCodigoGenerico('Ingeniería', 3, async (c) => c === 'ING')).toBe('ING2');
    expect(await resolverCodigoGenerico('Administración', 3, async (c) => c === 'ADM')).toBe(
      'ADM2',
    );
    expect(await resolverCodigoGenerico('Ventas', 3, async (c) => c === 'VEN')).toBe('VNT');
  });
  it('agrega sufijos desde la opción A ante colisión doble', async () => {
    const usados = new Set(['VEN', 'VNT', 'VEN2']);
    expect(await resolverCodigoGenerico('Ventas', 3, async (c) => usados.has(c))).toBe('VEN3');
  });
});
