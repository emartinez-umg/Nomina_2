import { describe, it, expect } from 'vitest';
import { entradaPrueba } from '../nomina/nomina.fixture.js';
import { calcularNomina } from '../nomina/nomina.calculo.js';
import {
  calcularAnual,
  calcularIndemnizacion,
  ciclo,
  mesesEquivalentes,
  promedio,
  tiempoLaborado,
  totalizar,
  ventanaIndemnizacion,
} from './prestaciones.calculo.js';
import {
  anualSchema,
  finiquitoSchema,
  accionSchema,
  constanciaSchema,
  querySchema,
} from './prestaciones.schemas.js';
const ps = entradaPrueba().parametros.map((p) => ({ ...p, desde: '2020-01-01' }));
const meses = (desde: number, hasta: number, valor = '3000', anio = 2026) =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => {
    const mes = desde + i;
    return {
      inicio: `${anio}-${String(mes).padStart(2, '0')}-01`,
      fin: new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10),
      monto: valor,
    };
  });
describe('Fase 9: cálculos con Decimal y casos borde', () => {
  it('ciclos exactos y fecha límite parametrizada', () => {
    expect(ciclo('BONO_14', 2026, ps)).toEqual({
      inicio: '2025-07-01',
      fin: '2026-06-30',
      limitePago: '2026-07-15',
    });
    expect(ciclo('AGUINALDO', 2026, ps)).toEqual({
      inicio: '2025-12-01',
      fin: '2026-11-30',
      limitePago: '2026-12-15',
    });
  });
  it('Bono 14 proporcional de seis meses sin doble prorrateo', () => {
    expect(
      calcularAnual('BONO_14', '2026-01-01', '2026-06-30', meses(1, 6), ps, '3000'),
    ).toMatchObject({
      promedio: '3000.00',
      monto: '1487.67',
      exento: '1487.67',
      gravado: '0.00',
      tiempo: '0.495890',
    });
  });
  it('aguinaldo de año completo con aumento intermedio', () => {
    const ingresos = [
      ...meses(12, 12, '2000', 2025),
      ...meses(1, 5, '2000'),
      ...meses(6, 11, '4000'),
    ];
    expect(
      calcularAnual('AGUINALDO', '2025-12-01', '2026-11-30', ingresos, ps, '4000'),
    ).toMatchObject({ promedio: '3000.00', monto: '3000.00' });
  });
  it('comisiones variables se promedian y el exceso conserva base gravada', () => {
    const ingresos = meses(1, 6).map((v, i) => ({
      ...v,
      monto: String(3000 + [0, 600, 1200, 0, 1800, 0][i]!),
    }));
    expect(
      calcularAnual('BONO_14', '2026-01-01', '2026-06-30', ingresos, ps, '3000'),
    ).toMatchObject({ promedio: '3600.00', monto: '1785.21' });
    expect(
      calcularAnual(
        'AGUINALDO',
        '2026-01-01',
        '2026-01-31',
        [{ inicio: '2026-01-01', fin: '2026-01-31', monto: '48000' }],
        ps,
        '3000',
      ),
    ).toMatchObject({ monto: '4076.71', exento: '3000.00', gravado: '1076.71' });
  });
  it('límite fiscal consumido por otro pago del mismo tipo', () => {
    expect(
      calcularAnual('BONO_14', '2026-01-01', '2026-06-30', meses(1, 6), ps, '3000', '2900'),
    ).toMatchObject({ exento: '100.00', gravado: '1387.67' });
  });
  it('ingreso de un día y fracciones en febrero bisiesto', () => {
    const r = calcularAnual(
      'AGUINALDO',
      '2024-02-29',
      '2024-02-29',
      [{ inicio: '2024-02-29', fin: '2024-02-29', monto: '100.00' }],
      ps,
      '3000',
    );
    expect(r.monto).toBe('7.95');
    expect(mesesEquivalentes('2024-02-01', '2024-02-29').toString()).toBe('1');
  });
  it('historia faltante, traslapada o cortada nunca se rellena con cero', () => {
    expect(() => promedio(meses(2, 6), '2026-01-01', '2026-06-30')).toThrow('historia');
    expect(() => promedio([...meses(1, 6), ...meses(1, 1)], '2026-01-01', '2026-06-30')).toThrow();
    expect(() => promedio(meses(1, 1), '2026-01-02', '2026-01-31')).toThrow('rango exacto');
  });
  it('indemnización de seis meses y vacaciones más proporcionales', () => {
    const i = calcularIndemnizacion(
      '2026-01-01',
      '2026-06-30',
      '2026-01-01',
      meses(1, 6),
      ps,
      true,
    );
    expect(i.monto).toBe('1487.67');
    const b = calcularAnual('BONO_14', '2026-01-01', '2026-06-30', meses(1, 6), ps, '3000');
    expect(totalizar([i, b])).toEqual({ total: '2975.34', exento: '2975.34', gravado: '0.00' });
  });
  it('indemnización variable con aumento y comisión real', () => {
    const ingresos = [...meses(1, 3, '3000'), ...meses(4, 6, '5000')];
    expect(
      calcularIndemnizacion('2025-07-01', '2026-06-30', '2026-01-01', ingresos, ps, true),
    ).toMatchObject({ promedio: '4000.00', tiempo: '1.000000', monto: '4000.00' });
  });
  it('renuncia no paga indemnización y conserva bases verificables', () => {
    expect(
      calcularIndemnizacion('2026-01-01', '2026-06-30', '2026-01-01', meses(1, 6), ps, false).monto,
    ).toBe('0.00');
  });
  it('aniversarios bisiestos, un día y ventana de seis meses', () => {
    expect(tiempoLaborado('2024-02-29', '2025-02-27').toString()).toBe('1');
    expect(tiempoLaborado('2026-01-01', '2026-01-01').gt(0)).toBe(true);
    expect(ventanaIndemnizacion('2026-10-12', 6)).toBe('2026-04-13');
    expect(ventanaIndemnizacion('2026-08-31', 6)).toBe('2026-03-01');
  });
  it('usa vigencia y porcentaje configurados, sin respaldos', () => {
    expect(() =>
      calcularAnual('BONO_14', '2026-01-01', '2026-06-30', meses(1, 6), [], '3000'),
    ).toThrow('vigencia');
    const cambio = ps.map((p) => (p.codigo === 'BONO14_PORCENTAJE' ? { ...p, valor: '50' } : p));
    expect(
      calcularAnual('BONO_14', '2026-01-01', '2026-06-30', meses(1, 6), cambio, '3000').monto,
    ).toBe('743.84');
  });
  it('nómina consume exención congelada y vacaciones gravadas del finiquito', () => {
    const e = entradaPrueba('10000'),
      base = calcularNomina(e).isr.renta;
    e.prestaciones = [
      { id: 1, tipo: 'AGUINALDO', monto: '12000', exento: '10000' },
      { id: 2, tipo: 'VACACIONES_PENDIENTES', monto: '500', exento: '0' },
      { id: 3, tipo: 'INDEMNIZACION', monto: '10000', exento: '10000' },
    ];
    expect(Number(calcularNomina(e).isr.renta) - Number(base)).toBe(2500);
  });
});
describe('Validación de prestaciones', () => {
  it('rechaza año, causa e IDs inválidos y propiedades inesperadas', () => {
    expect(anualSchema.safeParse({ tipo: 'BONO_14', anio: 2026, idEmpleado: 0 }).success).toBe(
      false,
    );
    expect(
      finiquitoSchema.safeParse({ idEmpleado: 1, corte: '2026-02-30', causa: 'RENUNCIA' }).success,
    ).toBe(false);
    expect(querySchema.safeParse({ ordenarPor: 'DROP TABLE' }).success).toBe(false);
  });
  it('exige confirmación, motivo y referencia segura', () => {
    expect(
      accionSchema.safeParse({
        hash: 'a'.repeat(64),
        motivo: 'Motivo válido de prueba',
        confirmado: false,
      }).success,
    ).toBe(false);
    expect(
      accionSchema.safeParse({
        hash: 'a'.repeat(64),
        motivo: 'Motivo válido de prueba',
        confirmado: true,
        referencia: '=cmd',
      }).success,
    ).toBe(false);
  });
  it('rango de constancia no invertido', () =>
    expect(
      constanciaSchema.safeParse({ idEmpleado: 1, inicio: '2026-06-30', fin: '2026-01-01' })
        .success,
    ).toBe(false));
});
describe('Bordes monetarios y fracciones de nómina', () => {
  it('promedio constante al egresar en una quincena parcial', () => {
    const ingresos = [
      { inicio: '2026-07-01', fin: '2026-07-31', monto: '5000', meses: '1' },
      { inicio: '2026-08-01', fin: '2026-08-31', monto: '5000', meses: '1' },
      { inicio: '2026-09-01', fin: '2026-09-30', monto: '5000', meses: '1' },
      { inicio: '2026-10-01', fin: '2026-10-12', monto: '2000', meses: '0.4' },
    ];
    expect(
      calcularAnual('BONO_14', '2026-07-01', '2026-10-12', ingresos, ps, '5000'),
    ).toMatchObject({ promedio: '5000.00', monto: '1424.66', tiempo: '0.284932' });
  });
  it('exento y gravado cuadran al redondear un límite con fracción de centavo', () => {
    const parametros = ps.map((p) =>
      p.codigo === 'ISR_EXENCION_BONO14_MESES' ? { ...p, valor: '0.333333' } : p,
    );
    const r = calcularAnual('BONO_14', '2026-01-01', '2026-06-30', meses(1, 6), parametros, '3000');
    expect(r).toMatchObject({ monto: '1487.67', exento: '1000.00', gravado: '487.67' });
  });
  it('bloquea desbordamiento de NUMBER(12,2)', () => {
    const c = calcularAnual('BONO_14', '2026-01-01', '2026-06-30', meses(1, 6), ps, '3000');
    expect(() =>
      totalizar([
        { ...c, monto: '9999999999.99' },
        { ...c, monto: '0.01' },
      ]),
    ).toThrow('capacidad monetaria');
  });
});

