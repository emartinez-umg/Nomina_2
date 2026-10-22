import { Decimal } from 'decimal.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import { dinero } from '../../shared/utils/dinero.js';
import { calcularNomina } from './nomina.calculo.js';
import { calcularPago } from './pago.calculo.js';
import type { Entrada, EstimacionFiscal, PeriodoFiscalEstimado } from './nomina.types.js';
import type { Historia } from './nomina.repository.js';

const siguiente = (fecha: string, dias = 1) =>
  new Date(Date.parse(fecha) + dias * 86400000).toISOString().slice(0, 10);
const campos = ['renta', 'igss', 'isr'] as const;

// Reconstruye solo salario e incentivo. Una retención estimada no certifica un pago real.
export function completarHistoria<T extends Entrada>(e: T): T {
  const historia = (e as Entrada & { historia?: Historia }).historia;
  if (!historia) return e;
  const inicioAnio = `${e.inicio.slice(0, 4)}-01-01`;
  let cursor = e.empleado.ingreso > inicioAnio ? e.empleado.ingreso : inicioAnio;
  const a = historia.apertura;
  if (a) {
    if (a.corte >= e.inicio)
      throw new ErrorConflicto(
        'La apertura fiscal se traslapa con esta quincena. Calcula desde el periodo siguiente al corte.',
      );
    cursor = siguiente(a.corte);
  }
  const acumulado = {
    renta: new Decimal(a?.renta ?? 0),
    igss: new Decimal(a?.igss ?? 0),
    isr: new Decimal(a?.isr ?? 0),
  };
  const periodos: PeriodoFiscalEstimado[] = [];
  const sumar = (n: { renta: string; igss: string; isr: string }) => {
    for (const k of campos) acumulado[k] = acumulado[k].plus(n[k]);
  };
  const completarHasta = (fin: string) => {
    while (cursor <= fin) {
      const conservado = historia.estimados?.find((n) => n.inicio === cursor && n.fin <= fin);
      if (conservado) {
        periodos.push(conservado);
        sumar(conservado);
        cursor = siguiente(conservado.fin);
        continue;
      }
      const mes = cursor.slice(0, 7),
        ultimo = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0))
          .toISOString()
          .slice(0, 10);
      const primeroActivo = e.empleado.ingreso > `${mes}-01` ? e.empleado.ingreso : `${mes}-01`;
      const mensual = 'tipoPago' in e && cursor === primeroActivo && fin >= ultimo;
      const corte = mensual ? ultimo : Number(cursor.slice(8)) <= 15 ? `${mes}-15` : ultimo;
      const hasta = corte < fin ? corte : fin;
      const entrada: Entrada = {
        ...e,
        inicio: mensual || Number(cursor.slice(8)) <= 15 ? `${mes}-01` : `${mes}-16`,
        fin: hasta,
        // El contrato y las vigencias prorratean el alta sin extender salarios hacia el pasado.
        empleado: { ...e.empleado, ingreso: cursor },
        acumulado: {
          renta: dinero(acumulado.renta),
          igss: dinero(acumulado.igss),
          isr: dinero(acumulado.isr),
        },
        ausencias: [],
        comisiones: [],
        horas: [],
        descuentos: [],
        deducciones: [],
        prestaciones: [],
      };
      delete entrada.estimacionFiscal;
      const r = mensual
        ? calcularPago({ ...entrada, mes, tipoPago: 'PAGO', anticipo: '0.00', novedades: [] })
        : calcularNomina(entrada);
      const renta = r.lineas.reduce(
        (s, l) => (l.concepto.isr && l.concepto.naturaleza === 'INGRESO' ? s.plus(l.monto) : s),
        new Decimal(0),
      );
      const n: PeriodoFiscalEstimado = {
        inicio: cursor,
        fin: hasta,
        renta: dinero(renta),
        igss: r.lineas.find((l) => l.concepto.codigo === 'IGSS_LABORAL')!.monto,
        isr: dinero(new Decimal(r.isr.retencion).minus(r.isr.restantes === 1 ? r.isr.exceso : 0)),
        metodo: mensual ? 'MENSUAL' : 'QUINCENAL',
      };
      periodos.push(n);
      sumar(n);
      cursor = siguiente(hasta);
    }
  };
  for (const n of [...historia.previos].sort((x, y) => x.inicio.localeCompare(y.inicio))) {
    // El primer periodo real puede comenzar antes del alta dentro de esa misma quincena.
    const inicioReal = n.inicio < e.empleado.ingreso ? e.empleado.ingreso : n.inicio;
    if ((a && n.inicio <= a.corte) || n.fin < n.inicio || n.fin >= e.inicio || inicioReal < cursor)
      throw new ErrorConflicto(
        'La historia fiscal contiene periodos traslapados. Revisa los pagos y la apertura.',
      );
    completarHasta(siguiente(n.inicio, -1));
    sumar(n);
    cursor = siguiente(n.fin);
  }
  completarHasta(siguiente(e.inicio, -1));
  const completa = {
    ...e,
    acumulado: {
      renta: dinero(acumulado.renta),
      igss: dinero(acumulado.igss),
      isr: dinero(acumulado.isr),
    },
  };
  delete completa.estimacionFiscal;
  if (periodos.length) {
    const estimacion: EstimacionFiscal = { periodos, renta: '0.00', igss: '0.00', isr: '0.00' };
    for (const k of campos)
      estimacion[k] = dinero(periodos.reduce((s, n) => s.plus(n[k]), new Decimal(0)));
    completa.estimacionFiscal = estimacion;
  }
  return completa;
}
