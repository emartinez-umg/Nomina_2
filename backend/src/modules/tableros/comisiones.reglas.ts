import { Decimal } from 'decimal.js';
import { dinero } from '../../shared/utils/dinero.js';
import { indiceMes, mesDeIndice } from './comisiones.schemas.js';
import type { ComisionesQuery } from './comisiones.schemas.js';
import type { MesVendedor, VendedorComision } from './comisiones.repository.js';

export function periodoComisiones(q: ComisionesQuery) {
  const inicio = indiceMes(q.desde),
    meses = indiceMes(q.hasta) - inicio + 1;
  return {
    desde: q.desde,
    hasta: q.hasta,
    meses,
    anterior: { desde: mesDeIndice(inicio - meses), hasta: mesDeIndice(inicio - 1) },
  };
}
export function variacionComisiones(actual: Decimal.Value, anterior: Decimal.Value) {
  const base = new Decimal(anterior);
  return base.isZero()
    ? new Decimal(actual).isZero()
      ? '0.00'
      : null
    : dinero(new Decimal(actual).minus(base).div(base).mul(100));
}
// DTO cerrado: no propaga campos adicionales que pudiera devolver un repository.
export const vendedorPublico = (f: VendedorComision): VendedorComision => ({
  idEmpleado: f.idEmpleado,
  codigo: f.codigo,
  nombre: f.nombre,
  puesto: f.puesto,
  idDepartamento: f.idDepartamento,
  departamento: f.departamento,
  centro: f.centro,
});
export function construirEstadisticasComisiones(q: ComisionesQuery, filas: MesVendedor[]) {
  const periodo = periodoComisiones(q);
  const meses = Array.from({ length: periodo.meses }, (_, i) =>
    mesDeIndice(indiceMes(q.desde) + i),
  );
  const grupos = new Map<
    number,
    { persona: VendedorComision; montos: Map<string, Decimal>; actuales: number }
  >();
  const totales = new Map<string, Decimal>();
  for (const f of filas) {
    const g = grupos.get(f.idEmpleado) ?? {
      persona: vendedorPublico(f),
      montos: new Map<string, Decimal>(),
      actuales: 0,
    };
    g.montos.set(f.mes, (g.montos.get(f.mes) ?? new Decimal(0)).plus(f.total));
    if (f.mes >= q.desde && f.mes <= q.hasta) g.actuales += f.cantidad;
    grupos.set(f.idEmpleado, g);
    totales.set(f.mes, (totales.get(f.mes) ?? new Decimal(0)).plus(f.total));
  }
  const indicadores = (montos: Map<string, Decimal>, conDatos: boolean) => {
    const serie = meses.map((mes) => {
      const mesAnterior = mesDeIndice(indiceMes(mes) - periodo.meses);
      return {
        mes,
        total: dinero(montos.get(mes) ?? 0),
        ...(q.comparar ? { mesAnterior, totalAnterior: dinero(montos.get(mesAnterior) ?? 0) } : {}),
      };
    });
    const total = serie.reduce((s, f) => s.plus(f.total), new Decimal(0));
    const anterior = q.comparar
      ? Array.from({ length: periodo.meses }, (_, i) =>
          mesDeIndice(indiceMes(periodo.anterior.desde) + i),
        ).reduce((s, mes) => s.plus(montos.get(mes) ?? 0), new Decimal(0))
      : null;
    const ordenados = [...serie].sort(
      (a, b) => new Decimal(b.total).cmp(a.total) || a.mes.localeCompare(b.mes),
    );
    return {
      total: dinero(total),
      promedioMensual: dinero(total.div(periodo.meses)),
      mejorMes: conDatos ? ordenados[0]! : null,
      peorMes: conDatos
        ? [...serie].sort(
            (a, b) => new Decimal(a.total).cmp(b.total) || a.mes.localeCompare(b.mes),
          )[0]!
        : null,
      totalAnterior: anterior === null ? null : dinero(anterior),
      variacionPorcentual: anterior === null ? null : variacionComisiones(total, anterior),
      sinBaseComparacion: anterior !== null && anterior.isZero() && !total.isZero(),
      serie,
    };
  };
  const vendedores = [...grupos.values()].filter((g) => g.actuales > 0);
  const resumen = {
    ...indicadores(totales, vendedores.length > 0),
    vendedoresConComision: vendedores.length,
  };
  const calcularVendedor = (id: number) => {
    const g = grupos.get(id);
    return indicadores(g?.montos ?? new Map(), (g?.actuales ?? 0) > 0);
  };
  const registros = vendedores.map((g) => {
    const resultado = calcularVendedor(g.persona.idEmpleado);
    return {
      ...g.persona,
      ...resultado,
      participacionPorcentual: new Decimal(resumen.total).isZero()
        ? '0.00'
        : dinero(new Decimal(resultado.total).div(resumen.total).mul(100)),
    };
  });
  return { periodo, meses, resumen, registros, calcularVendedor };
}
