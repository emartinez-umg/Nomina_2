import { nombrePersonaSql } from '../../shared/utils/nombre.js';
import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { DatosActa } from '../../shared/actas/modelo.js';
import type { FirmaDocumento } from '../../shared/pdf/documento.js';
import type { QueryActas } from './actas.schemas.js';
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
export const ahora = "CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)";
export interface TipoActa {
  id: number;
  nombre: string;
  gravedad: string;
  suspension: number;
  activo: number;
}
export interface Acta extends DatosActa {
  id: number;
  idDepartamento: number;
  codigo: string;
  estado: string;
  version: number;
  empleado: string;
  departamento: string;
  tipo: string;
  gravedad: string;
  suspension: number;
  emisorNombre: string | null;
  emisorCargo: string | null;
  emitidaEn: string | null;
  motivoAnulacion: string | null;
  idAusencia: number | null;
}
export interface AdjuntoActa {
  id: number;
  clase: string;
  nombre: string;
  tipo: string;
  tamano: number;
  hash: string;
  clave: string;
  idActa: number;
}
const columnas = `A.ID_ACTA "id",A.CODIGO "codigo",A.ID_EMPLEADO "idEmpleado",A.ID_TIPO_ACTA "idTipo",TO_CHAR(A.FECHA_HECHO,'YYYY-MM-DD') "fechaHecho",A.LUGAR "lugar",A.DESCRIPCION "descripcion",NVL(A.TESTIGOS,'') "testigos",A.NORMA "norma",A.MEDIDA "medida",NVL(A.DESCARGOS,'') "descargos",A.DIAS_SUSPENSION "diasSuspension",A.ESTADO "estado",A.VERSION "version",E.CODIGO||' · '||${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} "empleado",E.ID_DEPARTAMENTO "idDepartamento",D.NOMBRE "departamento",T.NOMBRE "tipo",T.GRAVEDAD "gravedad",T.ES_SUSPENSION "suspension",A.EMISOR_NOMBRE "emisorNombre",A.EMISOR_CARGO "emisorCargo",TO_CHAR(A.EMITIDA_EN,'YYYY-MM-DD HH24:MI:SS') "emitidaEn",A.MOTIVO_ANULACION "motivoAnulacion",A.ID_AUSENCIA "idAusencia"`;
const from =
  'ACTAS_ADMINISTRATIVAS A JOIN EMPLEADOS E ON E.ID_EMPLEADO=A.ID_EMPLEADO JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO JOIN TIPOS_ACTA T ON T.ID_TIPO_ACTA=A.ID_TIPO_ACTA';
