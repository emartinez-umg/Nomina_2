import oracledb from 'oracledb';
import type { Connection, BindParameters } from 'oracledb';
import type { Parametro, Periodo } from '../nomina/nomina.types.js';
import type { Componente } from './prestaciones.calculo.js';
import type { Query, Seleccion } from './prestaciones.schemas.js';
export const fecha = (b: string) => `TO_DATE(:${b},'YYYY-MM-DD')`;
export const num = (b: string) =>
  `TO_NUMBER(:${b},'999999999999D999999','NLS_NUMERIC_CHARACTERS=''.,''')`;
const str = (c: string) => `TO_CHAR(${c},'TM9','NLS_NUMERIC_CHARACTERS=''.,''')`;
export async function filas<T>(c: Connection, sql: string, b: BindParameters = {}) {
  return (
    (
      await c.execute<T>(sql, b, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { snapshot: { type: oracledb.STRING } },
      })
    ).rows ?? []
  );
}
export interface Empleado {
  id: number;
  usuario: number | null;
  nombre: string;
  ingreso: string;
  egreso: string | null;
  estado: string;
  departamento: string;
  puesto: string;
}
const empleadoSelect = `E.ID_EMPLEADO "id",E.ID_USUARIO "usuario",E.CODIGO||' · '||E.NOMBRES||' '||E.APELLIDOS "nombre",TO_CHAR(E.FECHA_INGRESO,'YYYY-MM-DD') "ingreso",TO_CHAR(E.FECHA_EGRESO,'YYYY-MM-DD') "egreso",E.ESTADO "estado",D.NOMBRE "departamento",P.NOMBRE "puesto"`;
const empleadoFrom =
  'EMPLEADOS E JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO JOIN PUESTOS P ON P.ID_PUESTO=E.ID_PUESTO';
