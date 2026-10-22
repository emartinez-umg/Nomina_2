import type { Vista } from '../prestaciones/prestaciones.service.js';
import type { Componente } from '../prestaciones/prestaciones.calculo.js';
import { horasDiariasEnFecha } from '../../shared/horarios/horas.js';
import { Decimal } from 'decimal.js';
import { dinero } from '../../shared/utils/dinero.js';
import { ErrorConflicto, ErrorNegocio } from '../../shared/errors/errors.js';
import { fechas, parametro, vigente, validarTramos } from './nomina.calculo.js';
import type { Entrada, Linea, Parametro, Resultado } from './nomina.types.js';
import type { Pendiente } from '../novedades/pendientes.repository.js';

export type TipoPago = 'ANTICIPO' | 'PAGO' | 'BONO_14' | 'AGUINALDO';
export interface EntradaPago extends Entrada {
  mes: string;
  tipoPago: TipoPago;
  anticipo: string;
  prestacion?: Vista;
  verificacionPrestacion?: { horasExtra: number; comisiones: number; ausencias: number };
  novedades: (Pendiente & { advertencia?: string | null })[];
}
export interface ResultadoPago extends Resultado {
  tipoPago: TipoPago;
  mes: string;
  devengado: string;
  anticipo: string;
  componentes?: Componente[];
}
// Motor A11: las novedades aplicadas al anticipo también integran el devengado mensual.
export function calcularPago(e: EntradaPago): ResultadoPago {
  const lineas: Linea[] = [],
    usados = new Map<number, Parametro>();
  const cortePago = e.tipoPago === 'ANTICIPO' ? `${e.mes}-15` : e.fin;
  const p = (codigo: string, fecha = cortePago) => {
    const v = parametro(e.parametros, codigo, fecha);
    usados.set(v.id, v);
    return new Decimal(v.valor);
  };
  const agregar = (
    codigo: string,
    monto: Decimal.Value,
    descripcion?: string,
    cantidad = '1',
    fecha = cortePago,
    descuento?: Entrada['descuentos'][number],
  ) => {
    const concepto = vigente(
      e.conceptos.filter((c) => c.codigo === codigo),
      fecha,
      codigo,
    );
    lineas.push({
      concepto,
      descripcion: descripcion ?? concepto.nombre,
      base: dinero(monto),
      cantidad,
      tasa: null,
      monto: dinero(monto),
      fecha,
      ...(descuento ? { descuento } : {}),
    });
  };
  const diasMes = fechas(e.inicio, e.fin);
  const activos = diasMes.filter(
    (f) => f >= e.empleado.ingreso && (!e.empleado.egreso || f <= e.empleado.egreso),
  );
  if (!activos.length)
    throw new ErrorConflicto('El empleado no tiene días de contrato en este mes.');
  const ultimo = vigente(e.salarios, activos.at(-1)!, 'salario');
  if (!new Decimal(ultimo.monto).gt(0))
    throw new ErrorConflicto('Completa un salario vigente mayor que cero.');
  // La asignación es requisito incluso cuando no se han cargado horas extra.
  for (const fecha of activos)
    vigente(
      e.horarios.map((h, id) => ({ ...h, id })),
      fecha,
      'horario',
    );
  const divisor = p('SALARIO_DIAS_MES');
  if (!divisor.gt(0)) throw new ErrorConflicto('Configura un divisor mensual positivo.');
  const diasContrato =
    activos.length === diasMes.length ? divisor : Decimal.min(divisor, activos.length);
  const grupos = new Map<number, { monto: Decimal; dias: Decimal; fecha: string }>();
  for (const fecha of activos) {
    const salario = vigente(e.salarios, fecha, 'salario');
    const peso = diasContrato.div(activos.length);
    const g = grupos.get(salario.id) ?? { monto: new Decimal(0), dias: new Decimal(0), fecha };
    g.monto = g.monto.plus(new Decimal(salario.monto).div(p('SALARIO_DIAS_MES', fecha)).mul(peso));
    g.dias = g.dias.plus(peso);
    grupos.set(salario.id, g);
  }
  const aprobado = e.novedades.filter((n) => n.autorizacion === 'APROBADA');
  const pendientes = e.novedades.filter((n) => n.autorizacion !== 'APROBADA');
  if (pendientes.length)
    throw new ErrorConflicto(
      'Autoriza o rechaza las novedades pendientes antes de pagar este empleado.',
    );
  const relevantes = aprobado.filter(
    (n) => e.tipoPago === 'PAGO' || ['COMISION', 'HORAS_EXTRA', 'AUSENCIA'].includes(n.tipo),
  );
  for (const n of relevantes)
    if (n.monto === null)
      throw new ErrorConflicto(`Completa los datos para ${n.descripcion} (${n.mes}).`);
  const ausencias = aprobado.filter(
    (n) => n.tipo === 'AUSENCIA' && new Decimal(n.monto ?? 0).gt(0),
  );
  const diasAusencia = ausencias.reduce((s, n) => s.plus(n.cantidad), new Decimal(0));
  const bonificacion = p('BONIFICACION_INCENTIVO_MENSUAL')
    .mul(Decimal.max(0, divisor.minus(diasAusencia)))
    .div(divisor);
  const porcentaje = e.tipoPago === 'ANTICIPO' ? p('ANTICIPO_PORCENTAJE').div(100) : new Decimal(1);
  if (!porcentaje.gt(0) || porcentaje.gt(1))
    throw new ErrorConflicto('El porcentaje de anticipo debe estar entre 0 y 100.');
  for (const g of grupos.values())
    agregar(
      'SALARIO_BASE',
      g.monto.mul(porcentaje),
      e.tipoPago === 'ANTICIPO' ? 'Anticipo de salario base' : 'Salario base',
      g.dias.toFixed(4),
      g.fecha,
    );
  agregar('BONIFICACION_INCENTIVO', bonificacion);
  const sb = [...grupos.values()].reduce((s, g) => s.plus(g.monto), new Decimal(0));
  const codigos: Record<string, string> = {
    COMISION: 'COMISION',
    HORAS_EXTRA: 'HORAS_EXTRA',
    AUSENCIA: 'AUSENCIA_SIN_GOCE',
    CONSUMO_TIENDA: 'CONSUMO_TIENDA',
    PARQUEO: 'PARQUEO',
  };
  for (const n of relevantes) {
    if (n.tipo === 'AUSENCIA' && (e.tipoPago === 'ANTICIPO' || !new Decimal(n.monto ?? 0).gt(0)))
      continue;
    const retro = n.mes < e.mes ? ` · Retroactiva ${n.mes}` : '';
    const descripcion =
      n.tipo === 'HORAS_EXTRA'
        ? `Horas extra, ${n.cantidad} horas`
        : n.tipo === 'AUSENCIA'
          ? `Descuento por ausencias, ${n.cantidad} días`
          : n.descripcion;
    let monto = n.monto!;
    if (n.tipo === 'AUSENCIA') {
      let baseAusencia = sb;
      if (n.mes !== e.mes) {
        const dias = fechas(
          `${n.mes}-01`,
          new Date(Date.UTC(Number(n.mes.slice(0, 4)), Number(n.mes.slice(5, 7)), 0))
            .toISOString()
            .slice(0, 10),
        );
        const contrato = dias.filter(
          (f) => f >= e.empleado.ingreso && (!e.empleado.egreso || f <= e.empleado.egreso),
        );
        const nominal = p('SALARIO_DIAS_MES', dias.at(-1)!);
        const peso = (
          contrato.length === dias.length ? nominal : Decimal.min(nominal, contrato.length)
        ).div(Math.max(1, contrato.length));
        baseAusencia = contrato.reduce(
          (s, f) =>
            s.plus(
              new Decimal(vigente(e.salarios, f, 'salario de ausencia retroactiva').monto)
                .div(p('SALARIO_DIAS_MES', f))
                .mul(peso),
            ),
          new Decimal(0),
        );
      }
      // A11 define AUS sobre SB, que ya incluye el prorrateo de contrato del mes de origen.
      const corteAusencia = new Date(
        Date.UTC(Number(n.mes.slice(0, 4)), Number(n.mes.slice(5, 7)), 0),
      )
        .toISOString()
        .slice(0, 10);
      monto = dinero(baseAusencia.mul(n.cantidad).div(p('SALARIO_DIAS_MES', corteAusencia)));
    }
    if (n.tipo === 'HORAS_EXTRA') {
      const fecha = new Date(Date.UTC(Number(n.mes.slice(0, 4)), Number(n.mes.slice(5, 7)), 0))
        .toISOString()
        .slice(0, 10);
      const corte = [fecha, cortePago, e.empleado.egreso ?? fecha].sort()[0]!;
      const salario = vigente(e.salarios, corte, 'salario para horas extra');
      const jornada = horasDiariasEnFecha(e.jornadas ?? [], corte);
      const divisor = p('SALARIO_DIAS_MES', corte),
        recargo = p('HORAS_EXTRA_RECARGO_PORCENTAJE', corte);
      if (!jornada.gt(0) || !divisor.gt(0))
        throw new ErrorConflicto(
          'Completa las horas diarias del horario para valorar las horas extra.',
        );
      monto = dinero(
        new Decimal(n.cantidad)
          .mul(new Decimal(salario.monto).div(divisor).div(jornada))
          .mul(new Decimal(1).plus(recargo.div(100))),
      );
    }
    agregar(codigos[n.tipo]!, monto, descripcion + retro, n.cantidad);
    if (n.id !== null) lineas.at(-1)!.novedad = n.id;
  }
  const suma = (fn: (l: Linea) => boolean) =>
    lineas.filter(fn).reduce((s, l) => s.plus(l.monto), new Decimal(0));
  const base = (bandera: 'igss' | 'isr') =>
    Decimal.max(
      0,
      suma((l) => !!l.concepto[bandera] && l.concepto.naturaleza === 'INGRESO').minus(
        suma((l) => l.concepto.codigo === 'AUSENCIA_SIN_GOCE' && !!l.concepto[bandera]),
      ),
    );
  const baseIgss = e.tipoPago === 'PAGO' ? base('igss') : new Decimal(0);
  let fiscal: Resultado['isr'] = {
    anio: Number(e.mes.slice(0, 4)),
    renta: '0.00',
    personal: '0.00',
    acreditadas: '0.00',
    igss: '0.00',
    imponible: '0.00',
    anual: '0.00',
    retenido: e.acumulado.isr,
    restantes: 13 - Number(e.mes.slice(5, 7)),
    retencion: '0.00',
    exceso: '0.00',
    tramos: [],
    deducciones: [],
    futuro: '0.00',
  };
  const devengado = suma((l) => l.concepto.naturaleza === 'INGRESO').minus(
    suma((l) => l.concepto.codigo === 'AUSENCIA_SIN_GOCE'),
  );
  const alertas: string[] = [];
  if (e.tipoPago === 'PAGO') {
    for (const [codigo, tasa] of [
      ['IGSS_LABORAL', 'IGSS_LABORAL_PORCENTAJE'],
      ['IGSS_PATRONAL', 'IGSS_PATRONAL_PORCENTAJE'],
      ['IRTRA', 'IRTRA_PATRONAL_PORCENTAJE'],
      ['INTECAP', 'INTECAP_PATRONAL_PORCENTAJE'],
    ] as const) {
      agregar(codigo, baseIgss.mul(p(tasa)).div(100));
      lineas.at(-1)!.base = dinero(baseIgss);
      lineas.at(-1)!.tasa = p(tasa).toString();
    }
    fiscal = calcularFiscalMensual(
      e,
      base('isr'),
      suma((l) => l.concepto.codigo === 'IGSS_LABORAL'),
      p,
      usados,
    );
    agregar('ISR', fiscal.retencion);
    if (new Decimal(fiscal.exceso).gt(0)) {
      if (fiscal.restantes === 1)
        agregar('ISR_DEVOLUCION', fiscal.exceso, 'Devolución ISR: liquidación anual definitiva');
      else
        alertas.push(
          `ISR retenido en exceso: Q ${fiscal.exceso}. Se ajustará en diciembre o al egreso.`,
        );
    }
    agregar('ANTICIPO_PAGADO', e.anticipo, 'Anticipo ya pagado');
    const saldos = new Map<number, Decimal>();
    for (const d of e.descuentos) {
      const saldo = d.saldo === null ? null : (saldos.get(d.id) ?? new Decimal(d.saldo));
      const monto = saldo === null ? new Decimal(d.monto) : Decimal.min(d.monto, saldo);
      if (saldo) saldos.set(d.id, saldo.minus(monto));
      if (monto.gt(0))
        agregar(
          e.conceptos.some((c) => c.codigo === d.codigo) ? d.codigo : 'OTRO_DESCUENTO',
          monto,
          d.nombre,
          '1',
          e.fin,
          d,
        );
    }
  }
  // Todas las categorías A11 permanecen visibles aunque su importe sea cero.
  for (const codigo of [
    'AUSENCIA_SIN_GOCE',
    'COMISION',
    'HORAS_EXTRA',
    ...(e.tipoPago === 'PAGO' ? ['PARQUEO', 'CONSUMO_TIENDA', 'PRESTAMO', 'OTRO_DESCUENTO'] : []),
  ])
    if (
      !lineas.some((l) => l.concepto.codigo === codigo) &&
      (e.tipoPago === 'PAGO' || codigo !== 'AUSENCIA_SIN_GOCE')
    )
      agregar(codigo, 0, undefined, '0');
  const ingresos = suma((l) => l.concepto.naturaleza === 'INGRESO'),
    descuentos = suma((l) => l.concepto.naturaleza === 'DESCUENTO'),
    neto = ingresos.minus(descuentos);
  if (neto.lt(0))
    throw new ErrorNegocio(
      `El neto de ${e.empleado.codigo} sería negativo (Q ${dinero(neto)}). Ajusta ausencias, descuentos o el anticipo antes de pagar a este empleado.`,
      422,
      'NETO_NEGATIVO',
    );
  for (const v of [ingresos, descuentos, neto])
    if (v.gt('9999999999.99'))
      throw new ErrorConflicto('El resultado excede el límite monetario de nómina.');
  return {
    ...(e.estimacionFiscal ? { estimacionFiscal: e.estimacionFiscal } : {}),
    tipoPago: e.tipoPago,
    mes: e.mes,
    devengado: dinero(devengado),
    anticipo: e.anticipo,
    dias: e.tipoPago === 'PAGO' ? dinero(Decimal.max(0, diasContrato.minus(diasAusencia))) : '0.00',
    salario: ultimo.monto,
    idSalario: ultimo.id,
    ingresos: dinero(ingresos),
    descuentos: dinero(descuentos),
    neto: dinero(neto),
    patronal: dinero(suma((l) => l.concepto.naturaleza === 'PATRONAL')),
    baseIgss: dinero(baseIgss),
    lineas,
    parametros: [...usados.values()],
    alertas,
    isr: fiscal,
  };
}
function calcularFiscalMensual(
  e: EntradaPago,
  actual: Decimal,
  igssActual: Decimal,
  p: (codigo: string, fecha?: string) => Decimal,
  usados: Map<number, Parametro>,
): Resultado['isr'] {
  const anio = Number(e.mes.slice(0, 4)),
    mes = Number(e.mes.slice(5, 7));
  const mesFinal =
    e.empleado.egreso && e.empleado.egreso < `${anio}-12-31`
      ? Number(e.empleado.egreso.slice(5, 7))
      : 12;
  const restantes = Math.max(1, mesFinal - mes + 1);
  let futuro = new Decimal(0),
    igssFuturo = new Decimal(0);
  for (let m = mes + 1; m <= mesFinal; m++) {
    const inicio = `${anio}-${String(m).padStart(2, '0')}-01`,
      fin = new Date(Date.UTC(anio, m, 0)).toISOString().slice(0, 10);
    const calendario = fechas(inicio, fin),
      activos = calendario.filter((f) => !e.empleado.egreso || f <= e.empleado.egreso);
    const dias =
      activos.length === calendario.length
        ? p('SALARIO_DIAS_MES', fin)
        : Decimal.min(p('SALARIO_DIAS_MES', fin), activos.length);
    let rentaMes = new Decimal(0),
      igssMes = new Decimal(0);
    for (const f of activos) {
      const salario = vigente(e.salarios, f, 'salario futuro');
      for (const codigo of ['SALARIO_BASE', 'BONIFICACION_INCENTIVO']) {
        const concepto = vigente(
          e.conceptos.filter((c) => c.codigo === codigo),
          f,
          codigo,
        );
        const monto =
          codigo === 'SALARIO_BASE'
            ? new Decimal(salario.monto).div(p('SALARIO_DIAS_MES', f)).mul(dias.div(activos.length))
            : p('BONIFICACION_INCENTIVO_MENSUAL', f).div(activos.length);
        if (concepto.isr) rentaMes = rentaMes.plus(monto);
        if (concepto.igss)
          igssMes = igssMes.plus(monto.mul(p('IGSS_LABORAL_PORCENTAJE', f)).div(100));
      }
    }
    futuro = futuro.plus(dinero(rentaMes));
    igssFuturo = igssFuturo.plus(dinero(igssMes));
  }
  let renta = new Decimal(e.acumulado.renta).plus(actual).plus(futuro);
  for (const tipo of ['AGUINALDO', 'BONO_14']) {
    const sinSnapshot = e.prestaciones
      .filter((v) => v.tipo === tipo && v.exento == null)
      .reduce((s, v) => s.plus(v.monto), new Decimal(0));
    if (sinSnapshot.gt(0))
      renta = renta.plus(
        Decimal.max(
          0,
          sinSnapshot.minus(
            new Decimal(
              vigente(
                e.salarios,
                e.empleado.egreso && e.empleado.egreso < e.fin ? e.empleado.egreso : e.fin,
                'salario',
              ).monto,
            ).mul(
              p(
                tipo === 'AGUINALDO' ? 'ISR_EXENCION_AGUINALDO_MESES' : 'ISR_EXENCION_BONO14_MESES',
              ),
            ),
          ),
        ),
      );
  }
  for (const v of e.prestaciones.filter((v) => v.exento != null))
    renta = renta.plus(Decimal.max(0, new Decimal(v.monto).minus(v.exento!)));
  renta = new Decimal(dinero(renta));
  const deducciones = [...new Set(e.deducciones.map((v) => v.tipo))].map((tipo) => {
    const ds = e.deducciones.filter((v) => v.tipo === tipo),
      monto = ds.reduce((s, v) => s.plus(v.monto), new Decimal(0)),
      codigo = ds[0]!.tope;
    let limite: Decimal | null = null;
    if (codigo) {
      const param = vigente(
        e.parametros.filter((v) => v.codigo === codigo),
        e.fin,
        codigo,
      );
      usados.set(param.id, param);
      if (!['PORCENTAJE', 'QUETZALES'].includes(param.unidad))
        throw new ErrorConflicto(`El tope ${codigo} debe estar en porcentaje o quetzales.`);
      limite =
        param.unidad === 'PORCENTAJE' ? renta.mul(param.valor).div(100) : new Decimal(param.valor);
    }
    return {
      tipo,
      monto: dinero(monto),
      aplicado: dinero(limite === null ? monto : Decimal.min(monto, limite)),
      tope: codigo,
    };
  });
  const acreditadas = deducciones.reduce((s, v) => s.plus(v.aplicado), new Decimal(0)),
    personal = p('ISR_DEDUCCION_PERSONAL_ANUAL'),
    igss = new Decimal(dinero(new Decimal(e.acumulado.igss).plus(igssActual).plus(igssFuturo)));
  const imponible = Decimal.max(0, renta.minus(personal).minus(acreditadas).minus(igss));
  const tramos = e.tramos
    .filter((t) => t.desde <= e.fin && (!t.hasta || t.hasta >= e.fin))
    .sort((a, b) => new Decimal(a.inferior).cmp(b.inferior));
  validarTramos(tramos);
  const tramo = tramos.find(
    (t) => imponible.gte(t.inferior) && (t.superior === null || imponible.lte(t.superior)),
  )!;
  const anual = new Decimal(
    dinero(imponible.minus(tramo.inferior).mul(tramo.tasa).div(100).plus(tramo.fija)),
  );
  return {
    anio,
    renta: dinero(renta),
    personal: dinero(personal),
    acreditadas: dinero(acreditadas),
    igss: dinero(igss),
    imponible: dinero(imponible),
    anual: dinero(anual),
    retenido: e.acumulado.isr,
    restantes,
    retencion: dinero(Decimal.max(0, anual.minus(e.acumulado.isr)).div(restantes)),
    exceso: dinero(Decimal.max(0, new Decimal(e.acumulado.isr).minus(anual))),
    tramos,
    deducciones,
    futuro: dinero(futuro),
  };
}
