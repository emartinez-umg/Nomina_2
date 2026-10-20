import { nombrePersonaSql, nombreUsuarioSql } from '../../shared/utils/nombre.js';
import oracledb from 'oracledb';
import type { FirmaDocumento } from '../../shared/pdf/documento.js';
import type { Connection, BindParameters } from 'oracledb';
import { randomUUID, createHash } from 'node:crypto';
import type { Query, Criticos, Contacto } from './solicitudes.schemas.js';
const ahora = "CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)";
export async function filas<T>(c: Connection, sql: string, binds: BindParameters = {}) {
  return (
    (
      await c.execute<T>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: {
          datos: { type: oracledb.STRING },
          contenido: { type: oracledb.STRING },
          variables: { type: oracledb.STRING },
          pdf: { type: oracledb.BUFFER },
        },
      })
    ).rows ?? []
  );
}
export interface Empleado extends Criticos, Contacto {
  id: number;
  usuario: number | null;
  estado: string;
  ingreso: string;
  egreso: string | null;
  puesto: string;
  departamento: string;
  afiliacionIgss: string | null;
}
export async function empleado(c: Connection, id: number) {
  return (
    await filas<Empleado>(
      c,
      `SELECT E.ID_EMPLEADO "id", E.ID_USUARIO "usuario", E.NOMBRES "nombres", E.APELLIDOS "apellidos", E.DPI "dpi", E.NIT "nit", E.ESTADO_CIVIL "estadoCivil", E.TELEFONO "telefono", COALESCE(E.DIRECCION_COMPLETA,E.DIRECCION,E.DIRECCION_ANTERIOR) "direccion", E.CORREO "correo", E.ESTADO "estado", TO_CHAR(E.FECHA_INGRESO,'YYYY-MM-DD') "ingreso", TO_CHAR(E.FECHA_EGRESO,'YYYY-MM-DD') "egreso", E.AFILIACION_IGSS "afiliacionIgss", P.NOMBRE "puesto", D.NOMBRE "departamento", C.NOMBRE "contactoNombre", C.PARENTESCO "contactoParentesco", C.TELEFONO "contactoTelefono" FROM EMPLEADOS E JOIN PUESTOS P ON P.ID_PUESTO=E.ID_PUESTO JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO LEFT JOIN EMPLEADO_CONTACTOS_EMERGENCIA C ON C.ID_EMPLEADO=E.ID_EMPLEADO AND C.PRIORIDAD=1 AND C.ACTIVO=1 WHERE E.ID_EMPLEADO=:id AND E.ACTIVO=1`,
      { id },
    )
  )[0];
}
export interface Solicitud {
  vehiculo: string | null;
  placa: string | null;
  codigo: string;
  id: number;
  idEmpleado: number;
  usuario: number | null;
  empleado: string;
  tipo: string;
  nombreTipo: string;
  generaPdf: number;
  estado: string;
  fecha: string;
  observaciones: string | null;
  motivo: string | null;
  datos: string | null;
  documento: number | null;
}
const select = `S.VEHICULO "vehiculo",S.PLACA "placa",S.ID_SOLICITUD "id",S.CODIGO "codigo", S.ID_EMPLEADO "idEmpleado", E.ID_USUARIO "usuario", ${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} "empleado", NVL(T.CODIGO_ANTERIOR,T.CODIGO) "tipo", T.NOMBRE "nombreTipo", T.GENERA_PDF "generaPdf", S.ESTADO "estado", TO_CHAR(S.FECHA_CREACION,'YYYY-MM-DD') "fecha", S.OBSERVACIONES "observaciones", S.MOTIVO_RECHAZO "motivo", S.DATOS_SOLICITADOS "datos", (SELECT MAX(D.ID_DOCUMENTO_GENERADO) FROM DOCUMENTOS_GENERADOS D WHERE D.ID_SOLICITUD=S.ID_SOLICITUD AND D.ACTIVO=1 AND D.ESTADO<>'ANULADO') "documento"`;
const from =
  'SOLICITUDES S JOIN EMPLEADOS E ON E.ID_EMPLEADO=S.ID_EMPLEADO JOIN TIPOS_SOLICITUD T ON T.ID_TIPO_SOLICITUD=S.ID_TIPO_SOLICITUD';