export async function empleado(c: Connection, id: number) {
  return (
    await filas<Empleado>(
      c,
      `SELECT ${empleadoSelect} FROM ${empleadoFrom} WHERE E.ID_EMPLEADO=:id`,
      { id },
    )
  )[0];
}
export async function empleados(c: Connection, q: Seleccion, inicio: string, fin: string) {
  return filas<Empleado>(
    c,
    `SELECT ${empleadoSelect} FROM ${empleadoFrom} WHERE E.FECHA_INGRESO<=${fecha('fin')} AND (E.FECHA_EGRESO IS NULL OR E.FECHA_EGRESO>=${fecha('inicio')}) AND (:id IS NULL OR E.ID_EMPLEADO=:id) AND (:dep IS NULL OR E.ID_DEPARTAMENTO=:dep) ORDER BY E.ID_EMPLEADO FETCH FIRST 501 ROWS ONLY`,
    { inicio, fin, id: q.idEmpleado ?? null, dep: q.idDepartamento ?? null },
  );
}
export async function parametros(c: Connection) {
  return filas<Parametro>(
    c,
    `SELECT ID_PARAMETRO_LEGAL "id",CLAVE_INTERNA "codigo",${str('VALOR')} "valor",UNIDAD "unidad",TO_CHAR(VIGENTE_DESDE,'YYYY-MM-DD') "desde",TO_CHAR(VIGENTE_HASTA,'YYYY-MM-DD') "hasta" FROM PARAMETROS_LEGALES WHERE ACTIVO=1 ORDER BY CODIGO,VIGENTE_DESDE`,
  );
}
export async function salario(c: Connection, id: number, corte: string) {
  return (
    await filas<{ monto: string }>(
      c,
      `SELECT ${str('SALARIO_BASE')} "monto" FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id AND ACTIVO=1 AND VIGENTE_DESDE<=${fecha('corte')} AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=${fecha('corte')})`,
      { id, corte },
    )
  )[0]?.monto;
}
export async function periodo(c: Connection, inicio: string) {
  return (
    await filas<Periodo>(
      c,
      `SELECT ID_PERIODO_NOMINA "id",TO_CHAR(FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(FECHA_FIN,'YYYY-MM-DD') "fin",ESTADO "estado",VERSION_CALCULO "version" FROM PERIODOS_NOMINA WHERE FECHA_INICIO=${fecha('inicio')} AND ACTIVO=1`,
      { inicio },
    )
  )[0];
}
export async function cerrado(c: Connection, id: number, p: Periodo) {
  return (
    await filas<{ snapshot: string; id: number }>(
      c,
      'SELECT ID_NOMINA_EMPLEADO "id",DATOS_EMPLEADO "snapshot" FROM NOMINA_EMPLEADO WHERE ID_EMPLEADO=:id AND ID_PERIODO_NOMINA=:p AND VERSION_CALCULO=:v',
      { id, p: p.id, v: p.version },
    )
  )[0];
}
export interface Registro {
  id: number;
  idEmpleado: number;
  empleado: string;
  tipo: string;
  inicio: string;
  fin: string;
  promedio: string;
  total: string;
  estado: string;
  hash: string | null;
  snapshot: string | null;
  fechaPago: string | null;
  referencia: string | null;
  motivo: string;
}
const select = `P.ID_PRESTACION "id",P.ID_EMPLEADO "idEmpleado",E.CODIGO||' · '||E.NOMBRES||' '||E.APELLIDOS "empleado",P.TIPO "tipo",TO_CHAR(P.FECHA_INICIO_BASE,'YYYY-MM-DD') "inicio",TO_CHAR(P.FECHA_FIN_BASE,'YYYY-MM-DD') "fin",${str('P.SALARIO_PROMEDIO')} "promedio",${str('P.MONTO_TOTAL')} "total",P.ESTADO "estado",P.HASH_FUENTES "hash",P.SNAPSHOT "snapshot",TO_CHAR(P.FECHA_PAGO,'YYYY-MM-DD') "fechaPago",P.REFERENCIA_PAGO "referencia",P.MOTIVO "motivo"`;
const from = 'PRESTACIONES P JOIN EMPLEADOS E ON E.ID_EMPLEADO=P.ID_EMPLEADO';
export async function registro(c: Connection, id: number) {
  return (
    await filas<Registro>(
      c,
      `SELECT ${select} FROM ${from} WHERE P.ID_PRESTACION=:id AND P.ACTIVO=1`,
      { id },
    )
  )[0];
}
export async function conflictos(
  c: Connection,
  id: number,
  tipo: string,
  inicio: string,
  fin: string,
  excluir = 0,
) {
  return filas<{ id: number; estado: string }>(
    c,
    `SELECT DISTINCT P.ID_PRESTACION "id",P.ESTADO "estado" FROM PRESTACIONES P LEFT JOIN PRESTACION_DETALLE D ON D.ID_PRESTACION=P.ID_PRESTACION WHERE P.ID_EMPLEADO=:id AND (P.TIPO=:tipo OR D.CONCEPTO=:tipo) AND P.ESTADO<>'ANULADA' AND P.ACTIVO=1 AND P.ID_PRESTACION<>:excluir AND P.FECHA_INICIO_BASE<=${fecha('fin')} AND P.FECHA_FIN_BASE>=${fecha('inicio')}`,
    { id, tipo, inicio, fin, excluir },
  );
}
export async function otrosPendientes(c: Connection, id: number) {
  return filas(
    c,
    "SELECT 1 FROM PRESTACIONES WHERE ID_EMPLEADO=:id AND ESTADO IN ('CALCULADA','APROBADA') AND ACTIVO=1",
    { id },
  );
}
export async function guardar(
  c: Connection,
  d: {
    idEmpleado: number;
    tipo: string;
    inicio: string;
    fin: string;
    promedio: string;
    tiempo: string;
    total: string;
    hash: string;
    snapshot: unknown;
    motivo: string;
    componentes: Componente[];
  },
  actor: number,
) {
  const r = await c.execute(
    `INSERT INTO PRESTACIONES (ID_EMPLEADO,TIPO,FECHA_INICIO_BASE,FECHA_FIN_BASE,FECHA_CALCULO,SALARIO_PROMEDIO,TIEMPO_ANIOS,MONTO_TOTAL,HASH_FUENTES,SNAPSHOT,MOTIVO,CREADO_POR) VALUES (:empleado,:tipo,${fecha('inicio')},${fecha('fin')},TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)),${num('promedio')},${num('tiempo')},${num('total')},:hash,:snapshot,:motivo,:actor) RETURNING ID_PRESTACION INTO :id`,
    {
      empleado: d.idEmpleado,
      tipo: d.tipo,
      inicio: d.inicio,
      fin: d.fin,
      promedio: d.promedio,
      tiempo: d.tiempo,
      total: d.total,
      hash: d.hash,
      snapshot: { val: JSON.stringify(d.snapshot), type: oracledb.CLOB },
      motivo: d.motivo,
      actor,
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
  );
  const id = (r.outBinds as { id: number[] }).id[0]!;
  for (const l of d.componentes)
    await c.execute(
      `INSERT INTO PRESTACION_DETALLE (ID_PRESTACION,CONCEPTO,BASE_CALCULO,DIAS,MONTO,MONTO_EXENTO_ISR,DETALLE_CALCULO,CREADO_POR) VALUES (:id,:concepto,${num('base')},0,${num('monto')},${num('exento')},:detalle,:actor)`,
      {
        id,
        concepto: l.concepto,
        base: l.promedio,
        monto: l.monto,
        exento: l.exento,
        detalle: { val: JSON.stringify(l), type: oracledb.CLOB },
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
  fechaPago: string | null = null,
  referencia: string | null = null,
) {
  await c.execute(
    `UPDATE PRESTACIONES SET ESTADO=:estado,MODIFICADO_POR=:actor,APROBADO_POR=CASE WHEN :estado='APROBADA' THEN :actor ELSE APROBADO_POR END,APROBADO_EN=CASE WHEN :estado='APROBADA' THEN CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE) ELSE APROBADO_EN END,FECHA_PAGO=${fecha('fechaPago')},REFERENCIA_PAGO=:referencia WHERE ID_PRESTACION=:id`,
    { id, estado, actor, fechaPago, referencia },
  );
}
export async function ultimoCierre(c: Connection) {
  return (
    await filas<{ fin: string | null }>(
      c,
      "SELECT TO_CHAR(MAX(FECHA_FIN),'YYYY-MM-DD') \"fin\" FROM PERIODOS_NOMINA WHERE ESTADO='CERRADO' AND ACTIVO=1",
    )
  )[0]!.fin;
}
export async function posterioresEmpleado(c: Connection, id: number, corte: string) {
  return filas(
    c,
    `SELECT 1 FROM NOMINA_EMPLEADO N JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA WHERE N.ID_EMPLEADO=:id AND P.FECHA_FIN>${fecha('corte')} AND P.ESTADO IN ('APROBADO','CERRADO')`,
    { id, corte },
  );
}
export async function fuenteUtilizada(c: Connection, id: number) {
  return (
    (
      await filas(
        c,
        `SELECT 1 FROM PRESTACIONES P, JSON_TABLE(P.SNAPSHOT,'$.nominas[*]' COLUMNS (ID NUMBER PATH '$')) J WHERE P.ESTADO<>'ANULADA' AND J.ID=:id FETCH FIRST 1 ROW ONLY`,
        { id },
      )
    ).length > 0
  );
}
export async function listar(c: Connection, q: Query, completo = false) {
  const w = ['P.ACTIVO=1'],
    b: Record<string, string | number> = {};
  for (const [k, col] of [
    ['idEmpleado', 'P.ID_EMPLEADO'],
    ['idDepartamento', 'E.ID_DEPARTAMENTO'],
    ['tipo', 'P.TIPO'],
    ['estado', 'P.ESTADO'],
  ] as const)
    if (q[k] !== undefined) {
      w.push(`${col}=:${k}`);
      b[k] = q[k]!;
    }
  if (q.buscar) {
    w.push("INSTR(UPPER(E.CODIGO||' '||E.NOMBRES||' '||E.APELLIDOS),UPPER(:buscar))>0");
    b.buscar = q.buscar;
  }
  if (q.desde) {
    w.push(`P.FECHA_FIN_BASE>=${fecha('desde')}`);
    b.desde = q.desde;
  }
  if (q.hasta) {
    w.push(`P.FECHA_INICIO_BASE<=${fecha('hasta')}`);
    b.hasta = q.hasta;
  }
  const total = (
    await filas<{ n: number }>(c, `SELECT COUNT(*) "n" FROM ${from} WHERE ${w.join(' AND ')}`, b)
  )[0]!.n;
  const ordenar = {
    id: 'P.ID_PRESTACION',
    empleado: 'E.NOMBRES',
    tipo: 'P.TIPO',
    fin: 'P.FECHA_FIN_BASE',
    total: 'P.MONTO_TOTAL',
    estado: 'P.ESTADO',
  }[q.ordenarPor];
  const registros = await filas<Registro>(
    c,
    `SELECT ${select.replace('P.SNAPSHOT "snapshot",', '')} FROM ${from} WHERE ${w.join(' AND ')} ORDER BY ${ordenar} ${q.direccion === 'asc' ? 'ASC' : 'DESC'},P.ID_PRESTACION OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
    { ...b, offset: completo ? 0 : (q.pagina - 1) * q.limite, limite: completo ? 10001 : q.limite },
  );
  return { registros, total, pagina: q.pagina, limite: q.limite };
}
export async function exencionUsada(
  c: Connection,
  id: number,
  tipo: string,
  anio: number,
  excluir = 0,
) {
  const r = await filas<{ exento: string }>(
    c,
    `SELECT ${str('NVL(SUM(D.MONTO_EXENTO_ISR),0)')} "exento" FROM PRESTACION_DETALLE D JOIN PRESTACIONES P ON P.ID_PRESTACION=D.ID_PRESTACION WHERE P.ID_EMPLEADO=:id AND D.CONCEPTO=:tipo AND P.ESTADO='PAGADA' AND EXTRACT(YEAR FROM P.FECHA_PAGO)=:anio AND P.ID_PRESTACION<>:excluir`,
    { id, tipo, anio, excluir },
  );
  return r[0]!.exento;
}

export async function historialPagos(c: Connection, id: number, inicio: string, fin: string) {
  const ns = await filas<{ id: number; snapshot: string; fecha: string }>(
    c,
    `SELECT N.ID_NOMINA_EMPLEADO "id",N.DATOS_EMPLEADO "snapshot",TO_CHAR(N.FECHA_PAGO,'YYYY-MM-DD') "fecha" FROM NOMINA_EMPLEADO N JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA WHERE N.ID_EMPLEADO=:id AND P.ESTADO='CERRADO' AND ((P.MOTOR='V0' AND N.VERSION_CALCULO=P.VERSION_CALCULO) OR (P.MOTOR='V1' AND P.QUINCENA=2 AND EXISTS(SELECT 1 FROM PAGOS_NOMINA PN WHERE PN.ID_NOMINA_EMPLEADO=N.ID_NOMINA_EMPLEADO AND PN.ESTADO='PAGADO'))) AND N.FECHA_PAGO BETWEEN ${fecha('inicio')} AND ${fecha('fin')} ORDER BY N.FECHA_PAGO,N.ID_NOMINA_EMPLEADO`,
    { id, inicio, fin },
  );
  const pagos = await filas<{ fecha: string; concepto: string; monto: string }>(
    c,
    `SELECT TO_CHAR(P.FECHA_PAGO,'YYYY-MM-DD') "fecha",D.CONCEPTO "concepto",${str('D.MONTO')} "monto" FROM PRESTACIONES P JOIN PRESTACION_DETALLE D ON D.ID_PRESTACION=P.ID_PRESTACION WHERE P.ID_EMPLEADO=:id AND P.ESTADO='PAGADA' AND D.CONCEPTO IN ('AGUINALDO','BONO_14','VACACIONES_PENDIENTES') AND P.FECHA_PAGO BETWEEN ${fecha('inicio')} AND ${fecha('fin')} ORDER BY P.FECHA_PAGO`,
    { id, inicio, fin },
  );
  return { ns, pagos };
}
