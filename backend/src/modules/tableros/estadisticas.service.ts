import { Decimal } from 'decimal.js';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { dinero } from '../../shared/utils/dinero.js';
import { ErrorProhibido } from '../../shared/errors/errors.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { reloj } from '../comunicacion/comunicacion.repository.js';
import { categoriasInasistencia, rangoInasistencias } from './tableros.reglas.js';
import type {
  QueryRemuneraciones,
  QueryInasistencias,
  QueryVacacionesTablero,
} from './tableros.schemas.js';
import * as repo from './estadisticas.repository.js';
export function crearEstadisticasService(db: BaseDatos, ahora: typeof reloj = reloj) {
  function leer<T>(auth: Autenticacion, consultar: (c: Connection, hoy: string) => Promise<T>) {
    if (!['RH', 'ADMIN'].includes(auth.rol)) throw new ErrorProhibido();
    return db.conConexion(async (c) => {
      await c.execute('SET TRANSACTION READ ONLY');
      try {
        const actualizadoEn = await ahora(c);
        return { actualizadoEn, ...(await consultar(c, actualizadoEn.slice(0, 10))) };
      } finally {
        await c.rollback();
      }
    });
  }
  return {
    remuneraciones: (auth: Autenticacion, q: QueryRemuneraciones) =>
      leer(auth, async (c, hoy) => {
        const mes = q.mes ?? hoy.slice(0, 7);
        const filas = await repo.remuneraciones(c, q, mes);
        return {
          mes,
          agrupar: q.agrupar,
          metrica: q.metrica,
          moneda: 'GTQ',
          fuente: 'PAGOS_CONFIRMADOS',
          registros: filas.map((f, i) => ({
            ...f,
            posicion: i + 1,
            salarioBase: dinero(f.salarioBase),
            comisiones: dinero(f.comisiones),
            horasExtra: dinero(f.horasExtra),
            totalDevengado: dinero(f.totalDevengado),
            valor: dinero(f[q.metrica]),
          })),
        };
      }),
    inasistencias: (auth: Autenticacion, q: QueryInasistencias) =>
      leer(auth, async (c, hoy) => {
        const rango = rangoInasistencias(q.fecha ?? hoy, q.periodo);
        const filas = await repo.inasistencias(c, q.agrupar, rango);
        const primera = filas[0];
        const totales = [
          primera?.totalIgss,
          primera?.totalGoce,
          primera?.totalSinGoce,
          primera?.totalInjustificada,
        ];
        const categorias = categoriasInasistencia.map((cat, i) => ({
          ...cat,
          dias: dinero(totales[i] ?? 0),
        }));
        return {
          ...rango,
          periodo: q.periodo,
          agrupar: q.agrupar,
          unidad: 'DIAS',
          categorias,
          totalDias: dinero(categorias.reduce((s, cat) => s.plus(cat.dias), new Decimal(0))),
          registros: filas.map((f, i) => ({
            id: f.id,
            nombre: f.nombre,
            posicion: i + 1,
            totalDias: dinero(f.total),
            categorias: categoriasInasistencia.map((cat) => ({
              ...cat,
              dias: dinero(f[cat.categoria]),
            })),
          })),
        };
      }),
    vacaciones: (auth: Autenticacion, q: QueryVacacionesTablero) =>
      leer(auth, async (c, hoy) => {
        const { filas, ...conteo } = await repo.vacaciones(c, q, hoy);
        const lista = (grupo: 'EN_CURSO' | 'PROXIMAS') =>
          filas
            .filter((f) => f.grupo === grupo)
            .map(({ grupo: _grupo, ...f }) => ({ ...f, diasLaborales: dinero(f.diasLaborales) }));
        return {
          hoy,
          dias: q.dias,
          pagina: q.pagina,
          limite: q.limite,
          ...conteo,
          enCurso: lista('EN_CURSO'),
          proximas: lista('PROXIMAS'),
        };
      }),
    celebraciones: (auth: Autenticacion) =>
      leer(auth, async (c, hoy) => {
        const filas = await repo.celebraciones(c, hoy);
        return {
          hoy,
          dias: 30,
          cumpleanos: filas
            .filter((f) => f.tipo === 'CUMPLEANOS')
            .map(({ tipo: _tipo, anios: _anios, ...f }) => ({ ...f, esHoy: !!f.esHoy })),
          aniversarios: filas
            .filter((f) => f.tipo === 'ANIVERSARIO')
            .map(({ tipo: _tipo, ...f }) => ({ ...f, esHoy: !!f.esHoy })),
        };
      }),
  };
}
