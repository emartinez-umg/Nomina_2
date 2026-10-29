import {
  consultarSaldosVacaciones,
  consultaDashboardSaldos,
} from '../vacaciones/vacaciones.saldos.service.js';
import { textoPresentacion } from '../../shared/presentacion/codigos.js';
import { crearCalendarioService } from '../calendario/calendario.service.js';
import { crearEstadisticasService } from './estadisticas.service.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { ErrorProhibido, ErrorConflicto } from '../../shared/errors/errors.js';
import { listarAuditoria } from '../auditoria/auditoria.repository.js';
import * as vacaciones from '../vacaciones/vacaciones.repository.js';
import { calcularSaldo } from '../vacaciones/vacaciones.reglas.js';
import { listar, reloj } from '../comunicacion/comunicacion.repository.js';
import * as repo from './tableros.repository.js';
import { consultarResumenMensual } from '../nomina/nomina.resumen.service.js';
import { querySchema } from '../nomina/nomina.schemas.js';
export function crearTablerosService(db: BaseDatos) {
  return {
    estadisticas: crearEstadisticasService(db),
    calendario: crearCalendarioService(db),
    consultar: (auth: Autenticacion, rol: 'rh' | 'admin' | 'empleado') =>
      db.conConexion(async (c) => {
        if (
          (rol === 'admin' && auth.rol !== 'ADMIN') ||
          (rol === 'rh' && !['ADMIN', 'RH'].includes(auth.rol)) ||
          (rol === 'empleado' && auth.rol !== 'EMPLEADO')
        )
          throw new ErrorProhibido();
        await c.execute('SET TRANSACTION READ ONLY');
        try {
          const ahora = await reloj(c);
          if (rol === 'rh') {
            const mes = ahora.slice(0, 7);
            const mensual = async (fecha: string) => {
              const r = await consultarResumenMensual(
                c,
                {
                  ...querySchema.parse({}),
                  anio: Number(fecha.slice(0, 4)),
                  mes: Number(fecha.slice(5, 7)),
                },
                undefined,
                undefined,
                { soloSalarios: true },
              );
              return {
                mes: fecha,
                ...r.totales,
                parcial: r.parcial,
                empleados: r.empleados,
                calculada: r.registros.length > 0,
              };
            };
            const nominaMes = await mensual(mes);
            const periodo = await repo.periodo(c);
            const evolucion = [];
            for (const p of await repo.evolucion(c)) {
              const r =
                p.inicio.slice(0, 7) === mes ? nominaMes : await mensual(p.inicio.slice(0, 7));
              evolucion.push({
                ...p,
                bruto: r.calculada ? r.ingresos : null,
                neto: r.calculada ? r.neto : null,
                costoPatronal: r.calculada ? r.patronal : null,
                empleados: r.empleados,
                parcial: r.parcial,
              });
            }
            const saldos = await consultarSaldosVacaciones(
              c,
              consultaDashboardSaldos,
              undefined,
              ahora.slice(0, 10),
            );
            return {
              saldosVacaciones: {
                cantidad: saldos.indicadores.empleadosAlerta,
                umbral: saldos.umbral,
                etiqueta: saldos.etiquetaAlerta,
              },
              rol: 'RH' as const,
              ahora,
              indicadores: await repo.indicadoresRh(c),
              periodo: periodo
                ? {
                    ...periodo,
                    bruto: nominaMes.calculada ? nominaMes.ingresos : null,
                    neto: nominaMes.calculada ? nominaMes.neto : null,
                    costoPatronal: nominaMes.calculada ? nominaMes.patronal : null,
                    empleados: nominaMes.empleados,
                  }
                : null,
              nominaMes,
              departamentos: await repo.departamentos(c),
              evolucion,
              celebraciones: await repo.celebraciones(c),
              alertas: (await repo.alertas(c)).map((a) => ({
                ...a,
                mensaje: a.tipo === 'PERIODO' ? textoPresentacion(a.mensaje) : a.mensaje,
              })),
            };
          }
          if (rol === 'admin')
            return {
              rol: 'ADMIN' as const,
              ahora,
              ...(await repo.administracion(c)),
              bitacora: (
                await listarAuditoria(c, {
                  pagina: 1,
                  limite: 10,
                  ordenarPor: 'fecha',
                  direccion: 'desc',
                })
              ).registros,
            };
          const id = await vacaciones.propio(c, auth.idUsuario),
            e = id ? await vacaciones.empleado(c, id) : undefined;
          const sinSaldo = { acumulado: null, tomados: null, disponible: null, solicitables: null };
          let saldo: {
            acumulado: string | null;
            tomados: string | null;
            disponible: string | null;
            solicitables: number | null;
            mensaje: string | null;
          } = {
            ...sinSaldo,
            disponible: null,
            mensaje: 'Tu usuario no tiene un expediente vinculado. Solicita a RRHH que lo revise.',
          };
          if (e)
            try {
              const corte =
                e.egreso && e.egreso < ahora.slice(0, 10) ? e.egreso : ahora.slice(0, 10);
              saldo = {
                ...calcularSaldo(
                  e.ingreso,
                  corte,
                  await vacaciones.parametros(c),
                  await vacaciones.movimientos(c, e.id),
                ),
                mensaje: null,
              };
            } catch (error) {
              if (!(error instanceof ErrorConflicto)) throw error;
              saldo = { ...sinSaldo, mensaje: error.message };
            }
          const q = {
            pagina: 1,
            limite: 5,
            ordenarPor: 'inicio' as const,
            direccion: 'desc' as const,
          };
          return {
            rol: 'EMPLEADO' as const,
            ahora,
            nombre: e?.nombre ?? auth.usuario,
            saldo,
            ultimaBoleta: await repo.ultimaBoleta(c, auth.idUsuario),
            anuncios: await listar(c, 'anuncios', q, auth.idUsuario),
            eventos: await listar(c, 'eventos', { ...q, direccion: 'asc' }, auth.idUsuario),
          };
        } finally {
          await c.rollback();
        }
      }),
  };
}
