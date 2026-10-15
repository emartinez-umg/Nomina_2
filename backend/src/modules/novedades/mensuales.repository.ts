import oracledb from 'oracledb';
import type { Connection, BindParameters } from 'oracledb';
import type { Query } from './novedades.schemas.js';
import type { Fila } from './novedades.repository.js';
export const tiposMensuales = {
  comisiones: 'COMISION',
  'horas-extra': 'HORAS_EXTRA',
  'consumo-tienda': 'CONSUMO_TIENDA',
} as const;
export type TipoMensual = keyof typeof tiposMensuales;
export const esMensual = (tipo: string): tipo is TipoMensual => tipo in tiposMensuales;
export const filas = async <T>(c: Connection, sql: string, binds: BindParameters = {}) =>
  (await c.execute<T>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows ?? [];
export const num = (col: string) => `TO_CHAR(${col},'TM9','NLS_NUMERIC_CHARACTERS=''.,''')`;
export const n = (bind: string) =>
  `TO_NUMBER(:${bind},'999999999999999999D99999999','NLS_NUMERIC_CHARACTERS=''.,''')`;
const bloqueo = `CASE WHEN M.ESTADO='APLICADA' OR EXISTS(SELECT 1 FROM PERIODOS_NOMINA P WHERE P.ESTADO='CERRADO' AND P.FECHA_INICIO<=LAST_DAY(M.MES) AND P.FECHA_FIN>=M.MES) THEN 1 ELSE 0 END`;
const select = `M.ID_NOVEDAD_MENSUAL "id",NULL "codigo",M.ID_EMPLEADO "idEmpleado",E.CODIGO||' · '||E.NOMBRES||' '||E.APELLIDOS "empleado",M.ACTIVO "activo",${bloqueo} "bloqueada",TO_CHAR(M.MES,'YYYY-MM-DD') "fechaInicio",TO_CHAR(LAST_DAY(M.MES),'YYYY-MM-DD') "fechaFin",TO_CHAR(M.MES,'YYYY-MM') "mes",M.ESTADO "estado",M.ESTADO "estadoAplicacion",M.ID_NOMINA_EMPLEADO "idPago",M.AUTORIZACION "autorizacion",M.DESCRIPCION "motivo",M.REFERENCIA "referencia",${num('M.MONTO')} "monto",NULL "saldo",CASE WHEN M.TIPO='HORAS_EXTRA' THEN ${num('M.CANTIDAD')} END "horas",${num('M.VALOR_UNITARIO')} "valorUnitario",${num('M.RECARGO')} "recargo"`;
export async function listarMensuales(c: Connection, tipo: TipoMensual, q: Query, id?: number) {
  const binds: BindParameters = { tipo: tiposMensuales[tipo] },
    where = ['M.TIPO=:tipo'];
  const add = (sql: string, key: string, value: string | number) => {
    where.push(sql);
    binds[key] = value;
  };
  if (id) add('M.ID_NOVEDAD_MENSUAL=:id', 'id', id);
  if (q.idEmpleado) add('M.ID_EMPLEADO=:empleado', 'empleado', q.idEmpleado);
  if (q.idDepartamento) add('E.ID_DEPARTAMENTO=:departamento', 'departamento', q.idDepartamento);
  if (q.mes) add("M.MES=TO_DATE(:mes||'-01','YYYY-MM-DD')", 'mes', q.mes);
  if (q.desde) add("LAST_DAY(M.MES)>=TO_DATE(:desde,'YYYY-MM-DD')", 'desde', q.desde);
  if (q.hasta) add("M.MES<=TO_DATE(:hasta,'YYYY-MM-DD')", 'hasta', q.hasta);
  if (q.estado) add('M.ESTADO=:estado', 'estado', q.estado);
  if (q.buscar)
    add(
      "INSTR(UPPER(E.CODIGO||' '||E.NOMBRES||' '||E.APELLIDOS||' '||M.DESCRIPCION||' '||M.REFERENCIA),UPPER(:buscar))>0",
      'buscar',
      q.buscar,
    );
  for (const key of ['monto', 'horas'] as const)
    for (const suf of ['Min', 'Max'] as const) {
      const k = `${key}${suf}` as const;
      if (q[k] !== undefined)
        add(
          `${key === 'monto' ? 'M.MONTO' : 'M.CANTIDAD'}${suf === 'Min' ? '>=' : '<='}${n(k)}`,
          k,
          q[k]!,
        );
    }
  const from = `NOVEDADES_MENSUALES M JOIN EMPLEADOS E ON E.ID_EMPLEADO=M.ID_EMPLEADO WHERE ${where.join(' AND ')}`;
  const total = (
    await filas<{ total: number }>(c, `SELECT COUNT(*) "total" FROM ${from}`, binds)
  )[0]!.total;
  const orden = {
    id: 'M.ID_NOVEDAD_MENSUAL',
    codigo: 'M.ID_NOVEDAD_MENSUAL',
    empleado: 'E.NOMBRES',
    fechaInicio: 'M.MES',
    monto: 'M.MONTO',
    estado: 'M.ESTADO',
    saldo: 'M.ID_NOVEDAD_MENSUAL',
  }[q.ordenarPor];
  const registros = await filas<Fila>(
    c,
    `SELECT ${select} FROM ${from} ORDER BY ${orden} ${q.direccion === 'asc' ? 'ASC' : 'DESC'},M.ID_NOVEDAD_MENSUAL DESC OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
    { ...binds, offset: (q.pagina - 1) * q.limite, limite: q.limite },
  );
  for (const r of registros) {
    if (r.horas == null) delete r.horas;
    if (r.referencia == null) delete r.referencia;
  }
  return { registros, total, pagina: q.pagina, limite: q.limite };
}
export async function guardarMensual(
  c: Connection,
  tipo: TipoMensual,
  d: { idEmpleado: number; mes: string; motivo: string; referencia?: string; horas?: string },
  monto: string,
  valorUnitario: string | null,
  recargo: string | null,
  actor: number,
  id?: number,
) {
  const binds = {
    empleado: d.idEmpleado,
    tipo: tiposMensuales[tipo],
    mes: d.mes,
    motivo: d.motivo,
    referencia: d.referencia ?? null,
    claveReferencia: d.referencia
      ? `${tiposMensuales[tipo]}:${d.idEmpleado}:${d.mes}:${d.referencia}`
      : null,
    cantidad: d.horas ?? '1',
    monto,
    valorUnitario,
    recargo,
    actor,
  };
  const values = `:empleado,:tipo,TO_DATE(:mes||'-01','YYYY-MM-DD'),:motivo,:referencia,:claveReferencia,${n('cantidad')},${n('monto')},${n('valorUnitario')},${n('recargo')},:actor`;
  if (id) {
    await c.execute(
      `UPDATE NOVEDADES_MENSUALES SET ID_EMPLEADO=:empleado,TIPO=:tipo,MES=TO_DATE(:mes||'-01','YYYY-MM-DD'),DESCRIPCION=:motivo,REFERENCIA=:referencia,CLAVE_REFERENCIA=:claveReferencia,CANTIDAD=${n('cantidad')},MONTO=${n('monto')},VALOR_UNITARIO=${n('valorUnitario')},RECARGO=${n('recargo')},AUTORIZACION='APROBADA',MODIFICADO_POR=:actor WHERE ID_NOVEDAD_MENSUAL=:id`,
      { ...binds, id },
    );
    return id;
  }
  const r = await c.execute<{ id: number[] }>(
    `INSERT INTO NOVEDADES_MENSUALES(ID_EMPLEADO,TIPO,MES,DESCRIPCION,REFERENCIA,CLAVE_REFERENCIA,CANTIDAD,MONTO,VALOR_UNITARIO,RECARGO,CREADO_POR) VALUES(${values}) RETURNING ID_NOVEDAD_MENSUAL INTO :id`,
    { ...binds, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
  );
  return r.outBinds!.id[0]!;
}
export async function referenciaRepetida(
  c: Connection,
  tipo: TipoMensual,
  d: { idEmpleado: number; mes: string; referencia?: string },
  excluir = 0,
) {
  if (!d.referencia) return false;
  return (
    (
      await filas<{ total: number }>(
        c,
        `SELECT COUNT(*) "total" FROM NOVEDADES_MENSUALES WHERE TIPO=:tipo AND ID_EMPLEADO=:empleado AND MES=TO_DATE(:mes||'-01','YYYY-MM-DD') AND REFERENCIA=:referencia AND ID_NOVEDAD_MENSUAL<>:excluir`,
        {
          tipo: tiposMensuales[tipo],
          empleado: d.idEmpleado,
          mes: d.mes,
          referencia: d.referencia,
          excluir,
        },
      )
    )[0]!.total > 0
  );
}
export async function anularMensual(c: Connection, id: number, actor: number) {
  await c.execute(
    'UPDATE NOVEDADES_MENSUALES SET ACTIVO=0,MODIFICADO_POR=:actor WHERE ID_NOVEDAD_MENSUAL=:id',
    { id, actor },
  );
}
export async function topeHoras(c: Connection, fecha: string) {
  return await filas<{ valor: string }>(
    c,
    `SELECT ${num('VALOR')} "valor" FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA='HORAS_EXTRA_TOPE_MENSUAL' AND UNIDAD='HORAS' AND ACTIVO=1 AND VIGENTE_DESDE<=TO_DATE(:fecha,'YYYY-MM-DD') AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TO_DATE(:fecha,'YYYY-MM-DD'))`,
    { fecha },
  );
}
export async function ausenciasMensuales(c: Connection, id: number) {
  return filas<{
    mes: string;
    dias: string;
    monto: string | null;
    idPago: number | null;
    estado: string;
  }>(
    c,
    `SELECT TO_CHAR(MES,'YYYY-MM') "mes",${num('CANTIDAD')} "dias",${num('MONTO')} "monto",ID_NOMINA_EMPLEADO "idPago",ESTADO "estado" FROM NOVEDADES_MENSUALES WHERE ID_AUSENCIA=:id AND ACTIVO=1 ORDER BY MES,ID_NOVEDAD_MENSUAL`,
    { id },
  );
}
export async function guardarAusenciaMes(
  c: Connection,
  d: {
    id: number;
    empleado: number;
    mes: string;
    dias: number;
    monto: string;
    estado: string;
    motivo: string;
  },
  actor: number,
) {
  await c.execute(
    `INSERT INTO NOVEDADES_MENSUALES(ID_EMPLEADO,TIPO,MES,CANTIDAD,MONTO,DESCRIPCION,AUTORIZACION,ID_AUSENCIA,CREADO_POR) VALUES(:empleado,'AUSENCIA',TO_DATE(:mes||'-01','YYYY-MM-DD'),:dias,${n('monto')},:motivo,:estado,:id,:actor)`,
    { ...d, actor },
  );
}
export async function limpiarAusencia(c: Connection, id: number) {
  await c.execute("DELETE FROM NOVEDADES_MENSUALES WHERE ID_AUSENCIA=:id AND ESTADO='PENDIENTE'", {
    id,
  });
}

export async function salariosEmpleado(c: Connection, id: number) {
  return filas<{ desde: string; hasta: string | null; salario: string }>(
    c,
    `SELECT TO_CHAR(VIGENTE_DESDE,'YYYY-MM-DD') "desde",TO_CHAR(VIGENTE_HASTA,'YYYY-MM-DD') "hasta",${num('SALARIO_BASE')} "salario" FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id AND ACTIVO=1`,
    { id },
  );
}
export async function horasMes(c: Connection, empleado: number, mes: string, excluir: number) {
  return (
    await filas<{ horas: string }>(
      c,
      `SELECT ${num('NVL(SUM(CANTIDAD),0)')} "horas" FROM NOVEDADES_MENSUALES WHERE TIPO='HORAS_EXTRA' AND ACTIVO=1 AND AUTORIZACION<>'RECHAZADA' AND ID_EMPLEADO=:empleado AND MES=TO_DATE(:mes||'-01','YYYY-MM-DD') AND ID_NOVEDAD_MENSUAL<>:excluir`,
      { empleado, mes, excluir },
    )
  )[0]!.horas;
}

export async function origenes(c: Connection, id: number) {
  return filas<{
    entidad: string;
    id: number;
    fecha: string | null;
    descripcion: string | null;
    cantidad: string | null;
    monto: string | null;
    estado: string | null;
  }>(
    c,
    `SELECT O.ENTIDAD "entidad",O.ID_ORIGEN "id",TO_CHAR(H.FECHA,'YYYY-MM-DD') "fecha",NVL(H.MOTIVO,C.DESCRIPCION) "descripcion",${num('H.HORAS')} "cantidad",${num('C.MONTO')} "monto",H.ESTADO "estado" FROM NOVEDADES_ORIGEN O LEFT JOIN HORAS_EXTRA H ON O.ENTIDAD='HORAS_EXTRA' AND H.ID_HORA_EXTRA=O.ID_ORIGEN LEFT JOIN COMISIONES C ON O.ENTIDAD='COMISIONES' AND C.ID_COMISION=O.ID_ORIGEN WHERE O.ID_NOVEDAD_MENSUAL=:id ORDER BY O.ID_ORIGEN`,
    { id },
  );
}
