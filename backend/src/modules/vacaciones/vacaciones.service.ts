import type { Connection } from 'oracledb';
import { Decimal } from 'decimal.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import {
  ErrorConflicto,
  ErrorNegocio,
  ErrorNoEncontrado,
  ErrorProhibido,
} from '../../shared/errors/errors.js';
import { verificarPropiedad } from '../../shared/security/rbac.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { revalidarActor } from '../auth/auth.service.js';
import type { ActorAuditoria, Autenticacion } from '../auth/auth.types.js';
import { hoy, opciones, cerrados } from '../novedades/novedades.repository.js';
import { escribirCsv } from '../empleados/empleados.csv.js';
import { dinero } from '../../shared/utils/dinero.js';
import {
  acumulaciones,
  calcularSaldo,
  calendarioLaboral,
  exigirSaldo,
  traslapan,
  valorarPendientes,
} from './vacaciones.reglas.js';
import { cargaSchema, rangoSchema, resolverSchema } from './vacaciones.schemas.js';
import type { Query } from './vacaciones.schemas.js';
import * as repo from './vacaciones.repository.js';
const audit = (
  c: Connection,
  actor: ActorAuditoria,
  id: number,
  accion: string,
  despues: unknown,
  antes: unknown = null,
) =>
  registrarAuditoria(c, {
    actor,
    accion,
    entidad: 'VACACIONES_SOLICITUDES',
    idEntidad: id,
    antes,
    despues,
  });
