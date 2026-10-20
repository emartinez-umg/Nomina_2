import { Decimal } from 'decimal.js';
import type { Connection } from 'oracledb';
import { dinero } from '../../shared/utils/dinero.js';
import { horasDiariasEnFecha } from '../../shared/horarios/horas.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import { fechas, vigente } from '../nomina/nomina.calculo.js';
import * as nomina from '../nomina/nomina.repository.js';
import type { Entrada, Resultado, Periodo } from '../nomina/nomina.types.js';
import { siguiente, valor } from './prestaciones.calculo.js';
import type { Devengado } from './prestaciones.calculo.js';
import * as repo from './prestaciones.repository.js';

export function importeNovedadesPrestaciones(
  entrada: Entrada,
  novedades: Awaited<ReturnType<typeof repo.mensual>>['novedades'],
  corte: string,
) {
  let suma = new Decimal(0);
  for (const n of novedades) {
    if (n.autorizacion !== 'APROBADA')
      throw new ErrorConflicto('Autoriza las novedades pendientes antes de calcular prestaciones.');
    if (
      !vigente(
        entrada.conceptos.filter((k) => k.codigo === n.tipo),
        corte,
        n.tipo,
      ).prestaciones
    )
      continue;
    if (n.tipo === 'HORAS_EXTRA') {
      const salario = vigente(entrada.salarios, corte, 'salario para horas extra'),
        jornada = horasDiariasEnFecha(entrada.jornadas ?? [], corte);
      if (jornada.lte(0))
        throw new ErrorConflicto('Completa el horario para valorar las horas extra.');
      suma = suma.plus(
        new Decimal(n.cantidad)
          .mul(salario.monto)
          .div(valor(entrada.parametros, 'SALARIO_DIAS_MES', corte, 'DIAS'))
          .div(jornada)
          .mul(
            new Decimal(1).plus(
              valor(entrada.parametros, 'HORAS_EXTRA_RECARGO_PORCENTAJE', corte, 'PORCENTAJE').div(
                100,
              ),
            ),
          ),
      );
    } else suma = suma.plus(n.monto);
  }
  return suma;
}

// Fuentes A12: contrato y vigencias salariales, sin exigir apertura fiscal ni una nómina previa.
export async function historiaMensual(
  c: Connection,
  e: repo.Empleado,
  inicio: string,
  fin: string,
  historica: (
    desde: string,
    hasta: string,
  ) => Promise<{ ingresos: Devengado[]; fuentes: unknown[]; nominas: number[] }>,
) {
  const ingresos: Devengado[] = [],
    fuentes: unknown[] = [],
    nominas: number[] = [];
  let cursor = inicio;
  while (cursor <= fin) {
    const mes = cursor.slice(0, 7),
      primero = `${mes}-01`;
    const ultimo = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0))
      .toISOString()
      .slice(0, 10);
    const hasta = ultimo < fin ? ultimo : fin;
    const p1 = await repo.periodo(c, primero),
      p2 = await repo.periodo(c, `${mes}-16`);
    if ([p1, p2].some((p) => p?.motor === 'V0')) {
      const h = await historica(cursor, hasta);
      ingresos.push(...h.ingresos);
      fuentes.push(...h.fuentes);
      nominas.push(...h.nominas);
      cursor = siguiente(hasta);
      continue;
    }
    const p = { id: 0, inicio: cursor, fin: hasta, estado: 'ABIERTO', version: 0 } as Periodo;
    const entrada = (await nomina.fuentes(c, p, e.id))[0];
    if (!entrada) throw new ErrorConflicto(`Faltan fuentes salariales desde ${cursor}.`);
    const h = await repo.mensual(c, e.id, mes);
    const activoInicio = e.ingreso > primero ? e.ingreso : primero;
    const activoFin = [e.egreso ?? ultimo, ultimo, fin].sort()[0]!;
    if (h.pago && cursor === activoInicio && hasta === activoFin) {
      const s = JSON.parse(h.pago.snapshot) as {
        entrada: Entrada & { novedades: { id: number; mes: string }[] };
        resultado: Resultado;
      };
      const lineas = s.resultado.lineas.filter(
        (l) => !l.novedad || s.entrada.novedades.find((n) => n.id === l.novedad)?.mes === mes,
      );
      let suma = lineas
        .filter((l) => l.concepto.prestaciones === 1)
        .reduce(
          (v, l) =>
            l.concepto.naturaleza === 'INGRESO'
              ? v.plus(l.monto)
              : l.concepto.codigo === 'AUSENCIA_SIN_GOCE'
                ? v.minus(l.monto)
                : v,
          new Decimal(0),
        );
      const meses = lineas
        .filter((l) => l.concepto.codigo === 'SALARIO_BASE')
        .reduce(
          (v, l) =>
            v.plus(
              new Decimal(l.cantidad).div(
                valor(s.entrada.parametros, 'SALARIO_DIAS_MES', l.fecha, 'DIAS'),
              ),
            ),
          new Decimal(0),
        );
      const adicionales = h.novedades.filter((n) => !lineas.some((l) => l.novedad === n.id));
      suma = suma.plus(importeNovedadesPrestaciones(entrada, adicionales, hasta));
      ingresos.push({ inicio: cursor, fin: hasta, monto: dinero(suma), meses: meses.toString() });
      fuentes.push({ pago: h.pago, adicionales });
      nominas.push(h.pago.id);
    } else {
      const dias = fechas(cursor, hasta),
        divisor = valor(entrada.parametros, 'SALARIO_DIAS_MES', hasta, 'DIAS');
      const peso = (
        cursor === primero && hasta === ultimo ? divisor : Decimal.min(divisor, dias.length)
      ).div(dias.length);
      let suma = new Decimal(0);
      for (const fecha of dias) {
        const salario = new Decimal(vigente(entrada.salarios, fecha, 'salario').monto);
        if (salario.lte(0)) throw new ErrorConflicto('Completa el salario vigente mayor que cero.');
        const ausencia = entrada.ausencias.find(
          (a) => a.inicio <= fecha && a.fin >= fecha && a.efecto === 'SIN_GOCE',
        );
        if (ausencia && ausencia.estado !== 'APROBADA')
          throw new ErrorConflicto(
            'Resuelve las ausencias pendientes antes de calcular prestaciones.',
          );
        if (!ausencia)
          suma = suma.plus(
            salario.div(valor(entrada.parametros, 'SALARIO_DIAS_MES', fecha, 'DIAS')).mul(peso),
          );
      }
      // Un importe mensual pertenece al cierre del mes o al egreso; nunca se reparte una comisión por días.
      if (hasta === activoFin)
        suma = suma.plus(importeNovedadesPrestaciones(entrada, h.novedades, hasta));
      ingresos.push({
        inicio: cursor,
        fin: hasta,
        monto: dinero(suma),
        meses: peso.mul(dias.length).div(divisor).toString(),
      });
      fuentes.push({ entrada, novedades: h.novedades });
    }
    cursor = siguiente(hasta);
  }
  return { ingresos, fuentes, nominas };
}
