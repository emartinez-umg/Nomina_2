import { describe, expect, it } from 'vitest';
import {
  aniversarios,
  calcularSaldo,
  calendarioLaboral,
  exigirSaldo,
  exigirCancelacion,
  traslapan,
  valorarPendientes,
} from './vacaciones.reglas.js';
import { cargaSchema, rangoSchema, resolverSchema } from './vacaciones.schemas.js';
const tasa = [{ desde: '2020-01-01', hasta: null, valor: '1.25' }];
describe('Vacaciones: acumulación y kardex', () => {
  it('acumula solo meses cumplidos, con precisión decimal', () => {
    expect(calcularSaldo('2026-01-12', '2026-02-11', tasa, []).disponible).toBe('0.00');
    expect(calcularSaldo('2026-01-12', '2026-10-12', tasa, []).disponible).toBe('11.25');
  });
  it('conserva el día de contratación al pasar febrero y años bisiestos', () => {
    expect(aniversarios('2024-01-31', '2024-03-31')).toEqual(['2024-02-29', '2024-03-31']);
    expect(aniversarios('2023-01-31', '2023-03-31')).toEqual(['2023-02-28', '2023-03-31']);
  });
  it('calcula con la tasa configurada al corte y no suma snapshots v0', () => {
    const p = [
      { desde: '2026-01-01', hasta: '2026-02-28', valor: '1.25' },
      { desde: '2026-03-01', hasta: null, valor: '1.50' },
    ];
    expect(calcularSaldo('2026-01-01', '2026-03-01', p, []).disponible).toBe('3.00');
    expect(
      calcularSaldo('2026-01-01', '2026-02-01', tasa, [
        { fecha: '2026-02-01', tipo: 'ACUMULACION', dias: '2.00', clave: 'MES:2026-02-01' },
      ]).disponible,
    ).toBe('1.25');
    expect(() => calcularSaldo('2026-01-01', '2026-02-01', [], [])).toThrow(/tasa/);
  });
  it('cinco meses producen 6.25 disponibles y seis solicitables', () => {
    expect(calcularSaldo('2026-05-15', '2026-10-15', tasa, [])).toMatchObject({
      mesesCompletos: 5,
      acumulado: '6.25',
      tomados: '0.00',
      previas: '0.00',
      disponible: '6.25',
      solicitables: 6,
    });
    expect(calcularSaldo('2026-05-15', '2026-10-14', tasa, []).solicitables).toBe(5);
    expect(calcularSaldo('2026-11-15', '2026-10-15', tasa, []).acumulado).toBe('0.00');
  });
  it('resta previas y aprobadas sin volver a contar acumulaciones materializadas', () => {
    const s = calcularSaldo('2026-01-01', '2026-05-01', tasa, [
      { tipo: 'AJUSTE', fecha: '2026-05-01', dias: '-1.25', clave: 'previas' },
      { tipo: 'DISFRUTE', fecha: '2026-05-01', dias: '-2', clave: 'solicitud' },
      { tipo: 'ACUMULACION', fecha: '2026-02-01', dias: '1.25', clave: 'MES:2026-02-01' },
    ]);
    expect(s).toMatchObject({
      acumulado: '5.00',
      tomados: '2.00',
      previas: '1.25',
      disponible: '1.75',
      solicitables: 1,
    });
  });
  it('abre historia certificada y acumula desde el siguiente aniversario del ingreso', () => {
    expect(
      calcularSaldo('2010-01-12', '2026-11-12', tasa, [
        { tipo: 'SALDO_INICIAL', fecha: '2026-10-12', dias: '4.50', clave: 'apertura' },
      ]).disponible,
    ).toBe('5.75');
    expect(
      calcularSaldo('2025-01-01', '2026-01-01', tasa, [
        { tipo: 'SALDO_INICIAL', fecha: '2026-01-01', dias: '0', clave: 'apertura' },
      ]).disponible,
    ).toBe('0.00');
  });
});
describe('Vacaciones: cancelación', () => {
  it('devuelve el consumo y conserva previas y decimales', () => {
    expect(
      calcularSaldo('2026-05-15', '2026-10-15', tasa, [
        { fecha: '2026-10-15', tipo: 'DISFRUTE', dias: '-2', clave: 'SOLICITUD:1' },
        { fecha: '2026-10-15', tipo: 'REVERSO', dias: '2', clave: 'CANCELACION:1' },
        { fecha: '2026-10-15', tipo: 'AJUSTE', dias: '-0.25', clave: 'previas' },
      ]),
    ).toMatchObject({ tomados: '0.00', disponible: '6.00', solicitables: 6 });
  });
  it('exige aprobación e inicio estrictamente futuro', () => {
    expect(() => exigirCancelacion('APROBADA', '2026-10-16', '2026-10-15')).not.toThrow();
    for (const estado of ['EN_PROCESO', 'CANCELADA', 'TOMADA', 'RECHAZADA'])
      expect(() => exigirCancelacion(estado, '2026-10-16', '2026-10-15')).toThrow();
    expect(() => exigirCancelacion('APROBADA', '2026-10-15', '2026-10-15')).toThrow(/comenzaron/);
  });
});
describe('Vacaciones: calendario y disponibilidad', () => {
  it('del 1 al 15 de noviembre 2026 Lun–Vie son diez días, y Lun–Sáb doce', () => {
    const contar = (dias: number[], feriados: string[] = []) =>
      calendarioLaboral(
        '2026-11-01',
        '2026-11-15',
        [{ desde: '2026-01-01', hasta: null, dias }],
        feriados,
      ).filter((d) => d.laborable).length;
    expect(contar([1, 2, 3, 4, 5])).toBe(10);
    expect(contar([1, 2, 3, 4, 5, 6])).toBe(12);
    expect(contar([1, 2, 3, 4, 5], ['2026-11-02'])).toBe(9);
  });
  it('excluye fines de semana y feriados nacionales/locales recibidos', () => {
    const d = calendarioLaboral(
      '2026-10-12',
      '2026-10-18',
      [{ desde: '2026-01-01', hasta: null, dias: [1, 2, 3, 4, 5] }],
      ['2026-10-13'],
    );
    expect(d.filter((d) => d.laborable)).toHaveLength(4);
  });
  it('admite descanso entre semana y trabajo en domingo', () => {
    const d = calendarioLaboral(
      '2026-10-12',
      '2026-10-18',
      [{ desde: '2026-01-01', hasta: null, dias: [1, 4, 5, 6, 7] }],
      [],
    );
    expect(d.filter((d) => d.laborable).map((d) => d.fecha)).toEqual([
      '2026-10-12',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
  });
  it('resuelve cambios de horario por fecha y detecta huecos', () => {
    const d = calendarioLaboral(
      '2026-10-12',
      '2026-10-18',
      [
        { desde: '2026-10-12', hasta: '2026-10-14', dias: [1, 2] },
        { desde: '2026-10-16', hasta: null, dias: [5, 7] },
      ],
      [],
    );
    expect(d.filter((d) => d.laborable)).toHaveLength(4);
    expect(d[3]!.motivo).toBe('Sin horario vigente');
  });
  it('detecta traslapes inclusivos pero permite rangos adyacentes', () => {
    expect(traslapan('2026-10-12', '2026-10-15', '2026-10-15', '2026-10-20')).toBe(true);
    expect(traslapan('2026-10-12', '2026-10-15', '2026-10-16', '2026-10-20')).toBe(false);
  });
  it('rechaza saldo insuficiente y acepta igualdad exacta', () => {
    expect(() => exigirSaldo('1.25', '2')).toThrow(/Saldo insuficiente/);
    expect(() => exigirSaldo('1.25', '1.25')).not.toThrow();
  });
  it('expone valoración exacta para Fase 9 sin pagar', () => {
    expect(valorarPendientes('1.25', '7000', '30').monto).toBe('291.67');
  });
  it('valida fechas reales, límites, confirmación y motivo de rechazo', () => {
    expect(rangoSchema.safeParse({ inicio: '2026-02-30', fin: '2026-03-01' }).success).toBe(false);
    expect(rangoSchema.safeParse({ inicio: '2026-10-12', fin: '2026-10-11' }).success).toBe(false);
    expect(
      resolverSchema.safeParse({ estado: 'RECHAZADA', motivo: '', confirmado: true }).success,
    ).toBe(false);
    expect(
      cargaSchema.safeParse({
        tipo: 'SALDO_INICIAL',
        dias: '0',
        referencia: 'EXP_1',
        motivo: 'Saldo certificado',
        confirmado: true,
      }).success,
    ).toBe(true);
  });
});
