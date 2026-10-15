import { describe, expect, it } from 'vitest';
import { entradaPrueba } from '../nomina/nomina.fixture.js';
import { importeNovedadesPrestaciones } from './prestaciones.historia.js';

describe('A12: ingresos variables del ciclo', () => {
  it('revalora horas con salario y horario efectivos, conserva comisión y suma sin anticipos', () => {
    const e = entradaPrueba('6000');
    e.jornadas = [1, 2, 3, 4, 5].map((dia) => ({
      desde: '2026-01-01',
      hasta: null,
      dia,
      horas: '8',
    }));
    // 8 × (6000 / 30 / 8) × 1.5 + 100 = 400. No usa la referencia monetaria obsoleta de HE.
    const r = importeNovedadesPrestaciones(
      e,
      [
        { id: 1, tipo: 'HORAS_EXTRA', cantidad: '8', monto: '999', autorizacion: 'APROBADA' },
        { id: 2, tipo: 'COMISION', cantidad: '1', monto: '100', autorizacion: 'APROBADA' },
      ],
      '2026-01-31',
    );
    expect(r.toFixed(2)).toBe('400.00');
  });
  it('una novedad pendiente bloquea el cálculo y una bandera excluida no suma', () => {
    const e = entradaPrueba('6000'),
      n = { id: 1, tipo: 'COMISION', cantidad: '1', monto: '100', autorizacion: 'PENDIENTE' };
    expect(() => importeNovedadesPrestaciones(e, [n], '2026-01-31')).toThrow('Autoriza');
    e.conceptos = e.conceptos.map((c) => (c.codigo === 'COMISION' ? { ...c, prestaciones: 0 } : c));
    expect(
      importeNovedadesPrestaciones(
        e,
        [{ ...n, autorizacion: 'APROBADA' }],
        '2026-01-31',
      ).toString(),
    ).toBe('0');
  });
});