export async function empleado(c: Connection, id: number, bloquear = false) {
  return (
    await c.execute<{ id: number; idUsuario: number | null; ingreso: string; nombre: string }>(
      `SELECT ID_EMPLEADO "id",ID_USUARIO "idUsuario",TO_CHAR(FECHA_INGRESO,'YYYY-MM-DD') "ingreso",NOMBRES||' '||APELLIDOS "nombre" FROM EMPLEADOS WHERE ID_EMPLEADO=:id ${bloquear ? 'FOR UPDATE' : ''}`,
      { id },
      opts,
    )
  ).rows?.[0];
}
export async function propio(c: Connection, usuario: number) {
  return (
    await c.execute<{ id: number }>(
      'SELECT ID_EMPLEADO "id" FROM EMPLEADOS WHERE ID_USUARIO=:usuario',
      { usuario },
      opts,
    )
  ).rows?.[0]?.id;
}
export async function tipos(c: Connection, soloActivos = true) {
  return (
    (
      await c.execute<TipoActa>(
        `SELECT ID_TIPO_ACTA "id",NOMBRE "nombre",GRAVEDAD "gravedad",ES_SUSPENSION "suspension",ACTIVO "activo" FROM TIPOS_ACTA ${soloActivos ? 'WHERE ACTIVO=1' : ''} ORDER BY ID_TIPO_ACTA`,
        {},
        opts,
      )
    ).rows ?? []
  );
}
export async function reglas(c: Connection) {
  return (
    await c.execute<{ hoy: string; maxDias: number | null; maxMb: number | null; codigo: string }>(
      `SELECT TO_CHAR(${ahora},'YYYY-MM-DD') "hoy",(SELECT VALOR FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA='ACTAS_MAX_DIAS_SUSPENSION' AND ACTIVO=1 AND VIGENTE_DESDE<=TRUNC(${ahora}) AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TRUNC(${ahora})) ORDER BY VIGENTE_DESDE DESC FETCH FIRST 1 ROW ONLY) "maxDias",(SELECT VALOR FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA='EXPEDIENTE_MAX_MB' AND ACTIVO=1 AND VIGENTE_DESDE<=TRUNC(${ahora}) AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TRUNC(${ahora})) ORDER BY VIGENTE_DESDE DESC FETCH FIRST 1 ROW ONLY) "maxMb",N2_CODIGOS.VISTA_PREVIA('actas') "codigo" FROM DUAL`,
      {},
      opts,
    )
  ).rows![0]!;
}
export async function acta(c: Connection, id: number, bloquear = false) {
  if (bloquear)
    await c.execute('SELECT ID_ACTA FROM ACTAS_ADMINISTRATIVAS WHERE ID_ACTA=:id FOR UPDATE', {
      id,
    });
  return (
    await c.execute<Acta>(
      `SELECT ${columnas} FROM ${from} WHERE A.ID_ACTA=:id`,
      { id },
      { ...opts, fetchInfo: { descripcion: { type: oracledb.STRING } } },
    )
  ).rows?.[0];
}
export async function listar(
  c: Connection,
  q: QueryActas,
  propietario?: number,
  antecedentes = false,
) {
  const filtros = ['1=1'],
    binds: Record<string, string | number> = {};
  for (const [key, col] of Object.entries({
    idEmpleado: 'A.ID_EMPLEADO',
    idDepartamento: 'E.ID_DEPARTAMENTO',
    idTipo: 'A.ID_TIPO_ACTA',
    estado: 'A.ESTADO',
  })) {
    const v = q[key as keyof QueryActas];
    if (v !== undefined) {
      filtros.push(`${col}=:${key}`);
      binds[key] = v;
    }
  }
  if (q.buscar) {
    filtros.push("INSTR(UPPER(A.CODIGO||' '||E.NOMBRES||' '||E.APELLIDOS),UPPER(:buscar))>0");
    binds.buscar = q.buscar;
  }
  if (propietario !== undefined) {
    filtros.push('E.ID_USUARIO=:propietario AND A.EMITIDA_EN IS NOT NULL');
    binds.propietario = propietario;
  }
  if (q.desde) {
    filtros.push("A.FECHA_HECHO>=TO_DATE(:desde,'YYYY-MM-DD')");
    binds.desde = q.desde;
  }
  if (q.hasta) {
    filtros.push("A.FECHA_HECHO<=TO_DATE(:hasta,'YYYY-MM-DD')");
    binds.hasta = q.hasta;
  }
  if (antecedentes)
    filtros.push(
      `A.FECHA_HECHO>=ADD_MONTHS(TRUNC(${ahora}),-12) AND A.FECHA_HECHO<=TRUNC(${ahora})`,
    );
  const where = filtros.join(' AND '),
    orden = {
      codigo: 'A.CODIGO',
      empleado: 'E.NOMBRES',
      fechaHecho: 'A.FECHA_HECHO',
      estado: 'A.ESTADO',
      tipo: 'T.NOMBRE',
    }[q.ordenarPor],
    dir = q.direccion === 'asc' ? 'ASC' : 'DESC';
  const total = (
    await c.execute<{ total: number }>(
      `SELECT COUNT(*) "total" FROM ${from} WHERE ${where}`,
      binds,
      opts,
    )
  ).rows![0]!.total;
  const registros =
    (
      await c.execute<
        Pick<
          Acta,
          | 'id'
          | 'codigo'
          | 'idEmpleado'
          | 'empleado'
          | 'departamento'
          | 'tipo'
          | 'estado'
          | 'fechaHecho'
        >
      >(
        `SELECT A.ID_ACTA "id",A.CODIGO "codigo",A.ID_EMPLEADO "idEmpleado",E.CODIGO||' · '||${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} "empleado",D.NOMBRE "departamento",T.NOMBRE "tipo",A.ESTADO "estado",TO_CHAR(A.FECHA_HECHO,'YYYY-MM-DD') "fechaHecho" FROM ${from} WHERE ${where} ORDER BY ${orden} ${dir},A.ID_ACTA ${dir} OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
        { ...binds, offset: (q.pagina - 1) * q.limite, limite: q.limite },
        opts,
      )
    ).rows ?? [];
  return { registros, total, pagina: q.pagina, limite: q.limite };
}
export async function guardar(c: Connection, d: DatosActa, actor: number, id?: number) {
  const valores = {
    idEmpleado: d.idEmpleado,
    idTipo: d.idTipo,
    fechaHecho: d.fechaHecho,
    lugar: d.lugar,
    descripcion: { val: d.descripcion, type: oracledb.CLOB },
    testigos: d.testigos || null,
    norma: d.norma,
    medida: d.medida,
    descargos: d.descargos || null,
    diasSuspension: d.diasSuspension,
    actor,
  };
  if (id) {
    await c.execute(
      `UPDATE ACTAS_ADMINISTRATIVAS SET ID_TIPO_ACTA=:idTipo,FECHA_HECHO=TO_DATE(:fechaHecho,'YYYY-MM-DD'),LUGAR=:lugar,DESCRIPCION=:descripcion,TESTIGOS=:testigos,NORMA=:norma,MEDIDA=:medida,DESCARGOS=:descargos,DIAS_SUSPENSION=:diasSuspension,VERSION=VERSION+1,MODIFICADO_POR=:actor,FECHA_MODIFICACION=${ahora} WHERE ID_ACTA=:id AND ID_EMPLEADO=:idEmpleado`,
      { ...valores, id },
    );
    return id;
  }
  const r = await c.execute<{ id: number[] }>(
    `INSERT INTO ACTAS_ADMINISTRATIVAS(ID_EMPLEADO,ID_TIPO_ACTA,FECHA_HECHO,LUGAR,DESCRIPCION,TESTIGOS,NORMA,MEDIDA,DESCARGOS,DIAS_SUSPENSION,CREADO_POR) VALUES(:idEmpleado,:idTipo,TO_DATE(:fechaHecho,'YYYY-MM-DD'),:lugar,:descripcion,:testigos,:norma,:medida,:descargos,:diasSuspension,:actor) RETURNING ID_ACTA INTO :id`,
    { ...valores, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
  );
  return r.outBinds!.id[0]!;
}
export async function historial(c: Connection, id: number) {
  return (
    (
      await c.execute<{
        id: number;
        anterior: string | null;
        estado: string;
        motivo: string | null;
        testigos: string | null;
        actor: string;
        fecha: string;
      }>(
        `SELECT H.ID_ACTA_HISTORIAL "id",H.ESTADO_ANTERIOR "anterior",H.ESTADO_NUEVO "estado",H.MOTIVO "motivo",H.TESTIGOS "testigos",CASE WHEN E.ID_EMPLEADO IS NOT NULL THEN ${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} ELSE REPLACE(INITCAP(U.USUARIO),'.',' ') END "actor",TO_CHAR(H.FECHA_CREACION,'YYYY-MM-DD HH24:MI:SS') "fecha" FROM ACTA_HISTORIAL H JOIN USUARIOS U ON U.ID_USUARIO=H.CREADO_POR LEFT JOIN EMPLEADOS E ON E.ID_USUARIO=U.ID_USUARIO WHERE H.ID_ACTA=:id ORDER BY H.ID_ACTA_HISTORIAL`,
        { id },
        opts,
      )
    ).rows ?? []
  );
}
export async function transicion(
  c: Connection,
  id: number,
  anterior: string | null,
  estado: string,
  actor: number,
  motivo?: string,
  testigos?: string,
) {
  if (anterior !== estado)
    await c.execute(
      'INSERT INTO ACTA_HISTORIAL(ID_ACTA,ESTADO_ANTERIOR,ESTADO_NUEVO,MOTIVO,TESTIGOS,CREADO_POR) VALUES(:id,:anterior,:estado,:motivo,:testigos,:actor)',
      { id, anterior, estado, motivo: motivo ?? null, testigos: testigos ?? null, actor },
    );
  if (anterior)
    await c.execute(
      `UPDATE ACTAS_ADMINISTRATIVAS SET ESTADO=:estado,VERSION=VERSION+1,MODIFICADO_POR=:actor,FECHA_MODIFICACION=${ahora},MOTIVO_ANULACION=CASE WHEN :estado='ANULADA' THEN :motivo ELSE MOTIVO_ANULACION END,ANULADA_POR=CASE WHEN :estado='ANULADA' THEN :actor ELSE ANULADA_POR END,ANULADA_EN=CASE WHEN :estado='ANULADA' THEN ${ahora} ELSE ANULADA_EN END WHERE ID_ACTA=:id`,
      { id, estado, actor, motivo: motivo ?? null },
    );
}
export async function emitir(
  c: Connection,
  id: number,
  pdf: Buffer,
  f: FirmaDocumento,
  plantilla: number,
  ausencia: number | null,
  hash: string,
) {
  await c.execute(
    `UPDATE ACTAS_ADMINISTRATIVAS SET EMITIDA_POR=:usuario,EMITIDA_EN=TO_DATE(:fecha,'YYYY-MM-DD HH24:MI:SS'),EMISOR_NOMBRE=:nombre,EMISOR_CARGO=:cargo,ID_PLANTILLA_DOCUMENTO=:plantilla,CONTENIDO_PDF=:pdf,PDF_SHA256=:hash,ID_AUSENCIA=:ausencia WHERE ID_ACTA=:id`,
    {
      id,
      usuario: f.idUsuario,
      fecha: f.fecha,
      nombre: f.nombre,
      cargo: f.cargo,
      plantilla,
      pdf: { val: pdf, type: oracledb.BLOB },
      hash,
      ausencia,
    },
  );
}
export async function pdf(c: Connection, id: number) {
  return (
    await c.execute<{ bytes: Buffer; hash: string }>(
      `SELECT CONTENIDO_PDF "bytes",PDF_SHA256 "hash" FROM ACTAS_ADMINISTRATIVAS WHERE ID_ACTA=:id`,
      { id },
      { ...opts, fetchInfo: { bytes: { type: oracledb.BUFFER } } },
    )
  ).rows![0]!;
}
export async function plantilla(c: Connection) {
  return (
    await c.execute<{ id: number; version: number; nombre: string; contenido: string }>(
      `SELECT ID_PLANTILLA_DOCUMENTO "id",VERSION "version",NOMBRE "nombre",CONTENIDO "contenido" FROM PLANTILLAS_DOCUMENTO WHERE CODIGO='ACTA_ADMINISTRATIVA' AND ACTIVO=1 AND VIGENTE_DESDE<=TRUNC(${ahora}) AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TRUNC(${ahora})) ORDER BY VERSION DESC FETCH FIRST 1 ROW ONLY`,
      {},
      { ...opts, fetchInfo: { contenido: { type: oracledb.STRING } } },
    )
  ).rows?.[0];
}
export async function guardarPlantilla(
  c: Connection,
  d: { version: number; nombre: string; contenido: string },
  usuario: number,
) {
  await c.execute(
    `INSERT INTO PLANTILLAS_DOCUMENTO(CODIGO,VERSION,NOMBRE,CONTENIDO,VARIABLES_PERMITIDAS,VIGENTE_DESDE,CREADO_POR) SELECT CODIGO,VERSION+1,:nombre,:contenido,VARIABLES_PERMITIDAS,TRUNC(${ahora}),:usuario FROM PLANTILLAS_DOCUMENTO WHERE CODIGO='ACTA_ADMINISTRATIVA' AND VERSION=:version`,
    {
      nombre: d.nombre,
      contenido: { val: d.contenido, type: oracledb.CLOB },
      usuario,
      version: d.version,
    },
  );
}
const columnasAdjunto =
  'ID_ACTA_ADJUNTO "id",ID_ACTA "idActa",CLASE "clase",NOMBRE_ARCHIVO "nombre",TIPO_CONTENIDO "tipo",TAMANO_BYTES "tamano",HASH_SHA256 "hash",CLAVE_ARCHIVO "clave"';
export async function adjuntos(c: Connection, id: number) {
  return (
    (
      await c.execute<AdjuntoActa>(
        `SELECT ${columnasAdjunto} FROM ACTA_ADJUNTOS WHERE ID_ACTA=:id ORDER BY ID_ACTA_ADJUNTO`,
        { id },
        opts,
      )
    ).rows ?? []
  );
}
export async function adjunto(c: Connection, id: number) {
  return (
    await c.execute<AdjuntoActa>(
      `SELECT ${columnasAdjunto} FROM ACTA_ADJUNTOS WHERE ID_ACTA_ADJUNTO=:id`,
      { id },
      opts,
    )
  ).rows?.[0];
}
export async function guardarAdjunto(
  c: Connection,
  d: {
    idActa: number;
    clase: string;
    nombre: string;
    clave: string;
    tipo: string;
    tamano: number;
    hash: string;
    actor: number;
  },
) {
  await c.execute(
    'INSERT INTO ACTA_ADJUNTOS(ID_ACTA,CLASE,NOMBRE_ARCHIVO,CLAVE_ARCHIVO,TIPO_CONTENIDO,TAMANO_BYTES,HASH_SHA256,CREADO_POR) VALUES(:idActa,:clase,:nombre,:clave,:tipo,:tamano,:hash,:actor)',
    d,
  );
}
export async function claveRegistrada(c: Connection, clave: string) {
  return !!(await c.execute('SELECT 1 FROM ACTA_ADJUNTOS WHERE CLAVE_ARCHIVO=:clave', { clave }))
    .rows?.length;
}
export async function tipoAusencia(c: Connection) {
  return (
    await c.execute<{ id: number }>(
      "SELECT ID_TIPO_AUSENCIA \"id\" FROM TIPOS_AUSENCIA WHERE ACTIVO=1 AND EFECTO='SIN_GOCE' AND CATEGORIA_INASISTENCIA='JUSTIFICADA_SIN_GOCE' ORDER BY ID_TIPO_AUSENCIA FETCH FIRST 1 ROW ONLY",
      {},
      opts,
    )
  ).rows?.[0]?.id;
}
export async function notificar(
  c: Connection,
  id: number,
  usuario: number,
  actor: number,
  anulada = false,
) {
  await c.execute(
    `INSERT INTO NOTIFICACIONES(ID_USUARIO,TIPO,TITULO,MENSAJE,CLAVE_EVENTO,ID_ACTA,CREADO_POR) VALUES(:usuario,'CAMBIO_ESTADO',:titulo,'Consulta el documento en Mis actas.',:clave,:id,:actor)`,
    {
      usuario,
      titulo: anulada ? 'Acta anulada' : 'Acta emitida',
      clave: `ACTA:${id}:${anulada ? 'ANULADA' : 'EMITIDA'}`,
      id,
      actor,
    },
  );
}