describe('A12: años completos, fracciones y liquidación paso a paso', () => {
  it('exactamente un año paga el 100 %, incluyendo doce meses variables', () => {
    const ingresos = [...meses(7, 12, '4000', 2025), ...meses(1, 6, '6000')];
    expect(
      calcularAnual('BONO_14', '2025-07-01', '2026-06-30', ingresos, ps, '6000'),
    ).toMatchObject({ dias: 365, promedio: '5000.00', tiempo: '1.000000', monto: '5000.00' });
  });
  it('año bisiesto no supera el 100 % del promedio', () => {
    const ingresos = [...meses(7, 12, '3000', 2023), ...meses(1, 6, '3000', 2024)];
    expect(
      calcularAnual('BONO_14', '2023-07-01', '2024-06-30', ingresos, ps, '3000'),
    ).toMatchObject({ dias: 366, monto: '3000.00', tiempo: '1.000000' });
  });
  it('baja a mitad del ciclo usa días reales sin diluir salario ni comisiones', () => {
    const ingresos = [
      ...meses(1, 2),
      { inicio: '2026-03-01', fin: '2026-03-15', monto: '2100', meses: '0.5' },
    ];
    const r = calcularAnual(
      'BONO_14',
      '2026-01-01',
      '2026-03-15',
      ingresos.map((v) => ({ ...v, meses: 'meses' in v ? v.meses : '1' })),
      ps,
      '3000',
    );
    // (3000 + 3000 + 1500 + 600 de comisión) / 2.5 × 74 / 365.
    expect(r).toMatchObject({ dias: 74, promedio: '3240.00', monto: '656.88' });
  });
  it('indemnización de un año y medio más vacaciones fraccionarias', () => {
    const r = calcularIndemnizacion(
      '2025-01-01',
      '2026-06-30',
      '2026-01-01',
      meses(1, 6, '6000'),
      ps,
      true,
    );
    // Un año más 181/365; vacaciones 6.25 × 6000 / 30 = 1250.
    expect(r).toMatchObject({ promedio: '6000.00', tiempo: '1.495890', monto: '8975.34' });
    expect(
      totalizar([
        r,
        {
          ...r,
          concepto: 'VACACIONES_PENDIENTES',
          monto: '1250.00',
          exento: '0.00',
          gravado: '1250.00',
        },
      ]).total,
    ).toBe('10225.34');
  });
});
