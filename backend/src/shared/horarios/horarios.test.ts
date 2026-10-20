import { horasDiariasEnFecha } from './horas.js';
import { describe, expect, it } from 'vitest';
import { analizarHorario, jornadaBloque } from './modelo.js';
import type { BloqueHorario, LimitesHorario } from './modelo.js';
import { diasLaboralesRango } from './calendario.js';
const limites: LimitesHorario = {
  DIURNA: { diarias: 8, semanales: 44 },
  MIXTA: { diarias: 7, semanales: 42 },
  NOCTURNA: { diarias: 6, semanales: 36 },
};
const bloque = (cambio: Partial<BloqueHorario> = {}): BloqueHorario => ({
  dias: [1, 2, 3, 4, 5],
  entrada: '08:00',
  salida: '17:00',
  minutosDescanso: 60,
  cruzaMedianoche: false,
  ...cambio,
});
describe('Horarios por bloques', () => {
  it('calcula horas por bloque, semana, jornada y descansos con sábado', () => {
    const a = analizarHorario(
      [bloque(), bloque({ dias: [6], entrada: '08:00', salida: '12:30', minutosDescanso: 30 })],
      limites,
    );
    expect(a.errores).toEqual([]);
    expect(a.horasDiarias).toEqual([8, 8, 8, 8, 8, 4, 0]);
    expect(a.horasSemanales).toBe(44);
    expect(a.jornada).toBe('DIURNA');
    expect(a.descansos).toEqual([7]);
  });
  it('detecta diurna, mixta y nocturna incluso después de medianoche', () => {
    expect(jornadaBloque(bloque())).toBe('DIURNA');
    expect(
      jornadaBloque(bloque({ entrada: '18:00', salida: '00:30', cruzaMedianoche: true })),
    ).toBe('NOCTURNA');
    expect(jornadaBloque(bloque({ entrada: '04:00', salida: '10:00' }))).toBe('MIXTA');
    expect(
      jornadaBloque(bloque({ entrada: '23:00', salida: '07:00', cruzaMedianoche: true })),
    ).toBe('MIXTA');
  });
  it('valida límites diarios acumulados y semanales parametrizables', () => {
    expect(analizarHorario([bloque({ salida: '18:00' })], limites).errores.join(' ')).toMatch(
      /diarias/,
    );
    expect(
      analizarHorario([bloque({ dias: [1, 2, 3, 4, 5, 6] })], limites).errores.join(' '),
    ).toMatch(/semanales/);
    expect(
      analizarHorario([bloque()], {
        ...limites,
        DIURNA: { diarias: 7, semanales: 35 },
      }).errores.join(' '),
    ).toMatch(/35 horas/);
    expect(
      analizarHorario(
        [
          bloque({ dias: [1], entrada: '08:00', salida: '13:00', minutosDescanso: 30 }),
          bloque({ dias: [1], entrada: '14:00', salida: '19:00', minutosDescanso: 30 }),
        ],
        limites,
      ).errores.join(' '),
    ).toMatch(/diarias/);
  });
  it('detecta solapes del mismo día, del siguiente y de domingo a lunes', () => {
    for (const dias of [
      [1, 2],
      [7, 1],
    ]) {
      const a = analizarHorario([
        bloque({ dias: [dias[0]!], entrada: '22:00', salida: '05:00', cruzaMedianoche: true }),
        bloque({ dias: [dias[1]!], entrada: '04:30', salida: '09:00' }),
      ]);
      expect(a.errores.join(' ')).toMatch(/solapan/);
    }
    expect(analizarHorario([bloque(), bloque()]).errores.join(' ')).toMatch(/solapan/);
    expect(
      analizarHorario(
        [
          bloque({ dias: [1], entrada: '08:00', salida: '12:00', minutosDescanso: 30 }),
          bloque({ dias: [1], entrada: '12:00', salida: '16:00', minutosDescanso: 30 }),
        ],
        limites,
      ).errores,
    ).toEqual([]);
  });
  it('rechaza pasos libres, descansos fuera de lista, vacío, días repetidos y cruces incorrectos', () => {
    for (const b of [
      bloque({ entrada: '08:15' }),
      bloque({ minutosDescanso: 0 }),
      bloque({ dias: [] }),
      bloque({ dias: [1, 1] }),
      bloque({ entrada: '17:00', salida: '08:00' }),
      bloque({ cruzaMedianoche: true }),
    ])
      expect(analizarHorario([b]).errores.length).toBeGreaterThan(0);
    expect(analizarHorario([]).errores.length).toBeGreaterThan(0);
    expect(
      analizarHorario([bloque({ entrada: '08:15', minutosDescanso: 15 })], undefined, false)
        .errores,
    ).toEqual([]);
  });
});
describe('Función única de días laborales', () => {
  const contar = (dias: number[], feriados: string[] = []) =>
    diasLaboralesRango(
      '2026-11-01',
      '2026-11-15',
      [{ desde: '2026-01-01', hasta: null, dias }],
      feriados,
    )
      .filter((d) => d.laborable)
      .map((d) => d.fecha);
  it('mantiene los 10 días de lunes a viernes del 1 al 15 de noviembre', () =>
    expect(contar([1, 2, 3, 4, 5])).toHaveLength(10));
  it('excluye descanso entre semana y admite sábado y domingo', () => {
    expect(contar([1, 4, 5, 6, 7])).toHaveLength(11);
    expect(contar([1, 4, 5, 6, 7])).not.toContain('2026-11-03');
    expect(contar([1, 2, 3, 4, 5, 6])).toHaveLength(12);
  });
  it('un feriado dentro del rango se excluye una sola vez', () => {
    expect(contar([1, 2, 3, 4, 5, 6], ['2026-11-07', '2026-11-07'])).toHaveLength(11);
    expect(contar([1, 2, 3, 4, 5], ['2026-11-01'])).toHaveLength(10);
  });
});

it('horas extra en descanso promedia el patrón y rechaza asignaciones ambiguas', () => {
  const jornadas = [
    { desde: '2026-01-01', hasta: null, dia: 1, horas: '8' },
    { desde: '2026-01-01', hasta: null, dia: 6, horas: '4' },
  ];
  expect(horasDiariasEnFecha(jornadas, '2026-10-11').toString()).toBe('6');
  expect(horasDiariasEnFecha(jornadas, '2026-10-10').toString()).toBe('4');
  expect(() =>
    horasDiariasEnFecha([...jornadas, { ...jornadas[0]!, desde: '2026-02-01' }], '2026-10-11'),
  ).toThrow(/único/);
});
