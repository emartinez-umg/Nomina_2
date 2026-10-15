import { membrete, firmante } from '../empresa/empresa.service.js';
import {
  guardarFirma,
  obtenerFirma,
  obtenerEmpresa,
  guardarConstancia,
} from '../empresa/empresa.repository.js';
import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import {
  ErrorConflicto,
  ErrorNegocio,
  ErrorNoEncontrado,
  ErrorProhibido,
} from '../../shared/errors/errors.js';
import { dinero } from '../../shared/utils/dinero.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { revalidarActor } from '../auth/auth.service.js';
import type { ActorAuditoria, Autenticacion } from '../auth/auth.types.js';
import { bloquearAdministracion, cambiarEstado } from '../usuarios/usuarios.repository.js';
import { revocarSesiones } from '../auth/auth.repository.js';
import { baja } from '../empleados/empleados.repository.js';
import { escribirCsv } from '../empleados/empleados.csv.js';
import { hoy } from '../novedades/novedades.repository.js';
import { quincena } from '../novedades/novedades.reglas.js';
import { prepararVacacionesFiniquito } from '../vacaciones/vacaciones.service.js';
import { mover } from '../vacaciones/vacaciones.repository.js';
import * as nomina from '../nomina/nomina.repository.js';
import { calcularNomina } from '../nomina/nomina.calculo.js';
import type { Entrada, Resultado } from '../nomina/nomina.types.js';
import { archivo } from '../nomina/nomina.exportar.js';
import {
  ciclo,
  calcularAnual,
  calcularIndemnizacion,
  ventanaIndemnizacion,
  valor,
  totalizar,
  siguiente,
} from './prestaciones.calculo.js';
import type { Componente, Devengado, TipoAnual } from './prestaciones.calculo.js';
import {
  anualSchema,
  finiquitoSchema,
  guardarSchema,
  liquidarSchema,
  accionSchema,
  constanciaSchema,
} from './prestaciones.schemas.js';
import type { Seleccion, Finiquito, Query } from './prestaciones.schemas.js';
import * as repo from './prestaciones.repository.js';
import { prestacionPdf, constanciaPdf } from './prestaciones.pdf.js';
const hashDe = (v: unknown) =>
  createHash('sha256')
    .update(Buffer.isBuffer(v) ? v : JSON.stringify(v))
    .digest('hex');
interface Historia {
  ingresos: Devengado[];
  fuentes: unknown[];
  nominas: number[];
}
export interface Vista {
  idEmpleado: number;
  empleado: string;
  inicio: string;
  fin: string;
  componentes: Componente[];
  total: string;
  exento: string;
  gravado: string;
  hash: string;
  fuentes: unknown[];
  nominas: number[];
  error?: string;
}
export interface Snapshot extends Vista {
  versionMotor: string;
  seleccion: Seleccion | Finiquito;
  empresa: Awaited<ReturnType<typeof nomina.empresa>>;
}
const audit = (
  c: Connection,
  actor: ActorAuditoria,
  id: number,
  accion: string,
  despues: unknown,
  motivo: string,
  antes: unknown = null,
) =>
  registrarAuditoria(c, {
    actor,
    accion,
    entidad: 'PRESTACIONES',
    idEntidad: id,
    antes,
    despues,
    motivo,
  });
