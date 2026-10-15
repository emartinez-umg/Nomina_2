import type { Connection, BindParameters } from 'oracledb';
import type { z } from 'zod';
import { filas, n, num } from './mensuales.repository.js';
import type { parqueoQuery, tarifaSchema } from './parqueo.schemas.js';
export async function tarifas(c: Connection) {
  return filas<{
    id: number;
    vehiculo: string;
    monto: string;
    desde: string;
    hasta: string | null;
  }>(
    c,
    `SELECT ID_PARQUEO_TARIFA "id",VEHICULO "vehiculo",${num('MONTO')} "monto",TO_CHAR(VIGENTE_DESDE,'YYYY-MM-DD') "desde",TO_CHAR(VIGENTE_HASTA,'YYYY-MM-DD') "hasta" FROM PARQUEO_TARIFAS WHERE ACTIVO=1 ORDER BY VIGENTE_DESDE DESC,VEHICULO`,
  );
}
export async function vigente(c: Connection, vehiculo: string, mes: string) {
  return filas<{ id: number; monto: string }>(
    c,
    `SELECT ID_PARQUEO_TARIFA "id",${num('MONTO')} "monto" FROM PARQUEO_TARIFAS WHERE ACTIVO=1 AND VEHICULO=:vehiculo AND VIGENTE_DESDE<=TO_DATE(:mes||'-01','YYYY-MM-DD') AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TO_DATE(:mes||'-01','YYYY-MM-DD'))`,
    { vehiculo, mes },
  );
}
export async function guardarTarifa(c: Connection, d: z.infer<typeof tarifaSchema>, actor: number) {
  await c.execute(
    "UPDATE PARQUEO_TARIFAS SET VIGENTE_HASTA=TO_DATE(:mes||'-01','YYYY-MM-DD')-1,MODIFICADO_POR=:actor WHERE VEHICULO=:vehiculo AND ACTIVO=1 AND VIGENTE_DESDE<TO_DATE(:mes||'-01','YYYY-MM-DD') AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TO_DATE(:mes||'-01','YYYY-MM-DD'))",
    { mes: d.mes, vehiculo: d.vehiculo, actor },
  );
  await c.execute(
    `INSERT INTO PARQUEO_TARIFAS(VEHICULO,MONTO,VIGENTE_DESDE,VIGENTE_HASTA,MOTIVO,CREADO_POR) VALUES(:vehiculo,${n('monto')},TO_DATE(:mes||'-01','YYYY-MM-DD'),(SELECT MIN(VIGENTE_DESDE)-1 FROM PARQUEO_TARIFAS WHERE VEHICULO=:vehiculo AND ACTIVO=1 AND VIGENTE_DESDE>TO_DATE(:mes||'-01','YYYY-MM-DD')),:motivo,:actor)`,
    { vehiculo: d.vehiculo, monto: d.monto, mes: d.mes, motivo: d.motivo, actor },
  );
  return (
    await filas<{ id: number }>(
      c,
      "SELECT ID_PARQUEO_TARIFA \"id\" FROM PARQUEO_TARIFAS WHERE VEHICULO=:vehiculo AND VIGENTE_DESDE=TO_DATE(:mes||'-01','YYYY-MM-DD')",
      { vehiculo: d.vehiculo, mes: d.mes },
    )
  )[0]!.id;
}
export interface Suscripcion {
  id: number;
  idEmpleado: number;
  usuario: number | null;
  empleado: string;
  vehiculo: string | null;
  placa: string | null;
  inicio: string;
  fin: string | null;
  estado: string;
  bajaSolicitada: number;
  montoAnterior: string | null;
  idPago: number | null;
  estadoAplicacion: string;
  tarifa: string | null;
  bloqueada: number;
  gestionBloqueada: number;
  completarBloqueado: number;
}
const mesActual = "TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),'MM')";
const select = `S.ID_PARQUEO_SUSCRIPCION "id",S.ID_EMPLEADO "idEmpleado",E.ID_USUARIO "usuario",E.CODIGO||' · '||E.NOMBRES||' '||E.APELLIDOS "empleado",S.VEHICULO "vehiculo",S.PLACA "placa",TO_CHAR(S.MES_INICIO,'YYYY-MM') "inicio",TO_CHAR(S.MES_FIN,'YYYY-MM') "fin",S.ESTADO "estado",S.BAJA_SOLICITADA "bajaSolicitada",${num('S.MONTO_ANTERIOR')} "montoAnterior",M.ID_NOMINA_EMPLEADO "idPago",NVL(M.ESTADO,'PENDIENTE') "estadoAplicacion",${num('NVL(M.MONTO,T.MONTO)')} "tarifa",CASE WHEN M.ESTADO='APLICADA' OR EXISTS(SELECT 1 FROM PERIODOS_NOMINA P WHERE P.ESTADO='CERRADO' AND P.FECHA_INICIO<=LAST_DAY(TO_DATE(:mes||'-01','YYYY-MM-DD')) AND P.FECHA_FIN>=TO_DATE(:mes||'-01','YYYY-MM-DD')) THEN 1 ELSE 0 END "bloqueada",CASE WHEN EXISTS(SELECT 1 FROM PERIODOS_NOMINA P WHERE P.ESTADO='CERRADO' AND P.FECHA_INICIO<=LAST_DAY(${mesActual}) AND P.FECHA_FIN>=${mesActual}) THEN 1 ELSE 0 END "gestionBloqueada",CASE WHEN EXISTS(SELECT 1 FROM NOVEDADES_MENSUALES C WHERE C.ID_PARQUEO_SUSCRIPCION=S.ID_PARQUEO_SUSCRIPCION AND C.MES=${mesActual} AND C.ESTADO='APLICADA') THEN 1 ELSE 0 END "completarBloqueado"`;
export async function suscripciones(
  c: Connection,
  q: z.infer<typeof parqueoQuery>,
  propietario: number | null,
  id?: number,
) {
  const binds: BindParameters = { mes: q.mes, propietario };
  const filtros = ['S.ACTIVO=1', '(:propietario IS NULL OR E.ID_USUARIO=:propietario)'];
  if (id) {
    filtros.push('S.ID_PARQUEO_SUSCRIPCION=:id');
    binds.id = id;
  }
  if (q.buscar) {
    filtros.push(
      "INSTR(UPPER(E.CODIGO||' '||E.NOMBRES||' '||E.APELLIDOS||' '||S.PLACA),UPPER(:buscar))>0",
    );
    binds.buscar = q.buscar;
  }
  if (q.idDepartamento) {
    filtros.push('E.ID_DEPARTAMENTO=:departamento');
    binds.departamento = q.idDepartamento;
  }
  if (q.vehiculo) {
    filtros.push('S.VEHICULO=:vehiculo');
    binds.vehiculo = q.vehiculo;
  }
  if (q.estado) {
    filtros.push('S.ESTADO=:estado');
    binds.estado = q.estado;
  }
  const from = `PARQUEO_SUSCRIPCIONES S JOIN EMPLEADOS E ON E.ID_EMPLEADO=S.ID_EMPLEADO LEFT JOIN NOVEDADES_MENSUALES M ON M.ID_PARQUEO_SUSCRIPCION=S.ID_PARQUEO_SUSCRIPCION AND M.MES=TO_DATE(:mes||'-01','YYYY-MM-DD') AND M.ACTIVO=1 LEFT JOIN PARQUEO_TARIFAS T ON T.VEHICULO=S.VEHICULO AND T.ACTIVO=1 AND T.VIGENTE_DESDE<=TO_DATE(:mes||'-01','YYYY-MM-DD') AND (T.VIGENTE_HASTA IS NULL OR T.VIGENTE_HASTA>=TO_DATE(:mes||'-01','YYYY-MM-DD')) WHERE ${filtros.join(' AND ')}`;
  const total = (
    await filas<{ total: number }>(c, `SELECT COUNT(*) "total" FROM ${from}`, binds)
  )[0]!.total;
  return {
    registros: await filas<Suscripcion>(
      c,
      `SELECT ${select} FROM ${from} ORDER BY ${{ id: 'S.ID_PARQUEO_SUSCRIPCION', empleado: 'E.NOMBRES', inicio: 'S.MES_INICIO', estado: 'S.ESTADO' }[q.ordenarPor ?? 'id']} ${q.direccion === 'asc' ? 'ASC' : 'DESC'},S.ID_PARQUEO_SUSCRIPCION DESC OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
      { ...binds, offset: (q.pagina - 1) * q.limite, limite: q.limite },
    ),
    total,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function existe(c: Connection, empleado: number, mes: string) {
  return (
    (
      await filas(
        c,
        "SELECT 1 FROM PARQUEO_SUSCRIPCIONES WHERE ID_EMPLEADO=:empleado AND ACTIVO=1 AND (MES_FIN IS NULL OR MES_FIN>=TO_DATE(:mes||'-01','YYYY-MM-DD'))",
        { empleado, mes },
      )
    ).length > 0
  );
}
export async function alta(
  c: Connection,
  empleado: number,
  solicitud: number,
  vehiculo: string,
  placa: string | null,
  mes: string,
  actor: number,
) {
  await c.execute(
    "INSERT INTO PARQUEO_SUSCRIPCIONES(ID_EMPLEADO,ID_SOLICITUD,VEHICULO,PLACA,MES_INICIO,MOTIVO,CREADO_POR) VALUES(:empleado,:solicitud,:vehiculo,:placa,TO_DATE(:mes||'-01','YYYY-MM-DD'),'Alta al aprobar solicitud',:actor)",
    { empleado, solicitud, vehiculo, placa, mes, actor },
  );
  return (
    await filas<{ id: number }>(
      c,
      'SELECT ID_PARQUEO_SUSCRIPCION "id" FROM PARQUEO_SUSCRIPCIONES WHERE ID_SOLICITUD=:solicitud',
      { solicitud },
    )
  )[0]!.id;
}
export async function cambiar(
  c: Connection,
  id: number,
  accion: string,
  mes: string,
  motivo: string,
  actor: number,
  vehiculo?: string,
  placa?: string,
) {
  if (accion === 'COMPLETAR')
    return c.execute(
      'UPDATE PARQUEO_SUSCRIPCIONES SET VEHICULO=:vehiculo,PLACA=:placa,MOTIVO=:motivo,MODIFICADO_POR=:actor WHERE ID_PARQUEO_SUSCRIPCION=:id',
      { id, vehiculo: vehiculo!, placa: placa ?? null, motivo, actor },
    );
  if (accion === 'SOLICITAR_BAJA')
    return c.execute(
      'UPDATE PARQUEO_SUSCRIPCIONES SET BAJA_SOLICITADA=1,MOTIVO=:motivo,MODIFICADO_POR=:actor WHERE ID_PARQUEO_SUSCRIPCION=:id',
      { id, motivo, actor },
    );
  return c.execute(
    "UPDATE PARQUEO_SUSCRIPCIONES SET ESTADO=:estado,MES_FIN=TO_DATE(:mes||'-01','YYYY-MM-DD'),BAJA_SOLICITADA=0,MOTIVO=:motivo,MODIFICADO_POR=:actor WHERE ID_PARQUEO_SUSCRIPCION=:id",
    { id, mes, motivo, actor, estado: accion === 'BAJA' ? 'BAJA' : 'SUSPENDIDA' },
  );
}
export async function notificarBaja(
  c: Connection,
  s: Suscripcion,
  solicitud: boolean,
  actor: number,
) {
  const usuarios = solicitud
    ? await filas<{ id: number }>(
        c,
        "SELECT U.ID_USUARIO \"id\" FROM USUARIOS U JOIN ROLES R ON R.ID_ROL=U.ID_ROL WHERE U.ACTIVO=1 AND R.CODIGO IN ('RH','ADMIN')",
      )
    : s.usuario
      ? [{ id: s.usuario }]
      : [];
  for (const u of usuarios)
    await c.execute(
      "INSERT INTO NOTIFICACIONES(ID_USUARIO,TIPO,TITULO,MENSAJE,CLAVE_EVENTO,CREADO_POR) VALUES(:usuario,'CAMBIO_ESTADO',:titulo,:mensaje,:clave,:actor)",
      {
        usuario: u.id,
        titulo: solicitud ? 'Baja de parqueo solicitada' : 'Suscripción de parqueo actualizada',
        mensaje: `${s.empleado}. Consulta Parqueo para revisar la gestión.`,
        clave: `PARQUEO:${s.id}:${solicitud ? 'SOLICITUD' : s.estado}:${u.id}`,
        actor,
      },
    );
}
