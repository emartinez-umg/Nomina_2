import { describe, expect, it } from 'vitest';
import { nombrePersona } from './nombre.js';
describe('Nombre visible de la ficha', () => {
  it('usa el primer nombre y primer apellido conservando la grafía registrada', () => {
    expect(nombrePersona(' María  José ', ' López\tGarcía ')).toBe('María López');
    expect(nombrePersona('Ana', 'Pérez')).toBe('Ana Pérez');
    expect(nombrePersona('Óscar René', 'Díaz Méndez')).toBe('Óscar Díaz');
  });
});
