import { describe, it, expect } from 'vitest';
import { crearUsuarioSchema } from './usuarios.schemas.js';
import { entradaSchema, querySchema } from '../catalogos/catalogos.schemas.js';
import { obtenerCatalogo } from '../catalogos/catalogos.definiciones.js';
describe('Captura administrativa final', () => {
  it('separa dirección postal del sentido de ordenamiento en filtros', () => {
    const q = querySchema(obtenerCatalogo('empresa')!).parse({
      direccion: 'desc',
      direccionTexto: 'Zona 1',
    });
    expect(q.direccion).toBe('desc');
    expect(q.direccionTexto).toBe('Zona 1');
    expect(
      querySchema(obtenerCatalogo('empresa')!).safeParse({ direccion: 'Zona 1' }).success,
    ).toBe(false);
  });
  it('exige confirmación, motivo y rol administrativo; empleado se crea desde su expediente', () => {
    const d = {
      nombre: 'Ana',
      apellido: 'Prueba',
      correo: 'ana@example.test',
      rol: 'RH',
      motivo: 'Alta autorizada',
      confirmado: true,
    };
    expect(crearUsuarioSchema.safeParse(d).success).toBe(true);
    for (const cambio of [
      { confirmado: false },
      { motivo: '' },
      { rol: 'EMPLEADO' },
      { idUsuario: 1 },
    ])
      expect(crearUsuarioSchema.safeParse({ ...d, ...cambio }).success).toBe(false);
  });
  it('valida NIT, correo, teléfono de empresa antes de Oracle', () => {
    const schema = entradaSchema(obtenerCatalogo('empresa')!);
    const d = {
      nombre: 'Empresa',
      nit: '1234567-9',
      direccion: 'Dirección fiscal',
      correo: 'empresa@example.test',
      telefono: '55551234',
    };
    expect(schema.safeParse(d).success).toBe(true);
    for (const cambio of [{ nit: '1234567-0' }, { correo: 'incorrecto' }, { telefono: '5555abcd' }])
      expect(schema.safeParse({ ...d, ...cambio }).success).toBe(false);
  });
});