async function obtener(c: Connection, id: number) {
  const e = await repo.empleado(c, id);
  if (!e) throw new ErrorNoEncontrado();
  return e;
}
async function devengados(
  c: Connection,
  e: repo.Empleado,
  inicio: string,
  fin: string,
): Promise<Historia> {
  const ingresos: Devengado[] = [],
    fuentes: unknown[] = [],
    nominas: number[] = [];
  let cursor = inicio;
  while (cursor <= fin) {
    const fechas = quincena(cursor);
    const p = (await repo.periodo(c, fechas.inicio)) ?? {
      id: 0,
      ...fechas,
      estado: 'ABIERTO' as const,
      version: 0,
      hash: null,
      alertas: '[]',
      empleados: 0,
      ingresos: '0',
      descuentos: '0',
      neto: '0',
      patronal: '0',
    };
    const hasta = p.fin < fin ? p.fin : fin;
    let entrada: Entrada, resultado: Resultado;
    const guardado = p.estado === 'CERRADO' ? await repo.cerrado(c, e.id, p) : undefined;
    if (p.estado === 'CERRADO' && !guardado)
      throw new ErrorConflicto(`Falta el cálculo cerrado de ${cursor} para el empleado.`);
    if (guardado) {
      const s = JSON.parse(guardado.snapshot) as { entrada: Entrada; resultado: Resultado };
      entrada = s.entrada;
      resultado = s.resultado;
      nominas.push(guardado.id);
      fuentes.push({ nomina: guardado.id, snapshot: guardado.snapshot });
    } else {
      const entradas = await nomina.fuentes(c, p, e.id);
      if (!entradas[0]) throw new ErrorConflicto(`No hay fuentes salariales para ${cursor}.`);
      entrada = entradas[0];
      fuentes.push({ periodo: p.id, estado: p.estado, entrada });
      resultado = calcularNomina({ ...entrada, descuentos: [], prestaciones: [] });
    }
    if (cursor > p.inicio || hasta < p.fin) {
      const ajustada = {
        ...entrada,
        empleado: {
          ...entrada.empleado,
          ingreso: cursor > e.ingreso ? cursor : e.ingreso,
          egreso: hasta,
        },
        comisiones: hasta === p.fin || !guardado ? entrada.comisiones : [],
        horas: entrada.horas.filter((h) => h.fecha >= cursor && h.fecha <= hasta),
        descuentos: [],
        prestaciones: [],
      };
      resultado = calcularNomina(ajustada);
    }
    if (resultado.alertas.length) throw new ErrorConflicto(resultado.alertas.join(' '));
    const monto = resultado.lineas
      .filter((l) => l.concepto.prestaciones === 1)
      .reduce(
        (s, l) =>
          l.concepto.naturaleza === 'INGRESO'
            ? s.plus(l.monto)
            : l.concepto.codigo === 'AUSENCIA_SIN_GOCE'
              ? s.minus(l.monto)
              : s,
        new Decimal(0),
      );
    const meses = resultado.lineas
      .filter((l) => l.concepto.codigo === 'SALARIO_BASE')
      .reduce(
        (s, l) =>
          s.plus(
            new Decimal(l.cantidad).div(
              valor(entrada.parametros, 'SALARIO_DIAS_MES', l.fecha, 'DIAS'),
            ),
          ),
        new Decimal(0),
      );
    ingresos.push({
      inicio: cursor,
      fin: hasta,
      monto: dinero(Decimal.max(0, monto)),
      meses: meses.toString(),
    });
    cursor = siguiente(hasta);
  }
  return { ingresos, fuentes, nominas };
}
async function anual(c: Connection, e: repo.Empleado, q: Seleccion, excluir = 0): Promise<Vista> {
  const ps = await repo.parametros(c),
    periodo = ciclo(q.tipo, q.anio, ps),
    actual = await hoy(c);
  if (periodo.fin > actual)
    throw new ErrorConflicto('El ciclo aún no termina. Calcula después de su fecha final.');
  const inicio = e.ingreso > periodo.inicio ? e.ingreso : periodo.inicio,
    fin = e.egreso && e.egreso < periodo.fin ? e.egreso : periodo.fin;
  if ((await repo.conflictos(c, e.id, q.tipo, periodo.inicio, periodo.fin, excluir)).length)
    throw new ErrorConflicto(
      'Ya hay una prestación o finiquito para este ciclo. Consulta el historial.',
    );
  const h = await devengados(c, e, inicio, fin),
    salario = await repo.salario(c, e.id, fin);
  if (!salario) throw new ErrorConflicto('Falta salario vigente al corte.');
  const componente = calcularAnual(
    q.tipo,
    inicio,
    fin,
    h.ingresos,
    ps,
    salario,
    await repo.exencionUsada(c, e.id, q.tipo, Number(actual.slice(0, 4)), excluir),
  );
  const fuentes = { e, h, ps, componente, periodo };
  return {
    idEmpleado: e.id,
    empleado: e.nombre,
    inicio: periodo.inicio,
    fin: periodo.fin,
    componentes: [componente],
    ...totalizar([componente]),
    hash: hashDe(fuentes),
    fuentes: [fuentes],
    nominas: h.nominas,
  };
}
export function crearPrestacionesService(db: BaseDatos) {
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
          throw new ErrorConflicto('La prestación ya existe. Recarga el historial.');
        throw e;
      }
    });
  async function masivo(c: Connection, q: Seleccion) {
    const ps = await repo.parametros(c),
      p = ciclo(q.tipo, q.anio, ps),
      es = await repo.empleados(c, q, p.inicio, p.fin);
    if (es.length > 500)
      throw new ErrorConflicto('Filtra por departamento: se admiten hasta 500 empleados por lote.');
    const filas: Vista[] = [];
    for (const e of es)
      try {
        filas.push(await anual(c, e, q));
      } catch (error) {
        if (!(error instanceof ErrorNegocio)) throw error;
        filas.push({
          idEmpleado: e.id,
          empleado: e.nombre,
          inicio: p.inicio,
          fin: p.fin,
          componentes: [],
          total: '0.00',
          exento: '0.00',
          gravado: '0.00',
          hash: '',
          fuentes: [],
          nominas: [],
          error: error.message,
        });
      }
    return {
      filas,
      hash: hashDe(filas),
      limitePago: p.limitePago,
      total: dinero(filas.reduce((s, f) => s.plus(f.total), new Decimal(0))),
    };
  }
  async function simular(c: Connection, a: ActorAuditoria, q: Finiquito): Promise<Vista> {
    const e = await obtener(c, q.idEmpleado),
      actual = await hoy(c);
    if (e.estado !== 'ACTIVO' || q.corte < e.ingreso || q.corte > actual)
      throw new ErrorConflicto(
        'Selecciona un empleado activo y un egreso no futuro desde su ingreso.',
      );
    if ((await repo.otrosPendientes(c, e.id)).length)
      throw new ErrorConflicto(
        'Resuelve las prestaciones calculadas o aprobadas antes de liquidar.',
      );
    if ((await repo.conflictos(c, e.id, 'INDEMNIZACION', e.ingreso, q.corte)).length)
      throw new ErrorConflicto('El empleado ya tiene una liquidación registrada.');
    if ((await repo.posterioresEmpleado(c, e.id, q.corte)).length)
      throw new ErrorConflicto(
        'El egreso afectaría una nómina aprobada o cerrada. Devuélvela a revisión o reabre antes de liquidar.',
      );
    const ps = await repo.parametros(c);
    for (const tipo of ['AGUINALDO', 'BONO_14'] as TipoAnual[]) {
      for (let anio = Number(e.ingreso.slice(0, 4)); anio <= Number(q.corte.slice(0, 4)); anio++) {
        const periodo = ciclo(tipo, anio, ps);
        if (periodo.fin < e.ingreso || periodo.fin >= q.corte) continue;
        const anteriores = await repo.conflictos(c, e.id, tipo, periodo.inicio, periodo.fin);
        if (!anteriores.some((p) => p.estado === 'PAGADA'))
          throw new ErrorConflicto(
            `Falta registrar el pago de ${tipo} del ciclo que termina ${periodo.fin}. Regulariza esa obligación antes de liquidar.`,
          );
      }
    }
    const n = valor(ps, 'INDEMNIZACION_PROMEDIO_MESES', q.corte, 'MESES').toNumber();
    if (!Number.isInteger(n) || n > 12)
      throw new ErrorConflicto('Configura los meses de indemnización entre 1 y 12.');
    const ventana = ventanaIndemnizacion(q.corte, n),
      inicio = ventana > e.ingreso ? ventana : e.ingreso;
    const h = await devengados(c, e, inicio, q.corte),
      fuentes: unknown[] = [{ e, ps, h, causa: q.causa }],
      nominas = [...h.nominas];
    const componentes = [
      calcularIndemnizacion(
        e.ingreso,
        q.corte,
        inicio,
        h.ingresos,
        ps,
        q.causa === 'DESPIDO_INJUSTIFICADO',
      ),
    ];
    const vacaciones = await prepararVacacionesFiniquito(c, a, e.id, q.corte);
    fuentes.push(vacaciones);
    componentes.push({
      concepto: 'VACACIONES_PENDIENTES',
      inicio: e.ingreso,
      fin: q.corte,
      promedio: vacaciones.salario,
      meses: '0',
      tiempo: vacaciones.dias,
      monto: vacaciones.monto,
      exento: '0.00',
      gravado: vacaciones.monto,
    });
    for (const tipo of ['AGUINALDO', 'BONO_14'] as TipoAnual[]) {
      const anio = Number(q.corte.slice(0, 4));
      let p = ciclo(tipo, anio, ps);
      if (q.corte > p.fin) p = ciclo(tipo, anio + 1, ps);
      const desde = e.ingreso > p.inicio ? e.ingreso : p.inicio;
      const previas = await repo.conflictos(c, e.id, tipo, p.inicio, q.corte);
      if (previas.some((p) => p.estado !== 'PAGADA'))
        throw new ErrorConflicto(`Resuelve ${tipo} pendiente antes de liquidar.`);
      const pagos = [];
      for (const previa of previas) pagos.push((await repo.registro(c, previa.id))!);
      const hx = await devengados(c, e, desde, q.corte),
        salario = await repo.salario(c, e.id, q.corte);
      if (!salario) throw new ErrorConflicto('Falta salario vigente al egreso.');
      const componente = calcularAnual(
        tipo,
        desde,
        q.corte,
        hx.ingresos,
        ps,
        salario,
        await repo.exencionUsada(c, e.id, tipo, Number(actual.slice(0, 4))),
      );
      const pagado = pagos.reduce((s, p) => s.plus(p.total), new Decimal(0));
      const pendiente = new Decimal(componente.monto).minus(pagado);
      if (pendiente.lt(0))
        throw new ErrorConflicto(
          `El pago anterior de ${tipo} supera el devengado actual. Revisa las fuentes antes de liquidar.`,
        );
      const exento = Decimal.min(pendiente, componente.exento);
      componentes.push({
        ...componente,
        monto: dinero(pendiente),
        exento: dinero(exento),
        gravado: dinero(pendiente.minus(exento)),
      });
      fuentes.push({ tipo, p, hx, pagos });
      nominas.push(...hx.nominas);
    }
    return {
      idEmpleado: e.id,
      empleado: e.nombre,
      inicio: e.ingreso,
      fin: q.corte,
      componentes,
      ...totalizar(componentes),
      hash: hashDe(fuentes),
      fuentes,
      nominas: [...new Set(nominas)],
    };
  }
  const guardar = async (
    c: Connection,
    a: ActorAuditoria,
    v: Vista,
    seleccion: Seleccion | Finiquito,
    motivo: string,
    tipo: string,
  ) => {
    const snapshot: Snapshot = {
      ...v,
      versionMotor: '9.0.0',
      seleccion,
      empresa: await nomina.empresa(c),
    };
    const id = await repo.guardar(
      c,
      {
        idEmpleado: v.idEmpleado,
        tipo,
        inicio: v.inicio,
        fin: v.fin,
        promedio: v.componentes[0]!.promedio,
        tiempo: v.componentes[0]!.tiempo,
        total: v.total,
        hash: v.hash,
        snapshot,
        motivo,
        componentes: v.componentes,
      },
      a.idUsuario,
    );
    await audit(c, a, id, 'CALCULAR_PRESTACION', { ...v, fuentes: undefined }, motivo);
    return id;
  };
  return {
    listar: (q: Query) => db.conConexion((c) => repo.listar(c, q)),
    detalle: (id: number) =>
      db.conConexion(async (c) => {
        const r = await repo.registro(c, id);
        if (!r) throw new ErrorNoEncontrado();
        return { ...r, snapshot: r.snapshot ? (JSON.parse(r.snapshot) as Snapshot) : null };
      }),
    previsualizar: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c) => masivo(c, anualSchema.parse(raw))),
    calcular: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const d = guardarSchema.parse(raw),
          v = await masivo(c, d.seleccion);
        if (v.hash !== d.hash)
          throw new ErrorConflicto('Las fuentes cambiaron. Genera otra vista previa.');
        if (!v.filas.length || v.filas.some((f) => f.error))
          throw new ErrorConflicto(
            'Resuelve los errores de la vista previa antes de guardar el lote.',
          );
        const ids = [];
        for (const f of v.filas)
          ids.push(await guardar(c, a, f, d.seleccion, d.motivo, d.seleccion.tipo));
        return { ids };
      }),
    simular: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, (c, a) => simular(c, a, finiquitoSchema.parse(raw))),
    liquidar: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const d = liquidarSchema.parse(raw),
          v = await simular(c, a, d.seleccion);
        if (v.hash !== d.hash)
          throw new ErrorConflicto('Las fuentes cambiaron. Simula nuevamente antes de confirmar.');
        const id = await guardar(c, a, v, d.seleccion, d.motivo, 'INDEMNIZACION');
        await membrete(c);
        await guardarFirma(c, 'PRESTACIONES', id, await firmante(c, a.idUsuario));
        await repo.estado(c, id, 'APROBADA', a.idUsuario);
        const e = await obtener(c, v.idEmpleado),
          dias = v.componentes.find((l) => l.concepto === 'VACACIONES_PENDIENTES')!.tiempo;
        if (new Decimal(dias).gt(0))
          await mover(
            c,
            e.id,
            {
              tipo: 'AJUSTE',
              fecha: v.fin,
              dias: new Decimal(dias).negated().toFixed(2),
              clave: `FINIQUITO:${id}`,
            },
            d.motivo,
            a.idUsuario,
          );
        await baja(c, e.id, v.fin, d.motivo, a.idUsuario);
        if (e.usuario) {
          await bloquearAdministracion(c);
          await cambiarEstado(c, e.usuario, false, a.idUsuario);
          await revocarSesiones(c, e.usuario, a.idUsuario);
        }
        await registrarAuditoria(c, {
          actor: a,
          accion: 'LIQUIDAR_Y_DAR_BAJA',
          entidad: 'EMPLEADOS',
          idEntidad: e.id,
          antes: e,
          despues: {
            estado: 'EGRESADO',
            egreso: v.fin,
            prestacion: id,
            diasLiquidados: dias,
            usuarioDesactivado: e.usuario,
          },
          motivo: d.motivo,
        });
        await audit(c, a, id, 'APROBAR_FINIQUITO', { total: v.total }, d.motivo);
        return { id };
      }),
    accion: (auth: Autenticacion, ip: string, id: number, accion: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const d = accionSchema.parse(raw),
          r = await repo.registro(c, id);
        if (!r) throw new ErrorNoEncontrado();
        if (!r.snapshot || !r.hash || r.hash !== d.hash)
          throw new ErrorConflicto('El registro cambió o carece de snapshot. Recarga el detalle.');
        const s = JSON.parse(r.snapshot) as Snapshot;
        const esperado = accion === 'aprobar' ? 'CALCULADA' : 'APROBADA';
        if (accion === 'anular') {
          if (!['CALCULADA', 'APROBADA'].includes(r.estado) || r.tipo === 'INDEMNIZACION')
            throw new ErrorConflicto('Solo puede anularse una prestación anual sin pagar.');
        } else if (r.estado !== esperado)
          throw new ErrorConflicto(`La operación requiere estado ${esperado}.`);
        if (accion !== 'anular' && r.tipo !== 'INDEMNIZACION') {
          const actual = await anual(
            c,
            await obtener(c, r.idEmpleado),
            s.seleccion as Seleccion,
            id,
          );
          if (actual.hash !== r.hash)
            throw new ErrorConflicto(
              'Las fuentes cambiaron. Anula el cálculo y genera otra vista previa.',
            );
        }
        const estado =
          accion === 'anular' ? 'ANULADA' : accion === 'aprobar' ? 'APROBADA' : 'PAGADA';
        if (estado === 'PAGADA') {
          if (
            r.tipo === 'INDEMNIZACION' &&
            (await repo.periodo(c, quincena(r.fin).inicio))?.estado === 'CERRADO'
          )
            throw new ErrorConflicto(
              'Registra el pago del finiquito antes de cerrar la nómina final para incorporar sus bases fiscales.',
            );
          if (r.tipo === 'INDEMNIZACION' && d.fechaPago && d.fechaPago > quincena(r.fin).fin)
            throw new ErrorConflicto(
              'La fecha de pago del finiquito debe pertenecer a la quincena final.',
            );
          if (d.fechaPago && d.fechaPago.slice(0, 4) !== (await hoy(c)).slice(0, 4))
            throw new ErrorConflicto(
              'Registra el pago en el año fiscal actual; recalcula antes de cambiar de año.',
            );
          for (const l of s.componentes.filter((l) =>
            ['AGUINALDO', 'BONO_14'].includes(l.concepto),
          )) {
            const ps = await repo.parametros(c),
              salario = await repo.salario(c, r.idEmpleado, l.fin);
            if (!salario) throw new ErrorConflicto('Falta salario al corte de la prestación.');
            const pref = l.concepto === 'BONO_14' ? 'BONO14' : l.concepto;
            const limite = new Decimal(salario).mul(
              valor(ps, `ISR_EXENCION_${pref}_MESES`, l.fin, 'MESES'),
            );
            const usado = await repo.exencionUsada(
              c,
              r.idEmpleado,
              l.concepto,
              Number((await hoy(c)).slice(0, 4)),
              id,
            );
            if (new Decimal(l.exento).plus(usado).gt(limite))
              throw new ErrorConflicto(
                'Otra prestación consumió el límite exento. Recalcula antes de registrar el pago.',
              );
          }

          if (!d.fechaPago || !d.referencia)
            throw new ErrorConflicto('Ingresa fecha y referencia del pago realizado.');
          const ultimo = await repo.ultimoCierre(c);
          if (
            d.fechaPago < r.fin ||
            d.fechaPago > (await hoy(c)) ||
            (ultimo && d.fechaPago <= ultimo)
          )
            throw new ErrorConflicto(
              'El pago debe ser no futuro, desde el corte y posterior al último cierre fiscal.',
            );
        }
        if (accion === 'aprobar') {
          await membrete(c);
          await guardarFirma(c, 'PRESTACIONES', id, await firmante(c, a.idUsuario));
        }
        await repo.estado(c, id, estado, a.idUsuario, d.fechaPago ?? null, d.referencia ?? null);
        await audit(
          c,
          a,
          id,
          `PRESTACION_${estado}`,
          { estado, fechaPago: d.fechaPago, referencia: d.referencia },
          d.motivo,
          { estado: r.estado },
        );
        return { id, estado };
      }),
    pdf: (auth: Autenticacion, ip: string, id: number) =>
      tx(auth, ip, async (c, a) => {
        const r = await repo.registro(c, id);
        if (!r?.snapshot) throw new ErrorNoEncontrado();
        const firma = await obtenerFirma(c, 'PRESTACIONES', id);
        if (['APROBADA', 'PAGADA'].includes(r.estado) && !firma)
          throw new ErrorConflicto(
            'La aprobación histórica carece de nombre y cargo. Completa la ficha del aprobador y solicita revisión de la prestación.',
          );
        const contenido = await prestacionPdf(
          r,
          JSON.parse(r.snapshot) as Snapshot,
          await membrete(c),
          firma,
        );
        await audit(
          c,
          a,
          id,
          'GENERAR_PDF_PRESTACION',
          { sha256: hashDe(contenido) },
          'Descarga de documento de prestación',
        );
        return archivo(contenido, `prestacion-${id}.pdf`, 'application/pdf');
      }),
    exportar: (q: Query) =>
      db.conConexion(async (c) => {
        await nomina.lecturaConsistente(c);
        const r = await repo.listar(c, q, true);
        if (r.total > 10000) throw new ErrorConflicto('Reduce los filtros a 10,000 registros.');
        return archivo(
          Buffer.from(
            escribirCsv([
              [
                'Empleado',
                'Tipo',
                'Inicio',
                'Fin',
                'Promedio',
                'Total',
                'Estado',
                'Fecha pago',
                'Referencia',
              ],
              ...r.registros.map((v) => [
                v.empleado,
                v.tipo,
                v.inicio,
                v.fin,
                v.promedio,
                v.total,
                v.estado,
                v.fechaPago,
                v.referencia,
              ]),
            ]),
            'utf8',
          ),
          'prestaciones.csv',
          'text/csv;charset=utf-8',
        );
      }),
    constancia: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const q = constanciaSchema.parse(raw),
          e = await obtener(c, q.idEmpleado);
        if (q.fin > (await hoy(c)))
          throw new ErrorConflicto('Selecciona un rango que termine hoy o antes.');
        const { ns, pagos } = await repo.historialPagos(c, e.id, q.inicio, q.fin);
        const filas = ns.map((n) => {
          const s = JSON.parse(n.snapshot) as { entrada: Entrada; resultado: Resultado };
          return {
            fecha: n.fecha,
            concepto: `Nómina ${s.entrada.inicio} al ${s.entrada.fin}`,
            monto: s.resultado.ingresos,
          };
        });
        filas.push(...pagos);
        filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
        if (!filas.length)
          throw new ErrorConflicto(
            'No hay ingresos pagados en el rango. Cierra las nóminas o registra los pagos antes de emitir la constancia.',
          );
        const empresa = await obtenerEmpresa(c);
        await membrete(c);
        const firma = await firmante(c, a.idUsuario);
        const contenido = await constanciaPdf(e, q, filas, empresa!, await hoy(c), firma);
        await guardarConstancia(c, e.id, firma, empresa!.version, contenido, hashDe(contenido));
        await registrarAuditoria(c, {
          actor: a,
          accion: 'GENERAR_CONSTANCIA_SALARIO',
          entidad: 'EMPLEADOS',
          idEntidad: e.id,
          despues: { ...q, registros: filas.length, sha256: hashDe(contenido) },
        });
        return archivo(contenido, `constancia-salario-${e.id}.pdf`, 'application/pdf');
      }),
  };
}
