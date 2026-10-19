import { describe, expect, it } from 'vitest';
import { calcularAnchoCampo } from './tamanoCampo';

describe('ancho proporcional de campos (B3)', () => {
  it.each([
    [10, 12],
    [20, 20],
    [30, 30],
    [50, 44],
    [100, 56],
  ])('texto con límite de %i usa %i caracteres visuales', (maxLength, caracteres) => {
    expect(calcularAnchoCampo({ maxLength })).toBe(`calc(${caracteres}ch + 2rem)`);
  });
  it('crece entre tramos y aplica un tope a textos largos', () => {
    const ancho = (maxLength: number) => Number(calcularAnchoCampo({ maxLength }).match(/\d+/)![0]);
    expect(ancho(31)).toBeGreaterThan(ancho(30));
    expect(ancho(51)).toBeGreaterThan(ancho(50));
    expect(ancho(200)).toBe(60);
    expect(ancho(10000)).toBe(60);
  });
  it.each([
    ['codigo', 12],
    ['zona', 12],
    ['dpi', 18],
    ['nit', 18],
    ['telefono', 14],
    ['fecha', 16],
    ['monto', 16],
    ['correo', 36],
    ['select', 20],
  ] as const)(
    'prioriza el formato %s frente a una longitud de almacenamiento',
    (tipo, caracteres) => {
      expect(calcularAnchoCampo({ tipo })).toBe(`calc(${caracteres}ch + 2rem)`);
    },
  );
  it('permite forzar tamaño sin eliminar el tope ni aceptar valores inválidos', () => {
    expect(calcularAnchoCampo({ tipo: 'dpi', tamano: 24 })).toBe('calc(24ch + 2rem)');
    expect(calcularAnchoCampo({ tamano: 'corto' })).toBe('calc(12ch + 2rem)');
    expect(calcularAnchoCampo({ tamano: 'medio' })).toBe('calc(30ch + 2rem)');
    expect(calcularAnchoCampo({ tamano: 'ancho' })).toBe('calc(56ch + 2rem)');
    expect(calcularAnchoCampo({ tamano: 500 })).toBe('calc(60ch + 2rem)');
    expect(calcularAnchoCampo({ tamano: NaN })).toBe(calcularAnchoCampo());
    expect(calcularAnchoCampo({ maxLength: -1 })).toBe(calcularAnchoCampo());
    expect(calcularAnchoCampo({ maxLength: Infinity })).toBe(calcularAnchoCampo());
  });
  it('textarea usa todo el espacio disponible hasta 640 px y permite un tamaño explícito', () => {
    expect(calcularAnchoCampo({ tipo: 'textarea', maxLength: 10000 })).toBe('40rem');
    expect(calcularAnchoCampo({ tipo: 'textarea', tamano: 30 })).toBe('calc(30ch + 2rem)');
    expect(calcularAnchoCampo({ tamano: 'completo' })).toBe('40rem');
  });
});