const visible = (fecha: string) => fecha.split('-').reverse().join('/');
const invalido = (campo: string, mensaje: string): never => {
  throw new ErrorNegocio(mensaje, 422, 'VALIDACION', { [campo]: [mensaje] });
};
async function sincronizar(c: Connection, e: repo.Empleado, corte: string, actor: ActorAuditoria) {
  const hasta = e.egreso && e.egreso < corte ? e.egreso : corte;
  let movimientos = await repo.movimientos(c, e.id);
  const parametros = await repo.parametros(c);
  const nuevos = acumulaciones(e.ingreso, hasta, parametros, movimientos).filter(
    (m) => !movimientos.some((v) => v.clave === m.clave),
  );
  for (const m of nuevos)
    await repo.mover(
      c,
      e.id,
      { ...m, tipo: 'ACUMULACION' },
      'Mes cumplido desde la fecha de contratación',
      actor.idUsuario,
    );
  if (nuevos.length) {
    await registrarAuditoria(c, {
      actor,
      accion: 'ACUMULAR_VACACIONES',
      entidad: 'VACACIONES_MOVIMIENTOS',
      idEntidad: e.id,
      despues: { meses: nuevos },
    });
    movimientos = await repo.movimientos(c, e.id);
  }
  return {
    ...calcularSaldo(e.ingreso, hasta, parametros, movimientos),
    corte: hasta,
    empleado: e.nombre,
    idEmpleado: e.id,
    kardex: movimientos,
  };
}
export function crearVacacionesService(db: BaseDatos) {
  async function tx<T>(
    auth: Autenticacion,
    ip: string,
    fn: (c: Connection, a: ActorAuditoria) => Promise<T>,
  ) {
    try {
      return await enTransaccion(db, async (c) => {
        await bloquearCatalogos(c, true);
        const a = await revalidarActor(c, auth);
        return fn(c, { ...a, ip });
      });
    } catch (e) {
      if (e && typeof e === 'object' && 'errorNum' in e && e.errorNum === 1)
        throw new ErrorConflicto(
          'Esta operación ya fue registrada. Recarga el saldo y revisa el historial antes de continuar.',
        );
      throw e;
    }
  }
  const rh = (a: ActorAuditoria) => {
    if (!['ADMIN', 'RH'].includes(a.rol)) throw new ErrorProhibido();
  };
  async function obtener(c: Connection, a: ActorAuditoria, id?: number) {
    const identidad = id ?? (await repo.propio(c, a.idUsuario));
    if (!identidad)
      throw new ErrorConflicto(
        'Tu usuario no tiene un expediente de empleado vinculado. Solicita a RRHH que lo revise.',
      );
    const e = await repo.empleado(c, identidad);
    if (!e) throw new ErrorNoEncontrado();
    verificarPropiedad(a, e.usuario);
    return e;
  }
  async function calendario(
    c: Connection,
    e: repo.Empleado,
    inicio: string,
    fin: string,
    excluir = 0,
  ) {
    const bloqueos = await repo.bloqueos(c, e.id, excluir);
    const dias = calendarioLaboral(
      inicio,
      fin,
      await repo.horarios(c, e.id),
      await repo.feriados(c, e.localidad, inicio, fin),
    );
    return {
      dias: dias.map((d) => ({
        ...d,
        bloqueado:
          bloqueos.some((b) => b.inicio <= d.fecha && b.fin >= d.fecha) ||
          d.fecha < e.ingreso ||
          !!(e.egreso && d.fecha > e.egreso),
      })),
      bloqueos,
    };
  }
  async function comparar(
    c: Connection,
    e: repo.Empleado,
    inicio: string,
    fin: string,
    saldo: string,
    excluir = 0,
  ) {
    const actual = await hoy(c);
    const cal = await calendario(c, e, inicio, fin, excluir);
    const dias = dinero(cal.dias.filter((d) => d.laborable).length);
    let bloqueo: string | null = null;
    if (e.estado !== 'ACTIVO' || inicio < e.ingreso || (e.egreso && fin > e.egreso))
      bloqueo = 'El rango debe estar dentro de una relación laboral activa.';
    else if (inicio < actual)
      bloqueo = 'El inicio no puede estar en el pasado. Selecciona hoy o una fecha futura.';
    else if (cal.dias.some((d) => d.motivo === 'Sin horario vigente'))
      bloqueo =
        'Falta un horario vigente dentro del rango. Pide a RRHH que complete la asignación.';
    else if (!cal.dias[0]?.laborable || !cal.dias.at(-1)?.laborable)
      bloqueo =
        'El inicio y el fin deben ser días laborales; los descansos y feriados intermedios no consumen saldo.';
    else if (cal.bloqueos.some((b) => traslapan(inicio, fin, b.inicio, b.fin)))
      bloqueo =
        'El rango se traslapa con vacaciones, una ausencia o un periodo cerrado. Selecciona fechas libres.';
    const alcanza = new Decimal(dias).gt(0) && new Decimal(saldo).gte(dias);
    return {
      dias,
      disponible: saldo,
      alcanza,
      puedeAprobar: alcanza && !bloqueo,
      bloqueo:
        bloqueo ??
        (!alcanza
          ? `Saldo insuficiente: ${saldo} días disponibles y ${dias} solicitados. Reduce el rango o revisa el kardex con RRHH.`
          : null),
    };
  }
  async function enriquecer(c: Connection, a: ActorAuditoria, s: repo.Solicitud) {
    try {
      const e = await obtener(c, a, s.idEmpleado);
      const saldo = await sincronizar(c, e, await hoy(c), a);
      const comp = await comparar(c, e, s.inicio, s.fin, saldo.disponible, s.id);
      return {
        ...s,
        ...comp,
        diasRegistrados: s.dias,
        puedeAprobar: s.estado === 'EN_PROCESO' && comp.puedeAprobar,
      };
    } catch (error) {
      if (!(error instanceof ErrorNegocio)) throw error;
      return {
        ...s,
        diasRegistrados: s.dias,
        disponible: null,
        alcanza: false,
        puedeAprobar: false,
        bloqueo: error.message,
      };
    }
  }
  return {
    saldo: (auth: Autenticacion, ip: string, id?: number) =>
      tx(auth, ip, async (c, a) => sincronizar(c, await obtener(c, a, id), await hoy(c), a)),
    calendario: (auth: Autenticacion, ip: string, inicio: string, fin: string, id?: number) =>
      tx(auth, ip, async (c, a) => {
        rangoSchema.parse({ inicio, fin });
        const e = await obtener(c, a, id);
        return { ...(await calendario(c, e, inicio, fin)), hoy: await hoy(c) };
      }),
    previsualizar: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const d = rangoSchema.parse(raw),
          e = await obtener(c, a),
          s = await sincronizar(c, e, await hoy(c), a);
        return comparar(c, e, d.inicio, d.fin, s.disponible);
      }),
    solicitar: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const d = rangoSchema.parse(raw),
          e = await obtener(c, a),
          s = await sincronizar(c, e, await hoy(c), a);
        const p = await comparar(c, e, d.inicio, d.fin, s.disponible);
        if (!p.puedeAprobar) invalido('inicio', p.bloqueo!);
        const id = await repo.crear(c, e.id, d.inicio, d.fin, p.dias, s.disponible, a.idUsuario);
        await repo.notificar(
          c,
          e,
          id,
          'EN_PROCESO',
          `${e.nombre} solicita ${p.dias} días laborales del ${visible(d.inicio)} al ${visible(d.fin)}.`,
          a.idUsuario,
        );
        await audit(c, a, id, 'SOLICITAR_VACACIONES', { ...d, dias: p.dias, saldo: s.disponible });
        return repo.solicitud(c, id);
      }),
    listar: (auth: Autenticacion, ip: string, q: Query) =>
      tx(auth, ip, async (c, a) => {
        const filtro = a.rol === 'EMPLEADO' ? { ...q, idEmpleado: (await obtener(c, a)).id } : q;
        const r = await repo.listar(c, filtro);
        const registros = [];
        for (const s of r.registros) registros.push(await enriquecer(c, a, s));
        return { ...r, registros };
      }),
    resolver: (auth: Autenticacion, ip: string, id: number, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        rh(a);
        const d = resolverSchema.parse(raw),
          s = await repo.solicitud(c, id);
        if (!s) throw new ErrorNoEncontrado();
        if (s.estado !== 'EN_PROCESO')
          throw new ErrorConflicto('La solicitud ya fue resuelta. Recarga la bandeja.');
        const e = await obtener(c, a, s.idEmpleado);
        if (await cerrados(c, s.inicio, s.fin))
          throw new ErrorConflicto('El rango afecta un periodo cerrado; no se puede modificar.');
        let saldo = s.saldoAlSolicitar,
          dias = s.dias;
        if (d.estado === 'APROBADA') {
          const actual = await sincronizar(c, e, await hoy(c), a);
          saldo = actual.disponible;
          const p = await comparar(c, e, s.inicio, s.fin, saldo, id);
          if (!p.puedeAprobar) throw new ErrorConflicto(p.bloqueo!);
          exigirSaldo(saldo, p.dias);
          dias = p.dias;
          await repo.mover(
            c,
            e.id,
            {
              tipo: 'DISFRUTE',
              fecha: await hoy(c),
              dias: new Decimal(dias).negated().toFixed(2),
              clave: `SOLICITUD:${id}`,
            },
            'Reserva de días al aprobar vacaciones',
            a.idUsuario,
            id,
          );
        }
        await repo.resolver(c, id, d.estado, d.motivo, dias, saldo, a.idUsuario);
        await repo.notificar(
          c,
          e,
          id,
          d.estado,
          `Solicitud del ${visible(s.inicio)} al ${visible(s.fin)}: ${d.estado === 'APROBADA' ? `aprobada por ${dias} días laborales.` : `rechazada. Motivo: ${d.motivo}`}`,
          a.idUsuario,
        );
        await audit(
          c,
          a,
          id,
          `VACACIONES_${d.estado}`,
          { estado: d.estado, dias, saldo, motivo: d.motivo },
          s,
        );
        return repo.solicitud(c, id);
      }),
    cargar: (auth: Autenticacion, ip: string, id: number, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        rh(a);
        const d = cargaSchema.parse(raw),
          e = await obtener(c, a, id),
          fecha = await hoy(c),
          antes = await repo.movimientos(c, id);
        if (e.estado !== 'ACTIVO' || e.ingreso > fecha)
          throw new ErrorConflicto('La carga requiere un empleado activo que ya haya ingresado.');
        if (await cerrados(c, fecha, fecha))
          throw new ErrorConflicto('La carga afecta un periodo cerrado.');
        if (d.tipo === 'SALDO_INICIAL' && antes.some((m) => m.tipo !== 'ACUMULACION'))
          throw new ErrorConflicto(
            'La apertura solo se permite una vez y antes de registrar disfrutes o ajustes.',
          );
        if (d.tipo === 'TOMADAS') {
          const s = await sincronizar(c, e, fecha, a);
          exigirSaldo(s.disponible, d.dias);
        }
        const m = {
          tipo: d.tipo === 'TOMADAS' ? 'AJUSTE' : 'SALDO_INICIAL',
          fecha,
          dias: d.tipo === 'TOMADAS' ? new Decimal(d.dias).negated().toFixed(2) : dinero(d.dias),
          clave: `${d.tipo}:${d.referencia}`,
        };
        await repo.mover(c, id, m, d.motivo, a.idUsuario);
        await registrarAuditoria(c, {
          actor: a,
          accion: 'CARGAR_VACACIONES_PREVIAS',
          entidad: 'VACACIONES_MOVIMIENTOS',
          idEntidad: id,
          despues: { ...m, motivo: d.motivo },
        });
        return sincronizar(c, e, fecha, a);
      }),
    opciones: (buscar: string, pagina: number, seleccionado?: number) =>
      db.conConexion((c) => opciones(c, 'empleados', buscar, pagina, seleccionado)),
    notificaciones: (auth: Autenticacion) =>
      db.conConexion((c) => repo.notificaciones(c, auth.idUsuario)),
    leerNotificacion: (auth: Autenticacion, ip: string, id: number) =>
      tx(auth, ip, async (c, a) => {
        await repo.leerNotificacion(c, a.idUsuario, id);
        return { leida: true };
      }),
    exportar: (auth: Autenticacion, q: Query) =>
      db.conConexion(async (c) => {
        const filtro =
          auth.rol === 'EMPLEADO'
            ? { ...q, idEmpleado: (await obtener(c, { ...auth, ip: '' })).id }
            : q;
        const filas: unknown[][] = [
          ['Código', 'Empleado', 'Inicio', 'Fin', 'Días laborales', 'Estado', 'Motivo de rechazo'],
        ];
        for (let pagina = 1; pagina <= 1000; pagina++) {
          const r = await repo.listar(c, { ...filtro, pagina, limite: 100 });
          for (const s of r.registros)
            filas.push([s.codigo, s.empleado, s.inicio, s.fin, s.dias, s.estado, s.motivo]);
          if (pagina * 100 >= r.total) return escribirCsv(filas);
        }
        throw new ErrorConflicto('Reduce los filtros para exportar hasta 100,000 registros.');
      }),
    finiquito: (auth: Autenticacion, ip: string, id: number, corte: string) =>
      tx(auth, ip, async (c, a) => {
        rh(a);
        return prepararVacacionesFiniquito(c, a, id, corte);
      }),
  };
}
// Fase 9 comparte esta conexión y controla commit/rollback; esta primitiva solo valora, no paga.
export async function prepararVacacionesFiniquito(
  c: Connection,
  actor: ActorAuditoria,
  id: number,
  corte: string,
) {
  if (!['ADMIN', 'RH'].includes(actor.rol)) throw new ErrorProhibido();
  await bloquearCatalogos(c, true);
  const e = await repo.empleado(c, id);
  if (!e) throw new ErrorNoEncontrado();
  if (corte < e.ingreso || corte > (await hoy(c)) || (e.egreso && corte !== e.egreso))
    throw new ErrorConflicto(
      'Usa una fecha de corte no futura dentro de la relación laboral; si existe egreso, usa esa fecha.',
    );
  if (await repo.reservasPosteriores(c, id, corte))
    throw new ErrorConflicto(
      'Hay solicitudes o reservas posteriores al corte. Resuélvelas o reviértelas en el finiquito antes de valorar vacaciones pendientes.',
    );
  const m = await repo.movimientos(c, id);
  if (m.some((m) => m.fecha > corte))
    throw new ErrorConflicto(
      'Hay movimientos posteriores al corte. Revisa sus reservas antes de preparar el finiquito.',
    );
  const saldo = await sincronizar(c, e, corte, actor),
    v = await repo.valoresFiniquito(c, id, corte);
  if (!v.salario || !v.divisor)
    throw new ErrorConflicto('Falta salario o divisor mensual vigente para el finiquito.');
  return { idEmpleado: id, corte, ...valorarPendientes(saldo.disponible, v.salario, v.divisor) };
}
