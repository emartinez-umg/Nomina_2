import { describe, expect, it } from 'vitest';
import { nombreEmpleado, nombreUsuario } from './nombre';
describe('Nombre de presentación', () => {
  it('prefiere la ficha aunque no coincida con la cuenta técnica', () => {
    expect(nombreUsuario({ usuario: 'otro.usuario2', nombreMostrado: 'José Pérez' })).toBe(
      'José Pérez',
    );
  });
  it('convierte una cuenta sin ficha separando puntos y capitalizando', () => {
    expect(nombreUsuario({ usuario: 'ana.pÉREZ2' })).toBe('Ana Pérez2');
    expect(nombreUsuario({ usuario: 'administrador' })).toBe('Administrador');
  });
  it('toma el primer nombre y primer apellido sin perder acentos ni espacios irregulares', () => {
    expect(nombreEmpleado('  María   José ', ' López\tGarcía ')).toBe('María López');
  });
});
