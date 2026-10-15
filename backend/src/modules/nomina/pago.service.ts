import { conLecturaConsistente } from '../../shared/db/lectura.js';
import type { Periodo } from './nomina.types.js';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { Decimal } from 'decimal.js';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { dinero } from '../../shared/utils/dinero.js';
import {
  ErrorConflicto,
  ErrorNegocio,
  ErrorNoEncontrado,
  ErrorProhibido,
} from '../../shared/errors/errors.js';
import type { ActorAuditoria, Autenticacion } from '../auth/auth.types.js';
import { revalidarActor } from '../auth/auth.service.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { membrete, firmante } from '../empresa/empresa.service.js';
import { guardarFirma } from '../empresa/empresa.repository.js';
import { aplicarNovedades, materializarParqueo } from '../novedades/consumo.service.js';
import { hoy } from '../novedades/novedades.repository.js';
import { rangoMes, validarMes } from '../novedades/mensuales.service.js';
import { registrarCobroCuota } from '../novedades/novedades.service.js';
import { fuenteUtilizada } from '../prestaciones/prestaciones.repository.js';
import { completarHistoria } from './nomina.historia.js';
import { calcularPago } from './pago.calculo.js';
import type { EntradaPago, ResultadoPago } from './pago.calculo.js';
import type { ObjetivoPago } from './pago.schemas.js';
import { simularSchema, pagarSchema, revertirPagoSchema } from './pago.schemas.js';
import * as repo from './nomina.repository.js';
import * as pago from './pago.repository.js';
import * as exportar from './nomina.exportar.js';
const hashDe = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
interface FilaSimulacion {
  idEmpleado: number;
  empleado: string;
  departamento: string;
  idDepartamento: number;
  resultado: ResultadoPago | null;
  alertas: string[];
  pagado: boolean;
}
async function preparar(c: Connection, d: ObjetivoPago) {
  const rango = validarMes(d.mes, await hoy(c)),
    periodo = await pago.periodoMes(c, d.mes, d.tipoPago);
  if (periodo && (periodo.motor !== 'V1' || ['APROBADO', 'CERRADO'].includes(periodo.estado)))
    throw new ErrorConflicto(
      'El periodo está aprobado/cerrado o conserva un cálculo v0. Abre el periodo y revisa su estado antes de simular.',
    );
  const fuentes = await repo.fuentes(
    c,
    {
      id: periodo?.id ?? 0,
      ...rango,
      estado: 'ABIERTO',
      version: 0,
      hash: null,
      alertas: '[]',
      empleados: 0,
      ingresos: '0',
      descuentos: '0',
      neto: '0',
      patronal: '0',
    },
    d.idEmpleado,
    d.idDepartamento,
  );
  const objetivo = fuentes.filter(
    (e) => !d.idDepartamento || e.empleado.idDepartamento === d.idDepartamento,
  );
  if (!objetivo.length)
    throw new ErrorConflicto('No hay empleados con relación laboral para este objetivo y mes.');
  if (objetivo.length > 10000)
    throw new ErrorConflicto(
      'Selecciona un departamento para reducir el objetivo a 10,000 empleados.',
    );
  const pagos = await pago.pagosMes(c, d.mes),
    entradas: EntradaPago[] = [],
    registros: FilaSimulacion[] = [];
  for (const e of objetivo) {
    const novedades = await pago.novedades(c, d.mes, e.empleado.id);
    const entrada: EntradaPago = {
      ...e,
      mes: d.mes,
      tipoPago: d.tipoPago,
      anticipo:
        pagos.find((p) => p.empleado === e.empleado.id && p.tipo === 'ANTICIPO')?.neto ?? '0.00',
      novedades,
    };
    // Las fuentes diarias v0 ya fueron migradas al libro mensual y no se consumen por segunda vez.
    entrada.comisiones = [];
    entrada.horas = [];
    entradas.push(entrada);
    const yaPagado = pagos.some((p) => p.empleado === e.empleado.id && p.tipo === d.tipoPago);
    const fila: FilaSimulacion = {
      idEmpleado: e.empleado.id,
      empleado: `${e.empleado.codigo} · ${e.empleado.nombres} ${e.empleado.apellidos}`,
      departamento: e.empleado.departamento,
      idDepartamento: e.empleado.idDepartamento,
      resultado: null,
      alertas: [],
      pagado: yaPagado,
    };
    try {
      if (yaPagado)
        throw new ErrorConflicto(
          'Este empleado ya tiene este pago registrado. No se permite pagarlo dos veces.',
        );
      if (
        d.tipoPago === 'ANTICIPO' &&
        pagos.some((p) => p.empleado === e.empleado.id && p.tipo === 'PAGO')
      )
        throw new ErrorConflicto(
          'El pago del mes ya está registrado. No puedes añadir un anticipo después.',
        );
      if (await pago.dependenciaPosterior(c, e.empleado.id, d.mes, 'PAGO'))
        throw new ErrorConflicto(
          'Hay pagos posteriores de este empleado. Reviértelos en orden inverso antes de pagar este mes.',
        );
      if (!e.empleado.usuario)
        throw new ErrorConflicto(
          'Vincula el usuario del empleado para publicar y notificar su boleta.',
        );
      const completa = d.tipoPago === 'PAGO' ? completarHistoria(entrada) : entrada;
      Object.assign(entrada, completa);
      fila.resultado = calcularPago(entrada);
      fila.alertas = [...fila.resultado.alertas];
    } catch (error) {
      if (!(error instanceof ErrorNegocio)) throw error;
      fila.alertas.push(error.message);
    }
    registros.push(fila);
  }
  const totales = { ingresos: '0.00', descuentos: '0.00', neto: '0.00', patronal: '0.00' };
  for (const k of ['ingresos', 'descuentos', 'neto', 'patronal'] as const)
    totales[k] = dinero(registros.reduce((s, f) => s.plus(f.resultado?.[k] ?? 0), new Decimal(0)));
  const verificacion = {
    horasExtra: 0,
    comisiones: 0,
    consumos: 0,
    ausencias: 0,
    retroactivas: 0,
    conAlertas: registros.filter((f) => f.alertas.length).length,
  };
  for (const e of entradas) {
    for (const [campo, tipo] of [
      ['horasExtra', 'HORAS_EXTRA'],
      ['comisiones', 'COMISION'],
      ['consumos', 'CONSUMO_TIENDA'],
      ['ausencias', 'AUSENCIA'],
    ] as const)
      if (e.novedades.some((n) => n.tipo === tipo)) verificacion[campo]++;
    if (e.novedades.some((n) => n.mes < d.mes)) verificacion.retroactivas++;
  }
  return {
    entradas,
    periodo,
    mes: d.mes,
    tipoPago: d.tipoPago,
    fechaPago: d.tipoPago === 'ANTICIPO' ? `${d.mes}-15` : rango.fin,
    registros,
    totales,
    verificacion,
    hash: hashDe({ d, entradas, periodo: periodo ?? null, pagos }),
  };
}
function publica(r: Awaited<ReturnType<typeof preparar>>) {
  return {
    mes: r.mes,
    tipoPago: r.tipoPago,
    fechaPago: r.fechaPago,
    registros: r.registros,
    totales: r.totales,
    verificacion: r.verificacion,
    hash: r.hash,
  };
}
export function crearPagosService(db: BaseDatos) {
  const lectura = <T>(fn: (c: Connection) => Promise<T>) => conLecturaConsistente(db, fn);
  const tx = <T>(
    auth: Autenticacion,
    ip: string,
    fn: (c: Connection, a: ActorAuditoria) => Promise<T>,
  ) =>
    enTransaccion(db, async (c) => {
      await bloquearCatalogos(c, true);
      const a = await revalidarActor(c, auth);
      if (!['ADMIN', 'RH'].includes(a.rol)) throw new ErrorProhibido();
      try {
        return await fn(c, { ...a, ip });
      } catch (e) {
        if (e && typeof e === 'object' && 'errorNum' in e && e.errorNum === 1)
          throw new ErrorConflicto(
            'El pago ya fue registrado. Recarga el historial; no se permite pagar dos veces.',
          );
        throw e;
      }
    });
  return {
    simular: (raw: unknown) =>
      lectura(async (c) => publica(await preparar(c, simularSchema.parse(raw)))),
    previewPago: (raw: unknown, idEmpleado: number) =>
      lectura(async (c) => {
        const r = await preparar(c, simularSchema.parse(raw)),
          f = r.registros.find((f) => f.idEmpleado === idEmpleado),
          e = r.entradas.find((e) => e.empleado.id === idEmpleado);
        if (!f || !e) throw new ErrorNoEncontrado();
        if (!f.resultado) throw new ErrorConflicto(f.alertas.join(' '));
        const n: repo.Guardado = {
          id: 0,
          idEmpleado,
          inicio: e.inicio,
          fin: e.fin,
          estado: 'SIMULACION',
          version: 0,
          snapshot: JSON.stringify({ entrada: e, resultado: f.resultado }),
        };
        return exportar.archivo(
          await exportar.boletasPdf([n], await membrete(c)),
          'simulacion.pdf',
          'application/pdf',
        );
      }),
    pagar: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const d = pagarSchema.parse(raw),
          hash = d.hash,
          objetivo = simularSchema.parse({
            mes: d.mes,
            tipoPago: d.tipoPago,
            objetivo: d.objetivo,
            ...(d.idEmpleado ? { idEmpleado: d.idEmpleado } : {}),
            ...(d.idDepartamento ? { idDepartamento: d.idDepartamento } : {}),
          }),
          r = await preparar(c, objetivo);
        if (hash !== r.hash)
          throw new ErrorConflicto(
            'Cambiaron los datos, novedades o pagos desde la simulación. Simula y revisa nuevamente antes de confirmar.',
          );
        const elegibles = r.registros.filter((f) => f.resultado && !f.pagado);
        if (!elegibles.length)
          throw new ErrorConflicto(
            'No hay empleados habilitados para pagar. Revisa las alertas o el historial de pagos.',
          );
        const empresa = await membrete(c),
          firma = await firmante(c, a.idUsuario);
        let p = r.periodo;
        if (!p) {
          const inicio = d.tipoPago === 'ANTICIPO' ? `${d.mes}-01` : `${d.mes}-16`,
            fin = r.fechaPago;
          const id = await repo.crear(
            c,
            inicio,
            fin,
            d.tipoPago === 'ANTICIPO' ? 1 : 2,
            a.idUsuario,
          );
          p = (await repo.periodo(c, id))!;
        }
        const ids: number[] = [];
        for (const f of elegibles) {
          const e = r.entradas.find((e) => e.empleado.id === f.idEmpleado)!,
            resultado = f.resultado!;
          const version = await pago.siguienteVersion(c, p.id, e.empleado.id);
          const id = await repo.guardarResultado(
            c,
            { ...p, version },
            e,
            resultado,
            a.idUsuario,
            empresa,
          );
          await pago.registrarPago(c, id, e.empleado.id, d.mes, d.tipoPago, a.idUsuario);
          if (d.tipoPago === 'PAGO') await materializarParqueo(c, a, d.mes, e.empleado.id);
          const pendientes = await prepararNovedadesParaAplicar(c, e, d.tipoPago);
          for (const l of resultado.lineas)
            if (
              l.novedad &&
              pendientes.includes(l.novedad) &&
              ['HORAS_EXTRA', 'AUSENCIA_SIN_GOCE'].includes(l.concepto.codigo)
            )
              await pago.actualizarValorAplicado(c, l.novedad, l.monto, a.idUsuario);
          await aplicarNovedades(c, a, id, pendientes);
          for (const [i, l] of resultado.lineas.entries())
            if (l.descuento) {
              if (l.descuento.cuota)
                await registrarCobroCuota(c, a, l.descuento.cuota, id, l.monto);
              else
                await repo.aplicarFijo(
                  c,
                  p,
                  e.empleado.id,
                  id,
                  l.descuento.id,
                  l.monto,
                  a.idUsuario,
                );
              await repo.vincularAplicacion(
                c,
                id,
                l.descuento.id,
                l.descuento.cuota,
                i + 1,
                a.idUsuario,
              );
            }
          await guardarFirma(c, 'NOMINA_EMPLEADO', id, firma);
          const n: repo.Guardado = {
            id,
            idEmpleado: e.empleado.id,
            inicio: p.inicio,
            fin: p.fin,
            estado: 'PAGADO',
            version,
            snapshot: JSON.stringify({ entrada: e, resultado }),
          };
          const pdf = await exportar.boletasPdf([n], empresa, new Map([[id, firma]]));
          await pago.archivarBoleta(
            c,
            id,
            pdf,
            createHash('sha256').update(pdf).digest('hex'),
            a.idUsuario,
          );
          await c.execute(
            "UPDATE NOMINA_EMPLEADO SET FECHA_PAGO=TO_DATE(:fecha,'YYYY-MM-DD'),MODIFICADO_POR=:actor WHERE ID_NOMINA_EMPLEADO=:id",
            { id, fecha: r.fechaPago, actor: a.idUsuario },
          );
          await pago.notificar(c, id, e.empleado.usuario!, a.idUsuario);
          await registrarAuditoria(c, {
            actor: a,
            accion: 'PAGAR_NOMINA',
            entidad: 'NOMINA_EMPLEADO',
            idEntidad: id,
            antes: null,
            despues: { mes: d.mes, tipoPago: d.tipoPago, neto: resultado.neto, hash },
            motivo: 'Confirmación de novedades completas y pago mensual',
          });
          ids.push(id);
        }
        await repo.estado(
          c,
          p.id,
          'CALCULADO',
          a.idUsuario,
          Math.max(1, p.version),
          null,
          [],
          'Pago confirmado; pendiente revisión y cierre',
        );
        return {
          idPeriodo: p.id,
          pagados: ids,
          bloqueados: r.registros.filter((f) => !f.resultado),
          mensaje: `Se pagaron ${ids.length} empleados. Los bloqueados conservan sus novedades pendientes.`,
        };
      }),
    revertirPago: (auth: Autenticacion, ip: string, id: number, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        if (a.rol !== 'ADMIN') throw new ErrorProhibido('Solo ADMIN puede revertir pagos.');
        const d = revertirPagoSchema.parse(raw),
          pagoActual = await pago.pagoPorNomina(c, id);
        if (!pagoActual || pagoActual.estado !== 'PAGADO')
          throw new ErrorConflicto('El pago no existe o ya fue revertido.');
        const p = (await repo.periodo(c, pagoActual.periodo))!;
        if (p.estado === 'CERRADO')
          throw new ErrorConflicto(
            'El periodo está cerrado. La reversión solo está disponible antes del cierre.',
          );
        if (
          await pago.dependenciaPosterior(c, pagoActual.empleado, pagoActual.mes, pagoActual.tipo)
        )
          throw new ErrorConflicto(
            'Hay un pago posterior que depende de este cálculo. Reviértelo primero.',
          );
        if (await fuenteUtilizada(c, id))
          throw new ErrorConflicto(
            'Este pago sustenta prestaciones. Resuelve sus cálculos antes de revertirlo.',
          );
        await repo.revertir(c, p, a.idUsuario, id);
        await pago.revertir(c, id, a.idUsuario, d.motivo);
        await repo.estado(c, p.id, 'CALCULADO', a.idUsuario, p.version, null, [], d.motivo);
        const n = await repo.resultado(c, id);
        if (n?.usuario) await pago.notificar(c, id, n.usuario, a.idUsuario, true);
        await registrarAuditoria(c, {
          actor: a,
          accion: 'REVERTIR_PAGO',
          entidad: 'NOMINA_EMPLEADO',
          idEntidad: id,
          antes: { estado: 'PAGADO' },
          despues: { estado: 'REVERTIDO' },
          motivo: d.motivo,
        });
        return { revertido: true };
      }),
    zipPagos: (q: {
      mes: string;
      idDepartamento?: number | undefined;
      idEmpleado?: number | undefined;
    }) =>
      lectura(async (c) => {
        const r = await repo.listar(c, {
          pagina: 1,
          limite: 100,
          ordenarPor: 'empleado',
          direccion: 'asc',
          anio: Number(q.mes.slice(0, 4)),
          mes: Number(q.mes.slice(5, 7)),
          ...(q.idDepartamento ? { idDepartamento: q.idDepartamento } : {}),
          ...(q.idEmpleado ? { idEmpleado: q.idEmpleado } : {}),
        });
        if (r.total > 10000)
          throw new ErrorConflicto(
            'Selecciona un departamento para descargar un máximo de 10,000 boletas.',
          );
        const archivos: Record<string, Uint8Array> = {};
        for (let pagina = 1; (pagina - 1) * 100 < r.total; pagina++) {
          const lote =
            pagina === 1
              ? r
              : await repo.listar(c, {
                  pagina,
                  limite: 100,
                  ordenarPor: 'empleado',
                  direccion: 'asc',
                  anio: Number(q.mes.slice(0, 4)),
                  mes: Number(q.mes.slice(5, 7)),
                  ...(q.idDepartamento ? { idDepartamento: q.idDepartamento } : {}),
                  ...(q.idEmpleado ? { idEmpleado: q.idEmpleado } : {}),
                });
          for (const f of lote.registros) {
            const pdf = await pago.boletaArchivada(c, f.id);
            if (pdf)
              archivos[
                `departamento-${exportar.snapshot((await repo.resultado(c, f.id))!).entrada.empleado.idDepartamento}/boleta-${f.id}.pdf`
              ] = pdf;
          }
        }
        if (!Object.keys(archivos).length)
          throw new ErrorConflicto('No hay boletas pagadas para este mes y departamento.');
        return exportar.archivo(
          Buffer.from(zipSync(archivos)),
          `boletas-${q.mes}.zip`,
          'application/zip',
        );
      }),
  };
}
async function prepararNovedadesParaAplicar(c: Connection, e: EntradaPago, tipo: string) {
  const { prepararNovedadesParaPago } = await import('../novedades/consumo.service.js');
  return (await prepararNovedadesParaPago(c, e.mes, e.empleado.id))
    .filter((n) => tipo === 'PAGO' || ['COMISION', 'HORAS_EXTRA'].includes(n.tipo))
    .map((n) => n.id!)
    .filter((id) => id !== null);
}
export async function accionPeriodoMensual(
  c: Connection,
  p: Periodo,
  accion: string,
  a: ActorAuditoria,
  motivo: string,
) {
  const { validarTransicion } = await import('./nomina.calculo.js');
  if (accion === 'calcular')
    throw new ErrorConflicto(
      'Usa Nómina → Simular pago para calcular y confirmar pagos de este periodo.',
    );
  validarTransicion(p.estado, accion, a.rol, motivo);
  const rs = await repo.resultados(c, p.id);
  if (accion !== 'reabrir' && !rs.length)
    throw new ErrorConflicto('No hay pagos vigentes para revisar o cerrar.');
  if (['revisar', 'aprobar', 'cerrar'].includes(accion)) {
    const mes = p.inicio.slice(0, 7),
      tipo = p.inicio.endsWith('-01') ? 'ANTICIPO' : 'PAGO';
    const rango = rangoMes(mes),
      fuentes = await repo.fuentes(c, { ...p, ...rango });
    if (fuentes.some((e) => !rs.some((n) => n.idEmpleado === e.empleado.id)))
      throw new ErrorConflicto(
        'Faltan empleados por pagar. Resuelve sus alertas y confirma sus pagos antes del cierre.',
      );
    const { prepararNovedadesParaPago } = await import('../novedades/consumo.service.js');
    for (const e of fuentes)
      if (
        (await prepararNovedadesParaPago(c, mes, e.empleado.id)).some(
          (n) => tipo === 'PAGO' || ['COMISION', 'HORAS_EXTRA'].includes(n.tipo),
        )
      )
        throw new ErrorConflicto(
          'Hay novedades pendientes posteriores al pago. Revisa y revierte el pago afectado antes de cerrar.',
        );
  }
  if (accion === 'cerrar' && (await repo.anteriores(c, p)))
    throw new ErrorConflicto('Cierra primero los periodos anteriores del mismo año.');
  const estado =
    accion === 'reabrir'
      ? 'CALCULADO'
      : accion === 'devolver'
        ? 'CALCULADO'
        : accion === 'revisar'
          ? 'REVISADO'
          : accion === 'aprobar'
            ? 'APROBADO'
            : 'CERRADO';
  if (accion === 'aprobar')
    await guardarFirma(c, 'PERIODOS_NOMINA', p.id, await firmante(c, a.idUsuario));
  await repo.estado(c, p.id, estado, a.idUsuario, p.version, p.hash, [], motivo);
  await registrarAuditoria(c, {
    actor: a,
    accion: accion.toUpperCase() + '_PERIODO',
    entidad: 'PERIODOS_NOMINA',
    idEntidad: p.id,
    antes: { estado: p.estado },
    despues: { estado },
    motivo: motivo || `Flujo mensual: ${accion}`,
  });
  return { id: p.id, estado, version: p.version, alertas: [] };
}
