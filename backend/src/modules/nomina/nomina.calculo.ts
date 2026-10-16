import { horasDiariasEnFecha } from '../../shared/horarios/horas.js';
import { Decimal } from 'decimal.js';
import { dinero } from '../../shared/utils/dinero.js';
import { ErrorConflicto, ErrorNegocio } from '../../shared/errors/errors.js';
import type {
  Entrada,
  Vigente,
  Parametro,
  Concepto,
  Linea,
  Resultado,
  Estado,
  Tramo,
} from './nomina.types.js';
export const fechas = (inicio: string, fin: string) => {
  const r: string[] = [];
  for (let t = Date.parse(inicio); t <= Date.parse(fin); t += 86400000)
    r.push(new Date(t).toISOString().slice(0, 10));
  return r;
};
export function vigente<T extends Vigente>(filas: T[], fecha: string, nombre: string): T {
  const r = filas.filter((v) => v.desde <= fecha && (!v.hasta || v.hasta >= fecha));
  if (r.length !== 1)
    throw new ErrorConflicto(`Configura una única vigencia de ${nombre} para ${fecha}.`);
  return r[0]!;
}
const unidades: Record<string, string> = {
  SALARIO_DIAS_MES: 'DIAS',
  QUINCENAS_MES: 'PERIODOS',
  PERIODOS_ANIO: 'PERIODOS',
  BONIFICACION_INCENTIVO_MENSUAL: 'QUETZALES',
  ISR_DEDUCCION_PERSONAL_ANUAL: 'QUETZALES',
  ISR_EXENCION_AGUINALDO_MESES: 'MESES',
  ISR_EXENCION_BONO14_MESES: 'MESES',
};
export function parametro(filas: Parametro[], codigo: string, fecha: string) {
  const p = vigente(
    filas.filter((p) => p.codigo === codigo),
    fecha,
    codigo,
  );
  const unidad = unidades[codigo] ?? (codigo.startsWith('JORNADA_') ? 'HORAS' : 'PORCENTAJE');
  if (p.unidad !== unidad) throw new ErrorConflicto(`La unidad de ${codigo} debe ser ${unidad}.`);
  return p;
}
export function validarTransicion(estado: Estado, accion: string, rol: string, motivo = '') {
  const permitidos: Record<string, Estado[]> = {
    calcular: ['ABIERTO', 'CALCULADO', 'REVISADO'],
    revisar: ['CALCULADO'],
    aprobar: ['REVISADO'],
    cerrar: ['APROBADO'],
    reabrir: ['CERRADO'],
    devolver: ['APROBADO'],
  };
  if (!permitidos[accion]?.includes(estado))
    throw new ErrorConflicto(
      `No se puede ${accion} un periodo ${estado}. Sigue calcular → revisar → aprobar → cerrar.`,
    );
  if (accion === 'reabrir' && rol !== 'ADMIN')
    throw new ErrorNegocio('Solo ADMIN puede reabrir un periodo.', 403, 'PROHIBIDO');
  if (['reabrir', 'devolver'].includes(accion) && motivo.trim().length < 10)
    throw new ErrorConflicto('Explica el motivo con al menos 10 caracteres.');
}
export function validarTramos(tramos: Tramo[]) {
  if (!tramos.length || !new Decimal(tramos[0]!.inferior).eq(0) || tramos.at(-1)!.superior !== null)
    throw new ErrorConflicto(
      'Configura la escala ISR completa desde cero y sin límite en el último tramo.',
    );
  for (let i = 1; i < tramos.length; i++) {
    const anterior = tramos[i - 1]!,
      actual = tramos[i]!;
    if (
      anterior.superior === null ||
      !new Decimal(anterior.superior).eq(actual.inferior) ||
      !new Decimal(actual.fija).eq(
        new Decimal(anterior.fija).plus(
          new Decimal(anterior.superior).minus(anterior.inferior).mul(anterior.tasa).div(100),
        ),
      )
    )
      throw new ErrorConflicto(
        'Los tramos ISR deben ser continuos, sin traslapes y con cuotas fijas coherentes.',
      );
  }
}
export function calcularNomina(e: Entrada): Resultado {
  const usados = new Map<number, Parametro>(),
    lineas: Linea[] = [],
    alertas: string[] = [];
  const p = (codigo: string, fecha = e.fin) => {
    const v = parametro(e.parametros, codigo, fecha);
    usados.set(v.id, v);
    return new Decimal(v.valor);
  };
  const concepto = (codigo: string, fecha = e.fin) =>
    vigente(
      e.conceptos.filter((c) => c.codigo === codigo),
      fecha,
      codigo,
    );
  const agregar = (
    codigo: string,
    monto: Decimal.Value,
    fecha = e.fin,
    extras: Partial<Omit<Linea, 'concepto' | 'monto' | 'fecha'>> = {},
  ) => {
    const c = concepto(codigo, fecha);
    lineas.push({
      concepto: c,
      descripcion: c.nombre,
      base: dinero(monto),
      cantidad: '1',
      tasa: null,
      monto: dinero(monto),
      fecha,
      ...extras,
    });
  };
  const dias = fechas(e.inicio, e.fin),
    activos = dias.filter(
      (f) => f >= e.empleado.ingreso && (!e.empleado.egreso || f <= e.empleado.egreso),
    );
  if (!activos.length)
    throw new ErrorConflicto(
      'El empleado no tiene días dentro de la relación laboral en esta quincena.',
    );
  const ultimo = vigente(e.salarios, activos.at(-1)!, 'salario');
  const quincenas = p('QUINCENAS_MES'),
    periodos = p('PERIODOS_ANIO');
  if (!quincenas.eq(2) || !periodos.eq(24))
    throw new ErrorConflicto('Este motor quincenal requiere QUINCENAS_MES=2 y PERIODOS_ANIO=24.');
  const nominal = p('SALARIO_DIAS_MES').div(quincenas);
  let diasPagados = new Decimal(
    activos.length === dias.length ? nominal : Decimal.min(nominal, activos.length),
  );
  const agrupados = new Map<
    string,
    { c: Concepto; fecha: string; salario: string; cantidad: Decimal; monto: Decimal }
  >();
  for (const f of activos) {
    const s = vigente(e.salarios, f, 'salario'),
      divisor = p('SALARIO_DIAS_MES', f);
    if (divisor.lte(0)) throw new ErrorConflicto('El divisor mensual debe ser mayor que cero.');
    // Quincena completa: mitad mensual; parcial: días calendario, con tope de una quincena.
    const peso =
      activos.length === dias.length
        ? divisor.div(quincenas).div(dias.length)
        : Decimal.min(nominal, activos.length).div(activos.length);
    const c = concepto('SALARIO_BASE', f),
      b = concepto('BONIFICACION_INCENTIVO', f);
    for (const [cc, monto, base] of [
      [c, new Decimal(s.monto).div(divisor).mul(peso), s.monto],
      [
        b,
        p('BONIFICACION_INCENTIVO_MENSUAL', f).div(divisor).mul(peso),
        p('BONIFICACION_INCENTIVO_MENSUAL', f).toString(),
      ],
    ] as const) {
      const tasas = [
        'IGSS_LABORAL_PORCENTAJE',
        'IGSS_PATRONAL_PORCENTAJE',
        'IRTRA_PATRONAL_PORCENTAJE',
        'INTECAP_PATRONAL_PORCENTAJE',
      ]
        .map((c) => p(c, f).toString())
        .join(':');
      const k = `${cc.id}:${base}:${divisor}:${tasas}`;
      const g = agrupados.get(k) ?? {
        c: cc,
        fecha: f,
        salario: base,
        cantidad: new Decimal(0),
        monto: new Decimal(0),
      };
      g.cantidad = g.cantidad.plus(peso);
      g.monto = g.monto.plus(monto);
      agrupados.set(k, g);
    }
  }
  // Cada ausencia conserva su fecha, salario y tasas: una vigencia intermedia no se pierde.
  const descuentosAusencia = new Map<
    string,
    { fecha: string; id: number; monto: Decimal; cantidad: number; efecto: string }
  >();
  for (const a of e.ausencias) {
    if (a.estado === 'PENDIENTE') {
      alertas.push(`Ausencia ${a.id} pendiente de autorización.`);
      continue;
    }
    if (a.estado !== 'APROBADA' || a.efecto === 'CON_GOCE') continue;
    for (const f of activos.filter((f) => f >= a.inicio && f <= a.fin)) {
      const h = vigente(
        e.horarios.map((h, i) => ({ ...h, id: i })),
        f,
        'horario',
      );
      if (!h.dias.includes(new Date(`${f}T00:00:00Z`).getUTCDay() || 7) || e.feriados.includes(f))
        continue;
      const divisor = p('SALARIO_DIAS_MES', f),
        salario = vigente(e.salarios, f, 'salario').monto;
      const tasas = [
        'IGSS_LABORAL_PORCENTAJE',
        'IGSS_PATRONAL_PORCENTAJE',
        'IRTRA_PATRONAL_PORCENTAJE',
        'INTECAP_PATRONAL_PORCENTAJE',
      ]
        .map((c) => p(c, f).toString())
        .join(':');
      const cc = concepto('AUSENCIA_SIN_GOCE', f),
        k = `${a.id}:${cc.id}:${salario}:${divisor}:${tasas}`;
      const g = descuentosAusencia.get(k) ?? {
        fecha: f,
        id: a.id,
        monto: new Decimal(0),
        cantidad: 0,
        efecto: a.efecto,
      };
      g.monto = g.monto.plus(new Decimal(salario).div(divisor));
      g.cantidad++;
      descuentosAusencia.set(k, g);
      diasPagados = Decimal.max(0, diasPagados.minus(1));
      const b = concepto('BONIFICACION_INCENTIVO', f),
        base = p('BONIFICACION_INCENTIVO_MENSUAL', f);
      const bonus = agrupados.get(`${b.id}:${base}:${divisor}:${tasas}`)!;
      bonus.monto = Decimal.max(0, bonus.monto.minus(base.div(divisor)));
    }
  }
  for (const g of agrupados.values())
    agregar(g.c.codigo, g.monto, g.fecha, { base: g.salario, cantidad: g.cantidad.toFixed(4) });
  for (const g of descuentosAusencia.values())
    agregar('AUSENCIA_SIN_GOCE', g.monto, g.fecha, {
      ausencia: g.id,
      cantidad: String(g.cantidad),
      descripcion:
        g.efecto === 'SUBSIDIO_IGSS' ? 'Incapacidad: salario a cargo de IGSS' : 'Ausencia sin goce',
    });
  for (const c of e.comisiones) agregar('COMISION', c.monto, e.fin, { comision: c.id });
  for (const h of e.horas) {
    if (h.estado === 'PENDIENTE') {
      alertas.push(`Horas extra ${h.id} pendientes de autorización.`);
      continue;
    }
    if (h.estado !== 'APROBADA') continue;
    const salario = vigente(e.salarios, h.fecha, 'salario').monto,
      jornada = horasDiariasEnFecha(e.jornadas ?? [], h.fecha),
      divisor = p('SALARIO_DIAS_MES', h.fecha),
      recargo = p('HORAS_EXTRA_RECARGO_PORCENTAJE', h.fecha);
    if (jornada.lte(0) || divisor.lte(0))
      throw new ErrorConflicto('El divisor y las horas de jornada deben ser mayores que cero.');
    agregar(
      'HORAS_EXTRA',
      new Decimal(salario)
        .div(divisor)
        .div(jornada)
        .mul(new Decimal(1).plus(recargo.div(100)))
        .mul(h.horas),
      h.fecha,
      {
        hora: h.id,
        base: dinero(new Decimal(salario).div(divisor).div(jornada)),
        cantidad: h.horas,
        tasa: recargo.plus(100).toString(),
      },
    );
  }
  const suma = (f: (l: Linea) => boolean) =>
    lineas.filter(f).reduce((s, l) => s.plus(l.monto), new Decimal(0));
  const base = (bandera: 'igss' | 'isr') =>
    Decimal.max(
      0,
      suma((l) => l.concepto.naturaleza === 'INGRESO' && !!l.concepto[bandera]).minus(
        suma((l) => l.concepto.codigo === 'AUSENCIA_SIN_GOCE' && !!l.concepto[bandera]),
      ),
    );
  const baseIgss = base('igss');
  for (const [codigo, tasa] of [
    ['IGSS_LABORAL', 'IGSS_LABORAL_PORCENTAJE'],
    ['IGSS_PATRONAL', 'IGSS_PATRONAL_PORCENTAJE'],
    ['IRTRA', 'IRTRA_PATRONAL_PORCENTAJE'],
    ['INTECAP', 'INTECAP_PATRONAL_PORCENTAJE'],
  ] as const) {
    // Se ponderan las tasas por vigencia en cada ingreso y en cada ausencia.
    let valor = new Decimal(0);
    for (const l of [...lineas])
      if (
        l.concepto.igss &&
        (l.concepto.naturaleza === 'INGRESO' || l.concepto.codigo === 'AUSENCIA_SIN_GOCE')
      )
        valor = valor.plus(
          new Decimal(l.monto)
            .mul(p(tasa, l.fecha))
            .div(100)
            .mul(l.concepto.naturaleza === 'INGRESO' ? 1 : -1),
        );
    agregar(codigo, Decimal.max(0, valor), e.fin, {
      base: dinero(baseIgss),
      tasa: p(tasa).toString(),
    });
  }
  const igssActual = suma((l) => l.concepto.codigo === 'IGSS_LABORAL');
  const anio = Number(e.fin.slice(0, 4)),
    mes = Number(e.fin.slice(5, 7)),
    numero = Number(e.inicio.slice(8)) === 1 ? 1 : 2;
  const corteFiscal =
    e.empleado.egreso && e.empleado.egreso < `${anio}-12-31` ? e.empleado.egreso : `${anio}-12-31`;
  const ultimoIndice =
    (Number(corteFiscal.slice(5, 7)) - 1) * quincenas.toNumber() +
    (Number(corteFiscal.slice(8)) <= 15 ? 1 : 2);
  const restantes = Math.max(1, ultimoIndice - ((mes - 1) * quincenas.toNumber() + numero) + 1);
  // Proyección desde ingresos reales cerrados, periodo actual y salario/bonificación futuros.
  let futura = new Decimal(0),
    futuroIgss = new Decimal(0);
  if (restantes > 1 && (!e.empleado.egreso || e.empleado.egreso > e.fin)) {
    const futuroInicio = new Date(Date.parse(e.fin) + 86400000).toISOString().slice(0, 10);
    for (let m = mes; m <= 12; m++)
      for (const q of [1, 2]) {
        const inicio = `${anio}-${String(m).padStart(2, '0')}-${q === 1 ? '01' : '16'}`;
        const fin =
          q === 1
            ? `${anio}-${String(m).padStart(2, '0')}-15`
            : new Date(Date.UTC(anio, m, 0)).toISOString().slice(0, 10);
        if (inicio < futuroInicio) continue;
        const ff = fechas(inicio, fin),
          laborales = ff.filter((f) => !e.empleado.egreso || f <= e.empleado.egreso);
        const completo = laborales.length === ff.length;
        const futuros = new Map<string, { monto: Decimal; concepto: Concepto; tasa: Decimal }>();
        for (const f of laborales) {
          const s = vigente(e.salarios, f, 'salario futuro'),
            divisor = p('SALARIO_DIAS_MES', f),
            peso = completo
              ? divisor.div(2).div(ff.length)
              : Decimal.min(divisor.div(2), laborales.length).div(laborales.length);
          for (const codigo of ['SALARIO_BASE', 'BONIFICACION_INCENTIVO']) {
            const c = concepto(codigo, f),
              valor = (
                codigo === 'SALARIO_BASE'
                  ? new Decimal(s.monto)
                  : p('BONIFICACION_INCENTIVO_MENSUAL', f)
              )
                .div(divisor)
                .mul(peso);
            const tasa = p('IGSS_LABORAL_PORCENTAJE', f),
              clave = `${c.id}:${codigo === 'SALARIO_BASE' ? s.monto : p('BONIFICACION_INCENTIVO_MENSUAL', f)}:${divisor}:${tasa}`;
            const grupo = futuros.get(clave) ?? { monto: new Decimal(0), concepto: c, tasa };
            grupo.monto = grupo.monto.plus(valor);
            futuros.set(clave, grupo);
          }
        }
        let cuotaFutura = new Decimal(0);
        for (const v of futuros.values()) {
          const valor = new Decimal(dinero(v.monto));
          if (v.concepto.isr) futura = futura.plus(valor);
          if (v.concepto.igss) cuotaFutura = cuotaFutura.plus(valor.mul(v.tasa).div(100));
        }
        futuroIgss = futuroIgss.plus(dinero(cuotaFutura));
      }
  }
  let renta = new Decimal(e.acumulado.renta).plus(base('isr')).plus(futura);
  // Prestaciones pagadas fuera de la planilla ordinaria: solo excedente del límite legal.
  const exentos: Record<string, string> = {
    AGUINALDO: 'ISR_EXENCION_AGUINALDO_MESES',
    BONO_14: 'ISR_EXENCION_BONO14_MESES',
  };
  // Fase 9 conserva el límite aplicado; una nueva vigencia salarial no cambia la exención histórica.
  for (const v of e.prestaciones.filter((v) => v.exento != null))
    renta = renta.plus(Decimal.max(0, new Decimal(v.monto).minus(v.exento!)));
  for (const tipo of Object.keys(exentos)) {
    const total = e.prestaciones
      .filter((v) => v.tipo === tipo && v.exento == null)
      .reduce((s, v) => s.plus(v.monto), new Decimal(0));
    if (total.gt(0))
      renta = renta.plus(
        Decimal.max(0, total.minus(new Decimal(ultimo.monto).mul(p(exentos[tipo]!)))),
      );
  }
  renta = new Decimal(dinero(renta));
  const deducciones: { tipo: string; monto: string; aplicado: string; tope: string | null }[] = [];
  for (const tipo of [...new Set(e.deducciones.map((v) => v.tipo))]) {
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
    deducciones.push({
      tipo,
      monto: dinero(monto),
      aplicado: dinero(limite ? Decimal.min(monto, limite) : monto),
      tope: codigo,
    });
  }
  const acreditadas = deducciones.reduce((s, v) => s.plus(v.aplicado), new Decimal(0)),
    personal = p('ISR_DEDUCCION_PERSONAL_ANUAL'),
    igss = new Decimal(dinero(new Decimal(e.acumulado.igss).plus(igssActual).plus(futuroIgss)));
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
  const retencion = dinero(Decimal.max(0, anual.minus(e.acumulado.isr)).div(restantes)),
    exceso = dinero(Decimal.max(0, new Decimal(e.acumulado.isr).minus(anual)));
  agregar('ISR', retencion, e.fin, { base: dinero(imponible), tasa: tramo.tasa });
  if (new Decimal(exceso).gt(0)) {
    if (restantes === 1)
      agregar('ISR_DEVOLUCION', exceso, e.fin, {
        base: e.acumulado.isr,
        descripcion: 'Devolución ISR: liquidación anual definitiva',
      });
    else
      alertas.push(
        `ISR retenido en exceso: Q ${exceso}. Se ajustará en la última quincena fiscal.`,
      );
  }
  const saldos = new Map<number, Decimal>();
  for (const d of e.descuentos) {
    const saldo = d.saldo === null ? null : (saldos.get(d.id) ?? new Decimal(d.saldo));
    const monto = saldo === null ? new Decimal(d.monto) : Decimal.min(d.monto, saldo);
    if (saldo !== null) saldos.set(d.id, saldo.minus(monto));
    const codigo = e.conceptos.some((c) => c.codigo === d.codigo) ? d.codigo : 'OTRO_DESCUENTO';
    if (monto.gt(0))
      agregar(codigo, monto, e.fin, {
        descuento: d,
        ...(d.nombre ? { descripcion: d.nombre } : {}),
      });
  }
  const ingresos = suma((l) => l.concepto.naturaleza === 'INGRESO'),
    descuentos = suma((l) => l.concepto.naturaleza === 'DESCUENTO'),
    neto = ingresos.minus(descuentos);
  if (neto.lt(0))
    throw new ErrorNegocio(
      `El neto de ${e.empleado.codigo} sería negativo (Q ${dinero(neto)}). Revisa descuentos, ausencias e ISR antes de aprobar.`,
      422,
      'NETO_NEGATIVO',
    );
  for (const valor of [ingresos, descuentos, neto])
    if (valor.gt('9999999999.99'))
      throw new ErrorConflicto('El resultado excede el límite monetario de nómina.');
  return {
    dias: dinero(diasPagados),
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
    isr: {
      anio,
      renta: dinero(renta),
      personal: dinero(personal),
      acreditadas: dinero(acreditadas),
      igss: dinero(igss),
      imponible: dinero(imponible),
      anual: dinero(anual),
      retenido: e.acumulado.isr,
      restantes,
      retencion,
      exceso,
      tramos,
      deducciones,
      futuro: dinero(futura),
    },
  };
}
