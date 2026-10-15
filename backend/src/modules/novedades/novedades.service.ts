import { prepararNovedadesParaPago } from './consumo.service.js';
import { crearParqueoService } from './parqueo.service.js';
import { empleadosResumen } from './pendientes.repository.js';
import * as mensual from './mensuales.service.js';
import * as mesesRepo from './mensuales.repository.js';
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
import { amortizar, diasInclusivos, descontarSaldo, quincena } from './novedades.reglas.js';
import * as repo from './novedades.repository.js';
const rechazar = (campo: string, mensaje: string): never => {
  throw new ErrorNegocio('Revisa los campos indicados antes de continuar.', 422, 'VALIDACION', {
    [campo]: [mensaje],
  });
};
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
            e.message.includes('UQ_NOV_MES_HORAS');
          throw new ErrorNegocio(
            horas
              ? 'Ya hay horas registradas para este empleado y mes.'
              : 'Esta referencia ya está registrada. Revisa si el origen ya fue cargado.',
            409,
            'CONFLICTO',
            {
              [horas ? 'mes' : 'referencia']: [
                horas
                  ? 'Edita el registro existente de este mes para corregir sus horas.'
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
    mensual.exigirEditable(d.estado, d.bloqueada, d.activo);
    if (d.autorizacion === 'RECHAZADA')
      throw new ErrorConflicto(
        'El registro v0 fue rechazado. Conserva la decisión y crea una novedad nueva si corresponde.',
      );
    if (!d.activo || ['LIQUIDADO', 'CANCELADO'].includes(d.estado))
      throw new ErrorConflicto('La novedad está liquidada o anulada. Se conserva para consulta.');
  }
  async function enriquecer(c: Connection, tipo: Tipo, d: repo.Fila) {
    if (tipo === 'horas-extra') {
      if (d.estado === 'APLICADA' || d.valorUnitario) {
        const topes = await mesesRepo.topeHoras(c, d.fechaInicio);
        const total = await mesesRepo.horasMes(c, d.idEmpleado, d.mes!, 0);
        return {
          ...d,
          calculo:
            d.monto && d.valorUnitario && d.recargo
              ? {
                  valorHora: new Decimal(d.valorUnitario).toFixed(2),
                  recargo: d.recargo,
                  monto: new Decimal(d.monto).toFixed(2),
                }
              : null,
          advertencia:
            topes[0] && new Decimal(total).gt(topes[0].valor)
              ? `El total mensual de ${total} horas supera el tope de ${topes[0].valor}. Verifica la cantidad.`
              : null,
        };
      }
      try {
        return {
          ...d,
          ...(await mensual.valorarMes(c, {
            idEmpleado: d.idEmpleado,
            mes: d.mes!,
            horas: d.horas!,
            id: d.id,
          })),
        };
      } catch (e) {
        if (e instanceof ErrorNegocio) return { ...d, calculo: null, advertencia: e.message };
        throw e;
      }
    }
    if (tipo === 'ausencias') {
      const aplicaciones = await mesesRepo.ausenciasMensuales(c, d.id);
      const descuento = aplicaciones.length
        ? new Decimal(0)
            .plus(aplicaciones.reduce((s, m) => s.plus(m.monto ?? 0), new Decimal(0)))
            .toFixed(2)
        : null;
      return {
        ...d,
        estadoAplicacion: aplicaciones.some((m) => m.estado === 'APLICADA')
          ? 'APLICADA'
          : 'PENDIENTE',
        aplicaciones,
        descuento,
      };
    }
    return { ...d, calculo: null, advertencia: null };
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
      if (repo.esDescuento(tipo) && ['PARQUEO', 'CONSUMO_TIENDA'].includes(ref!.codigo))
        rechazar('idTipo', 'Utiliza Suscripciones de parqueo o Consumo en tienda mensual.');
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
    return plan;
  }
  async function guardar(
    c: Connection,
    actor: ActorAuditoria,
    tipo: Tipo,
    d: Datos,
    antes?: repo.Fila,
  ) {
    if (mesesRepo.esMensual(tipo)) {
      if (antes && antes.idEmpleado !== d.idEmpleado)
        rechazar('idEmpleado', 'No se puede cambiar el empleado.');
      const id = await mensual.guardarMensual(c, actor, tipo, d, antes?.id);
      return enriquecer(c, tipo, await buscar(c, tipo, id));
    }
    const plan = await validar(c, tipo, d, antes);
    const campos: Parameters<typeof repo.guardar>[2] = {};
    const set = (key: string, valor: string | number | null, tipo?: 'fecha' | 'numero') => {
      campos[key] = tipo ? { valor, tipo } : { valor };
    };
    set('ID_EMPLEADO', d.idEmpleado);
    set('MOTIVO', d.motivo);
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
    if (tipo === 'ausencias') {
      await repo.guardarAdjunto(c, id, d.adjunto, actor.idUsuario);
      const desglose = await mensual.desglosarAusencia(c, {
        idEmpleado: d.idEmpleado,
        idTipo: d.idTipo!,
        fechaInicio: d.fechaInicio!,
        fechaFin: d.fechaFin!,
      });
      await mesesRepo.limpiarAusencia(c, id);
      for (const m of desglose.meses)
        await mesesRepo.guardarAusenciaMes(
          c,
          {
            id,
            empleado: d.idEmpleado,
            ...m,
            estado: d.estado!,
            motivo: `Descuento por ausencias, ${m.dias} días. ${d.motivo}`.slice(0, 500),
          },
          actor.idUsuario,
        );
    }
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
  const resumenPendientes = (q: {
    mes: string;
    pagina: number;
    limite: number;
    buscar?: string | undefined;
    idDepartamento?: number | undefined;
    ordenarPor?: 'empleado' | 'departamento' | undefined;
    direccion?: 'asc' | 'desc' | undefined;
  }) =>
    db.conConexion(async (c) => {
      mensual.validarMes(q.mes, await repo.hoy(c));
      const empleados = await empleadosResumen(c, q),
        novedades = await prepararNovedadesParaPago(c, q.mes);
      const porEmpleado = new Map<number, typeof novedades>();
      for (const n of novedades) {
        const items = porEmpleado.get(n.idEmpleado) ?? [];
        items.push(n);
        porEmpleado.set(n.idEmpleado, items);
      }
      const registros = empleados.registros.map((e) => {
        const items = porEmpleado.get(e.id) ?? [];
        return {
          ...e,
          novedades: items,
          pendientes: items.length,
          retroactivas: items.filter((n) => n.mes < q.mes).length,
          alertas: items.filter((n) => n.monto === null || n.autorizacion !== 'APROBADA').length,
        };
      });
      const departamentos = await empleadosResumen(c, { ...q, pagina: 1, limite: 1000000 });
      const resumen = new Map<
        number,
        { departamento: string; empleados: number; pendientes: number; alertas: number }
      >();
      for (const e of departamentos.registros) {
        const v = resumen.get(e.idDepartamento) ?? {
          departamento: e.departamento,
          empleados: 0,
          pendientes: 0,
          alertas: 0,
        };
        const items = porEmpleado.get(e.id) ?? [];
        v.empleados++;
        v.pendientes += items.length;
        v.alertas += items.filter((n) => n.monto === null || n.autorizacion !== 'APROBADA').length;
        resumen.set(e.idDepartamento, v);
      }
      return { ...empleados, registros, departamentos: [...resumen.values()] };
    });
  return {
    parqueo: crearParqueoService(db),
    pendientes: resumenPendientes,
    exportarPendientes: async (q: Parameters<typeof resumenPendientes>[0]) => {
      const r = await resumenPendientes({ ...q, pagina: 1, limite: 100000 });
      if (r.total > 100000)
        throw new ErrorConflicto('Reduce los filtros para exportar hasta 100,000 empleados.');
      return escribirCsv([
        ['Empleado', 'Departamento', 'Pendientes', 'Retroactivas', 'Alertas', 'Detalle'],
        ...r.registros.map((e) => [
          e.empleado,
          e.departamento,
          e.pendientes,
          e.retroactivas,
          e.alertas,
          e.novedades.map((n) => `${n.tipo} ${n.mes}: ${n.monto ?? 'Sin monto'}`).join(' | '),
        ]),
      ]);
    },
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
        origenes: mesesRepo.esMensual(tipo) ? await mesesRepo.origenes(c, id) : [],
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
    previsualizar: (auth: Autenticacion, ip: string, tipo: Tipo, raw: Datos, id?: number) =>
      tx(auth, ip, async (c) => {
        const d: Datos = schemas[tipo].parse(raw);
        if (id) {
          const antes = await buscar(c, tipo, id);
          editable(antes);
          if (antes.idEmpleado !== d.idEmpleado)
            rechazar('idEmpleado', 'No se puede cambiar el empleado.');
        }
        if (mesesRepo.esMensual(tipo)) {
          await mensual.validarMensual(c, d);
          return {
            plan: [],
            calculo: null,
            ...(tipo === 'horas-extra'
              ? await mensual.valorarMes(c, {
                  idEmpleado: d.idEmpleado,
                  mes: d.mes!,
                  horas: d.horas!,
                  ...(id ? { id } : {}),
                })
              : {}),
          };
        }
        const plan = await validar(c, tipo, { ...d, confirmado: true });
        return {
          plan,
          calculo: null,
          ...(tipo === 'ausencias'
            ? await mensual.desglosarAusencia(c, {
                idEmpleado: d.idEmpleado,
                idTipo: d.idTipo!,
                fechaInicio: d.fechaInicio!,
                fechaFin: d.fechaFin!,
              })
            : {}),
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
            'Mes',
            'Pago aplicado',
            'Referencia',
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
              f.mes,
              f.idPago,
              f.referencia,
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
