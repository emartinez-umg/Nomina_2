import { Decimal } from 'decimal.js';
import type { Connection } from 'oracledb';
import { dinero } from '../../shared/utils/dinero.js';
import type { Query } from './nomina.schemas.js';
import { movimientosResumen } from './nomina.repository.js';
import type { Guardado } from './nomina.repository.js';
import type { Snapshot } from './nomina.exportar.js';
import type { ResultadoPago } from './pago.calculo.js';

/** Importes archivados de versiones vigentes; consultar no recalcula ni modifica pagos. */
export interface MovimientoResumen {
  id: number;
  idEmpleado: number;
  idDepartamento: number;
  empleado: string;
  departamento: string;
  inicio: string;
  fin: string;
  motor: string;
  tipoPago: string | null;
  ingresos: string;
  descuentos: string;
  neto: string;
  patronal: string;
  devengado: string | null;
  anticipoPagado: string;
  devolucionIsr: string;
  ausencias: string;
  baseIgss: string;
  dias: string;
  igss: string;
  isr: string;
  salarioBase: string;
  comisiones: string;
  horasExtra: string;
}
const importes = [
  'ingresos',
  'descuentos',
  'neto',
  'patronal',
  'baseIgss',
  'dias',
  'igss',
  'isr',
  'salarioBase',
  'comisiones',
  'horasExtra',
] as const;
type Importes = Record<(typeof importes)[number], string>;
export function movimientoDesdeSnapshot(n: Guardado): MovimientoResumen {
  const s = JSON.parse(n.snapshot) as Snapshot;
  const e = s.entrada.empleado;
  const r = s.resultado as ResultadoPago;
  const suma = (codigo: string) =>
    dinero(
      r.lineas
        .filter((l) => l.concepto.codigo === codigo)
        .reduce((t, l) => t.plus(l.monto), new Decimal(0)),
    );
  return {
    id: n.id,
    idEmpleado: n.idEmpleado,
    idDepartamento: e.idDepartamento,
    empleado: `${e.codigo} · ${e.nombres} ${e.apellidos}`,
    departamento: e.departamento,
    inicio: n.inicio,
    fin: n.fin,
    motor: r.tipoPago ? 'V1' : 'V0',
    tipoPago: r.tipoPago ?? null,
    ingresos: r.ingresos,
    descuentos: r.descuentos,
    neto: r.neto,
    patronal: r.patronal,
    devengado: r.devengado ?? null,
    baseIgss: r.baseIgss,
    dias: r.dias,
    anticipoPagado: suma('ANTICIPO_PAGADO'),
    devolucionIsr: suma('ISR_DEVOLUCION'),
    ausencias: suma('AUSENCIA_SIN_GOCE'),
    igss: suma('IGSS_LABORAL'),
    isr: dinero(new Decimal(suma('ISR')).minus(suma('ISR_DEVOLUCION'))),
    salarioBase: suma('SALARIO_BASE'),
    comisiones: suma('COMISION'),
    horasExtra: suma('HORAS_EXTRA'),
  };
}
export interface ResumenEmpleadoMes extends Importes {
  idEmpleado: number;
  idDepartamento: number;
  empleado: string;
  departamento: string;
  mes: string;
  tipo: string;
  parcial: boolean;
  boletas: number[];
}

/** C1.3: el anticipo es parte del devengado mensual y su neteo no es una deducción. */
export function resumenMensualNomina(movimientos: MovimientoResumen[], incluirPrestaciones = true) {
  const grupos = new Map<string, MovimientoResumen[]>();
  for (const m of movimientos) {
    const prestacion = m.tipoPago === 'BONO_14' || m.tipoPago === 'AGUINALDO';
    if (prestacion && !incluirPrestaciones) continue;
    const clave = `${m.idEmpleado}:${m.inicio.slice(0, 7)}:${prestacion ? m.tipoPago : 'SALARIO'}`;
    const grupo = grupos.get(clave) ?? [];
    if (!grupo.some((g) => g.id === m.id)) grupo.push(m);
    grupos.set(clave, grupo);
  }
  const registros: ResumenEmpleadoMes[] = [];
  for (const grupo of grupos.values()) {
    const pagos = grupo.filter((m) => m.motor === 'V1' && m.tipoPago === 'PAGO');
    const primero = pagos.at(-1) ?? grupo.at(-1)!;
    const anticipos = grupo.filter((m) => m.motor === 'V1' && m.tipoPago === 'ANTICIPO');
    const efectivos = grupo.filter((m) => !anticipos.includes(m));
    // En v0 cada quincena devenga su propio salario. Las prestaciones conservan su identidad.
    const fuenteIngresos = pagos.length ? efectivos : grupo;
    const total = Object.fromEntries(importes.map((k) => [k, new Decimal(0)])) as Record<
      (typeof importes)[number],
      Decimal
    >;
    for (const m of fuenteIngresos) {
      const mensual = m.motor === 'V1' && m.tipoPago === 'PAGO';
      total.ingresos = total.ingresos.plus(
        mensual ? (m.devengado ?? new Decimal(m.ingresos).minus(m.ausencias)) : m.ingresos,
      );
      // AUS ya está restada en DEV; no se deduce otra vez del ingreso del mes.
      total.descuentos = total.descuentos.plus(
        new Decimal(m.descuentos)
          .minus(m.anticipoPagado)
          .minus(mensual ? m.ausencias : 0)
          .minus(mensual ? m.devolucionIsr : 0),
      );
      for (const k of importes.filter((k) => !['ingresos', 'descuentos', 'neto'].includes(k)))
        total[k] = total[k].plus(m[k]);
    }
    for (const m of grupo) total.neto = total.neto.plus(m.neto);
    registros.push({
      idEmpleado: primero.idEmpleado,
      idDepartamento: primero.idDepartamento,
      empleado: primero.empleado,
      departamento: primero.departamento,
      mes: primero.inicio.slice(0, 7),
      tipo: ['BONO_14', 'AGUINALDO'].includes(primero.tipoPago ?? '')
        ? primero.tipoPago!
        : 'SALARIO',
      parcial: anticipos.length > 0 && pagos.length === 0,
      boletas: grupo.map((m) => m.id),
      ...(Object.fromEntries(importes.map((k) => [k, dinero(total[k])])) as Importes),
    });
  }
  const totales = Object.fromEntries(
    importes.map((k) => [k, dinero(registros.reduce((s, r) => s.plus(r[k]), new Decimal(0)))]),
  ) as Importes;
  return {
    registros,
    totales,
    parcial: registros.some((r) => r.parcial),
    empleados: new Set(registros.map((r) => r.idEmpleado)).size,
  };
}

export async function consultarResumenMensual(
  c: Connection,
  q: Query,
  usuario?: number,
  periodo?: number,
  opciones?: { soloSalarios?: boolean; desde?: string; hasta?: string; soloConfirmados?: boolean },
) {
  return resumenMensualNomina(
    await movimientosResumen(c, q, usuario, periodo, opciones),
    !opciones?.soloSalarios,
  );
}
