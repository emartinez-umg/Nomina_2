import { Decimal } from 'decimal.js';
import { dinero } from '../../shared/utils/dinero.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import { vigente } from '../nomina/nomina.calculo.js';
import type { Parametro } from '../nomina/nomina.types.js';
export type TipoAnual = 'AGUINALDO' | 'BONO_14';
export interface Devengado {
  inicio: string;
  fin: string;
  monto: string;
  meses?: string;
}
export interface Componente {
  concepto: string;
  inicio: string;
  fin: string;
  promedio: string;
  meses: string;
  tiempo: string;
  monto: string;
  exento: string;
  gravado: string;
}
export function valor(ps: Parametro[], codigo: string, fecha: string, unidad: string) {
  const p = vigente(
    ps.filter((p) => p.codigo === codigo),
    fecha,
    codigo,
  );
  if (p.unidad !== unidad || new Decimal(p.valor).lte(0))
    throw new ErrorConflicto(`Configura ${codigo} en ${unidad} con valor positivo.`);
  return new Decimal(p.valor);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const siguiente = (s: string) => iso(new Date(Date.parse(s) + 86400000));
export function ciclo(tipo: TipoAnual, anio: number, ps: Parametro[]) {
  const pref = tipo === 'BONO_14' ? 'BONO14' : tipo;
  const referencia = `${anio}-01-01`;
  const mes = valor(ps, `${pref}_INICIO_MES`, referencia, 'CANTIDAD').toNumber();
  const dia = valor(ps, `${pref}_INICIO_DIA`, referencia, 'DIAS').toNumber();
  if (!Number.isInteger(mes) || mes > 12 || dia !== 1)
    throw new ErrorConflicto('El ciclo de prestaciones requiere un mes válido y el día inicial 1.');
  const inicio = iso(new Date(Date.UTC(anio - 1, mes - 1, dia)));
  const fin = iso(new Date(Date.UTC(anio, mes - 1, dia - 1)));
  const pagoMes = valor(ps, `${pref}_PAGO_MES`, fin, 'CANTIDAD').toNumber();
  const pagoDia = valor(ps, `${pref}_PAGO_DIA`, fin, 'DIAS').toNumber();
  const limitePago = iso(new Date(Date.UTC(anio, pagoMes - 1, pagoDia)));
  return { inicio, fin, limitePago };
}
// Fracciones del mes calendario: un mes completo equivale a uno, incluso febrero.
export function mesesEquivalentes(inicio: string, fin: string) {
  if (fin < inicio) return new Decimal(0);
  let total = new Decimal(0),
    cursor = inicio;
  while (cursor <= fin) {
    const d = new Date(cursor),
      y = d.getUTCFullYear(),
      m = d.getUTCMonth();
    const ultimo = iso(new Date(Date.UTC(y, m + 1, 0)));
    const hasta = ultimo < fin ? ultimo : fin;
    total = total.plus(
      new Decimal((Date.parse(hasta) - Date.parse(cursor)) / 86400000 + 1).div(
        new Date(ultimo).getUTCDate(),
      ),
    );
    cursor = siguiente(hasta);
  }
  return total;
}
export function promedio(devengados: Devengado[], inicio: string, fin: string) {
  let suma = new Decimal(0),
    cursor = inicio;
  const seleccionados = devengados.filter((d) => d.fin >= inicio && d.inicio <= fin);
  for (const d of [...seleccionados].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    if (d.fin < inicio || d.inicio > fin) continue;
    const desde = d.inicio < inicio ? inicio : d.inicio;
    const hasta = d.fin > fin ? fin : d.fin;
    if (desde !== cursor)
      throw new ErrorConflicto(`Falta historia de ingresos o hay traslapes desde ${cursor}.`);
    // Solo se aceptan importes del tramo exacto; nunca se prorratea una comisión por días.
    if (d.inicio !== desde || d.fin !== hasta)
      throw new ErrorConflicto('Los ingresos deben corresponder al rango exacto de cálculo.');
    suma = suma.plus(d.monto);
    cursor = siguiente(hasta);
  }
  if (cursor <= fin || suma.lt(0))
    throw new ErrorConflicto(`Completa la historia de ingresos desde ${cursor}.`);
  const meses = seleccionados.every((d) => d.meses !== undefined)
    ? seleccionados.reduce((s, d) => s.plus(d.meses!), new Decimal(0))
    : mesesEquivalentes(inicio, fin);
  if (meses.lte(0)) throw new ErrorConflicto('El rango no contiene tiempo laborado.');
  return { suma, meses, promedio: suma.div(meses) };
}
export function calcularAnual(
  tipo: TipoAnual,
  inicio: string,
  fin: string,
  ingresos: Devengado[],
  ps: Parametro[],
  salario: string,
  exentoUtilizado = '0',
): Componente {
  const pref = tipo === 'BONO_14' ? 'BONO14' : tipo;
  const p = promedio(ingresos, inicio, fin);
  const mesesAnio = valor(ps, 'PRESTACIONES_MESES_ANIO', fin, 'MESES');
  const mesesPromedio = valor(ps, `${pref}_PROMEDIO_MESES`, fin, 'MESES');
  if (!mesesAnio.eq(mesesPromedio) || p.meses.gt(mesesAnio))
    throw new ErrorConflicto('El ciclo y los meses de promedio deben corresponder a un año.');
  const tiempo = Decimal.min(1, p.meses.div(mesesAnio));
  const monto = new Decimal(
    dinero(
      p.promedio
        .mul(tiempo)
        .mul(valor(ps, `${pref}_PORCENTAJE`, fin, 'PORCENTAJE'))
        .div(100),
    ),
  );
  const limite = new Decimal(salario).mul(valor(ps, `ISR_EXENCION_${pref}_MESES`, fin, 'MESES'));
  const exento = new Decimal(
    dinero(Decimal.min(monto, Decimal.max(0, limite.minus(exentoUtilizado)))),
  );
  return {
    concepto: tipo,
    inicio,
    fin,
    promedio: dinero(p.promedio),
    meses: p.meses.toFixed(6),
    tiempo: tiempo.toFixed(6),
    monto: dinero(monto),
    exento: dinero(exento),
    gravado: dinero(monto.minus(exento)),
  };
}
export function ventanaIndemnizacion(corte: string, meses: number) {
  const d = new Date(corte),
    dia = d.getUTCDate();
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - meses + 1, 0));
  const inicio = new Date(
    Date.UTC(ultimo.getUTCFullYear(), ultimo.getUTCMonth(), Math.min(dia, ultimo.getUTCDate())),
  );
  return siguiente(iso(inicio));
}
export function tiempoLaborado(ingreso: string, corte: string) {
  if (corte < ingreso) throw new ErrorConflicto('El egreso no puede ser anterior al ingreso.');
  const i = new Date(ingreso),
    fin = new Date(siguiente(corte));
  let anios = fin.getUTCFullYear() - i.getUTCFullYear();
  const aniversario = (n: number) => {
    const ultimo = new Date(Date.UTC(i.getUTCFullYear() + n, i.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(
      Date.UTC(i.getUTCFullYear() + n, i.getUTCMonth(), Math.min(i.getUTCDate(), ultimo)),
    );
  };
  if (aniversario(anios) > fin) anios--;
  return new Decimal(anios).plus(
    new Decimal(fin.getTime() - aniversario(anios).getTime()).div(
      aniversario(anios + 1).getTime() - aniversario(anios).getTime(),
    ),
  );
}
export function calcularIndemnizacion(
  ingreso: string,
  corte: string,
  inicio: string,
  ingresos: Devengado[],
  ps: Parametro[],
  corresponde: boolean,
): Componente {
  const p = promedio(ingresos, inicio, corte),
    tiempo = tiempoLaborado(ingreso, corte);
  const monto = corresponde
    ? p.promedio
        .mul(tiempo)
        .mul(valor(ps, 'INDEMNIZACION_PORCENTAJE', corte, 'PORCENTAJE'))
        .div(100)
    : new Decimal(0);
  return {
    concepto: 'INDEMNIZACION',
    inicio,
    fin: corte,
    promedio: dinero(p.promedio),
    meses: p.meses.toFixed(6),
    tiempo: tiempo.toFixed(6),
    monto: dinero(monto),
    exento: dinero(monto),
    gravado: '0.00',
  };
}
export function totalizar(componentes: Componente[]) {
  const sumar = (k: 'monto' | 'exento' | 'gravado') =>
    dinero(componentes.reduce((s, c) => s.plus(c[k]), new Decimal(0)));
  const total = sumar('monto');
  if (new Decimal(total).gt('9999999999.99'))
    throw new ErrorConflicto('El total excede la capacidad monetaria del sistema.');
  return { total, exento: sumar('exento'), gravado: sumar('gravado') };
}
