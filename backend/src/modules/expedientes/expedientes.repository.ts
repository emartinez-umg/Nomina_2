import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
export const hoyExpediente = "TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE))";
export interface TipoDocumento {
  id: number;
  nombre: string;
  obligatorio: number;
  requiereVencimiento: number;
}
export interface DocumentoExpediente {
  id: number;
  idEmpleado: number;
  idTipo: number;
  version: number;
  actual: number;
  activo: number;
  nombre: string;
  tipo: string;
  tamano: number;
  hash: string;
  clave: string;
  vencimiento: string | null;
  creado: string;
  motivoBaja: string | null;
  bajaEn: string | null;
}
export async function empleado(c: Connection, id: number, bloquear = false) {
  return (
    (
      await c.execute<{ id: number; idUsuario: number | null }>(
        `SELECT ID_EMPLEADO "id",ID_USUARIO "idUsuario" FROM EMPLEADOS WHERE ID_EMPLEADO=:id ${bloquear ? 'FOR UPDATE' : ''}`,
        { id },
        opts,
      )
    ).rows?.[0] ?? null
  );
}
export async function propio(c: Connection, usuario: number) {
  return (
    await c.execute<{ id: number }>(
      'SELECT ID_EMPLEADO "id" FROM EMPLEADOS WHERE ID_USUARIO=:usuario AND ACTIVO=1',
      { usuario },
      opts,
    )
  ).rows?.[0]?.id;
}
export async function reglas(c: Connection) {
  const r =
    (
      await c.execute<{ clave: string; valor: number }>(
        `SELECT CLAVE_INTERNA "clave",VALOR "valor" FROM (SELECT P.*,ROW_NUMBER() OVER(PARTITION BY CLAVE_INTERNA ORDER BY VIGENTE_DESDE DESC) RN FROM PARAMETROS_LEGALES P WHERE ACTIVO=1 AND CLAVE_INTERNA IN ('EXPEDIENTE_MAX_MB','EXPEDIENTE_AVISO_DIAS') AND VIGENTE_DESDE<=${hoyExpediente} AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=${hoyExpediente})) WHERE RN=1`,
        {},
        opts,
      )
    ).rows ?? [];
  return {
    maxMb: r.find((x) => x.clave === 'EXPEDIENTE_MAX_MB')?.valor,
    avisoDias: r.find((x) => x.clave === 'EXPEDIENTE_AVISO_DIAS')?.valor,
    hoy: (
      await c.execute<{ hoy: string }>(
        `SELECT TO_CHAR(${hoyExpediente},'YYYY-MM-DD') "hoy" FROM DUAL`,
        {},
        opts,
      )
    ).rows![0]!.hoy,
  };
}
export async function tipos(c: Connection) {
  return (
    (
      await c.execute<TipoDocumento>(
        'SELECT ID_TIPO_DOCUMENTO_EXPEDIENTE "id",NOMBRE "nombre",OBLIGATORIO "obligatorio",REQUIERE_VENCIMIENTO "requiereVencimiento" FROM TIPOS_DOCUMENTO_EXPEDIENTE WHERE ACTIVO=1 ORDER BY ID_TIPO_DOCUMENTO_EXPEDIENTE',
        {},
        opts,
      )
    ).rows ?? []
  );
}
const columnas = `ID_EXPEDIENTE_DOCUMENTO "id",ID_EMPLEADO "idEmpleado",ID_TIPO_DOCUMENTO_EXPEDIENTE "idTipo",VERSION "version",ES_ACTUAL "actual",ACTIVO "activo",NOMBRE_ARCHIVO "nombre",TIPO_CONTENIDO "tipo",TAMANO_BYTES "tamano",HASH_SHA256 "hash",CLAVE_ARCHIVO "clave",TO_CHAR(VENCIMIENTO,'YYYY-MM-DD') "vencimiento",TO_CHAR(FECHA_CREACION,'YYYY-MM-DD"T"HH24:MI:SS')||'-06:00' "creado",MOTIVO_BAJA "motivoBaja",TO_CHAR(BAJA_EN,'YYYY-MM-DD"T"HH24:MI:SS')||CASE WHEN BAJA_EN IS NOT NULL THEN '-06:00' END "bajaEn"`;
export async function listar(c: Connection, id: number, pagina: number, tipo?: number) {
  const filtros = 'ID_EMPLEADO=:id AND (:tipo IS NULL OR ID_TIPO_DOCUMENTO_EXPEDIENTE=:tipo)';
  const binds = { id, tipo: tipo ?? null };
  const total = (
    await c.execute<{ total: number }>(
      `SELECT COUNT(*) "total" FROM EXPEDIENTE_DOCUMENTOS WHERE ${filtros}`,
      binds,
      opts,
    )
  ).rows![0]!.total;
  const registros =
    (
      await c.execute<DocumentoExpediente>(
        `SELECT ${columnas} FROM EXPEDIENTE_DOCUMENTOS WHERE ${filtros} ORDER BY VERSION DESC,ID_EXPEDIENTE_DOCUMENTO DESC OFFSET :offset ROWS FETCH NEXT 20 ROWS ONLY`,
        { ...binds, offset: (pagina - 1) * 20 },
        opts,
      )
    ).rows ?? [];
  return { registros, total, pagina, limite: 20 };
}
export async function actuales(c: Connection, id: number) {
  return (
    (
      await c.execute<DocumentoExpediente>(
        `SELECT ${columnas} FROM EXPEDIENTE_DOCUMENTOS WHERE ID_EMPLEADO=:id AND ACTIVO=1 AND ES_ACTUAL=1`,
        { id },
        opts,
      )
    ).rows ?? []
  );
}
export async function documento(c: Connection, id: number) {
  return (
    (
      await c.execute<DocumentoExpediente>(
        `SELECT ${columnas} FROM EXPEDIENTE_DOCUMENTOS WHERE ID_EXPEDIENTE_DOCUMENTO=:id`,
        { id },
        opts,
      )
    ).rows?.[0] ?? null
  );
}
export async function insertar(
  c: Connection,
  d: {
    empleado: number;
    tipo: number;
    nombre: string;
    clave: string;
    contenido: string;
    tamano: number;
    hash: string;
    vencimiento?: string | undefined;
    usuario: number;
  },
) {
  const version = (
    await c.execute<{ version: number }>(
      'SELECT NVL(MAX(VERSION),0)+1 "version" FROM EXPEDIENTE_DOCUMENTOS WHERE ID_EMPLEADO=:empleado AND ID_TIPO_DOCUMENTO_EXPEDIENTE=:tipo',
      { empleado: d.empleado, tipo: d.tipo },
      opts,
    )
  ).rows![0]!.version;
  const r = await c.execute<{ id: number[] }>(
    `INSERT INTO EXPEDIENTE_DOCUMENTOS(ID_EMPLEADO,ID_TIPO_DOCUMENTO_EXPEDIENTE,VERSION,NOMBRE_ARCHIVO,CLAVE_ARCHIVO,TIPO_CONTENIDO,TAMANO_BYTES,HASH_SHA256,VENCIMIENTO,CREADO_POR) VALUES(:empleado,:tipo,:version,:nombre,:clave,:contenido,:tamano,:hash,TO_DATE(:vencimiento,'YYYY-MM-DD'),:usuario) RETURNING ID_EXPEDIENTE_DOCUMENTO INTO :id`,
    {
      ...d,
      vencimiento: d.vencimiento ?? null,
      version,
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
  );
  return { id: r.outBinds!.id[0]!, version };
}
export async function superar(c: Connection, id: number, usuario: number) {
  await c.execute(
    'UPDATE EXPEDIENTE_DOCUMENTOS SET ES_ACTUAL=0,MODIFICADO_POR=:usuario,FECHA_MODIFICACION=SYSTIMESTAMP WHERE ID_EXPEDIENTE_DOCUMENTO=:id',
    { id, usuario },
  );
}
export async function baja(c: Connection, id: number, usuario: number, motivo: string) {
  await c.execute(
    'UPDATE EXPEDIENTE_DOCUMENTOS SET ACTIVO=0,ES_ACTUAL=0,MOTIVO_BAJA=:motivo,BAJA_POR=:usuario,BAJA_EN=SYSTIMESTAMP,MODIFICADO_POR=:usuario,FECHA_MODIFICACION=SYSTIMESTAMP WHERE ID_EXPEDIENTE_DOCUMENTO=:id',
    { id, usuario, motivo },
  );
}
export async function editarTipo(
  c: Connection,
  id: number,
  obligatorio: boolean,
  requiere: boolean,
  usuario: number,
) {
  await c.execute(
    'UPDATE TIPOS_DOCUMENTO_EXPEDIENTE SET OBLIGATORIO=:obligatorio,REQUIERE_VENCIMIENTO=:requiere,MODIFICADO_POR=:usuario,FECHA_MODIFICACION=SYSTIMESTAMP WHERE ID_TIPO_DOCUMENTO_EXPEDIENTE=:id AND ACTIVO=1',
    { id, obligatorio: obligatorio ? 1 : 0, requiere: requiere ? 1 : 0, usuario },
  );
}
// Un documento vencido o sin vencimiento obligatorio no completa el expediente.
export const faltaExpedienteSql = (alias: string) =>
  `EXISTS(SELECT 1 FROM TIPOS_DOCUMENTO_EXPEDIENTE T WHERE T.ACTIVO=1 AND T.OBLIGATORIO=1 AND NOT EXISTS(SELECT 1 FROM EXPEDIENTE_DOCUMENTOS X WHERE X.ID_EMPLEADO=${alias}.ID_EMPLEADO AND X.ID_TIPO_DOCUMENTO_EXPEDIENTE=T.ID_TIPO_DOCUMENTO_EXPEDIENTE AND X.ACTIVO=1 AND X.ES_ACTUAL=1 AND (X.VENCIMIENTO IS NULL OR X.VENCIMIENTO>=${hoyExpediente}) AND (T.REQUIERE_VENCIMIENTO=0 OR X.VENCIMIENTO IS NOT NULL)))`;

export async function claveRegistrada(c: Connection, clave: string) {
  return (
    ((
      await c.execute<{ total: number }>(
        'SELECT COUNT(*) "total" FROM EXPEDIENTE_DOCUMENTOS WHERE CLAVE_ARCHIVO=:clave',
        { clave },
        opts,
      )
    ).rows?.[0]?.total ?? 0) > 0
  );
}

export const requeridosExpedienteSql =
  '(SELECT COUNT(*) FROM TIPOS_DOCUMENTO_EXPEDIENTE T WHERE T.ACTIVO=1 AND T.OBLIGATORIO=1)';
export const completosExpedienteSql = (alias: string) =>
  `(SELECT COUNT(*) FROM TIPOS_DOCUMENTO_EXPEDIENTE T WHERE T.ACTIVO=1 AND T.OBLIGATORIO=1 AND EXISTS(SELECT 1 FROM EXPEDIENTE_DOCUMENTOS X WHERE X.ID_EMPLEADO=${alias}.ID_EMPLEADO AND X.ID_TIPO_DOCUMENTO_EXPEDIENTE=T.ID_TIPO_DOCUMENTO_EXPEDIENTE AND X.ACTIVO=1 AND X.ES_ACTUAL=1 AND (X.VENCIMIENTO IS NULL OR X.VENCIMIENTO>=${hoyExpediente}) AND (T.REQUIERE_VENCIMIENTO=0 OR X.VENCIMIENTO IS NOT NULL)))`;
