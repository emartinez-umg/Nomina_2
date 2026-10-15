import { horasDiariasEnFecha } from '../../shared/horarios/horas.js';
import { Decimal } from 'decimal.js';
import { createHash } from 'node:crypto';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import {
  ErrorConflicto,
  ErrorNegocio,
  ErrorNoEncontrado,
  ErrorProhibido,
} from '../../shared/errors/errors.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { revalidarActor } from '../auth/auth.service.js';
import type { ActorAuditoria, Autenticacion } from '../auth/auth.types.js';
import { escribirCsv } from '../empleados/empleados.csv.js';
import { schemas, validarAdjunto } from './novedades.schemas.js';
import type { Datos, Tipo, Query } from './novedades.schemas.js';
import {
  amortizar,
  calcularHoraExtra,
  diasInclusivos,
  descontarSaldo,
  quincena,
} from './novedades.reglas.js';
import * as repo from './novedades.repository.js';
import { dinero as validarMonto, fecha as validarFecha } from '../empleados/empleados.schemas.js';
const rechazar = (campo: string, mensaje: string): never => {
  throw new ErrorNegocio('Revisa los campos indicados antes de continuar.', 422, 'VALIDACION', {
    [campo]: [mensaje],
  });
};
// El llamador controla la transacción; parqueo usa el mismo acuerdo FIJO que consume nómina.
export async function registrarParqueo(
  c: Connection,
  actor: ActorAuditoria,
  idEmpleado: number,
  idSolicitud: number,
  monto: string,
  fechaInicio: string,
) {
  if (!['ADMIN', 'RH'].includes(actor.rol)) throw new ErrorProhibido();
  await bloquearCatalogos(c, true);
  monto = validarMonto.parse(monto);
  validarFecha.parse(fechaInicio);
  const e = await repo.empleado(c, idEmpleado),
    tipo = await repo.tipoParqueo(c);
  if (!tipo) throw new ErrorConflicto('Activa el tipo PARQUEO en Catálogos antes de aprobar.');
  if (!e || e.estado !== 'ACTIVO' || fechaInicio < e.inicio || (e.fin && fechaInicio > e.fin))
    throw new ErrorConflicto('El parqueo requiere una relación laboral activa.');
  if (fechaInicio < (await repo.hoy(c)) || (await repo.cerrados(c, fechaInicio, '9999-12-31')))
    throw new ErrorConflicto(
      'El inicio del descuento debe ser hoy o futuro y posterior a los periodos cerrados.',
    );
  if (await repo.parqueoVigente(c, idEmpleado, fechaInicio))
    throw new ErrorConflicto(
      'El empleado ya tiene parqueo vigente. Revisa el descuento existente.',
    );
  const id = await repo.guardar(
    c,
    'descuentos',
    {
      ID_EMPLEADO: { valor: idEmpleado },
      ID_TIPO_DESCUENTO: { valor: tipo },
      ID_SOLICITUD: { valor: idSolicitud },
      MODALIDAD: { valor: 'FIJO' },
      MONTO_QUINCENA: { valor: monto, tipo: 'numero' },
      FECHA_INICIO: { valor: fechaInicio, tipo: 'fecha' },
      MOTIVO: { valor: `Parqueo aprobado en solicitud ${idSolicitud}` },
    },
    actor.idUsuario,
  );
  await audit(
    c,
    actor,
    'descuentos',
    id,
    'APROBAR_PARQUEO',
    null,
    { idEmpleado, idSolicitud, monto, fechaInicio },
    'Alta automática al aprobar parqueo',
  );
  return id;
}
const audit = (
  c: Connection,
  actor: ActorAuditoria,
  tipo: Tipo,
  id: number,
  accion: string,
  antes: unknown,
  despues: unknown,
  motivo: string,
) =>
  registrarAuditoria(c, {
    actor,
    accion,
    entidad: repo.tablas[tipo][0],
    idEntidad: id,
    antes,
    despues,
    motivo,
  });

