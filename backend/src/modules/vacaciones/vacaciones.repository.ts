import { nombrePersonaSql, nombreUsuarioSql } from '../../shared/utils/nombre.js';
import { distribucionHorarioSql } from '../../shared/horarios/horarios.repository.js';
import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import type { Query } from './vacaciones.schemas.js';
import type { Asignacion, Movimiento, Vigencia } from './vacaciones.reglas.js';
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const fecha = (b: string) => `TO_DATE(:${b},'YYYY-MM-DD')`;
const num = (b: string) => `TO_NUMBER(:${b},'999999999999D999999','NLS_NUMERIC_CHARACTERS=''.,''')`;
const str = (c: string) => `TO_CHAR(${c},'TM9','NLS_NUMERIC_CHARACTERS=''.,''')`;
export interface Empleado {
  id: number;
  usuario: number | null;
  nombre: string;
  ingreso: string;
  egreso: string | null;
  estado: string;
  localidad: string;
}
export async function empleado(c: Connection, id: number) {
  return (
    await c.execute<Empleado>(
      `SELECT E.ID_EMPLEADO "id",E.ID_USUARIO "usuario",E.CODIGO||' · '||${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} "nombre",TO_CHAR(E.FECHA_INGRESO,'YYYY-MM-DD') "ingreso",TO_CHAR(E.FECHA_EGRESO,'YYYY-MM-DD') "egreso",E.ESTADO "estado",C.LOCALIDAD "localidad" FROM EMPLEADOS E JOIN CENTROS_TRABAJO C ON C.ID_CENTRO_TRABAJO=E.ID_CENTRO_TRABAJO WHERE E.ID_EMPLEADO=:id AND E.ACTIVO=1`,
      { id },
      opts,
    )
  ).rows?.[0];
}
export async function propio(c: Connection, usuario: number) {
  return (
    await c.execute<{ ID: number }>(
      'SELECT ID_EMPLEADO ID FROM EMPLEADOS WHERE ID_USUARIO=:usuario AND ACTIVO=1',
      { usuario },
      opts,
    )
  ).rows?.[0]?.ID;
}
export async function parametros(c: Connection) {
  return (
    (
      await c.execute<Vigencia>(
        `SELECT TO_CHAR(VIGENTE_DESDE,'YYYY-MM-DD') "desde",TO_CHAR(VIGENTE_HASTA,'YYYY-MM-DD') "hasta",${str('VALOR')} "valor" FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA='VACACIONES_ACUMULACION_MENSUAL' AND UNIDAD='DIAS' AND ACTIVO=1 ORDER BY VIGENTE_DESDE`,
        {},
        opts,
      )
    ).rows ?? []
  );
}
export async function movimientos(c: Connection, id: number) {
  return (
    (
      await c.execute<Movimiento & { id: number; motivo: string }>(
        `SELECT ID_VACACIONES_MOVIMIENTO "id",TO_CHAR(FECHA,'YYYY-MM-DD') "fecha",TIPO "tipo",${str('DIAS')} "dias",CLAVE_ORIGEN "clave",MOTIVO "motivo" FROM VACACIONES_MOVIMIENTOS WHERE ID_EMPLEADO=:id AND ACTIVO=1 ORDER BY FECHA,ID_VACACIONES_MOVIMIENTO`,
        { id },
        opts,
      )
    ).rows ?? []
  );
}
export async function mover(
  c: Connection,
  id: number,
  m: Movimiento,
  motivo: string,
  actor: number,
  solicitud: number | null = null,
) {
  await c.execute(
    `INSERT INTO VACACIONES_MOVIMIENTOS (ID_EMPLEADO,ID_VACACIONES_SOLICITUD,TIPO,FECHA,DIAS,CLAVE_ORIGEN,MOTIVO,CREADO_POR) VALUES (:id,:solicitud,:tipo,${fecha('fecha')},${num('dias')},:clave,:motivo,:actor)`,
    { id, solicitud, ...m, motivo, actor },
  );
}
export async function horarios(c: Connection, id: number) {
  const filas =
    (
      await c.execute<{
        id: number;
        desde: string;
        hasta: string | null;
        dia: number;
        laborable: number;
      }>(
        `SELECT DISTINCT E.ID_EMPLEADO_HORARIO "id",TO_CHAR(E.VIGENTE_DESDE,'YYYY-MM-DD') "desde",TO_CHAR(E.VIGENTE_HASTA,'YYYY-MM-DD') "hasta",D.DIA_SEMANA "dia",D.LABORABLE "laborable" FROM EMPLEADO_HORARIO E JOIN (${distribucionHorarioSql}) D ON D.ID_HORARIO=E.ID_HORARIO AND D.ACTIVO=1 WHERE E.ID_EMPLEADO=:id AND E.ACTIVO=1 ORDER BY "desde","dia"`,
        { id },
        opts,
      )
    ).rows ?? [];
  const mapa = new Map<number, Asignacion>();
  for (const f of filas) {
    if (!mapa.has(f.id)) mapa.set(f.id, { desde: f.desde, hasta: f.hasta, dias: [] });
    if (f.laborable) mapa.get(f.id)!.dias.push(f.dia);
  }
  return [...mapa.values()];
}
export async function feriados(c: Connection, localidad: string, inicio: string, fin: string) {
  return (
    (
      await c.execute<{ FECHA: string }>(
        `SELECT TO_CHAR(FECHA,'YYYY-MM-DD') FECHA FROM FERIADOS WHERE ACTIVO=1 AND FECHA BETWEEN ${fecha('inicio')} AND ${fecha('fin')} AND (AMBITO='NACIONAL' OR LOCALIDAD=:localidad)`,
        { localidad, inicio, fin },
        opts,
      )
    ).rows ?? []
  ).map((f) => f.FECHA);
}
export async function bloqueos(c: Connection, id: number, excluir = 0) {
  return (
    (
      await c.execute<{ inicio: string; fin: string }>(
        `SELECT TO_CHAR(FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(FECHA_FIN,'YYYY-MM-DD') "fin" FROM VACACIONES_SOLICITUDES WHERE ID_EMPLEADO=:id AND ID_VACACIONES_SOLICITUD<>:excluir AND ACTIVO=1 AND ESTADO IN ('EN_PROCESO','APROBADA','TOMADA') UNION ALL SELECT TO_CHAR(FECHA_INICIO,'YYYY-MM-DD'),TO_CHAR(FECHA_FIN,'YYYY-MM-DD') FROM AUSENCIAS WHERE ID_EMPLEADO=:id AND ACTIVO=1 AND ESTADO<>'RECHAZADA' UNION ALL SELECT TO_CHAR(FECHA_INICIO,'YYYY-MM-DD'),TO_CHAR(FECHA_FIN,'YYYY-MM-DD') FROM PERIODOS_NOMINA WHERE ESTADO='CERRADO'`,
        { id, excluir },
        opts,
      )
    ).rows ?? []
  );
}
export interface Solicitud {
  codigo: string;
  id: number;
  idEmpleado: number;
  empleado: string;
  inicio: string;
  fin: string;
  dias: string;
  saldoAlSolicitar: string;
  saldoAlResolver: string | null;
  estado: string;
  motivo: string | null;
  solicitadoPor: string | null;
  solicitadoEn: string;
  aprobadoPor: string | null;
  aprobadoEn: string | null;
  canceladoPor: string | null;
  canceladoEn: string | null;
  motivoCancelacion: string | null;
}
const select = `V.ID_VACACIONES_SOLICITUD "id",S.CODIGO "codigo",V.ID_EMPLEADO "idEmpleado",E.CODIGO||' · '||${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} "empleado",TO_CHAR(V.FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(V.FECHA_FIN,'YYYY-MM-DD') "fin",${str('V.DIAS_SOLICITADOS')} "dias",${str('V.SALDO_AL_SOLICITAR')} "saldoAlSolicitar",${str('V.SALDO_AL_RESOLVER')} "saldoAlResolver",V.ESTADO "estado",V.MOTIVO_RECHAZO "motivo",${nombreUsuarioSql('U')} "solicitadoPor",TO_CHAR(V.FECHA_CREACION,'YYYY-MM-DD HH24:MI:SS') "solicitadoEn",${nombreUsuarioSql('R')} "aprobadoPor",TO_CHAR(V.RESUELTO_EN,'YYYY-MM-DD HH24:MI:SS') "aprobadoEn",${nombreUsuarioSql('C')} "canceladoPor",TO_CHAR(V.CANCELADO_EN,'YYYY-MM-DD HH24:MI:SS') "canceladoEn",V.MOTIVO_CANCELACION "motivoCancelacion"`;
const from =
  'VACACIONES_SOLICITUDES V JOIN SOLICITUDES S ON S.ID_SOLICITUD=V.ID_SOLICITUD JOIN EMPLEADOS E ON E.ID_EMPLEADO=V.ID_EMPLEADO LEFT JOIN USUARIOS U ON U.ID_USUARIO=V.CREADO_POR LEFT JOIN USUARIOS R ON R.ID_USUARIO=V.RESUELTO_POR LEFT JOIN USUARIOS C ON C.ID_USUARIO=V.CANCELADO_POR';
