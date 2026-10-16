import { escribirCsv } from '../empleados/empleados.csv.js';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorProhibido } from '../../shared/errors/errors.js';
import { revalidarActor } from '../auth/auth.service.js';
import type { ActorAuditoria, Autenticacion } from '../auth/auth.types.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { cerrados, empleado, hoy } from './novedades.repository.js';
import { rangoMes } from './mensuales.service.js';
import { tarifaSchema, cambioParqueoSchema, parqueoQuery } from './parqueo.schemas.js';
import * as repo from './parqueo.repository.js';
export function validarCambioParqueo(estado: string, accion: string, solicitada: boolean) {
  if (estado !== 'ACTIVA')
    throw new ErrorConflicto(
      'La suscripción ya está dada de baja o suspendida. Solicita un alta nueva.',
    );
  if (accion === 'SOLICITAR_BAJA' && solicitada)
    throw new ErrorConflicto('Ya hay una solicitud de baja pendiente.');
}
export async function aprobarParqueo(
  c: Connection,
  a: ActorAuditoria,
  idEmpleado: number,
  idSolicitud: number,
  vehiculo: string | null,
  placa: string | null,
) {
  const fecha = await hoy(c),
    mes = fecha.slice(0, 7),
    r = rangoMes(mes),
    e = await empleado(c, idEmpleado);
  if (!['RH', 'ADMIN'].includes(a.rol)) throw new ErrorProhibido();
  if (!vehiculo)
    throw new ErrorConflicto(
      'La solicitud histórica no indica vehículo. Recházala y pide una solicitud nueva con Carro o Moto.',
    );
  if (!e || e.estado !== 'ACTIVO' || e.inicio > fecha || (e.fin && e.fin < fecha))
    throw new ErrorConflicto('El parqueo requiere una relación laboral activa.');
  if (await cerrados(c, r.inicio, r.fin))
    throw new ErrorConflicto('El mes de aprobación tiene un periodo cerrado.');
  if (await repo.existe(c, idEmpleado, mes))
    throw new ErrorConflicto('El empleado ya tiene parqueo durante este mes.');
  if ((await repo.vigente(c, vehiculo, mes)).length !== 1)
    throw new ErrorConflicto('Configura una tarifa mensual vigente única para este vehículo.');
  const id = await repo.alta(c, idEmpleado, idSolicitud, vehiculo, placa, mes, a.idUsuario);
  await registrarAuditoria(c, {
    actor: a,
    accion: 'ALTA_PARQUEO',
    entidad: 'PARQUEO_SUSCRIPCIONES',
    idEntidad: id,
    antes: null,
    despues: { idEmpleado, idSolicitud, vehiculo, placa, mes },
    motivo: 'Aprobación de solicitud de parqueo',
  });
  return id;
}
export function crearParqueoService(db: BaseDatos) {
  async function tx<T>(
    auth: Autenticacion,
    ip: string,
    fn: (c: Connection, a: ActorAuditoria) => Promise<T>,
  ) {
    return enTransaccion(db, async (c) => {
      await bloquearCatalogos(c, true);
      const a = await revalidarActor(c, auth);
      return fn(c, { ...a, ip });
    });
  }
  return {
    exportar: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const q = parqueoQuery.parse(raw),
          out: unknown[][] = [
            [
              'Empleado',
              'Vehículo',
              'Placa',
              'Inicio',
              'Último mes',
              'Estado',
              'Baja solicitada',
              'Mes consultado',
              'Monto',
              'Estado del cargo',
              'Pago',
            ],
          ];
        for (let pagina = 1; pagina <= 1000; pagina++) {
          const r = await repo.suscripciones(
            c,
            { ...q, pagina, limite: 100 },
            a.rol === 'EMPLEADO' ? a.idUsuario : null,
          );
          for (const s of r.registros)
            out.push([
              s.empleado,
              s.vehiculo,
              s.placa,
              s.inicio,
              s.fin,
              s.estado,
              s.bajaSolicitada,
              q.mes,
              s.tarifa,
              s.estadoAplicacion,
              s.idPago,
            ]);
          if (pagina * 100 >= r.total) return escribirCsv(out);
        }
        throw new ErrorConflicto('Reduce los filtros para exportar hasta 100,000 registros.');
      }),
    tarifas: () => db.conConexion(repo.tarifas),
    guardarTarifa: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        if (!['ADMIN', 'RH'].includes(a.rol)) throw new ErrorProhibido();
        const d = tarifaSchema.parse(raw),
          r = rangoMes(d.mes);
        if (await cerrados(c, r.inicio, '9999-12-31'))
          throw new ErrorConflicto('La vigencia no puede cambiar tarifas de periodos cerrados.');
        if ((await repo.tarifas(c)).some((t) => t.vehiculo === d.vehiculo && t.desde === r.inicio))
          throw new ErrorConflicto(
            'Esta vigencia ya existe. Crea una vigencia posterior para conservar el historial.',
          );
        const antes = await repo.vigente(c, d.vehiculo, d.mes);
        const id = await repo.guardarTarifa(c, d, a.idUsuario);
        await registrarAuditoria(c, {
          actor: a,
          accion: 'TARIFA_PARQUEO',
          entidad: 'PARQUEO_TARIFAS',
          idEntidad: id,
          antes,
          despues: d,
          motivo: d.motivo,
        });
        return repo.tarifas(c);
      }),
    listar: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, (c, a) =>
        repo.suscripciones(c, parqueoQuery.parse(raw), a.rol === 'EMPLEADO' ? a.idUsuario : null),
      ),
    cambiar: (auth: Autenticacion, ip: string, id: number, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const d = cambioParqueoSchema.parse(raw),
          mes = (await hoy(c)).slice(0, 7),
          r = rangoMes(mes);
        const s = (
          await repo.suscripciones(
            c,
            { mes, pagina: 1, limite: 1 },
            a.rol === 'EMPLEADO' ? a.idUsuario : null,
            id,
          )
        ).registros[0];
        if (!s) throw new ErrorNoEncontrado();
        if (a.rol === 'EMPLEADO' && d.accion !== 'SOLICITAR_BAJA') throw new ErrorProhibido();
        validarCambioParqueo(s.estado, d.accion, !!s.bajaSolicitada);
        if (s.inicio > mes) throw new ErrorConflicto('La suscripción aún no comenzó.');
        if (await cerrados(c, r.inicio, r.fin))
          throw new ErrorConflicto('El mes está cerrado; no admite cambios de parqueo.');
        if (d.accion === 'COMPLETAR') {
          if (s.vehiculo || !d.vehiculo || s.estadoAplicacion === 'APLICADA')
            throw new ErrorConflicto(
              'Solo se completa un vehículo histórico pendiente de revisión.',
            );
          if ((await repo.vigente(c, d.vehiculo, mes)).length !== 1)
            throw new ErrorConflicto('Configura primero su tarifa mensual vigente.');
        }
        // Baja/suspensión mantiene íntegro el cobro del mes, incluso si ya fue pagado.
        await repo.cambiar(c, id, d.accion, mes, d.motivo, a.idUsuario, d.vehiculo, d.placa);
        const despues = (await repo.suscripciones(c, { mes, pagina: 1, limite: 1 }, null, id))
          .registros[0]!;
        await registrarAuditoria(c, {
          actor: a,
          accion: d.accion,
          entidad: 'PARQUEO_SUSCRIPCIONES',
          idEntidad: id,
          antes: s,
          despues,
          motivo: d.motivo,
        });
        await repo.notificarBaja(c, despues, d.accion === 'SOLICITAR_BAJA', a.idUsuario);
        return despues;
      }),
  };
}