async function valorar(
  c: Connection,
  d: { idEmpleado: number; fecha: string; jornada: string; horas: string },
) {
  const p = await repo.parametrosHora(c, d.idEmpleado, d.fecha);
  const obtener = (codigo: string, unidad: string) => {
    const encontrados = p.parametros.filter((v) => v.CODIGO === codigo && v.UNIDAD === unidad);
    if (encontrados.length !== 1)
      throw new ErrorConflicto(
        `Configura una única vigencia de ${codigo} (${unidad}) para la fecha indicada.`,
      );
    return encontrados[0]!.VALOR;
  };
  if (!p.salario)
    rechazar(
      'fecha',
      'No existe un salario vigente para la fecha. Regístralo en la ficha del empleado.',
    );
  return calcularHoraExtra(
    p.salario!,
    d.horas,
    obtener('SALARIO_DIAS_MES', 'DIAS'),
    horasDiariasEnFecha(p.jornadas, d.fecha).toString(),
    obtener('HORAS_EXTRA_RECARGO_PORCENTAJE', 'PORCENTAJE'),
  );
}
export function crearNovedadesService(db: BaseDatos) {
  async function tx<T>(
    auth: Autenticacion,
    ip: string,
    fn: (c: Connection, a: ActorAuditoria) => Promise<T>,
  ) {
    try {
      return await enTransaccion(db, async (c) => {
        await bloquearCatalogos(c, true);
        const actor = await revalidarActor(c, auth);
        if (!['ADMIN', 'RH'].includes(actor.rol)) throw new ErrorProhibido();
        return fn(c, { ...actor, ip });
      });
    } catch (e) {
      if (e && typeof e === 'object' && 'errorNum' in e) {
        if (e.errorNum === 1) {
          const horas =
            'message' in e &&
            typeof e.message === 'string' &&
            e.message.includes('UQ_HORAS_EXTRA_1');
          throw new ErrorNegocio(
            horas
              ? 'Ya hay horas registradas para este empleado y fecha.'
              : 'Esta referencia ya está registrada. Revisa si el origen ya fue cargado.',
            409,
            'CONFLICTO',
            {
              [horas ? 'fecha' : 'referencia']: [
                horas
                  ? 'Edita el registro existente de este día para corregir sus horas.'
                  : 'Usa una referencia única para este registro.',
              ],
            },
          );
        }
        if (e.errorNum === 2291 || e.errorNum === 2292)
          throw new ErrorConflicto(
            'El registro está relacionado con otra operación. Recarga y conserva su historial.',
          );
      }
      throw e;
    }
  }
  async function buscar(c: Connection, tipo: Tipo, id: number) {
    const d = await repo.detalle(c, tipo, id);
    if (!d) throw new ErrorNoEncontrado();
    return d;
  }
  function editable(d: repo.Fila) {
    if (d.bloqueada)
      throw new ErrorConflicto(
        'Esta novedad afecta un periodo cerrado o ya fue consumida por nómina. Se conserva para consulta.',
      );
    if (!d.activo || ['LIQUIDADO', 'CANCELADO'].includes(d.estado))
      throw new ErrorConflicto('La novedad está liquidada o anulada. Se conserva para consulta.');
  }
  async function enriquecer(c: Connection, tipo: Tipo, d: repo.Fila) {
    let calculo = null,
      advertencia = null;
    if (tipo === 'horas-extra') {
      try {
        calculo = await valorar(c, {
          idEmpleado: d.idEmpleado,
          fecha: d.fecha!,
          horas: d.horas!,
          jornada: d.jornada!,
        });
      } catch (e) {
        if (e instanceof ErrorNegocio) advertencia = e.message;
        else throw e;
      }
    }
    return { ...d, calculo, advertencia };
  }
  async function validar(c: Connection, tipo: Tipo, d: Datos, antes?: repo.Fila) {
    const inicio = d.fecha ?? d.fechaInicio!;
    const campoInicio = d.fecha ? 'fecha' : 'fechaInicio';
    const fin = d.fechaFin ?? inicio;
    const empleado = await repo.empleado(c, d.idEmpleado);
    if (!empleado || empleado.estado !== 'ACTIVO')
      rechazar('idEmpleado', 'Selecciona un empleado activo.');
    if (antes && antes.idEmpleado !== d.idEmpleado)
      rechazar('idEmpleado', 'El empleado de un registro existente no se puede cambiar.');
    if (inicio < empleado!.inicio || (empleado!.fin && fin > empleado!.fin))
      rechazar(campoInicio, 'El rango debe estar dentro de la relación laboral del empleado.');
    if (fin < inicio)
      rechazar('fechaFin', 'La fecha final debe ser igual o posterior a la inicial.');
    if (d.idTipo) {
      const ref = await repo.tipoReferencia(c, tipo, d.idTipo);
      if (!ref) rechazar('idTipo', 'Selecciona un tipo activo del catálogo.');
      if (
        repo.esDescuento(tipo) &&
        (tipo === 'prestamos') !== ['PRESTAMO', 'ANTICIPO'].includes(ref!.codigo)
      )
        rechazar('idTipo', 'Utiliza el módulo correspondiente al tipo de descuento.');
    }
    if (d.estado && d.estado !== 'PENDIENTE' && !d.confirmado)
      rechazar('confirmado', 'Revisa y confirma la aprobación o rechazo.');
    let plan: ReturnType<typeof amortizar> = [];
    if (repo.esDescuento(tipo)) {
      const modalidad = tipo === 'prestamos' ? 'CUOTAS' : d.modalidad!;
      if (modalidad === 'FIJO' && d.cuotas !== null)
        rechazar('cuotas', 'El descuento fijo no tiene número de cuotas ni saldo total.');
      if (modalidad === 'UNICO' && d.cuotas !== 1)
        rechazar('cuotas', 'Un descuento único tiene exactamente una cuota.');
      if (modalidad === 'CUOTAS' && !d.cuotas)
        rechazar('cuotas', 'Indica cuántas cuotas tendrá el descuento.');
      if (modalidad !== 'FIJO') plan = amortizar(d.monto!, d.cuotas!, inicio);
      if (d.fechaFin && modalidad !== 'FIJO')
        rechazar('fechaFin', 'El fin de un descuento en cuotas se obtiene de su amortización.');
      if (tipo === 'prestamos') {
        if (inicio < (await repo.hoy(c)))
          rechazar(
            'fechaInicio',
            'La primera cuota no puede ser pasada. Selecciona hoy o una fecha futura.',
          );
        if (d.fechaDesembolso! > inicio || d.fechaDesembolso! < empleado!.inicio)
          rechazar(
            'fechaDesembolso',
            'El desembolso debe estar entre el ingreso y la primera cuota.',
          );
      }
      if (empleado!.fin && plan.length && plan.at(-1)!.fecha > empleado!.fin)
        rechazar('cuotas', 'El calendario excede la fecha de egreso. Reduce las cuotas.');
    }
    if (tipo === 'ausencias') {
      if (diasInclusivos(inicio, fin) > 366)
        rechazar('fechaFin', 'El rango admite hasta 366 días. Divide los rangos mayores.');
      if (
        d.estado !== 'RECHAZADA' &&
        (await repo.traslape(c, d.idEmpleado, inicio, fin, antes?.id))
      )
        rechazar(
          'fechaInicio',
          'El rango se traslapa con una ausencia, permiso, incapacidad o vacaciones del empleado. Elige fechas libres.',
        );
      if (d.adjunto && !validarAdjunto(d.adjunto))
        rechazar(
          'adjunto',
          'El contenido no corresponde a PDF, PNG o JPEG, o supera 1 MB. Selecciona un archivo válido.',
        );
    }
    const rango =
      tipo === 'comisiones'
        ? quincena(inicio)
        : {
            inicio,
            fin:
              plan.at(-1)?.fecha ?? (repo.esDescuento(tipo) ? (d.fechaFin ?? '9999-12-31') : fin),
          };
    if (await repo.cerrados(c, rango.inicio, rango.fin))
      rechazar(
        campoInicio,
        'El rango afecta un periodo cerrado. Selecciona fechas de periodos abiertos.',
      );
    if (tipo === 'horas-extra')
      await valorar(c, {
        idEmpleado: d.idEmpleado,
        fecha: d.fecha!,
        horas: d.horas!,
        jornada: d.jornada!,
      });
    return plan;
  }
  async function guardar(
    c: Connection,
    actor: ActorAuditoria,
    tipo: Tipo,
    d: Datos,
    antes?: repo.Fila,
  ) {
    const plan = await validar(c, tipo, d, antes);
    const campos: Parameters<typeof repo.guardar>[2] = {};
    const set = (key: string, valor: string | number | null, tipo?: 'fecha' | 'numero') => {
      campos[key] = tipo ? { valor, tipo } : { valor };
    };
    set('ID_EMPLEADO', d.idEmpleado);
    set(tipo === 'comisiones' ? 'DESCRIPCION' : 'MOTIVO', d.motivo);
    if (repo.esDescuento(tipo)) {
      const modalidad = tipo === 'prestamos' ? 'CUOTAS' : d.modalidad!;
      set('ID_TIPO_DESCUENTO', d.idTipo!);
      set('MODALIDAD', modalidad);
      set('MONTO_QUINCENA', plan[0]?.monto ?? d.monto!, 'numero');
      set('MONTO_TOTAL', plan.length ? d.monto! : null, 'numero');
      set('SALDO', plan.length ? d.monto! : null, 'numero');
      set('NUMERO_CUOTAS', plan.length || null);
      set('FECHA_INICIO', d.fechaInicio!, 'fecha');
      set('FECHA_FIN', plan.at(-1)?.fecha ?? d.fechaFin ?? null, 'fecha');
      set('ESTADO', 'VIGENTE');
    } else if (tipo === 'comisiones' || tipo === 'horas-extra') {
      set('ID_PERIODO_NOMINA', await repo.periodo(c, quincena(d.fecha!), actor.idUsuario));
      if (tipo === 'comisiones') {
        set('MONTO', d.monto!, 'numero');
        set('REFERENCIA', d.referencia!);
      } else {
        set('FECHA', d.fecha!, 'fecha');
        set('HORAS', d.horas!, 'numero');
        set('JORNADA', d.jornada!);
      }
    } else {
      set('ID_TIPO_AUSENCIA', d.idTipo!);
      set('FECHA_INICIO', d.fechaInicio!, 'fecha');
      set('FECHA_FIN', d.fechaFin!, 'fecha');
      set('DIAS', diasInclusivos(d.fechaInicio!, d.fechaFin!));
    }
    if (d.estado) {
      set('ESTADO', d.estado);
      set('APROBADO_POR', d.estado === 'APROBADA' ? actor.idUsuario : null);
    }
    const id = await repo.guardar(c, tipo, campos, actor.idUsuario, antes?.id);
    if (repo.esDescuento(tipo)) {
      if (tipo === 'prestamos') await repo.guardarPrestamo(c, id, d, actor.idUsuario);
      await repo.guardarCuotas(c, id, d.idEmpleado, plan, actor.idUsuario);
    }
    if (tipo === 'ausencias') await repo.guardarAdjunto(c, id, d.adjunto, actor.idUsuario);
    const despues = await buscar(c, tipo, id);
    await audit(
      c,
      actor,
      tipo,
      id,
      antes ? 'EDITAR_NOVEDAD' : 'CREAR_NOVEDAD',
      antes ?? null,
      tipo === 'ausencias' && d.adjunto
        ? {
            ...despues,
            soporte: {
              sha256: createHash('sha256')
                .update(Buffer.from(d.adjunto.base64, 'base64'))
                .digest('hex'),
              bytes: Buffer.byteLength(d.adjunto.base64, 'base64'),
            },
          }
        : despues,
      d.motivo,
    );
    return {
      ...(await enriquecer(c, tipo, despues)),
      cuotasDetalle: repo.esDescuento(tipo) ? await repo.cuotas(c, id) : [],
    };
  }
  return {
    restricciones: (id: number, excluir: number) =>
      db.conConexion((c) => repo.restricciones(c, id, excluir)),
    reglas: () => db.conConexion(async (c) => ({ hoy: await repo.hoy(c) })),
    opciones: (
      ref: Parameters<typeof repo.opciones>[1],
      buscar: string,
      pagina: number,
      seleccionado?: number,
    ) => db.conConexion((c) => repo.opciones(c, ref, buscar, pagina, seleccionado)),
    listar: (tipo: Tipo, q: Query) =>
      db.conConexion(async (c) => {
        const r = await repo.listar(c, tipo, q);
        return {
          ...r,
          registros: await Promise.all(r.registros.map((d) => enriquecer(c, tipo, d))),
        };
      }),
    detalle: (tipo: Tipo, id: number) =>
      db.conConexion(async (c) => ({
        ...(await enriquecer(c, tipo, await buscar(c, tipo, id))),
        cuotasDetalle: repo.esDescuento(tipo) ? await repo.cuotas(c, id) : [],
      })),
    crear: (auth: Autenticacion, ip: string, tipo: Tipo, raw: Datos) =>
      tx(auth, ip, (c, a) => guardar(c, a, tipo, schemas[tipo].parse(raw))),
    editar: (auth: Autenticacion, ip: string, tipo: Tipo, id: number, raw: Datos) =>
      tx(auth, ip, async (c, a) => {
        const antes = await buscar(c, tipo, id);
        editable(antes);
        return guardar(c, a, tipo, schemas[tipo].parse(raw), antes);
      }),
    anular: (auth: Autenticacion, ip: string, tipo: Tipo, id: number, motivo: string) =>
      tx(auth, ip, async (c, a) => {
        const antes = await buscar(c, tipo, id);
        editable(antes);
        await repo.anular(c, tipo, id, a.idUsuario);
        const despues = await buscar(c, tipo, id);
        await audit(c, a, tipo, id, 'ANULAR_NOVEDAD', antes, despues, motivo);
        return despues;
      }),
    adjunto: (id: number) =>
      db.conConexion(async (c) => {
        await buscar(c, 'ausencias', id);
        const d = await repo.adjunto(c, id);
        if (!d) throw new ErrorNoEncontrado();
        return d;
      }),
    previsualizar: (auth: Autenticacion, ip: string, tipo: Tipo, raw: Datos) =>
      tx(auth, ip, async (c) => {
        const d: Datos = schemas[tipo].parse(raw);
        const plan = await validar(c, tipo, { ...d, confirmado: true });
        return {
          plan,
          calculo:
            tipo === 'horas-extra'
              ? await valorar(c, {
                  idEmpleado: d.idEmpleado,
                  fecha: d.fecha!,
                  horas: d.horas!,
                  jornada: d.jornada!,
                })
              : null,
        };
      }),
    exportar: (tipo: Tipo, q: Query) =>
      db.conConexion(async (c) => {
        const filas: unknown[][] = [
          [
            'Código',
            'Empleado',
            'Tipo',
            'Inicio',
            'Fin',
            'Estado',
            'Monto',
            'Cuota quincenal',
            'Saldo',
            'Horas',
            'Jornada',
            'Efecto',
            'Motivo',
          ],
        ];
        let pagina = 1;
        do {
          const r = await repo.listar(c, tipo, { ...q, pagina, limite: 100 });
          for (const f of r.registros)
            filas.push([
              f.codigo,
              f.empleado,
              f.tipoNombre ?? tipo,
              f.fechaInicio,
              f.fechaFin,
              f.estado,
              f.monto,
              f.montoQuincena,
              f.saldo,
              f.horas,
              f.jornada,
              f.efecto,
              f.motivo,
            ]);
          if (pagina * 100 >= r.total) break;
          pagina++;
        } while (pagina <= 1000);
        if (pagina > 1000)
          throw new ErrorConflicto('Reduce los filtros para exportar hasta 100,000 registros.');
        return escribirCsv(filas);
      }),
  };
}

