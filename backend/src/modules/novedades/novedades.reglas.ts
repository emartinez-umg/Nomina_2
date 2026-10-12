import { Decimal } from 'decimal.js';
import { dinero } from '../../shared/utils/dinero.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';

export function quincena(fecha: string) {
  const [anio, mes, dia] = fecha.split('-').map(Number) as [number, number, number];
  const prefijo = `${anio}-${String(mes).padStart(2, '0')}`;
  return {
    inicio: `${prefijo}-${dia <= 15 ? '01' : '16'}`,
    fin: `${prefijo}-${dia <= 15 ? '15' : new Date(Date.UTC(anio, mes, 0)).getUTCDate()}`,
    numero: dia <= 15 ? 1 : 2,
  };
}
export const sumarDias = (fecha: string, dias: number) =>
  new Date(new Date(`${fecha}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
export const diasInclusivos = (inicio: string, fin: string) =>
  Math.round((Date.parse(fin) - Date.parse(inicio)) / 86400000) + 1;
export const traslapan = (a: string, b: string, c: string, d: string) => a <= d && c <= b;

export function amortizar(monto: string, cuotas: number, inicio: string) {
  if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 600)
    throw new ErrorConflicto('Indica entre 1 y 600 cuotas.');
  const total = new Decimal(monto);
  if (!total.gt(0) || total.decimalPlaces() > 2 || total.gt('9999999999.99'))
    throw new ErrorConflicto('El monto debe ser positivo y tener hasta dos decimales.');
  // Se distribuyen centavos enteros; el residuo queda en la última cuota.
  const regular = total.mul(100).div(cuotas).floor().div(100);
  if (regular.lt('0.01'))
    throw new ErrorConflicto(
      'El monto debe permitir al menos Q 0.01 por cuota. Reduce las cuotas.',
    );
  let saldo = total;
  let fecha = quincena(inicio).fin;
  return Array.from({ length: cuotas }, (_, i) => {
    const importe = i === cuotas - 1 ? saldo : regular;
    saldo = saldo.minus(importe);
    const fila = { numero: i + 1, fecha, monto: dinero(importe), saldo: dinero(saldo) };
    if (i < cuotas - 1) {
      const siguiente = sumarDias(fecha, 1);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(siguiente))
        throw new ErrorConflicto('El calendario de cuotas excede el año 9999.');
      fecha = quincena(siguiente).fin;
    }
    return fila;
  });
}
export function descontarSaldo(saldo: string, monto: string) {
  const pago = new Decimal(monto);
  if (!pago.gt(0) || pago.decimalPlaces() > 2 || pago.gt(saldo))
    throw new ErrorConflicto('El cobro debe ser positivo y no superar el saldo pendiente.');
  const nuevo = new Decimal(saldo).minus(pago);
  return { saldo: dinero(nuevo), estado: nuevo.isZero() ? 'LIQUIDADO' : 'VIGENTE' };
}
export function calcularHoraExtra(
  salario: string,
  horas: string,
  diasMes: string,
  horasJornada: string,
  recargo: string,
) {
  if (
    [salario, horas, diasMes, horasJornada].some((v) => !new Decimal(v).gt(0)) ||
    new Decimal(recargo).lt(0)
  )
    throw new ErrorConflicto('Revisa salario, horas y parámetros vigentes de la jornada.');
  const valorHora = new Decimal(salario).div(diasMes).div(horasJornada);
  return {
    valorHora: dinero(valorHora),
    recargo,
    monto: dinero(valorHora.mul(horas).mul(new Decimal(recargo).div(100).plus(1))),
  };
}
