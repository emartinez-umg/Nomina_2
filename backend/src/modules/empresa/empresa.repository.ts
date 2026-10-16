import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { DatosEmpresa } from './empresa.schemas.js';
import type { IdentidadEmpresa, FirmaDocumento } from '../../shared/pdf/documento.js';
export interface Empresa extends IdentidadEmpresa {
  id: number;
  version: number;
  logoHash: string | null;
}
export async function obtenerEmpresa(c: Connection): Promise<Empresa | null> {
  const r = await c.execute<Empresa>(
    `SELECT C.ID_CONFIGURACION_EMPRESA "id", C.RAZON_SOCIAL "razonSocial", I.NOMBRE_COMERCIAL "nombreComercial", C.NIT "nit", C.DIRECCION "direccion", C.TELEFONO "telefono", C.CORREO "correo", I.SITIO_WEB "sitioWeb", I.LOGO_PNG "logo", I.LOGO_SHA256 "logoHash", NVL(I.VERSION,0) "version" FROM CONFIGURACION_EMPRESA C LEFT JOIN IDENTIDAD_EMPRESA I ON I.ID_CONFIGURACION_EMPRESA=C.ID_CONFIGURACION_EMPRESA WHERE C.ACTIVO=1`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { logo: { type: oracledb.BUFFER } } },
  );
  return r.rows?.[0] ?? null;
}
export async function guardarEmpresa(
  c: Connection,
  d: DatosEmpresa,
  anterior: Empresa | null,
  logo: Buffer | null,
  hash: string | null,
  actor: number,
) {
  let id = anterior?.id;
  const binds = {
    nombre: d.razonSocial,
    nit: d.nit,
    direccion: d.direccion,
    telefono: d.telefono,
    correo: d.correo,
    actor,
  };
  if (id)
    await c.execute(
      "UPDATE CONFIGURACION_EMPRESA SET RAZON_SOCIAL=:nombre,NIT=:nit,DIRECCION=:direccion,TELEFONO=:telefono,CORREO=:correo,MODIFICADO_POR=:actor,FECHA_MODIFICACION=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE) WHERE ID_CONFIGURACION_EMPRESA=:id",
      { ...binds, id },
    );
  else {
    const r = await c.execute(
      'INSERT INTO CONFIGURACION_EMPRESA (RAZON_SOCIAL,NIT,DIRECCION,TELEFONO,CORREO,CREADO_POR) VALUES (:nombre,:nit,:direccion,:telefono,:correo,:actor) RETURNING ID_CONFIGURACION_EMPRESA INTO :id',
      { ...binds, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
    );
    id = (r.outBinds as { id: number[] }).id[0]!;
  }
  await c.execute(
    `MERGE INTO IDENTIDAD_EMPRESA I USING (SELECT :id ID_EMPRESA FROM DUAL) O ON (I.ID_CONFIGURACION_EMPRESA=O.ID_EMPRESA)
  WHEN MATCHED THEN UPDATE SET I.NOMBRE_COMERCIAL=:comercial,I.SITIO_WEB=:web,I.LOGO_PNG=:logo,I.LOGO_SHA256=:hash,I.VERSION=I.VERSION+1,I.MODIFICADO_POR=:actor,I.FECHA_MODIFICACION=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)
  WHEN NOT MATCHED THEN INSERT (ID_CONFIGURACION_EMPRESA,NOMBRE_COMERCIAL,SITIO_WEB,LOGO_PNG,LOGO_SHA256,CREADO_POR) VALUES (:id,:comercial,:web,:logo,:hash,:actor)`,
    {
      id,
      comercial: d.nombreComercial || null,
      web: d.sitioWeb || null,
      logo: { val: logo, type: oracledb.BLOB },
      hash,
      actor,
    },
  );
  return (await obtenerEmpresa(c))!;
}
export async function perfilFirmante(c: Connection, usuario: number) {
  const r = await c.execute<{ nombre: string; cargo: string }>(
    `SELECT TRIM(E.NOMBRES)||' '||TRIM(E.APELLIDOS) "nombre", P.NOMBRE "cargo" FROM EMPLEADOS E JOIN PUESTOS P ON P.ID_PUESTO=E.ID_PUESTO AND P.ACTIVO=1 WHERE E.ID_USUARIO=:usuario AND E.ACTIVO=1 AND E.ESTADO='ACTIVO' AND TRIM(E.NOMBRES) IS NOT NULL AND TRIM(E.APELLIDOS) IS NOT NULL`,
    { usuario },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return r.rows?.[0] ?? null;
}
export async function fechaFirma(c: Connection) {
  const r = await c.execute<{ fecha: string }>(
    `SELECT TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala','YYYY-MM-DD HH24:MI:SS') "fecha" FROM DUAL`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return r.rows![0]!.fecha;
}
export async function guardarFirma(c: Connection, entidad: string, id: number, f: FirmaDocumento) {
  await c.execute(
    `MERGE INTO FIRMAS_DOCUMENTO F USING (SELECT :entidad ENTIDAD,:id ID_REGISTRO FROM DUAL) O ON (F.ENTIDAD=O.ENTIDAD AND F.ID_REGISTRO=O.ID_REGISTRO)
  WHEN MATCHED THEN UPDATE SET ID_USUARIO=:usuario,NOMBRE=:nombre,CARGO=:cargo,APROBADO_EN=TO_DATE(:fecha,'YYYY-MM-DD HH24:MI:SS'),MODIFICADO_POR=:usuario
  WHEN NOT MATCHED THEN INSERT (ENTIDAD,ID_REGISTRO,ID_USUARIO,NOMBRE,CARGO,APROBADO_EN,CREADO_POR) VALUES (:entidad,:id,:usuario,:nombre,:cargo,TO_DATE(:fecha,'YYYY-MM-DD HH24:MI:SS'),:usuario)`,
    { entidad, id, usuario: f.idUsuario, nombre: f.nombre, cargo: f.cargo, fecha: f.fecha },
  );
}
export async function obtenerFirma(c: Connection, entidad: string, id: number) {
  const r = await c.execute<FirmaDocumento>(
    `SELECT ID_USUARIO "idUsuario",NOMBRE "nombre",CARGO "cargo",TO_CHAR(APROBADO_EN,'YYYY-MM-DD HH24:MI:SS') "fecha" FROM FIRMAS_DOCUMENTO WHERE ENTIDAD=:entidad AND ID_REGISTRO=:id`,
    { entidad, id },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return r.rows?.[0] ?? null;
}
export async function firmaBoleta(c: Connection, id: number) {
  const r = await c.execute<FirmaDocumento>(
    `SELECT F.ID_USUARIO "idUsuario",F.NOMBRE "nombre",F.CARGO "cargo",TO_CHAR(F.APROBADO_EN,'YYYY-MM-DD HH24:MI:SS') "fecha" FROM NOMINA_EMPLEADO N JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA JOIN FIRMAS_DOCUMENTO F ON F.ENTIDAD='PERIODOS_NOMINA' AND F.ID_REGISTRO=P.ID_PERIODO_NOMINA WHERE N.ID_NOMINA_EMPLEADO=:id AND P.ESTADO IN ('APROBADO','CERRADO')`,
    { id },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return r.rows?.[0] ?? null;
}
export async function guardarConstancia(
  c: Connection,
  empleado: number,
  firma: FirmaDocumento,
  version: number,
  pdf: Buffer,
  hash: string,
) {
  await c.execute(
    `INSERT INTO CONSTANCIAS_SALARIO_PDF (ID_EMPLEADO,APROBADO_POR,APROBADO_EN,FIRMANTE_NOMBRE,FIRMANTE_CARGO,VERSION_MEMBRETE,CONTENIDO_PDF,SHA256,CREADO_POR) VALUES (:empleado,:usuario,TO_DATE(:fecha,'YYYY-MM-DD HH24:MI:SS'),:nombre,:cargo,:version,:pdf,:hash,:usuario)`,
    {
      empleado,
      usuario: firma.idUsuario,
      fecha: firma.fecha,
      nombre: firma.nombre,
      cargo: firma.cargo,
      version,
      pdf: { val: pdf, type: oracledb.BLOB },
      hash,
    },
  );
}
