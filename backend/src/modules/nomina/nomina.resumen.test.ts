import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { entradaPrueba } from './nomina.fixture.js';
import { calcularNomina } from './nomina.calculo.js';
import { calcularPago, type EntradaPago } from './pago.calculo.js';
import { movimientoDesdeSnapshot, resumenMensualNomina } from './nomina.resumen.service.js';
import type { Resultado } from './nomina.types.js';
import type { Guardado } from './nomina.repository.js';

function entrada(salario = '10000', id = 1): EntradaPago {
  const e = entradaPrueba(salario);
  e.empleado.id = id;
  e.conceptos.push({
    id: 100,
    codigo: 'ANTICIPO_PAGADO',
    nombre: 'Anticipo ya pagado',
    naturaleza: 'DESCUENTO',
    igss: 0,
    isr: 0,
    prestaciones: 0,
    desde: '2026-01-01',
    hasta: null,
  });
  return {
    ...e,
    fin: '2026-01-31',
    tipoPago: 'ANTICIPO',
    mes: '2026-01',
    anticipo: '0.00',
    novedades: [],
  };
}
function guardado(e: EntradaPago, resultado: Resultado, id: number): Guardado {
  return {
    id,
    idEmpleado: e.empleado.id,
    inicio: e.inicio,
    fin: e.fin,
    estado: 'CERRADO',
    version: 1,
    snapshot: JSON.stringify({ entrada: e, resultado }),
  };
}
function mes(e = entrada(), inicial = 1) {
  const anticipo = calcularPago(e);
  const a = guardado(e, anticipo, inicial);
  e.tipoPago = 'PAGO';
  e.anticipo = anticipo.neto;
  return [a, guardado(e, calcularPago(e), inicial + 1)];
}
const resumir = (ns: Guardado[]) => resumenMensualNomina(ns.map(movimientoDesdeSnapshot));