export async function solicitud(c: Connection, id: number) {
  return (
    await c.execute<Solicitud>(
      `SELECT ${select} FROM ${from} WHERE V.ID_VACACIONES_SOLICITUD=:id AND V.ACTIVO=1`,
      { id },
      opts,
    )
  ).rows?.[0];
}
export async function listar(c: Connection, q: Query) {
  const b: Record<string, string | number> = {},
    w = ['V.ACTIVO=1'];
  if (q.idEmpleado) {
    w.push('V.ID_EMPLEADO=:empleado');
    b.empleado = q.idEmpleado;
  }
  if (q.estado) {
    w.push('V.ESTADO=:estado');
    b.estado = q.estado;
  }
  if (q.buscar) {
    w.push(
      "INSTR(UPPER(S.CODIGO||' '||E.CODIGO||' '||E.NOMBRES||' '||E.APELLIDOS),UPPER(:buscar))>0",
    );
    b.buscar = q.buscar;
  }
  if (q.desde) {
    w.push(`V.FECHA_FIN>=${fecha('desde')}`);
    b.desde = q.desde;
  }
  if (q.hasta) {
    w.push(`V.FECHA_INICIO<=${fecha('hasta')}`);
    b.hasta = q.hasta;
  }
  const where = ` WHERE ${w.join(' AND ')}`;
  const total = (await c.execute<{ N: number }>(`SELECT COUNT(*) N FROM ${from}${where}`, b, opts))
    .rows![0]!.N;
  const orden = {
    id: 'V.ID_VACACIONES_SOLICITUD',
    empleado: 'E.NOMBRES',
    inicio: 'V.FECHA_INICIO',
    fin: 'V.FECHA_FIN',
    dias: 'V.DIAS_SOLICITADOS',
    estado: 'V.ESTADO',
  }[q.ordenarPor];
  const dir = q.direccion === 'asc' ? 'ASC' : 'DESC';
  const registros =
    (
      await c.execute<Solicitud>(
        `SELECT ${select} FROM ${from}${where} ORDER BY ${orden} ${dir},V.ID_VACACIONES_SOLICITUD ${dir} OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
        { ...b, offset: (q.pagina - 1) * q.limite, limite: q.limite },
        opts,
      )
    ).rows ?? [];
  return { registros, total, pagina: q.pagina, limite: q.limite };
}
export async function crear(
  c: Connection,
  id: number,
  inicio: string,
  fin: string,
  dias: string,
  saldo: string,
  actor: number,
) {
  const tipo = (
    await c.execute<{ ID: number }>(
      "SELECT ID_TIPO_SOLICITUD ID FROM TIPOS_SOLICITUD WHERE NVL(CODIGO_ANTERIOR,CODIGO)='VACACIONES' AND ACTIVO=1",
      {},
      opts,
    )
  ).rows?.[0]?.ID;
  if (!tipo) throw new ErrorConflicto('Activa el tipo de solicitud VACACIONES en el catálogo.');
  const tramite = await c.execute(
    `INSERT INTO SOLICITUDES (ID_EMPLEADO,ID_TIPO_SOLICITUD,DATOS_SOLICITADOS,CREADO_POR) VALUES (:id,:tipo,:datos,:actor) RETURNING ID_SOLICITUD INTO :nuevo`,
    {
      id,
      tipo,
      datos: JSON.stringify({ inicio, fin, dias }),
      actor,
      nuevo: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
  );
  const idTramite = (tramite.outBinds as { nuevo: number[] }).nuevo[0]!;
  await c.execute(
    "INSERT INTO SOLICITUD_HISTORIAL (ID_SOLICITUD,ESTADO_NUEVO,ID_USUARIO,CREADO_POR) VALUES (:idTramite,'EN_PROCESO',:actor,:actor)",
    { idTramite, actor },
  );
  const r = await c.execute(
    `INSERT INTO VACACIONES_SOLICITUDES (ID_SOLICITUD,ID_EMPLEADO,FECHA_INICIO,FECHA_FIN,DIAS_SOLICITADOS,SALDO_AL_SOLICITAR,CREADO_POR) VALUES (:idTramite,:id,${fecha('inicio')},${fecha('fin')},${num('dias')},${num('saldo')},:actor) RETURNING ID_VACACIONES_SOLICITUD INTO :nuevo`,
    {
      id,
      idTramite,
      inicio,
      fin,
      dias,
      saldo,
      actor,
      nuevo: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
  );
  return (r.outBinds as { nuevo: number[] }).nuevo[0]!;
}
export async function resolver(
  c: Connection,
  id: number,
  estado: string,
  motivo: string,
  dias: string,
  saldo: string,
  actor: number,
) {
  await c.execute(
    `UPDATE VACACIONES_SOLICITUDES SET ESTADO=:estado,MOTIVO_RECHAZO=:motivo,DIAS_SOLICITADOS=${num('dias')},SALDO_AL_RESOLVER=${num('saldo')},RESUELTO_POR=:actor,RESUELTO_EN=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),MODIFICADO_POR=:actor WHERE ID_VACACIONES_SOLICITUD=:id`,
    { id, estado, motivo: motivo || null, dias, saldo, actor },
  );
  const tramite = (
    await c.execute<{ ID: number }>(
      'SELECT ID_SOLICITUD ID FROM VACACIONES_SOLICITUDES WHERE ID_VACACIONES_SOLICITUD=:id',
      { id },
      opts,
    )
  ).rows![0]!.ID;
  await c.execute(
    `UPDATE SOLICITUDES SET ESTADO=:estado,MOTIVO_RECHAZO=:motivo,RESUELTO_POR=:actor,RESUELTO_EN=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),MODIFICADO_POR=:actor WHERE ID_SOLICITUD=:tramite`,
    { tramite, estado, motivo: motivo || null, actor },
  );
  await c.execute(
    "INSERT INTO SOLICITUD_HISTORIAL (ID_SOLICITUD,ESTADO_ANTERIOR,ESTADO_NUEVO,ID_USUARIO,MOTIVO,CREADO_POR) VALUES (:tramite,'EN_PROCESO',:estado,:actor,:motivo,:actor)",
    { tramite, estado, actor, motivo: motivo || null },
  );
}
export async function consumoSolicitud(c: Connection, id: number) {
  return (
    await c.execute<{ dias: string }>(
      `SELECT ${str('DIAS')} "dias" FROM VACACIONES_MOVIMIENTOS WHERE ID_VACACIONES_SOLICITUD=:id AND TIPO='DISFRUTE' AND CLAVE_ORIGEN=:clave AND ACTIVO=1`,
      { id, clave: `SOLICITUD:${id}` },
      opts,
    )
  ).rows?.[0]?.dias;
}
export async function cancelar(c: Connection, id: number, motivo: string, actor: number) {
  await c.execute(
    `UPDATE VACACIONES_SOLICITUDES SET ESTADO='CANCELADA',MOTIVO_CANCELACION=:motivo,CANCELADO_POR=:actor,CANCELADO_EN=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),MODIFICADO_POR=:actor WHERE ID_VACACIONES_SOLICITUD=:id`,
    { id, motivo, actor },
  );
  const tramite = (
    await c.execute<{ ID: number }>(
      'SELECT ID_SOLICITUD ID FROM VACACIONES_SOLICITUDES WHERE ID_VACACIONES_SOLICITUD=:id',
      { id },
      opts,
    )
  ).rows![0]!.ID;
  await c.execute(
    "UPDATE SOLICITUDES SET ESTADO='CANCELADA',MODIFICADO_POR=:actor WHERE ID_SOLICITUD=:tramite",
    { tramite, actor },
  );
  await c.execute(
    "INSERT INTO SOLICITUD_HISTORIAL (ID_SOLICITUD,ESTADO_ANTERIOR,ESTADO_NUEVO,ID_USUARIO,MOTIVO,CREADO_POR) VALUES (:tramite,'APROBADA','CANCELADA',:actor,:motivo,:actor)",
    { tramite, actor, motivo },
  );
}
export async function notificar(
  c: Connection,
  e: Empleado,
  id: number,
  estado: string,
  mensaje: string,
  actor: number,
) {
  const destinatarios =
    estado === 'EN_PROCESO'
      ? (
          (
            await c.execute<{ ID: number }>(
              "SELECT U.ID_USUARIO ID FROM USUARIOS U JOIN ROLES R ON R.ID_ROL=U.ID_ROL WHERE U.ACTIVO=1 AND R.CODIGO IN ('ADMIN','RH')",
              {},
              opts,
            )
          ).rows ?? []
        ).map((u) => u.ID)
      : e.usuario
        ? [e.usuario]
        : [];
  for (const usuario of destinatarios)
    await c.execute(
      `INSERT INTO NOTIFICACIONES (ID_SOLICITUD,ID_USUARIO,TIPO,TITULO,MENSAJE,CLAVE_EVENTO,CREADO_POR) VALUES ((SELECT ID_SOLICITUD FROM VACACIONES_SOLICITUDES WHERE ID_VACACIONES_SOLICITUD=:id),:usuario,:tipo,:titulo,:mensaje,:clave,:actor)`,
      {
        id,
        usuario,
        tipo: estado === 'EN_PROCESO' ? 'NUEVA_SOLICITUD' : 'CAMBIO_ESTADO',
        titulo: `Vacaciones · ${estado === 'EN_PROCESO' ? 'Nueva solicitud' : estado === 'APROBADA' ? 'Aprobada' : estado === 'CANCELADA' ? 'Cancelada' : 'Rechazada'}`,
        mensaje,
        clave: `VACACIONES:${id}:${estado}`,
        actor,
      },
    );
}
export async function notificaciones(c: Connection, usuario: number) {
  const pendientes = (
    await c.execute<{ N: number }>(
      'SELECT COUNT(*) N FROM NOTIFICACIONES WHERE ID_USUARIO=:usuario AND ACTIVO=1 AND LEIDA_EN IS NULL',
      { usuario },
      opts,
    )
  ).rows![0]!.N;
  const registros =
    (
      await c.execute<{
        id: number;
        titulo: string;
        mensaje: string;
        clave: string;
        leida: number;
      }>(
        `SELECT ID_NOTIFICACION "id",TITULO "titulo",MENSAJE "mensaje",CLAVE_EVENTO "clave",CASE WHEN LEIDA_EN IS NULL THEN 0 ELSE 1 END "leida" FROM NOTIFICACIONES WHERE ID_USUARIO=:usuario AND ACTIVO=1 ORDER BY FECHA_CREACION DESC,ID_NOTIFICACION DESC FETCH NEXT 30 ROWS ONLY`,
        { usuario },
        opts,
      )
    ).rows ?? [];
  return { pendientes, registros };
}
export async function leerNotificacion(c: Connection, usuario: number, id: number) {
  return (
    await c.execute(
      `UPDATE NOTIFICACIONES SET LEIDA_EN=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),MODIFICADO_POR=:usuario WHERE ID_NOTIFICACION=:id AND ID_USUARIO=:usuario AND ACTIVO=1 AND LEIDA_EN IS NULL`,
      { usuario, id },
    )
  ).rowsAffected;
}
// ACTIVO conserva la deduplicación del evento y las referencias históricas de otros destinatarios.
export async function borrarNotificaciones(c: Connection, usuario: number, id?: number) {
  const r = await c.execute(
    `UPDATE NOTIFICACIONES SET ACTIVO=0,MODIFICADO_POR=:usuario
     WHERE ID_USUARIO=:usuario AND ACTIVO=1 AND (:id IS NULL OR ID_NOTIFICACION=:id)`,
    { usuario, id: id ?? null },
  );
  return r.rowsAffected ?? 0;
}
export async function valoresFiniquito(c: Connection, id: number, corte: string) {
  const salario =
    (
      await c.execute<{ VALOR: string }>(
        `SELECT ${str('SALARIO_BASE')} VALOR FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id AND ACTIVO=1 AND VIGENTE_DESDE<=${fecha('corte')} AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=${fecha('corte')})`,
        { id, corte },
        opts,
      )
    ).rows ?? [];
  const divisor =
    (
      await c.execute<{ VALOR: string }>(
        `SELECT ${str('VALOR')} VALOR FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA='SALARIO_DIAS_MES' AND UNIDAD='DIAS' AND ACTIVO=1 AND VIGENTE_DESDE<=${fecha('corte')} AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=${fecha('corte')})`,
        { corte },
        opts,
      )
    ).rows ?? [];
  return {
    salario: salario.length === 1 ? salario[0]!.VALOR : null,
    divisor: divisor.length === 1 ? divisor[0]!.VALOR : null,
  };
}

export async function reservasPosteriores(c: Connection, id: number, corte: string) {
  return !!(
    await c.execute(
      `SELECT 1 FROM VACACIONES_SOLICITUDES WHERE ID_EMPLEADO=:id AND ACTIVO=1 AND ESTADO IN ('EN_PROCESO','APROBADA') AND FECHA_FIN>${fecha('corte')}`,
      { id, corte },
    )
  ).rows?.length;
}
