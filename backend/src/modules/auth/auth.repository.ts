import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { ContextoPeticion, Rol, UsuarioCredencial } from './auth.types.js';

interface FilaUsuario {
  ID_USUARIO: number;
  USUARIO: string;
  CORREO: string;
  ID_ROL: number;
  ROL: Rol;
  ACTIVO: number;
  ROL_ACTIVO: number;
  CAMBIO_OBLIGATORIO: number;
  CONTRASENA_HASH: string;
  INTENTOS_FALLIDOS: number;
  BLOQUEADO: number;
}
export async function buscarUsuario(
  c: Connection,
  selector: { id?: number; usuario?: string },
): Promise<UsuarioCredencial | undefined> {
  const r = await c.execute<FilaUsuario>(
    `SELECT U.ID_USUARIO, U.USUARIO, U.CORREO, U.ID_ROL,
    R.CODIGO ROL, R.ACTIVO ROL_ACTIVO, U.ACTIVO, U.CAMBIO_OBLIGATORIO, U.CONTRASENA_HASH,
    U.INTENTOS_FALLIDOS, CASE WHEN U.BLOQUEADO_HASTA > CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)
    THEN 1 ELSE 0 END BLOQUEADO FROM USUARIOS U JOIN ROLES R ON R.ID_ROL = U.ID_ROL
    WHERE (:id IS NOT NULL AND U.ID_USUARIO = :id) OR (:usuario IS NOT NULL AND U.USUARIO = :usuario)
    FOR UPDATE OF U.INTENTOS_FALLIDOS`,
    { id: selector.id ?? null, usuario: selector.usuario ?? null },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const f = r.rows?.[0];
  return f
    ? {
        idUsuario: f.ID_USUARIO,
        usuario: f.USUARIO,
        correo: f.CORREO,
        idRol: f.ID_ROL,
        rol: f.ROL,
        activo: f.ACTIVO === 1 && f.ROL_ACTIVO === 1,
        cambioObligatorio: f.CAMBIO_OBLIGATORIO === 1,
        contrasenaHash: f.CONTRASENA_HASH,
        intentosFallidos: f.INTENTOS_FALLIDOS,
        bloqueado: f.BLOQUEADO === 1,
      }
    : undefined;
}
export async function registrarFallo(c: Connection, id: number) {
  const r = await c.execute<{ bloqueado: number[] }>(
    `UPDATE USUARIOS SET
    INTENTOS_FALLIDOS = CASE WHEN BLOQUEADO_HASTA IS NOT NULL THEN 1 ELSE INTENTOS_FALLIDOS + 1 END,
    BLOQUEADO_HASTA = CASE WHEN BLOQUEADO_HASTA IS NULL AND INTENTOS_FALLIDOS >= 4
      THEN CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE) + 15/1440 ELSE NULL END,
    MODIFICADO_POR = :id WHERE ID_USUARIO = :id
    RETURNING CASE WHEN BLOQUEADO_HASTA IS NULL THEN 0 ELSE 1 END INTO :bloqueado`,
    {
      id,
      bloqueado: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
  );
  return r.outBinds?.bloqueado?.[0] === 1;
}
export async function registrarAcceso(c: Connection, id: number) {
  await c.execute(
    `UPDATE USUARIOS SET INTENTOS_FALLIDOS = 0, BLOQUEADO_HASTA = NULL,
    ULTIMO_ACCESO = CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE), MODIFICADO_POR = :id
    WHERE ID_USUARIO = :id`,
    { id },
  );
}
export async function crearSesion(
  c: Connection,
  id: number,
  token: Buffer,
  csrf: Buffer,
  minutos: number,
  ctx: ContextoPeticion,
) {
  await c.execute(
    `INSERT INTO SESIONES (ID_USUARIO, TOKEN_HASH, CSRF_HASH, EXPIRA_EN, IP, AGENTE_USUARIO, CREADO_POR)
    VALUES (:id, :token, :csrf, CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE) + :minutos/1440, :ip, :agente, :id)`,
    { id, token, csrf, minutos, ip: ctx.ip, agente: ctx.agente },
  );
}
export async function usuarioDeToken(c: Connection, token: Buffer): Promise<number | undefined> {
  const r = await c.execute<{ ID_USUARIO: number }>(
    'SELECT ID_USUARIO FROM SESIONES WHERE TOKEN_HASH = :token',
    { token },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return r.rows?.[0]?.ID_USUARIO;
}
export async function sesionVigente(
  c: Connection,
  idUsuario: number,
  selector: { token?: Buffer; id?: number },
): Promise<{ idSesion: number; csrfHash: Buffer } | undefined> {
  const r = await c.execute<{ ID_SESION: number; CSRF_HASH: Buffer }>(
    `SELECT S.ID_SESION, S.CSRF_HASH FROM SESIONES S
    WHERE S.ID_USUARIO = :usuario AND ((:token IS NOT NULL AND S.TOKEN_HASH = :token) OR (:id IS NOT NULL AND S.ID_SESION = :id))
    AND S.ACTIVO = 1 AND S.REVOCADA_EN IS NULL AND S.EXPIRA_EN > CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)
    FOR UPDATE OF S.ULTIMA_ACTIVIDAD`,
    { usuario: idUsuario, token: selector.token ?? null, id: selector.id ?? null },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const f = r.rows?.[0];
  return f ? { idSesion: f.ID_SESION, csrfHash: f.CSRF_HASH } : undefined;
}
export async function renovarActividad(c: Connection, id: number, minutos: number) {
  await c.execute(
    `UPDATE SESIONES SET ULTIMA_ACTIVIDAD = CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),
    EXPIRA_EN = CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE) + :minutos/1440,
    MODIFICADO_POR = ID_USUARIO WHERE ID_SESION = :id`,
    { id, minutos },
  );
}
export async function revocarSesiones(
  c: Connection,
  usuario: number,
  actor: number,
  sesion: number | null = null,
) {
  await c.execute(
    `UPDATE SESIONES SET ACTIVO = 0, REVOCADA_EN = CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),
    MODIFICADO_POR = :actor WHERE ID_USUARIO = :usuario AND ACTIVO = 1 AND (:sesion IS NULL OR ID_SESION = :sesion)`,
    { usuario, actor, sesion },
  );
}
export async function cambiarCredencial(
  c: Connection,
  id: number,
  credencial: string,
  temporal: boolean,
  actor: number,
) {
  await c.execute(
    `UPDATE USUARIOS SET CONTRASENA_HASH = :credencial, CAMBIO_OBLIGATORIO = :temporal,
    CONTRASENA_CAMBIADA_EN = CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),
    INTENTOS_FALLIDOS = 0, BLOQUEADO_HASTA = NULL, MODIFICADO_POR = :actor WHERE ID_USUARIO = :id`,
    { id, credencial, temporal: temporal ? 1 : 0, actor },
  );
}