describe('R3-2: fuente única de totales mensuales desde pagos archivados', () => {
  it('SB Q10000: DEV 10250, IGSS 483, ISR 288.35, neto 9478.65; nunca 15500', () => {
    const ns = mes();
    const original = JSON.stringify(ns);
    const r = resumir(ns);
    expect(r.totales).toMatchObject({
      ingresos: '10250.00',
      descuentos: '771.35',
      neto: '9478.65',
      baseIgss: '10000.00',
      igss: '483.00',
      isr: '288.35',
      patronal: '1267.00',
    });
    expect(r.parcial).toBe(false);
    expect(r.empleados).toBe(1);
    expect(r.registros).toHaveLength(1);
    expect(JSON.stringify(ns)).toBe(original);
  });
  it('solo anticipo: ingresos y neto 5250, deducciones cero y parcial', () => {
    const r = resumir(mes().slice(0, 1));
    expect(r.totales).toMatchObject({
      ingresos: '5250.00',
      descuentos: '0.00',
      neto: '5250.00',
      igss: '0.00',
    });
    expect(r.parcial).toBe(true);
  });
  it('varios empleados: usa el pago de cada uno y el anticipo de quien todavía no tiene pago', () => {
    const uno = mes();
    const dos = mes(entrada('10000', 2), 3);
    const completo = resumir([...dos, ...uno]);
    expect(completo.totales).toMatchObject({
      ingresos: '20500.00',
      descuentos: '1542.70',
      neto: '18957.30',
      igss: '966.00',
    });
    expect(completo.empleados).toBe(2);
    expect(completo.parcial).toBe(false);
    const parcial = resumir([...uno, dos[0]!]);
    expect(parcial.totales).toMatchObject({
      ingresos: '15500.00',
      descuentos: '771.35',
      neto: '14728.65',
    });
    expect(parcial.parcial).toBe(true);
  });
  it('alta 08/10: no suma Q2533.33 a los Q7400 devengados ni duplica los días IGSS', () => {
    const e = entrada('9000');
    e.mes = '2026-10';
    e.inicio = '2026-10-01';
    e.fin = '2026-10-31';
    e.empleado.ingreso = '2026-10-08';
    const r = resumir(mes(e));
    expect(r.totales).toMatchObject({
      ingresos: '7400.00',
      baseIgss: '7200.00',
      igss: '347.76',
      dias: '24.00',
    });
    expect(new Decimal(r.totales.ingresos).minus(r.totales.descuentos).toFixed(2)).toBe(
      r.totales.neto,
    );
  });
  it('alta después del 15: pago sin anticipo no es parcial y conserva el neto real', () => {
    const e = entrada('6500');
    e.mes = '2026-10';
    e.inicio = '2026-10-01';
    e.fin = '2026-10-31';
    e.empleado.ingreso = '2026-10-24';
    e.tipoPago = 'PAGO';
    const r = resumir([guardado(e, calcularPago(e), 1)]);
    expect(r.parcial).toBe(false);
    expect(r.totales).toMatchObject({ ingresos: '1800.00', igss: '83.72' });
  });
  it('ausencia: DEV ya la resta; excluye también su línea de las deducciones, sin tocar la boleta', () => {
    const e = entrada();
    e.novedades.push({
      id: 1,
      idEmpleado: 1,
      tipo: 'AUSENCIA',
      mes: e.mes,
      monto: '333.33',
      cantidad: '1',
      autorizacion: 'APROBADA',
      idSuscripcion: null,
      descripcion: 'Sin goce',
    });
    const ns = mes(e);
    const r = resumir(ns);
    expect(r.totales.ingresos).toBe('9908.34'); // 10000 - 333.33 + 241.67
    expect(new Decimal(r.totales.ingresos).minus(r.totales.descuentos).toFixed(2)).toBe(
      r.totales.neto,
    );
  });
  it('año: consolida cada mes por separado, conserva centavos y no duplica IDs', () => {
    const enero = mes(entrada('10000.01'));
    const e = entrada('10000.01');
    e.mes = '2026-02';
    e.inicio = '2026-02-01';
    e.fin = '2026-02-28';
    const febrero = mes(e, 3);
    const r = resumir([...enero, ...febrero, enero[0]!]);
    expect(r.registros).toHaveLength(2);
    expect(r.totales.ingresos).toBe('20500.02');
    expect(r.empleados).toBe(1);
  });
  it('devolución ISR: reduce la deducción efectiva y conserva DEV, netos e importes con signo', () => {
    const e = entrada();
    Object.assign(e, {
      mes: '2026-12',
      inicio: '2026-12-01',
      fin: '2026-12-31',
      acumulado: { renta: '112750.00', igss: '5313.00', isr: '5000.00' },
    });
    const r = resumir(mes(e));
    expect(r.totales).toMatchObject({
      ingresos: '10250.00',
      igss: '483.00',
      isr: '-1539.80',
      descuentos: '-1056.80',
      neto: '11306.80',
    });
  });
  it('v0: las quincenas devengan por separado; no aplica la regla del anticipo v1', () => {
    const e = entrada('3000');
    e.fin = '2026-01-15';
    const uno = guardado(e, calcularNomina(e), 1);
    e.inicio = '2026-01-16';
    e.fin = '2026-01-31';
    const dos = guardado(e, calcularNomina(e), 2);
    expect(resumir([uno, dos]).totales).toMatchObject({
      ingresos: '3250.00',
      igss: '144.90',
      neto: '3105.10',
      dias: '30.00',
    });
  });
  it('prestaciones: separadas del salario; dashboard e IGSS las excluyen', () => {
    const ns = mes();
    const prestacion = {
      ...movimientoDesdeSnapshot(ns[0]!),
      id: 3,
      tipoPago: 'BONO_14',
      ingresos: '10000.00',
      neto: '10000.00',
    };
    const movimientos = [...ns.map(movimientoDesdeSnapshot), prestacion];
    expect(resumenMensualNomina(movimientos).totales.ingresos).toBe('20250.00');
    expect(resumenMensualNomina(movimientos, false).totales.ingresos).toBe('10250.00');
  });
});
