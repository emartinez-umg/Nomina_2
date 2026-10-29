import { describe, expect, it } from 'vitest';
import { validarJerarquia } from './jefaturas.service.js';
import { asignacionJefaturaSchema } from './jefaturas.schemas.js';
describe('R3-5: jerarquía y asignación de jefaturas', () => {
  const filas = [
    { id: 1, superior: null },
    { id: 2, superior: 1 },
    { id: 3, superior: 2 },
  ];
  it('admite tres niveles y mover una rama sin ciclo', () => {
    expect(() => validarJerarquia(filas, 3, 1)).not.toThrow();
    expect(() => validarJerarquia(filas, 2, null)).not.toThrow();
  });
  it.each([
    [1, 1],
    [1, 3],
    [2, 3],
  ])('rechaza ciclo %s → %s', (id, superior) => {
    expect(() => validarJerarquia(filas, id, superior)).toThrow(/ciclo/);
  });
  it('no se bloquea ante una cadena histórica cíclica', () => {
    expect(() =>
      validarJerarquia(
        [
          { id: 1, superior: 2 },
          { id: 2, superior: 1 },
        ],
        3,
        1,
      ),
    ).toThrow(/ciclo/);
  });
  it('exige IDs únicos, límite, motivo y confirmación explícita', () => {
    const d = { idJefatura: 1, empleados: [1, 2], motivo: 'Traslado de equipo', confirmado: true };
    expect(asignacionJefaturaSchema.safeParse(d).success).toBe(true);
    for (const cambio of [
      { empleados: [] },
      { empleados: [1, 1] },
      { empleados: Array.from({ length: 501 }, (_, i) => i + 1) },
      { confirmado: false },
      { motivo: '  ' },
      { empleados: [-1] },
      { idJefatura: '1' },
      { usuarioId: 3 },
    ])
      expect(asignacionJefaturaSchema.safeParse({ ...d, ...cambio }).success).toBe(false);
  });
});
