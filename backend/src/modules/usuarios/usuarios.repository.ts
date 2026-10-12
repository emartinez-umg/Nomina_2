import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { Rol } from '../auth/auth.types.js';
import type { UsuariosQuery } from './usuarios.schemas.js';

// Serializa la administración y las altas; protege el último ADMIN y los sufijos concurrentes.
export async function bloquearAdministracion(c: Connection) {
  await c.execute("SELECT ID_ROL FROM ROLES WHERE CODIGO = 'ADMIN' FOR UPDATE");
}
export async function buscarIdRol(c: Connection, rol: Rol) {
  const r = await c.execute<{ ID_ROL: number }>(
    'SELECT ID_ROL FROM ROLES WHERE CODIGO = :rol AND ACTIVO = 1',
    { rol },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return r.rows?.[0]?.ID_ROL;
}
export async function contarAdmins(c: Connection) {
  const r = await c.execute<{ TOTAL: number }>(
    `SELECT COUNT(*) TOTAL FROM USUARIOS U JOIN ROLES R ON R.ID_ROL = U.ID_ROL
    WHERE U.ACTIVO = 1 AND R.ACTIVO = 1 AND R.CODIGO = 'ADMIN'`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return r.rows?.[0]?.TOTAL ?? 0;
}
export async function cambiarEstado(c: Connection, id: number, activo: boolean, actor: number) {
  await c.execute(
    'UPDATE USUARIOS SET ACTIVO = :activo, MODIFICADO_POR = :actor WHERE ID_USUARIO = :id',
    { id, activo: activo ? 1 : 0, actor },
  );
}
export async function cambiarRol(c: Connection, id: number, rol: number, actor: number) {
  await c.execute(
    'UPDATE USUARIOS SET ID_ROL = :rol, MODIFICADO_POR = :actor WHERE ID_USUARIO = :id',
    { id, rol, actor },
  );
}
export async function existeUsuario(c: Connection, usuario: string) {
  const r = await c.execute('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO = :usuario', {
    usuario,
  });
  return Boolean(r.rows?.length);
}
export async function insertarUsuario(
  c: Connection,
  usuario: string,
  correo: string,
  hash: string,
  rol: number,
  actor: number,
) {
  const r = await c.execute<{ id: number[] }>(
    `INSERT INTO USUARIOS (USUARIO, CORREO, CONTRASENA_HASH, ID_ROL, CAMBIO_OBLIGATORIO, CREADO_POR)
    VALUES (:usuario, :correo, :hash, :rol, 1, :actor) RETURNING ID_USUARIO INTO :id`,
    {
      usuario,
      correo,
      hash,
      rol,
      actor,
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
  );
  return r.outBinds!.id[0]!;
}
export async function listarUsuarios(c: Connection, q: UsuariosQuery) {
  const filtros = {
    buscar: q.buscar ?? null,
    usuario: q.usuario ?? null,
    correo: q.correo ?? null,
    rol: q.rol ?? null,
    activo: q.activo ? Number(q.activo) : null,
    cambio: q.cambioObligatorio ? Number(q.cambioObligatorio) : null,
  };
  const total = await c.execute<{ TOTAL: number }>(
    `SELECT COUNT(*) TOTAL FROM USUARIOS U JOIN ROLES R ON R.ID_ROL = U.ID_ROL
    WHERE (:buscar IS NULL OR INSTR(U.USUARIO, LOWER(:buscar)) > 0 OR INSTR(U.CORREO, LOWER(:buscar)) > 0)
    AND (:usuario IS NULL OR INSTR(U.USUARIO, LOWER(:usuario)) > 0)
    AND (:correo IS NULL OR INSTR(U.CORREO, LOWER(:correo)) > 0) AND (:rol IS NULL OR R.CODIGO = :rol)
    AND (:activo IS NULL OR U.ACTIVO = :activo) AND (:cambio IS NULL OR U.CAMBIO_OBLIGATORIO = :cambio)`,
    filtros,
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const filas = await c.execute(
    `SELECT U.ID_USUARIO "idUsuario", U.USUARIO "usuario", U.CORREO "correo", R.CODIGO "rol",
    U.ACTIVO "activo", U.CAMBIO_OBLIGATORIO "cambioObligatorio",
    TO_CHAR(U.ULTIMO_ACCESO, 'YYYY-MM-DD"T"HH24:MI:SS') || CASE WHEN U.ULTIMO_ACCESO IS NOT NULL THEN '-06:00' END "ultimoAcceso" FROM USUARIOS U JOIN ROLES R ON R.ID_ROL = U.ID_ROL
    WHERE (:buscar IS NULL OR INSTR(U.USUARIO, LOWER(:buscar)) > 0 OR INSTR(U.CORREO, LOWER(:buscar)) > 0)
    AND (:usuario IS NULL OR INSTR(U.USUARIO, LOWER(:usuario)) > 0)
    AND (:correo IS NULL OR INSTR(U.CORREO, LOWER(:correo)) > 0) AND (:rol IS NULL OR R.CODIGO = :rol)
    AND (:activo IS NULL OR U.ACTIVO = :activo) AND (:cambio IS NULL OR U.CAMBIO_OBLIGATORIO = :cambio)
    ORDER BY
    CASE WHEN :orden = 'usuario' AND :direccion = 'asc' THEN U.USUARIO END ASC,
    CASE WHEN :orden = 'usuario' AND :direccion = 'desc' THEN U.USUARIO END DESC,
    CASE WHEN :orden = 'correo' AND :direccion = 'asc' THEN U.CORREO END ASC,
    CASE WHEN :orden = 'correo' AND :direccion = 'desc' THEN U.CORREO END DESC,
    CASE WHEN :orden = 'rol' AND :direccion = 'asc' THEN R.CODIGO END ASC,
    CASE WHEN :orden = 'rol' AND :direccion = 'desc' THEN R.CODIGO END DESC,
    CASE WHEN :orden = 'activo' AND :direccion = 'asc' THEN U.ACTIVO END ASC,
    CASE WHEN :orden = 'activo' AND :direccion = 'desc' THEN U.ACTIVO END DESC,
    CASE WHEN :direccion = 'asc' THEN U.ID_USUARIO END ASC,
    CASE WHEN :direccion = 'desc' THEN U.ID_USUARIO END DESC
    OFFSET :inicio ROWS FETCH NEXT :limite ROWS ONLY`,
    {
      ...filtros,
      orden: q.ordenarPor,
      direccion: q.direccion,
      inicio: (q.pagina - 1) * q.limite,
      limite: q.limite,
    },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return {
    usuarios: filas.rows ?? [],
    total: total.rows?.[0]?.TOTAL ?? 0,
    pagina: q.pagina,
    limite: q.limite,
  };
}
