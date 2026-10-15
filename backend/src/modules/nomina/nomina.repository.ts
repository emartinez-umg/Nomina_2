import { jornadasEmpleado } from '../../shared/horarios/horarios.repository.js';
import oracledb from 'oracledb';
import type { Connection, BindParameter } from 'oracledb';
import type {
  Entrada,
  Empleado,
  Parametro,
  Concepto,
  Tramo,
  Salario,
  Ausencia,
  Descuento,
  Resultado,
  Periodo,
} from './nomina.types.js';
import type { Query } from './nomina.schemas.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import * as vacaciones from '../vacaciones/vacaciones.repository.js';
const opts = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
  fetchInfo: {
    snapshot: { type: oracledb.STRING },
    alertas: { type: oracledb.STRING },
    formato: { type: oracledb.STRING },
  },
};
type Binds = Record<string, string | number | null | BindParameter>;
const fecha = (b: string) => `TO_DATE(:${b},'YYYY-MM-DD')`;
const num = (b: string) =>
  `TO_NUMBER(:${b},'999999999999999999D999999','NLS_NUMERIC_CHARACTERS=''.,''')`;
const str = (v: string) => `TO_CHAR(${v},'TM9','NLS_NUMERIC_CHARACTERS=''.,''')`;
const vigencia = `TO_CHAR(VIGENTE_DESDE,'YYYY-MM-DD') "desde",TO_CHAR(VIGENTE_HASTA,'YYYY-MM-DD') "hasta"`;
async function filas<T>(c: Connection, sql: string, b: Binds = {}) {
  return (await c.execute<T>(sql, b, opts)).rows ?? [];
}
const periodoSelect = `P.ID_PERIODO_NOMINA "id",TO_CHAR(P.FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(P.FECHA_FIN,'YYYY-MM-DD') "fin",P.ESTADO "estado",P.VERSION_CALCULO "version",P.HASH_FUENTES "hash",P.ALERTAS "alertas",(SELECT COUNT(*) FROM NOMINA_EMPLEADO N WHERE N.ID_PERIODO_NOMINA=P.ID_PERIODO_NOMINA AND N.VERSION_CALCULO=P.VERSION_CALCULO) "empleados"`;
export async function periodo(c: Connection, id: number) {
  return (
    await filas<Periodo>(
      c,
      `SELECT ${periodoSelect} FROM PERIODOS_NOMINA P WHERE P.ID_PERIODO_NOMINA=:id AND P.ACTIVO=1`,
      { id },
    )
  )[0];
}
export async function crear(
  c: Connection,
  inicio: string,
  fin: string,
  numero: number,
  actor: number,
) {
  const existente = await filas(
    c,
    `SELECT 1 FROM PERIODOS_NOMINA WHERE FECHA_INICIO<=${fecha('fin')} AND FECHA_FIN>=${fecha('inicio')}`,
    { inicio, fin },
  );
  if (existente.length)
    throw new ErrorConflicto(
      'Ya existe una quincena que cruza estas fechas. Abre el periodo existente.',
    );
  const r = await c.execute(
    `INSERT INTO PERIODOS_NOMINA (FECHA_INICIO,FECHA_FIN,QUINCENA,CREADO_POR) VALUES (${fecha('inicio')},${fecha('fin')},:numero,:actor) RETURNING ID_PERIODO_NOMINA INTO :id`,
    { inicio, fin, numero, actor, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
  );
  return (r.outBinds as { id: number[] }).id[0]!;
}
export async function posteriores(c: Connection, p: Periodo) {
  return (
    (
      await filas(
        c,
        `SELECT 1 FROM PERIODOS_NOMINA WHERE FECHA_INICIO>${fecha('inicio')} AND ESTADO IN ('APROBADO','CERRADO')`,
        { inicio: p.inicio },
      )
    ).length > 0
  );
}
export async function anteriores(c: Connection, p: Periodo) {
  return (
    (
      await filas(
        c,
        `SELECT 1 FROM PERIODOS_NOMINA WHERE FECHA_FIN<${fecha('inicio')} AND EXTRACT(YEAR FROM FECHA_INICIO)=:anio AND ESTADO<>'CERRADO' AND ACTIVO=1`,
        { inicio: p.inicio, anio: Number(p.inicio.slice(0, 4)) },
      )
    ).length > 0
  );
}
export async function fuentes(c: Connection, p: Periodo, idFiltro?: number): Promise<Entrada[]> {
  const parametros = await filas<Parametro>(
    c,
    `SELECT ID_PARAMETRO_LEGAL "id",CLAVE_INTERNA "codigo",${str('VALOR')} "valor",UNIDAD "unidad",${vigencia} FROM PARAMETROS_LEGALES WHERE ACTIVO=1 ORDER BY CODIGO,VIGENTE_DESDE`,
  );
  const conceptos = await filas<Concepto>(
    c,
    `SELECT ID_CONCEPTO_NOMINA "id",CODIGO "codigo",NOMBRE "nombre",NATURALEZA "naturaleza",AFECTA_IGSS "igss",AFECTA_ISR "isr",AFECTA_PRESTACIONES "prestaciones",${vigencia} FROM CONCEPTOS_NOMINA WHERE ACTIVO=1 ORDER BY CODIGO,VIGENTE_DESDE`,
  );
  const tramos = await filas<Tramo>(
    c,
    `SELECT ID_TRAMO_ISR "id",${str('LIMITE_INFERIOR')} "inferior",${str('LIMITE_SUPERIOR')} "superior",${str('TASA_PORCENTAJE')} "tasa",${str('CUOTA_FIJA')} "fija",${vigencia} FROM TRAMOS_ISR WHERE ACTIVO=1 ORDER BY VIGENTE_DESDE,LIMITE_INFERIOR`,
  );
  const empleados = await filas<Empleado>(
    c,
    `SELECT E.ID_EMPLEADO "id",E.ID_USUARIO "usuario",E.CODIGO "codigo",E.NOMBRES "nombres",E.APELLIDOS "apellidos",TO_CHAR(E.FECHA_INGRESO,'YYYY-MM-DD') "ingreso",TO_CHAR(E.FECHA_EGRESO,'YYYY-MM-DD') "egreso",E.ID_DEPARTAMENTO "idDepartamento",D.NOMBRE "departamento",P.NOMBRE "puesto",E.ID_CENTRO_TRABAJO "centro",C.LOCALIDAD "localidad",E.NIT "nit",E.AFILIACION_IGSS "afiliacion" FROM EMPLEADOS E JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO JOIN PUESTOS P ON P.ID_PUESTO=E.ID_PUESTO JOIN CENTROS_TRABAJO C ON C.ID_CENTRO_TRABAJO=E.ID_CENTRO_TRABAJO WHERE E.FECHA_INGRESO<=${fecha('fin')} AND ((E.ACTIVO=1 AND E.FECHA_EGRESO IS NULL) OR E.FECHA_EGRESO>=${fecha('inicio')}) AND (:idFiltro IS NULL OR E.ID_EMPLEADO=:idFiltro) ORDER BY E.ID_EMPLEADO`,
    { inicio: p.inicio, fin: p.fin, idFiltro: idFiltro ?? null },
  );
  const entradas: Entrada[] = [];
  for (const empleado of empleados) {
    const id = empleado.id,
      anio = Number(p.inicio.slice(0, 4));
    const salarios = await filas<Salario>(
      c,
      `SELECT ID_HISTORIAL_SALARIAL "id",${str('SALARIO_BASE')} "monto",${vigencia} FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id AND ACTIVO=1 ORDER BY VIGENTE_DESDE`,
      { id },
    );
    const ausencias = await filas<Ausencia>(
      c,
      `SELECT A.ID_AUSENCIA "id",TO_CHAR(A.FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(A.FECHA_FIN,'YYYY-MM-DD') "fin",A.ESTADO "estado",T.EFECTO "efecto" FROM AUSENCIAS A JOIN TIPOS_AUSENCIA T ON T.ID_TIPO_AUSENCIA=A.ID_TIPO_AUSENCIA WHERE A.ID_EMPLEADO=:id AND A.ACTIVO=1 AND A.ESTADO<>'RECHAZADA' AND A.FECHA_INICIO<=${fecha('fin')} AND A.FECHA_FIN>=${fecha('inicio')} ORDER BY A.ID_AUSENCIA`,
      { id, inicio: p.inicio, fin: p.fin },
    );
    const comisiones = await filas<Entrada['comisiones'][number]>(
      c,
      `SELECT ID_COMISION "id",${str('MONTO')} "monto" FROM COMISIONES WHERE ID_EMPLEADO=:id AND ID_PERIODO_NOMINA=:periodo AND ACTIVO=1 ORDER BY ID_COMISION`,
      { id, periodo: p.id },
    );
    const horas = await filas<Entrada['horas'][number]>(
      c,
      `SELECT ID_HORA_EXTRA "id",TO_CHAR(FECHA,'YYYY-MM-DD') "fecha",${str('HORAS')} "horas",JORNADA "jornada",ESTADO "estado" FROM HORAS_EXTRA WHERE ID_EMPLEADO=:id AND ID_PERIODO_NOMINA=:periodo AND ACTIVO=1 AND ESTADO<>'RECHAZADA' ORDER BY ID_HORA_EXTRA`,
      { id, periodo: p.id },
    );
    const descuentos = await filas<Descuento>(
      c,
      `SELECT D.ID_DESCUENTO_EMPLEADO "id",C.ID_DESCUENTO_CUOTA "cuota",NVL(T.CODIGO_ANTERIOR,T.CODIGO) "codigo",T.NOMBRE "nombre",D.MODALIDAD "modalidad",${str("CASE WHEN D.MODALIDAD='FIJO' THEN D.MONTO_QUINCENA ELSE C.MONTO-C.MONTO_PAGADO END")} "monto",${str('D.SALDO')} "saldo" FROM DESCUENTOS_EMPLEADO D JOIN TIPOS_DESCUENTO T ON T.ID_TIPO_DESCUENTO=D.ID_TIPO_DESCUENTO LEFT JOIN DESCUENTOS_CUOTAS C ON C.ID_DESCUENTO_EMPLEADO=D.ID_DESCUENTO_EMPLEADO AND C.ACTIVO=1 AND C.ESTADO IN ('PENDIENTE','PARCIAL') AND C.FECHA_VENCIMIENTO<=${fecha('fin')} WHERE D.ID_EMPLEADO=:id AND NOT EXISTS(SELECT 1 FROM PARQUEO_SUSCRIPCIONES S WHERE S.ID_DESCUENTO_ORIGEN=D.ID_DESCUENTO_EMPLEADO) AND D.ACTIVO=1 AND D.ESTADO='VIGENTE' AND D.FECHA_INICIO<=${fecha('fin')} AND (D.MODALIDAD<>'FIJO' OR D.FECHA_FIN IS NULL OR D.FECHA_FIN>=${fecha('inicio')}) AND (D.MODALIDAD='FIJO' OR C.ID_DESCUENTO_CUOTA IS NOT NULL) ORDER BY D.ID_DESCUENTO_EMPLEADO,C.ID_DESCUENTO_CUOTA`,
      { id, inicio: p.inicio, fin: p.fin },
    );
    const deducciones = await filas<Entrada['deducciones'][number]>(
      c,
      `SELECT D.ID_DEDUCCION_ISR "id",T.CODIGO "tipo",${str('D.MONTO')} "monto",T.CODIGO_PARAMETRO_TOPE "tope" FROM ISR_DEDUCCIONES_EMPLEADO D JOIN TIPOS_DEDUCCION_ISR T ON T.ID_TIPO_DEDUCCION_ISR=D.ID_TIPO_DEDUCCION_ISR WHERE D.ID_EMPLEADO=:id AND D.ANIO=:anio AND D.ACTIVO=1 AND D.FECHA_COMPROBANTE<=${fecha('fin')} ORDER BY D.ID_DEDUCCION_ISR`,
      { id, anio, fin: p.fin },
    );
    const apertura = (
      await filas<{ corte: string; renta: string; igss: string; isr: string }>(
        c,
        `SELECT TO_CHAR(FECHA_CORTE,'YYYY-MM-DD') "corte",${str('RENTA')} "renta",${str('IGSS')} "igss",${str('ISR')} "isr" FROM ISR_APERTURAS WHERE ID_EMPLEADO=:id AND ANIO=:anio AND ACTIVO=1`,
        { id, anio },
      )
    )[0];
    const previos = await filas<{
      inicio: string;
      fin: string;
      renta: string;
      igss: string;
      isr: string;
    }>(
      c,
      `SELECT TO_CHAR(P.FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(P.FECHA_FIN,'YYYY-MM-DD') "fin",${str("SUM(CASE WHEN D.AFECTA_ISR=1 AND D.NATURALEZA='INGRESO' THEN D.MONTO WHEN C.CODIGO='AUSENCIA_SIN_GOCE' AND D.AFECTA_ISR=1 THEN -D.MONTO ELSE 0 END)")} "renta",${str("SUM(CASE WHEN C.CODIGO='IGSS_LABORAL' THEN D.MONTO ELSE 0 END)")} "igss",${str("SUM(CASE WHEN C.CODIGO='ISR' THEN D.MONTO WHEN C.CODIGO='ISR_DEVOLUCION' THEN -D.MONTO ELSE 0 END)")} "isr" FROM NOMINA_EMPLEADO N JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA JOIN NOMINA_DETALLE D ON D.ID_NOMINA_EMPLEADO=N.ID_NOMINA_EMPLEADO JOIN CONCEPTOS_NOMINA C ON C.ID_CONCEPTO_NOMINA=D.ID_CONCEPTO_NOMINA WHERE N.ID_EMPLEADO=:id AND N.VERSION_CALCULO=P.VERSION_CALCULO AND P.ESTADO='CERRADO' AND P.FECHA_FIN<${fecha('inicio')} AND EXTRACT(YEAR FROM P.FECHA_INICIO)=:anio GROUP BY P.FECHA_INICIO,P.FECHA_FIN ORDER BY P.FECHA_INICIO`,
      { id, inicio: p.inicio, anio },
    );
    const acumulado = { renta: '0', igss: '0', isr: '0' };
    // La continuidad se verifica en el servicio por empleado; nunca se inventa historia salarial pagada.
    const prestaciones = await filas<Entrada['prestaciones'][number]>(
      c,
      `SELECT P.ID_PRESTACION "id",NVL(D.CONCEPTO,P.TIPO) "tipo",${str('NVL(D.MONTO,P.MONTO_TOTAL)')} "monto",${str('D.MONTO_EXENTO_ISR')} "exento" FROM PRESTACIONES P LEFT JOIN PRESTACION_DETALLE D ON D.ID_PRESTACION=P.ID_PRESTACION AND D.ACTIVO=1 WHERE P.ID_EMPLEADO=:id AND P.ACTIVO=1 AND P.ESTADO='PAGADA' AND EXTRACT(YEAR FROM P.FECHA_PAGO)=:anio AND P.FECHA_PAGO<=${fecha('fin')} ORDER BY P.ID_PRESTACION,D.ID_PRESTACION_DETALLE`,
      { id, anio, fin: p.fin },
    );
    entradas.push({
      inicio: p.inicio,
      fin: p.fin,
      empleado,
      salarios,
      parametros,
      conceptos,
      tramos,
      jornadas: await jornadasEmpleado(c, id),
      horarios: await vacaciones.horarios(c, id),
      feriados: (await vacaciones.feriados(c, empleado.localidad, p.inicio, p.fin)).sort(),
      ausencias,
      comisiones,
      horas,
      descuentos,
      deducciones,
      acumulado,
      prestaciones,
      ...{ historia: { apertura: apertura ?? null, previos } },
    });
  }
  return entradas;
}
export interface Historia {
  apertura: { corte: string; renta: string; igss: string; isr: string } | null;
  previos: { inicio: string; fin: string; renta: string; igss: string; isr: string }[];
}
export async function guardarResultado(
  c: Connection,
  p: Periodo,
  e: Entrada,
  r: Resultado,
  actor: number,
  empresa: unknown,
) {
  const datos = JSON.stringify({ versionMotor: '8.0.0', entrada: e, resultado: r, empresa });
  const ins = await c.execute(
    `INSERT INTO NOMINA_EMPLEADO (ID_PERIODO_NOMINA,ID_EMPLEADO,ID_HISTORIAL_SALARIAL,VERSION_CALCULO,DIAS_PAGADOS,SALARIO_BASE,TOTAL_INGRESOS,TOTAL_DESCUENTOS,NETO,COSTO_PATRONAL,DATOS_EMPLEADO,CREADO_POR) VALUES (:periodo,:empleado,:salario,:version,${num('dias')},${num('base')},${num('ingresos')},${num('descuentos')},${num('neto')},${num('patronal')},:datos,:actor) RETURNING ID_NOMINA_EMPLEADO INTO :id`,
    {
      periodo: p.id,
      empleado: e.empleado.id,
      salario: r.idSalario,
      version: p.version,
      dias: r.dias,
      base: r.salario,
      ingresos: r.ingresos,
      descuentos: r.descuentos,
      neto: r.neto,
      patronal: r.patronal,
      datos: { val: datos, type: oracledb.CLOB },
      actor,
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
  );
  const id = (ins.outBinds as { id: number[] }).id[0]!;
  for (const [orden, l] of r.lineas.entries())
    await c.execute(
      `INSERT INTO NOMINA_DETALLE (ID_NOMINA_EMPLEADO,ID_EMPLEADO,ID_PERIODO_NOMINA,ID_CONCEPTO_NOMINA,ORDEN,DESCRIPCION,NATURALEZA,BASE_CALCULO,CANTIDAD,TASA_PORCENTAJE,MONTO,AFECTA_IGSS,AFECTA_ISR,AFECTA_PRESTACIONES,ID_COMISION,ID_HORA_EXTRA,ID_AUSENCIA,CREADO_POR) VALUES (:id,:empleado,:periodo,:concepto,:orden,:descripcion,:naturaleza,${num('base')},${num('cantidad')},${num('tasa')},${num('monto')},:igss,:isr,:prestaciones,:comision,:hora,:ausencia,:actor)`,
      {
        id,
        empleado: e.empleado.id,
        periodo: p.id,
        concepto: l.concepto.id,
        orden: orden + 1,
        descripcion: l.descripcion,
        naturaleza: l.concepto.naturaleza,
        base: l.base,
        cantidad: l.cantidad,
        tasa: l.tasa,
        monto: l.monto,
        igss: l.concepto.igss,
        isr: l.concepto.isr,
        prestaciones: l.concepto.prestaciones,
        comision: l.comision ?? null,
        hora: l.hora ?? null,
        ausencia: l.ausencia ?? null,
        actor,
      },
    );
  for (const v of r.parametros)
    await c.execute(
      `INSERT INTO NOMINA_PARAMETROS (ID_NOMINA_EMPLEADO,ID_PARAMETRO_LEGAL,VALOR_APLICADO,CREADO_POR) VALUES (:id,:parametro,${num('valor')},:actor)`,
      { id, parametro: v.id, valor: v.valor, actor },
    );
  const i = r.isr;
  await c.execute(
    `INSERT INTO ISR_PROYECCIONES (ID_NOMINA_EMPLEADO,ANIO,RENTA_ANUAL,DEDUCCION_PERSONAL,DEDUCCIONES_ACREDITADAS,IGSS_PROYECTADO,RENTA_IMPONIBLE,ISR_ANUAL,RETENIDO_ACUMULADO,PERIODOS_RESTANTES,RETENCION_PERIODO,DETALLE_CALCULO,CREADO_POR) VALUES (:id,:anio,${num('renta')},${num('personal')},${num('acreditadas')},${num('igss')},${num('imponible')},${num('anual')},${num('retenido')},:restantes,${num('retencion')},:datos,:actor)`,
    {
      id,
      anio: i.anio,
      renta: i.renta,
      personal: i.personal,
      acreditadas: i.acreditadas,
      igss: i.igss,
      imponible: i.imponible,
      anual: i.anual,
      retenido: i.retenido,
      restantes: i.restantes,
      retencion: i.retencion,
      datos: { val: JSON.stringify(i), type: oracledb.CLOB },
      actor,
    },
  );
  return id;
}
export async function estado(
  c: Connection,
  id: number,
  estado: string,
  actor: number,
  version: number,
  hash: string | null,
  alertas: string[],
  motivo: string,
) {
  const campos =
    estado === 'CALCULADO'
      ? ",CALCULADO_EN=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),REVISADO_EN=NULL,APROBADO_EN=NULL,APROBADO_POR=NULL,CERRADO_EN=NULL,CERRADO_POR=NULL"
      : estado === 'REVISADO'
        ? ",REVISADO_EN=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)"
        : estado === 'APROBADO'
          ? ",APROBADO_EN=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),APROBADO_POR=:actor"
          : estado === 'CERRADO'
            ? ",CERRADO_EN=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),CERRADO_POR=:actor"
            : ',REVISADO_EN=NULL,APROBADO_EN=NULL,APROBADO_POR=NULL,CERRADO_EN=NULL,CERRADO_POR=NULL';
  await c.execute(
    `UPDATE PERIODOS_NOMINA SET ESTADO=:estado,VERSION_CALCULO=:version,HASH_FUENTES=:hash,ALERTAS=:alertas,MOTIVO_REAPERTURA=:motivo,MODIFICADO_POR=:actor${campos} WHERE ID_PERIODO_NOMINA=:id`,
    {
      id,
      estado,
      actor,
      version,
      hash,
      alertas: { val: JSON.stringify(alertas), type: oracledb.CLOB },
      motivo: motivo || null,
    },
  );
}
export interface Guardado {
  id: number;
  idEmpleado: number;
  inicio: string;
  fin: string;
  estado: string;
  version: number;
  snapshot: string;
}
export async function resultados(c: Connection, periodo: number) {
  return filas<Guardado>(
    c,
    `SELECT N.ID_NOMINA_EMPLEADO "id",N.ID_EMPLEADO "idEmpleado",TO_CHAR(P.FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(P.FECHA_FIN,'YYYY-MM-DD') "fin",P.ESTADO "estado",N.VERSION_CALCULO "version",N.DATOS_EMPLEADO "snapshot" FROM NOMINA_EMPLEADO N JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA WHERE N.ID_PERIODO_NOMINA=:periodo AND N.VERSION_CALCULO=P.VERSION_CALCULO ORDER BY N.ID_EMPLEADO`,
    { periodo },
  );
}
export async function resultado(c: Connection, id: number) {
  return (
    await filas<Guardado & { usuario: number | null; actual: number }>(
      c,
      `SELECT N.ID_NOMINA_EMPLEADO "id",N.ID_EMPLEADO "idEmpleado",TO_CHAR(P.FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(P.FECHA_FIN,'YYYY-MM-DD') "fin",P.ESTADO "estado",N.VERSION_CALCULO "version",P.VERSION_CALCULO "actual",E.ID_USUARIO "usuario",N.DATOS_EMPLEADO "snapshot" FROM NOMINA_EMPLEADO N JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA JOIN EMPLEADOS E ON E.ID_EMPLEADO=N.ID_EMPLEADO WHERE N.ID_NOMINA_EMPLEADO=:id`,
      { id },
    )
  )[0];
}
export interface FilaNomina {
  id: number;
  idEmpleado: number;
  empleado: string;
  departamento: string;
  inicio: string;
  fin: string;
  estado: string;
  version: number;
  ingresos: string;
  descuentos: string;
  neto: string;
  patronal: string;
  alertas: string;
}
function filtros(q: Query, usuario?: number, periodo?: number) {
  const w = ['N.VERSION_CALCULO=P.VERSION_CALCULO'],
    b: Binds = {};
  if (usuario !== undefined) {
    w.push("E.ID_USUARIO=:usuario AND P.ESTADO='CERRADO'");
    b.usuario = usuario;
  }
  if (periodo) {
    w.push('P.ID_PERIODO_NOMINA=:periodo');
    b.periodo = periodo;
  }
  for (const [k, col] of [
    ['anio', 'EXTRACT(YEAR FROM P.FECHA_INICIO)'],
    ['mes', 'EXTRACT(MONTH FROM P.FECHA_INICIO)'],
    ['idEmpleado', 'N.ID_EMPLEADO'],
    [
      'idDepartamento',
      "JSON_VALUE(N.DATOS_EMPLEADO,'$.entrada.empleado.idDepartamento' RETURNING NUMBER)",
    ],
    ['estado', 'P.ESTADO'],
  ] as const)
    if (q[k] !== undefined) {
      w.push(`${col}=:${k}`);
      b[k] = q[k]!;
    }
  if (q.buscar) {
    w.push(
      "INSTR(UPPER(JSON_VALUE(N.DATOS_EMPLEADO,'$.entrada.empleado.codigo')||' '||JSON_VALUE(N.DATOS_EMPLEADO,'$.entrada.empleado.nombres')||' '||JSON_VALUE(N.DATOS_EMPLEADO,'$.entrada.empleado.apellidos')),UPPER(:buscar))>0",
    );
    b.buscar = q.buscar;
  }
  if (q.alertas) {
    w.push(
      "(CASE WHEN JSON_VALUE(N.DATOS_EMPLEADO,'$.resultado.alertas[0]') IS NULL THEN 0 ELSE 1 END)=:alerta",
    );
    b.alerta = Number(q.alertas);
  }
  return { w: w.join(' AND '), b };
}
const from =
  'NOMINA_EMPLEADO N JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA JOIN EMPLEADOS E ON E.ID_EMPLEADO=N.ID_EMPLEADO';
export async function listar(c: Connection, q: Query, usuario?: number, periodo?: number) {
  const { w, b } = filtros(q, usuario, periodo);
  const total = (
    await filas<{
      n: number;
      ingresos: string;
      descuentos: string;
      neto: string;
      patronal: string;
    }>(
      c,
      `SELECT COUNT(*) "n",${str('NVL(SUM(N.TOTAL_INGRESOS),0)')} "ingresos",${str('NVL(SUM(N.TOTAL_DESCUENTOS),0)')} "descuentos",${str('NVL(SUM(N.NETO),0)')} "neto",${str('NVL(SUM(N.COSTO_PATRONAL),0)')} "patronal" FROM ${from} WHERE ${w}`,
      b,
    )
  )[0]!;
  const orden = {
      inicio: 'P.FECHA_INICIO',
      empleado: "JSON_VALUE(N.DATOS_EMPLEADO,'$.entrada.empleado.nombres')",
      ingresos: 'N.TOTAL_INGRESOS',
      descuentos: 'N.TOTAL_DESCUENTOS',
      neto: 'N.NETO',
      estado: 'P.ESTADO',
    }[q.ordenarPor],
    dir = q.direccion === 'asc' ? 'ASC' : 'DESC';
  const registros = await filas<FilaNomina>(
    c,
    `SELECT N.ID_NOMINA_EMPLEADO "id",N.ID_EMPLEADO "idEmpleado",JSON_VALUE(N.DATOS_EMPLEADO,'$.entrada.empleado.codigo')||' · '||JSON_VALUE(N.DATOS_EMPLEADO,'$.entrada.empleado.nombres')||' '||JSON_VALUE(N.DATOS_EMPLEADO,'$.entrada.empleado.apellidos') "empleado",JSON_VALUE(N.DATOS_EMPLEADO,'$.entrada.empleado.departamento') "departamento",TO_CHAR(P.FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(P.FECHA_FIN,'YYYY-MM-DD') "fin",P.ESTADO "estado",N.VERSION_CALCULO "version",${str('N.TOTAL_INGRESOS')} "ingresos",${str('N.TOTAL_DESCUENTOS')} "descuentos",${str('N.NETO')} "neto",${str('N.COSTO_PATRONAL')} "patronal",JSON_QUERY(N.DATOS_EMPLEADO,'$.resultado.alertas' RETURNING VARCHAR2(4000)) "alertas" FROM ${from} WHERE ${w} ORDER BY ${orden} ${dir},N.ID_NOMINA_EMPLEADO ${dir} OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
    { ...b, offset: (q.pagina - 1) * q.limite, limite: q.limite },
  );
  return {
    registros,
    total: total.n,
    pagina: q.pagina,
    limite: q.limite,
    totales: {
      ingresos: total.ingresos,
      descuentos: total.descuentos,
      neto: total.neto,
      patronal: total.patronal,
    },
  };
}
export async function periodos(c: Connection, q: Query) {
  const w = ['P.ACTIVO=1'],
    b: Binds = {};
  for (const [k, col] of [
    ['anio', 'EXTRACT(YEAR FROM P.FECHA_INICIO)'],
    ['mes', 'EXTRACT(MONTH FROM P.FECHA_INICIO)'],
    ['estado', 'P.ESTADO'],
  ] as const)
    if (q[k] !== undefined) {
      w.push(`${col}=:${k}`);
      b[k] = q[k]!;
    }
  const total = (
    await filas<{ N: number }>(
      c,
      `SELECT COUNT(*) N FROM PERIODOS_NOMINA P WHERE ${w.join(' AND ')}`,
      b,
    )
  )[0]!.N;
  const registros = await filas<Periodo>(
    c,
    `SELECT ${periodoSelect} FROM PERIODOS_NOMINA P WHERE ${w.join(' AND ')} ORDER BY P.FECHA_INICIO ${q.direccion === 'asc' ? 'ASC' : 'DESC'} OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
    { ...b, offset: (q.pagina - 1) * q.limite, limite: q.limite },
  );
  return { registros, total, pagina: q.pagina, limite: q.limite };
}
export async function empresa(c: Connection) {
  return (
    (
      await filas<{
        id: number;
        nombre: string;
        nit: string;
        direccion: string;
        formato: string | null;
      }>(
        c,
        'SELECT ID_CONFIGURACION_EMPRESA "id",RAZON_SOCIAL "nombre",NIT "nit",DIRECCION "direccion",FORMATO_IGSS "formato" FROM CONFIGURACION_EMPRESA WHERE ACTIVO=1 ORDER BY ID_CONFIGURACION_EMPRESA',
      )
    )[0] ?? null
  );
}
export async function guardarFormato(c: Connection, id: number, formato: unknown, actor: number) {
  await c.execute(
    'UPDATE CONFIGURACION_EMPRESA SET FORMATO_IGSS=:formato,MODIFICADO_POR=:actor WHERE ID_CONFIGURACION_EMPRESA=:id',
    { id, formato: { val: JSON.stringify(formato), type: oracledb.CLOB }, actor },
  );
}
export async function vincularAplicacion(
  c: Connection,
  nomina: number,
  descuento: number,
  cuota: number | null,
  orden: number,
  actor: number,
) {
  await c.execute(
    "UPDATE NOMINA_DETALLE SET ID_DESCUENTO_APLICACION=(SELECT ID_DESCUENTO_APLICACION FROM DESCUENTOS_APLICACIONES WHERE ID_NOMINA_EMPLEADO=:nomina AND ID_DESCUENTO_EMPLEADO=:descuento AND (ID_DESCUENTO_CUOTA=:cuota OR (:cuota IS NULL AND ID_DESCUENTO_CUOTA IS NULL)) AND ESTADO='APLICADA'),MODIFICADO_POR=:actor WHERE ID_NOMINA_EMPLEADO=:nomina AND ORDEN=:orden",
    { nomina, descuento, cuota, orden, actor },
  );
}
export async function aplicarFijo(
  c: Connection,
  p: Periodo,
  empleado: number,
  nomina: number,
  descuento: number,
  monto: string,
  actor: number,
) {
  await c.execute(
    `INSERT INTO DESCUENTOS_APLICACIONES (ID_NOMINA_EMPLEADO,ID_EMPLEADO,ID_PERIODO_NOMINA,ID_DESCUENTO_EMPLEADO,MONTO,CREADO_POR) VALUES (:nomina,:empleado,:periodo,:descuento,${num('monto')},:actor)`,
    { nomina, empleado, periodo: p.id, descuento, monto, actor },
  );
}
export async function revertir(c: Connection, p: Periodo, actor: number) {
  const aplicaciones = await filas<{
    id: number;
    descuento: number;
    cuota: number | null;
    monto: string;
  }>(
    c,
    'SELECT ID_DESCUENTO_APLICACION "id",ID_DESCUENTO_EMPLEADO "descuento",ID_DESCUENTO_CUOTA "cuota",' +
      str('MONTO') +
      ' "monto" FROM DESCUENTOS_APLICACIONES WHERE ID_PERIODO_NOMINA=:id AND ESTADO=\'APLICADA\' ORDER BY ID_DESCUENTO_APLICACION DESC',
    { id: p.id },
  );
  for (const a of aplicaciones) {
    if (a.cuota) {
      await c.execute(
        `UPDATE DESCUENTOS_CUOTAS SET MONTO_PAGADO=MONTO_PAGADO-${num('monto')},ESTADO=CASE WHEN MONTO_PAGADO-${num('monto')}=0 THEN 'PENDIENTE' ELSE 'PARCIAL' END,FECHA_PAGO=NULL,ID_PERIODO_NOMINA=NULL,MODIFICADO_POR=:actor WHERE ID_DESCUENTO_CUOTA=:id`,
        { monto: a.monto, actor, id: a.cuota },
      );
      await c.execute(
        `UPDATE DESCUENTOS_EMPLEADO SET SALDO=SALDO+${num('monto')},ESTADO='VIGENTE',MODIFICADO_POR=:actor WHERE ID_DESCUENTO_EMPLEADO=:id`,
        { monto: a.monto, actor, id: a.descuento },
      );
    }
    await c.execute(
      "UPDATE DESCUENTOS_APLICACIONES SET ESTADO='REVERTIDA',MODIFICADO_POR=:actor WHERE ID_DESCUENTO_APLICACION=:id",
      { actor, id: a.id },
    );
  }
}
export async function marcarPago(c: Connection, p: Periodo, actor: number) {
  await c.execute(
    `UPDATE NOMINA_EMPLEADO SET FECHA_PAGO=${fecha('fin')},MODIFICADO_POR=:actor WHERE ID_PERIODO_NOMINA=:id AND VERSION_CALCULO=:version`,
    { fin: p.fin, actor, id: p.id, version: p.version },
  );
}
export async function tiposDeduccion(c: Connection) {
  return filas<{ id: number; nombre: string; codigo: string }>(
    c,
    'SELECT ID_TIPO_DEDUCCION_ISR "id",NOMBRE "nombre",CODIGO "codigo" FROM TIPOS_DEDUCCION_ISR WHERE ACTIVO=1 ORDER BY NOMBRE',
  );
}
export async function fiscal(c: Connection, id: number, anio: number) {
  return {
    aperturas: await filas(
      c,
      `SELECT ID_ISR_APERTURA "id",TO_CHAR(FECHA_CORTE,'YYYY-MM-DD') "fecha",${str('RENTA')} "renta",${str('IGSS')} "igss",${str('ISR')} "isr",MOTIVO "motivo" FROM ISR_APERTURAS WHERE ID_EMPLEADO=:id AND ANIO=:anio`,
      { id, anio },
    ),
    deducciones: await filas(
      c,
      `SELECT D.ID_DEDUCCION_ISR "id",T.NOMBRE "tipo",${str('D.MONTO')} "monto",D.REFERENCIA "referencia",TO_CHAR(D.FECHA_COMPROBANTE,'YYYY-MM-DD') "fecha" FROM ISR_DEDUCCIONES_EMPLEADO D JOIN TIPOS_DEDUCCION_ISR T ON T.ID_TIPO_DEDUCCION_ISR=D.ID_TIPO_DEDUCCION_ISR WHERE D.ID_EMPLEADO=:id AND D.ANIO=:anio AND D.ACTIVO=1 ORDER BY D.ID_DEDUCCION_ISR`,
      { id, anio },
    ),
  };
}
export async function guardarFiscal(
  c: Connection,
  tipo: 'apertura' | 'deduccion',
  d: {
    idEmpleado: number;
    anio: number;
    fecha: string;
    monto: string;
    igss?: string;
    isr?: string;
    motivo: string;
    idTipo?: number;
    referencia?: string;
  },
  actor: number,
) {
  if (tipo === 'apertura') {
    if (
      (
        await filas(
          c,
          `SELECT 1 FROM NOMINA_EMPLEADO N JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA WHERE N.ID_EMPLEADO=:id AND EXTRACT(YEAR FROM P.FECHA_INICIO)=:anio AND P.ESTADO IN ('APROBADO','CERRADO')`,
          { id: d.idEmpleado, anio: d.anio },
        )
      ).length
    )
      throw new ErrorConflicto(
        'Registra la apertura antes de aprobar o cerrar la primera nómina del año del empleado.',
      );
    const r = await c.execute(
      `INSERT INTO ISR_APERTURAS (ID_EMPLEADO,ANIO,FECHA_CORTE,RENTA,IGSS,ISR,MOTIVO,CREADO_POR) VALUES (:id,:anio,${fecha('fecha')},${num('monto')},${num('igss')},${num('isr')},:motivo,:actor) RETURNING ID_ISR_APERTURA INTO :nuevo`,
      {
        id: d.idEmpleado,
        anio: d.anio,
        fecha: d.fecha,
        monto: d.monto,
        igss: d.igss ?? '0',
        isr: d.isr ?? '0',
        motivo: d.motivo,
        actor,
        nuevo: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
    );
    return (r.outBinds as { nuevo: number[] }).nuevo[0]!;
  } else {
    if (!(await tiposDeduccion(c)).some((t) => t.id === d.idTipo))
      throw new ErrorConflicto('Selecciona un tipo de deducción ISR activo.');
    const r = await c.execute(
      `INSERT INTO ISR_DEDUCCIONES_EMPLEADO (ID_EMPLEADO,ID_TIPO_DEDUCCION_ISR,ANIO,MONTO,REFERENCIA,FECHA_COMPROBANTE,CREADO_POR) VALUES (:id,:tipo,:anio,${num('monto')},:referencia,${fecha('fecha')},:actor) RETURNING ID_DEDUCCION_ISR INTO :nuevo`,
      {
        id: d.idEmpleado,
        tipo: d.idTipo!,
        anio: d.anio,
        monto: d.monto,
        referencia: d.referencia!,
        fecha: d.fecha,
        actor,
        nuevo: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
    );
    return (r.outBinds as { nuevo: number[] }).nuevo[0]!;
  }
}

export async function centros(c: Connection) {
  return filas<{ id: number; nombre: string; direccion: string | null }>(
    c,
    'SELECT ID_CENTRO_TRABAJO "id",NOMBRE "nombre",DIRECCION "direccion" FROM CENTROS_TRABAJO WHERE ACTIVO=1 ORDER BY NOMBRE',
  );
}
export async function crearEmpresa(
  c: Connection,
  d: { nombre: string; nit: string; direccion: string; correo: string },
  actor: number,
) {
  await c.execute(
    'INSERT INTO CONFIGURACION_EMPRESA (RAZON_SOCIAL,NIT,DIRECCION,CORREO,CREADO_POR) VALUES (:nombre,:nit,:direccion,:correo,:actor)',
    { nombre: d.nombre, nit: d.nit, direccion: d.direccion, correo: d.correo, actor },
  );
  return (await empresa(c))!;
}

export async function lecturaConsistente(c: Connection) {
  await c.execute('SET TRANSACTION READ ONLY');
}

export async function existeEmpleado(c: Connection, id: number) {
  return (await filas(c, 'SELECT 1 FROM EMPLEADOS WHERE ID_EMPLEADO=:id', { id })).length > 0;
}
