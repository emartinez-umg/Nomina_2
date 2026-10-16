import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  amortizar,
  calcularHoraExtra,
  descontarSaldo,
  diasInclusivos,
  quincena,
  traslapan,
} from './novedades.reglas.js';
import { schemas, querySchema, validarAdjunto, adjuntoSchema } from './novedades.schemas.js';
import { dinero } from '../../shared/utils/dinero.js';
describe('Cuotas y saldos exactos', () => {
  it('distribuye centavos y liquida sin crear ni perder dinero', () => {
    const plan = amortizar('100.00', 3, '2028-02-15');
    expect(plan.map((c) => c.monto)).toEqual(['33.33', '33.33', '33.34']);
    expect(plan.map((c) => c.fecha)).toEqual(['2028-02-29', '2028-03-31', '2028-04-30']);
    expect(plan.at(-1)?.saldo).toBe('0.00');
    expect(plan.reduce((s, c) => s.plus(c.monto), new Decimal(0)).toFixed(2)).toBe('100.00');
  });
  it('pasa de diciembre a enero y conserva importe único', () => {
    expect(amortizar('2', 2, '2026-12-31').map((c) => c.fecha)).toEqual([
      '2026-12-31',
      '2027-01-31',
    ]);
    expect(amortizar('0.01', 1, '2027-01-01')[0]).toMatchObject({ monto: '0.01', saldo: '0.00' });
  });
  it.each([0, -1, 601, 1.5])('rechaza cantidad inválida %s', (n) =>
    expect(() => amortizar('100', n, '2027-01-01')).toThrow(),
  );
  it('impide cuotas vacías, montos negativos y precisión adicional', () => {
    for (const monto of ['0.01', '0', '-100', '1.111'])
      expect(() => amortizar(monto, 3, '2027-01-01')).toThrow();
  });
  it('mantiene vigente un saldo parcial y liquida exactamente en cero', () => {
    expect(descontarSaldo('100', '33.33')).toEqual({ saldo: '66.67', estado: 'VIGENTE' });
    expect(descontarSaldo('66.67', '66.67')).toEqual({ saldo: '0.00', estado: 'LIQUIDADO' });
    for (const monto of ['0', '-1', '100.01', '0.001'])
      expect(() => descontarSaldo('100', monto)).toThrow();
  });
  it('usa half-up único sin redondear el valor hora antes de multiplicar', () => {
    expect(dinero('1.005')).toBe('1.01');
    expect(calcularHoraExtra('5000', '2', '30', '8', '50')).toEqual({
      valorHora: '20.83',
      recargo: '50',
      monto: '62.50',
    });
    expect(calcularHoraExtra('5000', '1', '30', '7', '75').monto).toBe('41.67');
    expect(() => calcularHoraExtra('5000', '1', '0', '7', '50')).toThrow();
  });
});
describe('Rangos, captura y formatos', () => {
  it('detecta traslapes inclusivos, contención e igualdad; admite rangos adyacentes', () => {
    expect(traslapan('2026-10-01', '2026-10-15', '2026-10-15', '2026-10-17')).toBe(true);
    expect(traslapan('2026-10-01', '2026-10-15', '2026-10-02', '2026-10-03')).toBe(true);
    expect(traslapan('2026-10-01', '2026-10-15', '2026-10-16', '2026-10-17')).toBe(false);
    expect(diasInclusivos('2028-02-28', '2028-03-01')).toBe(3);
    expect(quincena('2027-02-28')).toEqual({ inicio: '2027-02-16', fin: '2027-02-28', numero: 2 });
  });
  it('valida decimales malformados sin lanzar errores internos', () => {
    for (const monto of ['abc', '1e2', '-1', '0', 'NaN', 'Infinity', '1.111'])
      expect(
        schemas.comisiones.safeParse({
          idEmpleado: 1,
          motivo: 'Comisión válida',
          fecha: '2027-01-01',
          monto,
          referencia: 'ABC',
        }).success,
      ).toBe(false);
  });
  it('rechaza campos ajenos, órdenes inyectados y rangos invertidos', () => {
    expect(querySchema.safeParse({ saldoMax: '0', montoMin: '0' }).success).toBe(true);
    expect(querySchema.safeParse({ montoMin: 'foo', montoMax: '100' }).success).toBe(false);
    expect(querySchema.safeParse({ ordenarPor: 'SALDO DESC;DELETE' }).success).toBe(false);
    expect(querySchema.safeParse({ montoMin: '200', montoMax: '100' }).success).toBe(false);
    expect(querySchema.safeParse({ desde: '2027-02-01', hasta: '2027-01-01' }).success).toBe(false);
    expect(
      schemas['horas-extra'].safeParse({
        idEmpleado: 1,
        fecha: '2027-02-30',
        horas: '25',
        jornada: 'DIURNA',
        estado: 'APROBADA',
        motivo: 'Horas',
        saldo: '1',
      }).success,
    ).toBe(false);
  });
  it('verifica firma, base64 canónico y límite de los respaldos privados', () => {
    const pdf = {
      nombre: 'soporte.pdf',
      tipo: 'application/pdf' as const,
      base64: Buffer.from('%PDF-1.7\nPrueba').toString('base64'),
    };
    expect(validarAdjunto(pdf)).toBe(true);
    expect(validarAdjunto({ ...pdf, tipo: 'image/png' })).toBe(false);
    expect(adjuntoSchema.safeParse({ ...pdf, nombre: '../../archivo.pdf' }).success).toBe(false);
    expect(
      validarAdjunto({
        ...pdf,
        base64: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1048576)]).toString('base64'),
      }),
    ).toBe(false);
  });
});
