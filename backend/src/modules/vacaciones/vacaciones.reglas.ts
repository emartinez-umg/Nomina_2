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
  for (let n = 1; n <= 1200; n++) {
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
export function acumulaciones(
  ingreso: string,
  corte: string,
  parametros: Vigencia[],
  movimientos: Movimiento[],
) {
  const inicial = movimientos.find((m) => m.tipo === 'SALDO_INICIAL' && m.fecha <= corte);
  return aniversarios(ingreso, corte)
    .filter((f) => !inicial || f > inicial.fecha)
    .map((fecha) => {
      const clave = `MES:${fecha}`;
      const guardado = movimientos.find((m) => m.clave === clave);
      const p = parametros.filter((p) => p.desde <= fecha && (!p.hasta || p.hasta >= fecha));
      if (!guardado && (p.length !== 1 || !new Decimal(p[0]!.valor).gt(0)))
        throw new ErrorConflicto(
          `Falta una tasa de vacaciones vigente el ${fecha}. RRHH debe configurar la vigencia histórica o cargar un saldo inicial al día de hoy.`,
        );
      return { fecha, clave, dias: dinero(guardado?.dias ?? p[0]!.valor) };
    });
}
export function calcularSaldo(
  ingreso: string,
  corte: string,
  parametros: Vigencia[],
  movimientos: Movimiento[],
) {
  const inicial = movimientos.find((m) => m.tipo === 'SALDO_INICIAL' && m.fecha <= corte);
  const acumulado = acumulaciones(ingreso, corte, parametros, movimientos).reduce(
    (s, m) => s.plus(m.dias),
    new Decimal(0),
  );
  const ajustes = movimientos.filter(
    (m) => m.tipo !== 'ACUMULACION' && m.fecha <= corte && (!inicial || m.fecha >= inicial.fecha),
  );
  const disponible = ajustes.reduce((s, m) => s.plus(m.dias), acumulado);
  return {
    acumulado: dinero(acumulado),
    saldoInicial: inicial?.dias ?? '0.00',
    movimientos: dinero(disponible.minus(acumulado)),
    disponible: dinero(disponible),
  };
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
