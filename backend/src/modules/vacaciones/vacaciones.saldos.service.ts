import type { Connection } from 'oracledb';
import { Decimal } from 'decimal.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { ErrorConflicto, ErrorProhibido } from '../../shared/errors/errors.js';
import { dinero } from '../../shared/utils/dinero.js';
import { hoy } from '../novedades/novedades.repository.js';
import { escribirCsv } from '../empleados/empleados.csv.js';
import { archivo, excel } from '../nomina/nomina.exportar.js';
import { calcularSaldo } from './vacaciones.reglas.js';
import type { Movimiento } from './vacaciones.reglas.js';
import { parametros } from './vacaciones.repository.js';
import * as repo from './vacaciones.saldos.repository.js';
import { saldosQuerySchema } from './vacaciones.saldos.schemas.js';
import type { SaldosQuery } from './vacaciones.saldos.schemas.js';
export const etiquetaAlerta = (umbral: string) => `Más de ${new Decimal(umbral).toString()} días`;
export const tieneAlerta = (disponible: string, umbral: string) =>
  new Decimal(disponible).gt(umbral);
// Punto común para listado, exportación y dashboard. Solo recibe un alcance resuelto en servidor.
export async function consultarSaldosVacaciones(
  c: Connection,
  q: SaldosQuery,
  alcance?: readonly number[],
  fecha?: string,
) {
  if (
    (q.alcance === 'equipo' && !Array.isArray(alcance)) ||
    (alcance !== undefined &&
      (!Array.isArray(alcance) || alcance.some((id) => !Number.isSafeInteger(id) || id <= 0)))
  )
    throw new ErrorProhibido();
  const corte = fecha ?? (await hoy(c));
  const valores = await repo.umbral(c, corte);
  if (valores.length !== 1 || !new Decimal(valores[0]!.valor).gt(0))
    throw new ErrorConflicto(
      'Configura un único umbral de alerta de vacaciones vigente, mayor que cero y en días.',
    );
  const umbral = new Decimal(valores[0]!.valor).toString();
  const empleados = await repo.empleados(c, q, alcance);
  if (empleados.length > 100000)
    throw new ErrorConflicto('Reduce los filtros para consultar hasta 100,000 empleados.');
  const tasas = await parametros(c);
  const porEmpleado = new Map<number, Movimiento[]>();
  for (const m of await repo.movimientosLote(
    c,
    empleados.map((e) => e.id),
  )) {
    const lista = porEmpleado.get(m.idEmpleado) ?? [];
    lista.push(m);
    porEmpleado.set(m.idEmpleado, lista);
  }
  const registros = empleados
    .map((e) => {
      const hasta = e.egreso && e.egreso < corte ? e.egreso : corte;
      const saldo = calcularSaldo(e.ingreso, hasta, tasas, porEmpleado.get(e.id) ?? []);
      return { ...e, ...saldo, corte: hasta, alerta: tieneAlerta(saldo.disponible, umbral) };
    })
    .filter((e) => !q.soloAlerta || e.alerta);
  const numeros = new Set(['mesesCompletos', 'acumulado', 'tomados', 'disponible', 'solicitables']);
  const comparador = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  registros.sort((a, b) => {
    const x = a[q.ordenarPor] ?? '',
      y = b[q.ordenarPor] ?? '';
    const n = numeros.has(q.ordenarPor)
      ? new Decimal(x).comparedTo(y)
      : comparador.compare(String(x), String(y));
    return (n || a.id - b.id) * (q.direccion === 'asc' ? 1 : -1);
  });
  const disponible = registros.reduce((s, e) => s.plus(e.disponible), new Decimal(0));
  return {
    registros,
    total: registros.length,
    corte,
    umbral,
    idParametro: valores[0]!.id,
    etiquetaAlerta: etiquetaAlerta(umbral),
    indicadores: {
      empleadosAlerta: registros.filter((e) => e.alerta).length,
      promedioDisponible: dinero(registros.length ? disponible.div(registros.length) : 0),
      totalAcumulado: dinero(registros.reduce((s, e) => s.plus(e.acumulado), new Decimal(0))),
    },
  };
}
// Sin un resolvedor autorizado, equipo nunca se convierte en alcance general.
export type ResolverEquipoVacaciones = (
  c: Connection,
  auth: Autenticacion,
) => Promise<readonly number[]>;
export function crearSaldosVacacionesService(
  db: BaseDatos,
  resolverEquipo?: ResolverEquipoVacaciones,
) {
  function leer<T>(
    auth: Autenticacion,
    q: SaldosQuery,
    fn: (r: Awaited<ReturnType<typeof consultarSaldosVacaciones>>) => T,
  ) {
    if (
      !['RH', 'ADMIN'].includes(auth.rol) &&
      !(auth.rol === 'EMPLEADO' && q.alcance === 'equipo' && resolverEquipo)
    )
      throw new ErrorProhibido();
    return db.conConexion(async (c) => {
      await c.execute('SET TRANSACTION READ ONLY');
      try {
        if (q.alcance === 'equipo' && !resolverEquipo) throw new ErrorProhibido();
        const ids = q.alcance === 'equipo' ? await resolverEquipo!(c, auth) : undefined;
        return fn(await consultarSaldosVacaciones(c, q, ids));
      } finally {
        await c.rollback();
      }
    });
  }
  return {
    listar: (auth: Autenticacion, q: SaldosQuery) =>
      leer(auth, q, (r) => ({
        ...r,
        registros: r.registros.slice((q.pagina - 1) * q.limite, q.pagina * q.limite).map((e) =>
          auth.rol === 'EMPLEADO'
            ? {
                id: e.id,
                codigo: e.codigo,
                nombre: e.nombre,
                departamento: e.departamento,
                centro: e.centro,
                jefatura: e.jefatura,
                ingreso: e.ingreso,
                egreso: e.egreso,
                activo: e.activo,
                mesesCompletos: e.mesesCompletos,
                acumulado: e.acumulado,
                tomados: e.tomados,
                previas: e.previas,
                disponible: e.disponible,
                solicitables: e.solicitables,
                corte: e.corte,
                alerta: e.alerta,
              }
            : e,
        ),
        pagina: q.pagina,
        limite: q.limite,
      })),
    exportar: (auth: Autenticacion, q: SaldosQuery, formato: 'csv' | 'excel') =>
      leer(auth, q, (r) => {
        const filas: (string | number)[][] = [
          [
            'Código',
            'Nombre',
            'Departamento',
            'Centro',
            'Jefatura',
            'Ingreso',
            'Meses completos',
            'Acumulado',
            'Tomados / aprobados',
            'Disponible',
            'Solicitables',
            'Previas / ajustes',
            'Estado',
            'Alerta',
            'Umbral (días)',
            'Corte',
          ],
          ...r.registros.map((e) => [
            e.codigo,
            e.nombre,
            e.departamento,
            e.centro ?? '',
            e.jefatura ?? '',
            e.ingreso.split('-').reverse().join('/'),
            e.mesesCompletos,
            e.acumulado,
            e.tomados,
            e.disponible,
            e.solicitables,
            e.previas,
            e.activo ? 'Activo' : 'Inactivo',
            e.alerta ? r.etiquetaAlerta : 'Sin alerta',
            r.umbral,
            e.corte.split('-').reverse().join('/'),
          ]),
        ];
        return formato === 'csv'
          ? archivo(
              Buffer.from(escribirCsv(filas), 'utf8'),
              'saldos-vacaciones.csv',
              'text/csv;charset=utf-8',
            )
          : archivo(
              excel(filas, 'Saldos de vacaciones'),
              'saldos-vacaciones.xlsx',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            );
      }),
  };
}
export const consultaDashboardSaldos = saldosQuerySchema.parse({});
