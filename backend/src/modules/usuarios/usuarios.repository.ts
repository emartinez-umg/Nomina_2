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
  const filtros: Record<string, string | number> = {};
  const condiciones: string[] = [];
  if (q.buscar) {
    condiciones.push('(INSTR(U.USUARIO,LOWER(:buscar))>0 OR INSTR(U.CORREO,LOWER(:buscar))>0)');
    filtros.buscar = q.buscar;
  }
  for (const [clave, columna] of [
    ['usuario', 'USUARIO'],
    ['correo', 'CORREO'],
  ] as const)
    if (q[clave]) {
      condiciones.push(`INSTR(U.${columna},LOWER(:${clave}))>0`);
      filtros[clave] = q[clave]!;
    }
  if (q.rol) {
    condiciones.push('R.CODIGO=:rol');
    filtros.rol = q.rol;
  }
  if (q.activo !== undefined) {
    condiciones.push('U.ACTIVO=:activo');
    filtros.activo = Number(q.activo);
  }
  if (q.cambioObligatorio !== undefined) {
    condiciones.push('U.CAMBIO_OBLIGATORIO=:cambio');
    filtros.cambio = Number(q.cambioObligatorio);
  }
  const where = condiciones.length ? ` WHERE ${condiciones.join(' AND ')}` : '';
  // Identificadores proceden de esta lista estática; valores y paginación siempre usan binds.
  const orden = {
    id: 'U.ID_USUARIO',
    usuario: 'U.USUARIO',
    correo: 'U.CORREO',
    rol: 'R.CODIGO',
    activo: 'U.ACTIVO',
  }[q.ordenarPor];
  const direccion = q.direccion === 'desc' ? 'DESC' : 'ASC';
  const total = await c.execute<{ TOTAL: number }>(
    `SELECT COUNT(*) TOTAL FROM USUARIOS U JOIN ROLES R ON R.ID_ROL=U.ID_ROL${where}`,
    filtros,
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const filas = await c.execute(
    `SELECT U.ID_USUARIO "idUsuario",U.USUARIO "usuario",U.CORREO "correo",R.CODIGO "rol",U.ACTIVO "activo",U.CAMBIO_OBLIGATORIO "cambioObligatorio",TO_CHAR(U.ULTIMO_ACCESO,'YYYY-MM-DD"T"HH24:MI:SS')||CASE WHEN U.ULTIMO_ACCESO IS NOT NULL THEN '-06:00' END "ultimoAcceso" FROM USUARIOS U JOIN ROLES R ON R.ID_ROL=U.ID_ROL${where} ORDER BY ${orden} ${direccion},U.ID_USUARIO ${direccion} OFFSET :inicio ROWS FETCH NEXT :limite ROWS ONLY`,
    { ...filtros, inicio: (q.pagina - 1) * q.limite, limite: q.limite },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return {
    usuarios: filas.rows ?? [],
    total: total.rows?.[0]?.TOTAL ?? 0,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function expedienteUsuario(c: Connection, id: number) {
  const r = await c.execute<{ id: number }>(
    `SELECT ID_EMPLEADO "id" FROM EMPLEADOS WHERE ID_USUARIO=:id`,
    { id },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return r.rows?.[0] ?? null;
}
export async function expedienteDisponible(c: Connection, id: number) {
  const r = await c.execute<{ usuario: number | null; nombre: string; puesto: string }>(
    `SELECT E.ID_USUARIO "usuario",E.NOMBRES||' '||E.APELLIDOS "nombre",P.NOMBRE "puesto" FROM EMPLEADOS E JOIN PUESTOS P ON P.ID_PUESTO=E.ID_PUESTO AND P.ACTIVO=1 WHERE E.ID_EMPLEADO=:id AND E.ACTIVO=1 AND E.ESTADO='ACTIVO' FOR UPDATE OF E.ID_USUARIO`,
    { id },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return r.rows?.[0] ?? null;
}
export async function vincularExpediente(
  c: Connection,
  id: number,
  usuario: number,
  actor: number,
) {
  await c.execute(
    'UPDATE EMPLEADOS SET ID_USUARIO=:usuario,MODIFICADO_POR=:actor WHERE ID_EMPLEADO=:id',
    { id, usuario, actor },
  );
}