// El consumidor controla commit/rollback junto a la nómina. No hay un endpoint de cobro manual.
export async function registrarCobroCuota(
  c: Connection,
  actor: ActorAuditoria,
  idCuota: number,
  idNomina: number,
  monto: string,
) {
  if (!['ADMIN', 'RH'].includes(actor.rol)) throw new ErrorProhibido();
  await bloquearCatalogos(c, true);
  const p = await repo.contextoCobro(c, idCuota, idNomina);
  if (!p || p.estado === 'CERRADO' || p.vigente !== 'VIGENTE')
    throw new ErrorConflicto(
      'La cuota no está pendiente en este periodo, no pertenece a la nómina o el periodo está cerrado.',
    );
  if (new Decimal(monto).gt(p.pendiente))
    throw new ErrorConflicto('El cobro supera el pendiente de la cuota.');
  const nuevo = descontarSaldo(p.saldo, monto);
  await repo.cobrar(c, p, idCuota, idNomina, monto, nuevo.saldo, nuevo.estado, actor.idUsuario);
  await audit(
    c,
    actor,
    'descuentos',
    p.id,
    'APLICAR_CUOTA',
    { saldo: p.saldo },
    { ...nuevo, idCuota, idNomina, monto },
    'Aplicación de cuota desde nómina',
  );
  return nuevo;
}
