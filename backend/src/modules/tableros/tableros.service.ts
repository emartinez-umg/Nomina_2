import type { BaseDatos } from '../../shared/db/pool.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { ErrorProhibido, ErrorConflicto } from '../../shared/errors/errors.js';
import { listarAuditoria } from '../auditoria/auditoria.repository.js';
import * as vacaciones from '../vacaciones/vacaciones.repository.js';
import { calcularSaldo } from '../vacaciones/vacaciones.reglas.js';
import { listar, reloj } from '../comunicacion/comunicacion.repository.js';
import * as repo from './tableros.repository.js';
export function crearTablerosService(db: BaseDatos) {
  return {
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
          if (rol === 'rh')
            return {
              rol: 'RH' as const,
              ahora,
              indicadores: await repo.indicadoresRh(c),
              periodo: await repo.periodo(c),
              departamentos: await repo.departamentos(c),
              evolucion: await repo.evolucion(c),
              celebraciones: await repo.celebraciones(c),
              alertas: await repo.alertas(c),
            };
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
          let saldo: { disponible: string | null; mensaje: string | null } = {
            disponible: null,
            mensaje: 'Tu usuario no tiene un expediente vinculado. Solicita a RRHH que lo revise.',
          };
          if (e)
            try {
              const corte =
                e.egreso && e.egreso < ahora.slice(0, 10) ? e.egreso : ahora.slice(0, 10);
              saldo = {
                disponible: calcularSaldo(
                  e.ingreso,
                  corte,
                  await vacaciones.parametros(c),
                  await vacaciones.movimientos(c, e.id),
                ).disponible,
                mensaje: null,
              };
            } catch (error) {
              if (!(error instanceof ErrorConflicto)) throw error;
              saldo = { disponible: null, mensaje: error.message };
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
