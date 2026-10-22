import { describe, it, expect } from 'vitest';
import { completarHistoria } from './nomina.historia.js';
import { calcularNomina } from './nomina.calculo.js';
import { calcularPago, type EntradaPago } from './pago.calculo.js';
import { entradaPrueba } from './nomina.fixture.js';
import type { Entrada, PeriodoFiscalEstimado } from './nomina.types.js';
import type { Historia } from './nomina.repository.js';

function entrada(mensual = false, salario = '10000') {
  const e: Entrada & { historia: Historia } = {
    ...entradaPrueba(salario),
    inicio: '2026-10-01',
    fin: '2026-10-15',
    historia: { apertura: null, previos: [] },
  };
  e.conceptos.push({
    ...e.conceptos.find((c) => c.codigo === 'PRESTAMO')!,
    id: 1000,
    codigo: 'ANTICIPO_PAGADO',
    nombre: 'Anticipo pagado',
  });
  return mensual
    ? ({
        ...e,
        fin: '2026-10-31',
        mes: '2026-10',
        tipoPago: 'PAGO',
        anticipo: '0.00',
        novedades: [],
      } as EntradaPago & { historia: Historia })
    : e;
}
describe('Acumulados fiscales automáticos para la simulación académica', () => {
  it('reconstruye enero a septiembre sin capturar aperturas ni mutar las fuentes', () => {
    const e = entrada(false, '3000'),
      original = JSON.stringify(e),
      r = completarHistoria(e);
    expect(r.acumulado).toEqual({ renta: '29250.00', igss: '1304.10', isr: '0.00' });
    expect(r.estimacionFiscal?.periodos).toHaveLength(18);
    expect(calcularNomina(r).estimacionFiscal).toEqual(r.estimacionFiscal);
    expect(JSON.stringify(e)).toBe(original);
  });
  it('mensual Q10000: nueve meses de 10250, IGSS 483 e ISR 288.35', () => {
    const e = entrada(true) as EntradaPago & { historia: Historia },
      r = completarHistoria(e);
    expect(r.acumulado).toEqual({ renta: '92250.00', igss: '4347.00', isr: '2595.15' });
    expect(r.estimacionFiscal?.periodos).toHaveLength(9);
    const pago = calcularPago(r);
    expect(pago.isr.retencion).toBe('288.35');
    expect(pago.neto).toBe('9478.65');
    expect(pago.estimacionFiscal).toEqual(r.estimacionFiscal);
  });
  it('quincenal alto conserva centavos y proyección anual', () => {
    const r = completarHistoria(entrada());
    expect(r.acumulado).toEqual({ renta: '92250.00', igss: '4347.00', isr: '2595.15' });
    expect(calcularNomina(r).isr.retencion).toBe('144.18');
  });
  it('ingreso de septiembre: prorratea solo los días de contrato del primer mes', () => {
    const e = entrada(true);
    e.empleado.ingreso = '2026-09-10';
    const r = completarHistoria(e);
    expect(r.estimacionFiscal?.periodos).toHaveLength(1);
    expect(r.acumulado.renta).toBe('7250.00');
    expect(r.acumulado.igss).toBe('338.10');
    expect(r.estimacionFiscal?.periodos[0]).toMatchObject({
      inicio: '2026-09-10',
      fin: '2026-09-30',
      metodo: 'MENSUAL',
    });
  });
  it('alta en el mes actual no crea historia anterior', () => {
    const e = entrada(true);
    e.empleado.ingreso = '2026-10-04';
    expect(completarHistoria(e).estimacionFiscal).toBeUndefined();
    expect(completarHistoria(e).acumulado).toEqual({ renta: '0.00', igss: '0.00', isr: '0.00' });
  });
  it('enero reinicia el año, aunque el contrato sea anterior', () => {
    const e = entrada(true);
    e.inicio = '2026-01-01';
    e.fin = '2026-01-31';
    e.empleado.ingreso = '2020-01-01';
    expect(completarHistoria(e).estimacionFiscal).toBeUndefined();
  });
  it('apertura acreditada tiene prioridad y no se convierte en estimación', () => {
    const e = entrada(true);
    e.historia.apertura = {
      corte: '2026-09-30',
      renta: '99999.00',
      igss: '1111.00',
      isr: '2345.67',
    };
    const r = completarHistoria(e);
    expect(r.acumulado).toEqual({ renta: '99999.00', igss: '1111.00', isr: '2345.67' });
    expect(r.estimacionFiscal).toBeUndefined();
  });
  it('estima únicamente los huecos entre una apertura y un pago real', () => {
    const e = entrada(true);
    e.historia.apertura = {
      corte: '2026-07-31',
      renta: '70000.00',
      igss: '3000.00',
      isr: '2000.00',
    };
    e.historia.previos = [
      { inicio: '2026-09-01', fin: '2026-09-30', renta: '12345.00', igss: '600.00', isr: '400.00' },
    ];
    const r = completarHistoria(e);
    expect(r.acumulado.renta).toBe('92595.00');
    expect(r.acumulado.igss).toBe('4083.00');
    expect(r.estimacionFiscal?.periodos.map((p) => p.inicio)).toEqual(['2026-08-01']);
  });
  it('salario aumentado en julio usa cada vigencia, sin multiplicar el salario actual por nueve', () => {
    const e = entrada(true);
    e.salarios[0]!.monto = '6000';
    e.salarios[0]!.hasta = '2026-06-30';
    e.salarios.push({ id: 2, monto: '10000', desde: '2026-07-01', hasta: null });
    const r = completarHistoria(e);
    expect(r.acumulado.renta).toBe('68250.00');
    expect(r.acumulado.igss).toBe('3187.80');
  });
  it('no usa las novedades, deducciones ni cuotas actuales como si ocurrieran en el pasado', () => {
    const e = entrada();
    e.comisiones = [{ id: 1, monto: '9999' }];
    e.ausencias = [
      { id: 1, inicio: '2026-10-01', fin: '2026-10-05', efecto: 'SIN_GOCE', estado: 'APROBADA' },
    ];
    e.descuentos = [
      { id: 1, cuota: 1, codigo: 'PRESTAMO', modalidad: 'CUOTAS', monto: '99999', saldo: '99999' },
    ];
    expect(completarHistoria(e).acumulado).toEqual(completarHistoria(entrada()).acumulado);
  });
  it('conserva estimaciones del pago anterior aunque después cambie el salario histórico', () => {
    const e = entrada(true),
      primero = completarHistoria(e);
    e.inicio = '2026-11-01';
    e.fin = '2026-11-30';
    e.historia.estimados = primero.estimacionFiscal!.periodos;
    e.historia.previos = [
      { inicio: '2026-10-01', fin: '2026-10-31', renta: '10250.00', igss: '483.00', isr: '288.35' },
    ];
    e.salarios[0]!.monto = '12000';
    const r = completarHistoria(e);
    expect(r.acumulado).toEqual({ renta: '102500.00', igss: '4830.00', isr: '2883.50' });
    expect(r.estimacionFiscal).toEqual(primero.estimacionFiscal);
  });
  it('un pago real sustituye el intervalo estimado sin duplicar sus importes', () => {
    const e = entrada(true),
      r = completarHistoria(e);
    e.historia.estimados = r.estimacionFiscal!.periodos;
    e.historia.previos = [
      { inicio: '2026-01-01', fin: '2026-01-31', renta: '15000', igss: '700', isr: '500' },
    ];
    const f = completarHistoria(e);
    expect(f.acumulado.renta).toBe('97000.00');
    expect(f.estimacionFiscal?.periodos).toHaveLength(8);
  });
  it('admite el primer pago real cuyo intervalo comienza antes del alta', () => {
    const e = entrada(true);
    e.empleado.ingreso = '2026-09-10';
    e.historia.previos = [
      { inicio: '2026-09-01', fin: '2026-09-30', renta: '7250', igss: '338.10', isr: '0' },
    ];
    expect(completarHistoria(e).acumulado.renta).toBe('7250.00');
    expect(completarHistoria(e).estimacionFiscal).toBeUndefined();
  });
  it('rechaza duplicados, traslapes con apertura o periodos posteriores', () => {
    const e = entrada();
    const n = {
      inicio: '2026-01-01',
      fin: '2026-01-15',
      renta: '5125',
      igss: '241.50',
      isr: '144.18',
    };
    e.historia.previos = [n, n];
    expect(() => completarHistoria(e)).toThrow(/traslapados/);
    e.historia.previos = [{ ...n, inicio: '2026-10-01', fin: '2026-10-15' }];
    expect(() => completarHistoria(e)).toThrow(/traslapados/);
    e.historia.previos = [n];
    e.historia.apertura = { corte: '2026-01-15', renta: '5125', igss: '241.50', isr: '144.18' };
    expect(() => completarHistoria(e)).toThrow(/traslapados/);
  });
  it('no inventa una vigencia salarial ni tasas ausentes', () => {
    const e = entrada(true);
    e.salarios[0]!.desde = '2026-02-01';
    expect(() => completarHistoria(e)).toThrow(/vigencia de salario/);
    const f = entrada(true);
    f.parametros = f.parametros.filter((p) => p.codigo !== 'IGSS_LABORAL_PORCENTAJE');
    expect(() => completarHistoria(f)).toThrow(/IGSS_LABORAL/);
  });
  it('una quincena real y un hueco parcial se combinan sin estimar otra vez el mes entero', () => {
    const e = entrada(true);
    e.historia.apertura = { corte: '2026-08-31', renta: '82000', igss: '3864', isr: '2306.80' };
    e.historia.previos = [
      { inicio: '2026-09-01', fin: '2026-09-15', renta: '5125', igss: '241.50', isr: '144.18' },
    ];
    const r = completarHistoria(e);
    expect(r.acumulado.renta).toBe('92250.00');
    expect(r.estimacionFiscal?.periodos).toHaveLength(1);
    expect(r.estimacionFiscal?.periodos[0]?.inicio).toBe('2026-09-16');
  });
  it('es determinista al calcular de nuevo la misma entrada y conserva la marca estimada', () => {
    const e = entrada(true);
    const r = completarHistoria(e);
    expect(completarHistoria(r)).toEqual(r);
    const periodos: PeriodoFiscalEstimado[] = r.estimacionFiscal!.periodos;
    expect(periodos.every((p) => p.fin < e.inicio)).toBe(true);
  });
});
