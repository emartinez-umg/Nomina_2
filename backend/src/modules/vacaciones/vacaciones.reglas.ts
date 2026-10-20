export { diasLaboralesRango as calendarioLaboral } from '../../shared/horarios/calendario.js';
export type { Asignacion } from '../../shared/horarios/calendario.js';
import { Decimal } from 'decimal.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import { dinero } from '../../shared/utils/dinero.js';
import { traslapan } from '../novedades/novedades.reglas.js';
export { traslapan };
export interface Vigencia {
  desde: string;
  hasta: string | null;
  valor: string;
}
export interface Movimiento {
  fecha: string;
  tipo: string;
  dias: string;
  clave: string;
}
export function aniversarios(ingreso: string, corte: string) {
  const [y, m, d] = ingreso.split('-').map(Number) as [number, number, number];
  const fechas: string[] = [];
  for (let n = 1; ; n++) {
    const mes = new Date(Date.UTC(y, m - 1 + n, 1));
    const dia = Math.min(
      d,
      new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 0)).getUTCDate(),
    );
    const f = `${mes.toISOString().slice(0, 7)}-${String(dia).padStart(2, '0')}`;
    if (f > corte) break;
    fechas.push(f);
  }
  return fechas;
}
// La tasa vive en Oracle; consultar no materializa acumulaciones en el kardex.
export function calcularSaldo(
  ingreso: string,
  corte: string,
  parametros: Vigencia[],
  movimientos: Movimiento[],
) {
  const vigentes = parametros.filter((p) => p.desde <= corte && (!p.hasta || p.hasta >= corte));
  if (vigentes.length !== 1 || !new Decimal(vigentes[0]!.valor).gt(0))
    throw new ErrorConflicto(
      'Configura una única tasa de vacaciones vigente para la fecha de consulta.',
    );
  const tasa = new Decimal(vigentes[0]!.valor);
  const mesesCompletos = aniversarios(ingreso, corte).length;
  const acumulado = tasa.mul(mesesCompletos);
  const inicial = movimientos.find((m) => m.tipo === 'SALDO_INICIAL' && m.fecha <= corte);
  // Una apertura certifica el disponible de su fecha; no se pierde su historia.
  const apertura = inicial
    ? tasa.mul(aniversarios(ingreso, inicial.fecha).length).minus(inicial.dias)
    : new Decimal(0);
  const vigentesMov = movimientos.filter(
    (m) => m.fecha <= corte && (!inicial || m.fecha >= inicial.fecha),
  );
  const tomados = vigentesMov
    .filter((m) => ['DISFRUTE', 'REVERSO'].includes(m.tipo))
    .reduce((s, m) => s.minus(m.dias), new Decimal(0));
  const previas = vigentesMov
    .filter((m) => m.tipo === 'AJUSTE')
    .reduce((s, m) => s.minus(m.dias), apertura);
  const disponible = acumulado.minus(tomados).minus(previas);
  return {
    mesesCompletos,
    tasaMensual: dinero(tasa),
    acumulado: dinero(acumulado),
    tomados: dinero(tomados),
    previas: dinero(previas),
    solicitables: disponible.floor().toNumber(),
    saldoInicial: inicial ? dinero(inicial.dias) : '0.00',
    movimientos: dinero(disponible.minus(acumulado)),
    disponible: dinero(disponible),
  };
}
export function exigirCancelacion(estado: string, inicio: string, hoy: string) {
  if (estado !== 'APROBADA')
    throw new ErrorConflicto(
      'Solo se puede cancelar una solicitud aprobada. Recarga el historial.',
    );
  if (inicio <= hoy)
    throw new ErrorConflicto(
      'Las vacaciones ya comenzaron. Solo puedes cancelar antes del día de inicio.',
    );
}
export function exigirSaldo(saldo: string, dias: string) {
  if (!new Decimal(dias).gt(0) || new Decimal(dias).gt(saldo))
    throw new ErrorConflicto(
      `Saldo insuficiente: hay ${saldo} días disponibles y se solicitan ${dias}. Reduce el rango o revisa el kardex con RRHH.`,
    );
}
export function valorarPendientes(saldo: string, salario: string, divisor: string) {
  if (!new Decimal(salario).gt(0) || !new Decimal(divisor).gt(0))
    throw new ErrorConflicto('Configura salario y divisor mensual vigentes para el finiquito.');
  return {
    dias: dinero(Decimal.max(0, saldo)),
    salario,
    divisor,
    monto: dinero(Decimal.max(0, saldo).mul(salario).div(divisor)),
  };
}