export async function solicitud(c: Connection, id: number) {
  return (
    await filas<Solicitud>(
      c,
      `SELECT ${select} FROM ${from} WHERE S.ID_SOLICITUD=:id AND S.ACTIVO=1`,
      { id },
    )
  )[0];
}
export async function listar(c: Connection, q: Query, propietario: number | null) {
  const binds: BindParameters = { propietario };
  const filtros = [
    'S.ACTIVO=1',
    "NVL(T.CODIGO_ANTERIOR,T.CODIGO) IN ('CONSTANCIA_LABORAL','CERTIFICADO_IGSS','CONSTANCIA_INTECAP','GAFETE','PARQUEO','ACTUALIZACION_DATOS')",
    '(:propietario IS NULL OR E.ID_USUARIO=:propietario)',
  ];
  if (q.tipo) {
    filtros.push('NVL(T.CODIGO_ANTERIOR,T.CODIGO)=:tipo');
    binds.tipo = q.tipo;
  }
  if (q.estado) {
    filtros.push('S.ESTADO=:estado');
    binds.estado = q.estado;
  }
  if (q.idEmpleado) {
    filtros.push('S.ID_EMPLEADO=:empleado');
    binds.empleado = q.idEmpleado;
  }
  if (q.buscar) {
    filtros.push(
      "INSTR(LOWER(E.NOMBRES||' '||E.APELLIDOS||' '||E.CODIGO||' '||S.CODIGO),LOWER(:buscar))>0",
    );
    binds.buscar = q.buscar;
  }
  if (q.desde) {
    filtros.push("S.FECHA_CREACION>=TO_DATE(:desde,'YYYY-MM-DD')");
    binds.desde = q.desde;
  }
  if (q.hasta) {
    filtros.push("S.FECHA_CREACION<TO_DATE(:hasta,'YYYY-MM-DD')+1");
    binds.hasta = q.hasta;
  }
  const where = filtros.join(' AND ');
  const total = (
    await filas<{ n: number }>(c, `SELECT COUNT(*) "n" FROM ${from} WHERE ${where}`, binds)
  )[0]!.n;
  const orden = {
    codigo: 'S.CODIGO',
    id: 'S.ID_SOLICITUD',
    empleado: 'E.NOMBRES',
    tipo: 'T.NOMBRE',
    estado: 'S.ESTADO',
    fecha: 'S.FECHA_CREACION',
  }[q.ordenarPor];
  const registros = await filas<Solicitud>(
    c,
    `SELECT ${select} FROM ${from} WHERE ${where} ORDER BY ${orden} ${q.direccion === 'asc' ? 'ASC' : 'DESC'}, S.ID_SOLICITUD DESC OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
    { ...binds, offset: (q.pagina - 1) * q.limite, limite: q.limite },
  );
  // Los listados nunca exponen los valores críticos propuestos.
  return {
    registros: registros.map(({ datos: _datos, usuario: _usuario, ...r }) => r),
    total,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function tipo(c: Connection, codigo: string) {
  return (
    await filas<{ id: number; nombre: string }>(
      c,
      'SELECT ID_TIPO_SOLICITUD "id",NOMBRE "nombre" FROM TIPOS_SOLICITUD WHERE NVL(CODIGO_ANTERIOR,CODIGO)=:codigo AND ACTIVO=1 AND ES_DIRECTA=0',
      { codigo },
    )
  )[0];
}
export async function pendiente(c: Connection, empleado: number, tipo: number) {
  return (
    (
      await filas(
        c,
        "SELECT ID_SOLICITUD FROM SOLICITUDES WHERE ID_EMPLEADO=:empleado AND ID_TIPO_SOLICITUD=:tipo AND ESTADO='EN_PROCESO' AND ACTIVO=1",
        { empleado, tipo },
      )
    ).length > 0
  );
}
export async function crear(
  c: Connection,
  empleado: number,
  tipo: number,
  observaciones: string,
  datos: unknown,
  actor: number,
  vehiculo?: string,
  placa?: string,
) {
  const r = await c.execute<{ id: number[] }>(
    'INSERT INTO SOLICITUDES (ID_EMPLEADO,ID_TIPO_SOLICITUD,OBSERVACIONES,DATOS_SOLICITADOS,CREADO_POR,VEHICULO,PLACA) VALUES (:empleado,:tipo,:observaciones,:datos,:actor,:vehiculo,:placa) RETURNING ID_SOLICITUD INTO :id',
    {
      empleado,
      tipo,
      vehiculo: vehiculo ?? null,
      placa: placa ?? null,
      observaciones,
      datos: { val: datos ? JSON.stringify(datos) : null, type: oracledb.CLOB },
      actor,
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
  );
  return r.outBinds!.id[0]!;
}
export async function historial(c: Connection, id: number) {
  return filas<{
    id: number;
    anterior: string | null;
    estado: string;
    fecha: string;
    motivo: string | null;
    actor: string;
  }>(
    c,
    `SELECT H.ID_SOLICITUD_HISTORIAL "id",H.ESTADO_ANTERIOR "anterior",H.ESTADO_NUEVO "estado",TO_CHAR(H.FECHA,'YYYY-MM-DD HH24:MI:SS') "fecha",H.MOTIVO "motivo",${nombreUsuarioSql('U')} "actor" FROM SOLICITUD_HISTORIAL H JOIN USUARIOS U ON U.ID_USUARIO=H.ID_USUARIO WHERE H.ID_SOLICITUD=:id ORDER BY H.ID_SOLICITUD_HISTORIAL`,
    { id },
  );
}
export async function registrarEstado(
  c: Connection,
  id: number,
  anterior: string | null,
  estado: string,
  motivo: string,
  actor: number,
  reemision = false,
) {
  if (anterior)
    await c.execute(
      `UPDATE SOLICITUDES SET ESTADO=:estado, MOTIVO_RECHAZO=CASE WHEN :estado='RECHAZADA' THEN :motivo ELSE MOTIVO_RECHAZO END, RESUELTO_POR=COALESCE(RESUELTO_POR,:actor), RESUELTO_EN=COALESCE(RESUELTO_EN,${ahora}), ENTREGADA_EN=CASE WHEN :estado='ENTREGADA' THEN ${ahora} ELSE NULL END, MODIFICADO_POR=:actor WHERE ID_SOLICITUD=:id`,
      { id, estado, motivo, actor },
    );
  await c.execute(
    'INSERT INTO SOLICITUD_HISTORIAL (ID_SOLICITUD,ESTADO_ANTERIOR,ESTADO_NUEVO,ID_USUARIO,MOTIVO,CREADO_POR,TIPO_MOVIMIENTO) VALUES (:id,:anterior,:estado,:actor,:motivo,:actor,:tipoMovimiento)',
    { id, anterior, estado, actor, motivo, tipoMovimiento: reemision ? 'REEMISION' : 'ESTADO' },
  );
}
export async function notificar(c: Connection, s: Solicitud, estado: string, actor: number) {
  const versiones =
    estado === 'ENTREGADA'
      ? await filas<{ n: number }>(
          c,
          'SELECT MAX(VERSION) "n" FROM DOCUMENTOS_GENERADOS WHERE ID_SOLICITUD=:id',
          { id: s.id },
        )
      : [];
  const sufijo = (versiones[0]?.n ?? 0) > 1 ? `:V${versiones[0]!.n}` : '';
  const destinatarios =
    estado === 'EN_PROCESO'
      ? (
          await filas<{ id: number }>(
            c,
            "SELECT U.ID_USUARIO \"id\" FROM USUARIOS U JOIN ROLES R ON R.ID_ROL=U.ID_ROL WHERE U.ACTIVO=1 AND R.CODIGO IN ('RH','ADMIN')",
          )
        ).map((r) => r.id)
      : s.usuario
        ? [s.usuario]
        : [];
  for (const usuario of destinatarios)
    await c.execute(
      `INSERT INTO NOTIFICACIONES (ID_SOLICITUD, ID_USUARIO, TIPO, TITULO, MENSAJE, CLAVE_EVENTO, CREADO_POR) VALUES (:id,:usuario,:tipo,:titulo,:mensaje,:clave,:actor)`,
      {
        id: s.id,
        usuario,
        tipo:
          estado === 'EN_PROCESO'
            ? 'NUEVA_SOLICITUD'
            : estado === 'ENTREGADA' && s.generaPdf
              ? 'DOCUMENTO_ENTREGADO'
              : 'CAMBIO_ESTADO',
        titulo: `${s.nombreTipo} · ${estado.replace(/_/g, ' ')}`,
        mensaje:
          estado === 'EN_PROCESO'
            ? `${s.empleado} envió la solicitud ${s.id}. Revisa la bandeja.`
            : estado === 'RECHAZADA'
              ? `Solicitud ${s.id} rechazada. Motivo: ${s.motivo}`
              : estado === 'ENTREGADA' && s.generaPdf
                ? `Tu documento está disponible. Abre la solicitud ${s.id} para descargarlo.`
                : `Solicitud ${s.id}: ${estado === 'APROBADA' ? 'aprobada' : 'entregada'}.`,
        clave: `SOLICITUD:${s.id}:${estado}${sufijo}`,
        actor,
      },
    );
}
export async function actualizarContacto(c: Connection, id: number, d: Contacto, actor: number) {
  await c.execute(
    'UPDATE EMPLEADOS SET TELEFONO=:telefono,DIRECCION_COMPLETA=:direccion,CORREO=:correo,MODIFICADO_POR=:actor WHERE ID_EMPLEADO=:id',
    { id, telefono: d.telefono, direccion: d.direccion, correo: d.correo, actor },
  );
  await c.execute(
    `MERGE INTO EMPLEADO_CONTACTOS_EMERGENCIA C USING (SELECT :id ID_EMPLEADO FROM DUAL) O ON (C.ID_EMPLEADO=O.ID_EMPLEADO AND C.PRIORIDAD=1) WHEN MATCHED THEN UPDATE SET C.NOMBRE=:nombre,C.PARENTESCO=:parentesco,C.TELEFONO=:telefono,C.ACTIVO=1,C.MODIFICADO_POR=:actor WHEN NOT MATCHED THEN INSERT (ID_EMPLEADO,NOMBRE,PARENTESCO,TELEFONO,PRIORIDAD,CREADO_POR) VALUES (:id,:nombre,:parentesco,:telefono,1,:actor)`,
    {
      id,
      nombre: d.contactoNombre,
      parentesco: d.contactoParentesco,
      telefono: d.contactoTelefono,
      actor,
    },
  );
}
export async function actualizarCriticos(c: Connection, id: number, d: Criticos, actor: number) {
  await c.execute(
    'UPDATE EMPLEADOS SET NOMBRES=:nombres,APELLIDOS=:apellidos,DPI=:dpi,NIT=:nit,ESTADO_CIVIL=:estadoCivil,MODIFICADO_POR=:actor WHERE ID_EMPLEADO=:id',
    { id, ...d, actor },
  );
}
export interface Plantilla {
  id: number;
  tipo: string;
  nombre: string;
  version: number;
  contenido: string;
}
export async function plantillas(c: Connection) {
  return filas<Plantilla>(
    c,
    `SELECT ID_PLANTILLA_DOCUMENTO "id", CODIGO "tipo", NOMBRE "nombre", VERSION "version", CONTENIDO "contenido" FROM (SELECT P.*, ROW_NUMBER() OVER (PARTITION BY ID_TIPO_SOLICITUD ORDER BY VERSION DESC) RN FROM PLANTILLAS_DOCUMENTO P WHERE ACTIVO=1 AND VIGENTE_DESDE<=TRUNC(${ahora}) AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TRUNC(${ahora}))) WHERE RN=1 ORDER BY CODIGO`,
  );
}
export async function versionar(
  c: Connection,
  p: Plantilla,
  contenido: string,
  actor: number,
  variables: readonly string[],
) {
  await c.execute(
    `INSERT INTO PLANTILLAS_DOCUMENTO (ID_TIPO_SOLICITUD,CODIGO,VERSION,NOMBRE,CONTENIDO,VARIABLES_PERMITIDAS,VIGENTE_DESDE,CREADO_POR) SELECT ID_TIPO_SOLICITUD,CODIGO,VERSION+1,NOMBRE,:contenido,:variables,TRUNC(${ahora}),:actor FROM PLANTILLAS_DOCUMENTO WHERE ID_PLANTILLA_DOCUMENTO=:id`,
    {
      id: p.id,
      contenido: { val: contenido, type: oracledb.CLOB },
      variables: { val: JSON.stringify(variables), type: oracledb.CLOB },
      actor,
    },
  );
}
export interface Documento {
  id: number;
  nombre: string;
  sha256: Buffer;
  pdf: Buffer;
  estado: string;
  versionMembrete: number | null;
}
export async function documento(c: Connection, id: number) {
  return (
    await filas<Documento>(
      c,
      `SELECT ID_DOCUMENTO_GENERADO "id",NOMBRE_ARCHIVO "nombre",SHA256 "sha256",CONTENIDO_PDF "pdf",ESTADO "estado",VERSION_MEMBRETE "versionMembrete" FROM DOCUMENTOS_GENERADOS WHERE ID_SOLICITUD=:id AND ACTIVO=1 AND ESTADO<>'ANULADO' ORDER BY VERSION DESC FETCH FIRST 1 ROW ONLY`,
      { id },
    )
  )[0];
}
export async function guardarPdf(
  c: Connection,
  s: Solicitud,
  p: Plantilla,
  datos: Record<string, string | null>,
  pdf: Buffer,
  actor: number,
  firma: FirmaDocumento,
  versionMembrete: number,
) {
  await c.execute(
    `INSERT INTO DOCUMENTOS_GENERADOS (ID_EMPLEADO,ID_SOLICITUD,ID_PLANTILLA_DOCUMENTO,VERSION,NOMBRE_ARCHIVO,RUTA_PRIVADA,SHA256,TAMANIO_BYTES,CONTENIDO_PLANTILLA,VARIABLES_APLICADAS,CONTENIDO_PDF,CREADO_POR,APROBADO_POR,APROBADO_EN,FIRMANTE_NOMBRE,FIRMANTE_CARGO,VERSION_MEMBRETE) VALUES (:empleado,:id,:plantilla,(SELECT NVL(MAX(VERSION),0)+1 FROM DOCUMENTOS_GENERADOS WHERE ID_SOLICITUD=:id),:nombre,:ruta,:hash,:bytes,:contenido,:variables,:pdf,:actor,:actor,TO_DATE(:fechaFirma,'YYYY-MM-DD HH24:MI:SS'),:firmanteNombre,:firmanteCargo,:versionMembrete)`,
    {
      empleado: s.idEmpleado,
      id: s.id,
      plantilla: p.id,
      nombre: `${s.tipo.toLowerCase()}-${s.id}.pdf`,
      ruta: `oracle:solicitudes/${s.id}/${randomUUID()}`,
      hash: createHash('sha256').update(pdf).digest(),
      bytes: pdf.length,
      contenido: { val: p.contenido, type: oracledb.CLOB },
      variables: { val: JSON.stringify(datos), type: oracledb.CLOB },
      pdf: { val: pdf, type: oracledb.BLOB },
      fechaFirma: firma.fecha,
      firmanteNombre: firma.nombre,
      firmanteCargo: firma.cargo,
      versionMembrete,
      actor,
    },
  );
}
export async function entregarPdf(c: Connection, id: number, actor: number) {
  await c.execute(
    `UPDATE DOCUMENTOS_GENERADOS SET ESTADO='ENTREGADO',ENTREGADO_EN=${ahora},MODIFICADO_POR=:actor WHERE ID_SOLICITUD=:id AND ESTADO='VISTA_PREVIA' AND ACTIVO=1`,
    { id, actor },
  );
}

export async function archivarPdf(c: Connection, id: number, actor: number) {
  await c.execute(
    'UPDATE DOCUMENTOS_GENERADOS SET ACTIVO=0,MODIFICADO_POR=:actor WHERE ID_SOLICITUD=:id AND ACTIVO=1',
    { id, actor },
  );
}
