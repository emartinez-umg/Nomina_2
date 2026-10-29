import { Decimal } from 'decimal.js';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { ErrorNoEncontrado, ErrorProhibido, ErrorValidacion } from '../../shared/errors/errors.js';
import { escribirCsv } from '../empleados/empleados.csv.js';
import { archivo, excel } from '../nomina/nomina.exportar.js';
import { dinero } from '../../shared/utils/dinero.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { resolverAlcanceEquipo } from '../equipo/equipo.service.js';
import { reloj } from '../comunicacion/comunicacion.repository.js';
import { aniosConDatos } from '../calendario/calendario.repository.js';
import {
  construirEstadisticasComisiones,
  periodoComisiones,
  vendedorPublico,
} from './comisiones.reglas.js';
import type {
  ComisionesQuery,
  ComisionesLista,
  ComisionesHistorial,
} from './comisiones.schemas.js';
import * as repo from './comisiones.repository.js';

export async function alcanceComisiones(c: Connection, auth: Autenticacion) {
  if (auth.cambioObligatorio) throw new ErrorProhibido();
  if (auth.rol === 'RH' || auth.rol === 'ADMIN') return undefined;
  if (auth.rol !== 'EMPLEADO') throw new ErrorProhibido();
  return (await resolverAlcanceEquipo(c, auth, 'VER_COMISIONES_EQUIPO')).empleados;
}
export function crearComisionesService(db: BaseDatos, ahora: typeof reloj = reloj) {
  async function leer<T>(
    auth: Autenticacion,
    fn: (c: Connection, ids: number[] | undefined, actualizadoEn: string) => Promise<T>,
  ) {
    return db.conConexion(async (c) => {
      await c.execute('SET TRANSACTION READ ONLY');
      try {
        const ids = await alcanceComisiones(c, auth);
        return await fn(c, ids, await ahora(c));
      } finally {
        await c.rollback();
      }
    });
  }
  async function datos(
    c: Connection,
    ids: number[] | undefined,
    q: ComisionesQuery,
    actualizadoEn: string,
    vendedor?: number,
  ) {
    if (q.desde > actualizadoEn.slice(0, 7) || q.hasta > actualizadoEn.slice(0, 7))
      throw new ErrorValidacion({
        hasta: ['No se permiten meses futuros. Selecciona un mes hasta el actual.'],
      });
    if (
      ids !== undefined &&
      (q.vendedores?.some((id) => !ids.includes(id)) ||
        (vendedor !== undefined && !ids.includes(vendedor)))
    )
      throw new ErrorProhibido();
    if (!(await repo.validarFiltros(c, q, ids))) {
      if (ids !== undefined) throw new ErrorProhibido();
      throw new ErrorNoEncontrado();
    }
    if (vendedor !== undefined && q.vendedores && !q.vendedores.includes(vendedor))
      throw new ErrorNoEncontrado();
    const periodo = periodoComisiones(q);
    const filas = await repo.mesesVendedores(
      c,
      { ...q, desde: q.comparar ? periodo.anterior.desde : q.desde },
      ids,
    );
    return {
      modelo: construirEstadisticasComisiones(q, filas),
      meta: {
        actualizadoEn,
        moneda: 'GTQ',
        estado: q.estado,
        periodo: { desde: q.desde, hasta: q.hasta, meses: periodo.meses },
        periodoAnterior: q.comparar ? periodo.anterior : null,
        alcance: { tipo: ids === undefined ? 'GENERAL' : 'EQUIPO', personas: ids?.length ?? null },
      },
    };
  }
  function pagina(modelo: ReturnType<typeof construirEstadisticasComisiones>, q: ComisionesLista) {
    const filas = [...modelo.registros].sort((a, b) => {
      const orden =
        q.ordenarPor === 'total' || q.ordenarPor === 'promedioMensual'
          ? new Decimal(a[q.ordenarPor]).cmp(b[q.ordenarPor])
          : a[q.ordenarPor].localeCompare(b[q.ordenarPor], 'es', {
              sensitivity: 'base',
              numeric: true,
            });
      return orden * (q.direccion === 'asc' ? 1 : -1) || a.idEmpleado - b.idEmpleado;
    });
    return {
      registros: filas.slice((q.pagina - 1) * q.limite, q.pagina * q.limite),
      total: filas.length,
      pagina: q.pagina,
      limite: q.limite,
    };
  }
  return {
    resumen: (auth: Autenticacion, q: ComisionesQuery) =>
      leer(auth, async (c, ids, hoy) => {
        const { modelo, meta } = await datos(c, ids, q, hoy);
        const r = modelo.resumen;
        return {
          ...meta,
          indicadores: {
            total: r.total,
            promedioMensual: r.promedioMensual,
            mejorMes: r.mejorMes,
            vendedoresConComision: r.vendedoresConComision,
            totalAnterior: r.totalAnterior,
            variacionPorcentual: r.variacionPorcentual,
            sinBaseComparacion: r.sinBaseComparacion,
          },
        };
      }),
    tendencia: (auth: Autenticacion, q: ComisionesQuery) =>
      leer(auth, async (c, ids, hoy) => {
        const { modelo, meta } = await datos(c, ids, q, hoy);
        return { ...meta, registros: modelo.resumen.serie };
      }),
    ranking: (auth: Autenticacion, q: ComisionesLista) =>
      leer(auth, async (c, ids, hoy) => {
        const { modelo, meta } = await datos(c, ids, q, hoy);
        const p = pagina(modelo, q);
        return {
          ...meta,
          ...p,
          totalComisiones: modelo.resumen.total,
          registros: p.registros.map(({ serie: _serie, ...f }, i) => ({
            ...f,
            posicion: (q.pagina - 1) * q.limite + i + 1,
          })),
        };
      }),
    tabla: (auth: Autenticacion, q: ComisionesLista) =>
      leer(auth, async (c, ids, hoy) => {
        const { modelo, meta } = await datos(c, ids, q, hoy);
        return {
          ...meta,
          ...pagina(modelo, q),
          meses: modelo.meses,
          totalesMensuales: modelo.resumen.serie,
          totalComisiones: modelo.resumen.total,
        };
      }),
    opciones: (auth: Autenticacion, q: ComisionesQuery) =>
      leer(auth, async (c, ids, hoy) => {
        const { modelo, meta } = await datos(c, ids, q, hoy);
        return {
          ...meta,
          vendedores: modelo.registros
            .map(vendedorPublico)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.idEmpleado - b.idEmpleado),
          departamentos: [
            ...new Map(
              modelo.registros.map((f) => [
                f.idDepartamento,
                { id: f.idDepartamento, nombre: f.departamento },
              ]),
            ).values(),
          ].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
        };
      }),
    historial: (auth: Autenticacion, id: number, q: ComisionesHistorial) =>
      leer(auth, async (c, ids, hoy) => {
        const { modelo, meta } = await datos(c, ids, q, hoy, id);
        const persona = await repo.vendedor(c, id);
        if (!persona || (q.idDepartamento && persona.idDepartamento !== q.idDepartamento))
          throw new ErrorNoEncontrado();
        const { serie, ...indicadores } = modelo.calcularVendedor(id);
        const cantidad = modelo.resumen.vendedoresConComision;
        const promedioEquipo = cantidad
          ? new Decimal(modelo.resumen.total).div(cantidad).div(modelo.periodo.meses)
          : new Decimal(0);
        const detalles = await repo.detalleComisiones(c, id, q, ids);
        return {
          ...meta,
          vendedor: vendedorPublico(persona),
          indicadores,
          promedioMensualEquipo: dinero(promedioEquipo),
          vendedoresEquipo: cantidad,
          evolucion: serie.map((f, i) => ({
            ...f,
            promedioEquipo: cantidad
              ? dinero(new Decimal(modelo.resumen.serie[i]!.total).div(cantidad))
              : '0.00',
          })),
          ...detalles,
          registros: detalles.registros.map((f) => ({
            id: f.id,
            mes: f.mes,
            monto: dinero(f.monto),
            descripcion: f.descripcion,
            referencia: f.referencia,
            estado: f.estado,
          })),
        };
      }),
    exportar: (auth: Autenticacion, q: ComisionesQuery, formato: 'csv' | 'excel') =>
      leer(auth, async (c, ids, hoy) => {
        const { modelo, meta } = await datos(c, ids, q, hoy);
        const filas: (string | number)[][] = [
          ['Estadísticas de comisiones (GTQ)', q.desde, q.hasta],
          [
            'Estado',
            { todas: 'Todas', pendientes: 'Pendientes', aplicadas: 'Aplicadas' }[q.estado],
          ],
          [
            'Alcance',
            ids === undefined ? 'General' : `Equipo: ${ids.length} personas`,
            'Corte',
            meta.actualizadoEn,
          ],
          [
            'Departamento',
            q.idDepartamento ?? 'Todos',
            'Vendedores',
            q.vendedores?.join(', ') ?? 'Todos',
          ],
          [
            'Periodo anterior',
            meta.periodoAnterior?.desde ?? 'Sin comparación',
            meta.periodoAnterior?.hasta ?? '',
          ],
          [
            'Código',
            'Vendedor',
            'Departamento',
            ...modelo.meses,
            'Total',
            'Promedio mensual',
            'Participación (%)',
            'Total anterior',
            'Variación (%)',
          ],
          ...modelo.registros.map((f) => [
            f.codigo,
            f.nombre,
            f.departamento,
            ...f.serie.map((m) => m.total),
            f.total,
            f.promedioMensual,
            f.participacionPorcentual,
            f.totalAnterior ?? '',
            f.variacionPorcentual ?? (f.sinBaseComparacion ? 'Sin base de comparación' : ''),
          ]),
          [
            'TOTAL',
            '',
            '',
            ...modelo.resumen.serie.map((m) => m.total),
            modelo.resumen.total,
            modelo.resumen.promedioMensual,
            '',
            modelo.resumen.totalAnterior ?? '',
            modelo.resumen.variacionPorcentual ??
              (modelo.resumen.sinBaseComparacion ? 'Sin base de comparación' : ''),
          ],
        ];
        const nombre = `comisiones-${q.desde}-${q.hasta}`;
        return formato === 'csv'
          ? archivo(
              Buffer.from(escribirCsv(filas), 'utf8'),
              `${nombre}.csv`,
              'text/csv;charset=utf-8',
            )
          : archivo(
              excel(filas, 'Comisiones'),
              `${nombre}.xlsx`,
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            );
      }),
    anios: (auth: Autenticacion) =>
      leer(auth, async (c, ids, hoy) => {
        const anioActual = Number(hoy.slice(0, 4));
        const anios = [
          ...new Set([anioActual, ...(await aniosConDatos(c, 'comisiones', null, ids))]),
        ].sort((a, b) => a - b);
        return {
          fuente: 'comisiones',
          anioActual,
          anioMin: anios[0]!,
          anioMax: anios.at(-1)!,
          anios,
        };
      }),
  };
}
