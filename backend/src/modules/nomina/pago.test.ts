import { describe, it, expect } from 'vitest';
import { calcularPago } from './pago.calculo.js';
import type { EntradaPago } from './pago.calculo.js';
import { entradaPrueba } from './nomina.fixture.js';
import { simularSchema, pagarSchema, revertirPagoSchema } from './pago.schemas.js';
function entrada(): EntradaPago {
  const e = entradaPrueba('10000');
  e.parametros.push({
    id: 100,
    codigo: 'ANTICIPO_PORCENTAJE',
    valor: '50',
    unidad: 'PORCENTAJE',
    desde: '2026-01-01',
    hasta: null,
  });
  e.conceptos.push({
    id: 100,
    codigo: 'ANTICIPO_PAGADO',
    nombre: 'Anticipo pagado',
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
    mes: '2026-01',
    tipoPago: 'ANTICIPO',
    anticipo: '0.00',
    novedades: [],
  };
}
function nov(e: EntradaPago, tipo: string, monto: string, cantidad = '1', mes = e.mes) {
  e.novedades.push({
    id: e.novedades.length + 1,
    idEmpleado: 1,
    tipo,
    mes,
    monto,
    cantidad,
    autorizacion: 'APROBADA',
    idSuscripcion: null,
    descripcion: tipo,
  });
}
const importe = (e: ReturnType<typeof calcularPago>, codigo: string) =>
  e.lineas.find((l) => l.concepto.codigo === codigo)?.monto;
describe('A11: esperados independientes (aritmética decimal documentada)', () => {
  it('Q10000: anticipo 5000+250 sin descuentos; mensual IGSS 483 e ISR 288.35', () => {
    const e = entrada(),
      a = calcularPago(e);
    expect(a.neto).toBe('5250.00');
    expect(a.descuentos).toBe('0.00');
    expect(a.baseIgss).toBe('0.00');
    expect(a.isr.retencion).toBe('0.00');
    e.tipoPago = 'PAGO';
    e.anticipo = '5250.00';
    const p = calcularPago(e);
    // 123000 renta - 48000 personal - 5796 IGSS = 69204; 5%=3460.20; /12=288.35.
    expect(p.isr).toMatchObject({
      renta: '123000.00',
      igss: '5796.00',
      imponible: '69204.00',
      anual: '3460.20',
      restantes: 12,
      retencion: '288.35',
    });
    expect(importe(p, 'IGSS_LABORAL')).toBe('483.00');
    expect(p.neto).toBe('4228.65');
    expect(p.devengado).toBe('10250.00');
  });
  it('comisiones y horas antes y después del anticipo integran IGSS una sola vez', () => {
    const e = entrada();
    nov(e, 'COMISION', '1000');
    nov(e, 'HORAS_EXTRA', '500', '8');
    expect(calcularPago(e).neto).toBe('6750.00');
    e.tipoPago = 'PAGO';
    e.anticipo = '6750.00';
    const p = calcularPago(e);
    expect(p.devengado).toBe('11750.00');
    expect(importe(p, 'IGSS_LABORAL')).toBe('555.45');
    expect(p.neto).toBe('4150.25');
    nov(e, 'COMISION', '200');
    nov(e, 'HORAS_EXTRA', '125', '2');
    const despues = calcularPago(e);
    expect(despues.devengado).toBe('12075.00');
    expect(despues.baseIgss).toBe('11825.00');
    expect(importe(despues, 'IGSS_LABORAL')).toBe('571.15');
    expect(despues.isr.retencion).toBe('295.59');
    expect(despues.neto).toBe('4458.26');
  });
  it('ausencia sin goce resta 10000/30, reduce BI y base IGSS', () => {
    const e = entrada();
    nov(e, 'AUSENCIA', '333.33');
    expect(calcularPago(e).neto).toBe('5241.67');
    e.tipoPago = 'PAGO';
    e.anticipo = '5250.00';
    const p = calcularPago(e);
    expect(p.devengado).toBe('9908.34');
    expect(importe(p, 'BONIFICACION_INCENTIVO')).toBe('241.67');
    expect(importe(p, 'IGSS_LABORAL')).toBe('466.90');
    expect(p.isr.retencion).toBe('286.99');
    expect(p.neto).toBe('3904.45');
  });
  it('con goce no resta ni reduce bonificación', () => {
    const e = entrada();
    nov(e, 'AUSENCIA', '0', '2');
    e.tipoPago = 'PAGO';
    expect(calcularPago(e).devengado).toBe('10250.00');
  });
  it('ingreso 16 enero: 16 días de contrato/30, con BI según fórmula A11', () => {
    const e = entrada();
    e.empleado.ingreso = '2026-01-16';
    expect(calcularPago(e).neto).toBe('2916.67');
    e.tipoPago = 'PAGO';
    e.anticipo = '2916.67';
    const p = calcularPago(e);
    expect(p.devengado).toBe('5583.33');
    expect(importe(p, 'IGSS_LABORAL')).toBe('257.60');
    expect(p.neto).toBe('2139.21');
  });
  it('A11 combinado: ingreso parcial y AUS usan SB prorrateado también para la ausencia', () => {
    const e = entrada();
    e.empleado.ingreso = '2026-01-16';
    e.tipoPago = 'PAGO';
    e.anticipo = '2916.67';
    nov(e, 'AUSENCIA', '333.33');
    const p = calcularPago(e);
    expect(importe(p, 'AUSENCIA_SIN_GOCE')).toBe('177.78');
    expect(p.devengado).toBe('5397.22');
    expect(importe(p, 'IGSS_LABORAL')).toBe('249.01');
    expect(p.isr.retencion).toBe('269.11');
    expect(p.neto).toBe('1962.43');
  });
  it.each(['2026-02', '2028-02', '2026-04', '2026-01'])(
    'mes completo %s conserva salario mensual',
    (mes) => {
      const e = entrada();
      e.mes = mes;
      e.inicio = `${mes}-01`;
      e.fin = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0))
        .toISOString()
        .slice(0, 10);
      expect(calcularPago(e).neto).toBe('5250.00');
    },
  );
  it('parqueo y tienda se cobran únicamente en el pago', () => {
    const e = entrada();
    nov(e, 'PARQUEO', '150');
    nov(e, 'CONSUMO_TIENDA', '82.25');
    expect(calcularPago(e).neto).toBe('5250.00');
    e.tipoPago = 'PAGO';
    e.anticipo = '5250.00';
    expect(calcularPago(e).neto).toBe('3996.40');
  });
  it('última cuota menor liquida saldo, otros descuentos fijos mensuales', () => {
    const e = entrada();
    e.descuentos = [
      { id: 1, cuota: 8, codigo: 'PRESTAMO', modalidad: 'CUOTAS', monto: '100', saldo: '33.34' },
      { id: 2, cuota: null, codigo: 'EMBARGO', modalidad: 'FIJO', monto: '50', saldo: null },
    ];
    expect(calcularPago(e).neto).toBe('5250.00');
    e.tipoPago = 'PAGO';
    e.anticipo = '5250.00';
    const p = calcularPago(e);
    expect(importe(p, 'PRESTAMO')).toBe('33.34');
    expect(p.neto).toBe('4145.31');
  });
  it('neto negativo bloquea únicamente el cálculo del empleado', () => {
    const e = entrada();
    e.tipoPago = 'PAGO';
    nov(e, 'CONSUMO_TIENDA', '20000');
    expect(() => calcularPago(e)).toThrow(/negativo.*Ajusta/);
    expect(calcularPago(entrada()).neto).toBe('5250.00');
  });
  it('retroactivos identificados e incluidos en el mes de aplicación', () => {
    const e = entrada();
    e.mes = '2026-02';
    e.inicio = '2026-02-01';
    e.fin = '2026-02-28';
    nov(e, 'COMISION', '100', '1', '2026-01');
    expect(
      calcularPago(e).lineas.find((l) => l.descripcion.includes('Retroactiva 2026-01'))?.monto,
    ).toBe('100.00');
  });
  it('diciembre recalcula contra ingresos y retención realmente acumulados', () => {
    const e = entrada();
    e.mes = '2026-12';
    e.inicio = '2026-12-01';
    e.fin = '2026-12-31';
    e.tipoPago = 'PAGO';
    e.anticipo = '5250.00';
    e.acumulado = { renta: '112750', igss: '5313', isr: '3171.85' };
    nov(e, 'COMISION', '1000');
    const p = calcularPago(e);
    expect(p.isr).toMatchObject({
      restantes: 1,
      futuro: '0.00',
      anual: '3507.79',
      retencion: '335.94',
    });
    expect(p.neto).toBe('5132.76');
  });
  it('devuelve ISR en exceso en diciembre', () => {
    const e = entrada();
    e.mes = '2026-12';
    e.inicio = '2026-12-01';
    e.fin = '2026-12-31';
    e.tipoPago = 'PAGO';
    e.acumulado = { renta: '112750', igss: '5313', isr: '3600' };
    const p = calcularPago(e);
    expect(importe(p, 'ISR_DEVOLUCION')).toBe('139.80');
    expect(p.isr.retencion).toBe('0.00');
  });
  it('consulta vigencias de IGSS, BI, anticipo, deducciones y tramos sin constantes de respaldo', () => {
    const e = entrada();
    e.parametros = e.parametros.filter((p) => p.codigo !== 'ANTICIPO_PORCENTAJE');
    expect(() => calcularPago(e)).toThrow(/ANTICIPO_PORCENTAJE/);
    const f = entrada();
    f.parametros.find((p) => p.codigo === 'BONIFICACION_INCENTIVO_MENSUAL')!.valor = '300';
    f.parametros.find((p) => p.codigo === 'ANTICIPO_PORCENTAJE')!.valor = '40';
    expect(calcularPago(f).neto).toBe('4300.00');
    f.tipoPago = 'PAGO';
    f.parametros.find((p) => p.codigo === 'IGSS_LABORAL_PORCENTAJE')!.valor = '5';
    f.deducciones = [{ id: 1, tipo: 'SEGURO', monto: '1000', tope: null }];
    const p = calcularPago(f);
    expect(importe(p, 'IGSS_LABORAL')).toBe('500.00');
    expect(p.isr.acreditadas).toBe('1000.00');
  });
  it('revalora horas con recargo vigente de BD y conserva cantidad sin redondear valor hora', () => {
    const e = entrada();
    nov(e, 'HORAS_EXTRA', '1', '8');
    e.parametros.find((p) => p.codigo === 'HORAS_EXTRA_RECARGO_PORCENTAJE')!.valor = '75';
    const p = calcularPago(e);
    expect(importe(p, 'HORAS_EXTRA')).toBe('583.33');
    expect(p.neto).toBe('5833.33');
    expect(
      p.parametros.some((p) => p.codigo === 'HORAS_EXTRA_RECARGO_PORCENTAJE' && p.valor === '75'),
    ).toBe(true);
  });
  it('escala ISR superior y exención con snapshot se leen de BD', () => {
    const e = entrada();
    e.salarios[0]!.monto = '40000';
    e.tipoPago = 'PAGO';
    e.anticipo = '20250.00';
    e.prestaciones = [{ id: 1, tipo: 'AGUINALDO', monto: '40000', exento: '40000' }];
    const p = calcularPago(e);
    expect(p.isr).toMatchObject({
      renta: '483000.00',
      igss: '23184.00',
      imponible: '411816.00',
      anual: '22827.12',
      retencion: '1902.26',
    });
    expect(p.neto).toBe('16165.74');
  });
  it('tasas del corte del pago y bonificación del corte del anticipo respetan vigencias', () => {
    const e = entrada();
    const igss = e.parametros.find((p) => p.codigo === 'IGSS_LABORAL_PORCENTAJE')!;
    igss.hasta = '2026-01-15';
    e.parametros.push({ ...igss, id: 1001, valor: '5', desde: '2026-01-16', hasta: null });
    const bi = e.parametros.find((p) => p.codigo === 'BONIFICACION_INCENTIVO_MENSUAL')!;
    bi.hasta = '2026-01-15';
    e.parametros.push({ ...bi, id: 1002, valor: '300', desde: '2026-01-16', hasta: null });
    expect(calcularPago(e).neto).toBe('5250.00');
    e.tipoPago = 'PAGO';
    const p = calcularPago(e);
    expect(importe(p, 'IGSS_LABORAL')).toBe('500.00');
    expect(importe(p, 'BONIFICACION_INCENTIVO')).toBe('300.00');
  });
  it('proyecta egreso a mitad de junio con salario parcial y BI completa según A11', () => {
    const e = entrada();
    e.empleado.egreso = '2026-06-15';
    e.salarios[0]!.hasta = '2026-06-15';
    e.tipoPago = 'PAGO';
    e.anticipo = '5250.00';
    const p = calcularPago(e);
    expect(p.isr).toMatchObject({
      renta: '56500.00',
      futuro: '46250.00',
      igss: '2656.50',
      imponible: '5843.50',
      anual: '292.18',
      restantes: 6,
      retencion: '48.70',
    });
    expect(p.neto).toBe('4468.30');
  });
  it('faltas de horario/salario/autorización generan mensajes claros', () => {
    for (const campo of ['horarios', 'salarios'] as const) {
      const e = entrada();
      e[campo] = [];
      expect(() => calcularPago(e)).toThrow(/vigencia/);
    }
    const e = entrada();
    nov(e, 'COMISION', '100');
    e.novedades[0]!.autorizacion = 'PENDIENTE';
    expect(() => calcularPago(e)).toThrow(/Autoriza/);
  });
});
describe('A11: validación de entrada', () => {
  it('objetivo coherente y prestaciones futuras bloqueadas', () => {
    expect(
      simularSchema.safeParse({ mes: '2026-01', tipoPago: 'PAGO', objetivo: 'EMPLEADO' }).success,
    ).toBe(false);
    expect(
      simularSchema.safeParse({ mes: '2026-01', tipoPago: 'BONO_14', objetivo: 'TODOS' }).success,
    ).toBe(false);
  });
  it('confirmar exige revisión explícita de novedades y hash; reversión exige motivo', () => {
    const d = {
      mes: '2026-01',
      tipoPago: 'PAGO',
      objetivo: 'TODOS',
      hash: 'a'.repeat(64),
      confirmado: true,
    };
    expect(pagarSchema.safeParse(d).success).toBe(false);
    expect(pagarSchema.safeParse({ ...d, novedadesCompletas: true }).success).toBe(true);
    expect(revertirPagoSchema.safeParse({ confirmado: true, motivo: 'corto' }).success).toBe(false);
  });
});
