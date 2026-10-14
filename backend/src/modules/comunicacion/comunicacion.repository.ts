import oracledb from 'oracledb';
import type { Connection, BindParameters } from 'oracledb';
import type { Tipo, Datos, Query } from './comunicacion.schemas.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';
export const ahoraSql = "CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)";
const opts = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
  fetchInfo: { contenido: { type: oracledb.STRING } },
};
export const config = {
  anuncios: {
    tabla: 'ANUNCIOS',
    id: 'ID_ANUNCIO',
    audiencia: 'ANUNCIO_DESTINATARIOS',
    inicio: 'VIGENTE_DESDE',
    fin: 'VIGENTE_HASTA',
    contenido: 'CONTENIDO',
    tipo: 'ANUNCIO',
  },
  eventos: {
    tabla: 'EVENTOS',
    id: 'ID_EVENTO',
    audiencia: 'EVENTO_DESTINATARIOS',
    inicio: 'FECHA_INICIO',
    fin: 'FECHA_FIN',
    contenido: 'DESCRIPCION',
    tipo: 'EVENTO',
  },
} as const;
const grupos = {
  DEPARTAMENTO: ['DEPARTAMENTOS', 'ID_DEPARTAMENTO'],
  PUESTO: ['PUESTOS', 'ID_PUESTO'],
  JEFATURA: ['JEFATURAS', 'ID_JEFATURA'],
} as const;
export interface Fila {
  codigo: string;
  id: number;
  titulo: string;
  contenido: string;
  inicio: string;
  fin: string;
  lugar: string;
  paraTodos: number;
  activo: number;
  version: number;
}
export interface Destinatario {
  tipo: 'DEPARTAMENTO' | 'PUESTO' | 'JEFATURA';
  id: number;
  nombre: string;
}
// Audiencias OR, EXISTS evita duplicados si una persona pertenece a varios grupos.
export function audienciaSql(tipo: Tipo) {
  const t = config[tipo];
  return `(T.PARA_TODOS=1 OR EXISTS (SELECT 1 FROM ${t.audiencia} D WHERE D.${t.id}=T.${t.id} AND D.ACTIVO=1 AND (D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO OR D.ID_PUESTO=E.ID_PUESTO OR D.ID_JEFATURA=E.ID_JEFATURA)))`;
}
function filtros(tipo: Tipo, q: Query, usuario: number | null) {
  const t = config[tipo];
  const where = [
    `(:buscar IS NULL OR INSTR(LOWER(T.CODIGO||' '||T.TITULO),LOWER(:buscar))>0)`,
    `(:desde IS NULL OR T.${t.fin}>=TO_DATE(:desde,'YYYY-MM-DD'))`,
    `(:hasta IS NULL OR T.${t.inicio}<TO_DATE(:hasta,'YYYY-MM-DD')+1)`,
    `(:activo IS NULL OR T.ACTIVO=:activo)`,
    `(:todos IS NULL OR T.PARA_TODOS=:todos)`,
  ];
  const binds: BindParameters = {
    buscar: q.buscar ?? null,
    desde: q.desde ?? null,
    hasta: q.hasta ?? null,
    activo: q.activo ?? null,
    todos: q.paraTodos ?? null,
  };
  if (q.grupo && q.idGrupo) {
    where.push(
      `EXISTS (SELECT 1 FROM ${t.audiencia} D WHERE D.${t.id}=T.${t.id} AND D.ACTIVO=1 AND D.${grupos[q.grupo][1]}=:grupo)`,
    );
    binds.grupo = q.idGrupo;
  }
  if (usuario !== null) {
    where.push(
      `T.ACTIVO=1 AND T.${t.fin}>=${tipo === 'anuncios' ? `TRUNC(${ahoraSql})` : ahoraSql}`,
    );
    if (tipo === 'anuncios') where.push(`T.${t.inicio}<=TRUNC(${ahoraSql})`);
    where.push(
      `EXISTS (SELECT 1 FROM EMPLEADOS E WHERE E.ID_USUARIO=:usuario AND E.ACTIVO=1 AND E.ESTADO='ACTIVO' AND E.FECHA_INGRESO<=TRUNC(${ahoraSql}) AND ${audienciaSql(tipo)})`,
    );
    binds.usuario = usuario;
  }
  return { where: where.join(' AND '), binds };
}
const seleccion = (tipo: Tipo) => {
  const t = config[tipo],
    formato = tipo === 'anuncios' ? 'YYYY-MM-DD' : 'YYYY-MM-DD"T"HH24:MI';
  return `T.${t.id} "id",T.CODIGO "codigo",T.TITULO "titulo",T.${t.contenido} "contenido",TO_CHAR(T.${t.inicio},'${formato}') "inicio",TO_CHAR(T.${t.fin},'${formato}') "fin",${tipo === 'eventos' ? 'T.LUGAR' : "' '"} "lugar",T.PARA_TODOS "paraTodos",T.ACTIVO "activo",T.VERSION "version"`;
};
export async function listar(c: Connection, tipo: Tipo, q: Query, usuario: number | null) {
  const t = config[tipo],
    f = filtros(tipo, q, usuario);
  const total = (
    await c.execute<{ N: number }>(
      `SELECT COUNT(*) N FROM ${t.tabla} T WHERE ${f.where}`,
      f.binds,
      opts,
    )
  ).rows![0]!.N;
  const orden = { codigo: 'CODIGO', id: t.id, titulo: 'TITULO', inicio: t.inicio, fin: t.fin }[
    q.ordenarPor
  ];
  const registros =
    (
      await c.execute<Fila>(
        `SELECT ${seleccion(tipo)} FROM ${t.tabla} T WHERE ${f.where} ORDER BY T.${orden} ${q.direccion === 'asc' ? 'ASC' : 'DESC'},T.${t.id} DESC OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
        { ...f.binds, offset: (q.pagina - 1) * q.limite, limite: q.limite },
        opts,
      )
    ).rows ?? [];
  return { registros, total, pagina: q.pagina, limite: q.limite };
}
export async function detalle(c: Connection, tipo: Tipo, id: number, usuario: number | null) {
  const f = filtros(tipo, { pagina: 1, limite: 1, direccion: 'asc', ordenarPor: 'id' }, usuario);
  return (
    await c.execute<Fila>(
      `SELECT ${seleccion(tipo)} FROM ${config[tipo].tabla} T WHERE T.${config[tipo].id}=:id AND ${f.where}`,
      { ...f.binds, id },
      opts,
    )
  ).rows?.[0];
}
export async function destinatarios(c: Connection, tipo: Tipo, id: number) {
  const t = config[tipo];
  return (
    (
      await c.execute<Destinatario>(
        `SELECT CASE WHEN D.ID_DEPARTAMENTO IS NOT NULL THEN 'DEPARTAMENTO' WHEN D.ID_PUESTO IS NOT NULL THEN 'PUESTO' ELSE 'JEFATURA' END "tipo", COALESCE(D.ID_DEPARTAMENTO,D.ID_PUESTO,D.ID_JEFATURA) "id",COALESCE(A.NOMBRE,P.NOMBRE,J.NOMBRE) "nombre" FROM ${t.audiencia} D LEFT JOIN DEPARTAMENTOS A ON A.ID_DEPARTAMENTO=D.ID_DEPARTAMENTO LEFT JOIN PUESTOS P ON P.ID_PUESTO=D.ID_PUESTO LEFT JOIN JEFATURAS J ON J.ID_JEFATURA=D.ID_JEFATURA WHERE D.${t.id}=:id AND D.ACTIVO=1 ORDER BY "tipo","nombre"`,
        { id },
        opts,
      )
    ).rows ?? []
  );
}
export async function validarGrupos(c: Connection, d: Datos) {
  for (const grupo of d.destinatarios) {
    const [tabla, col] = grupos[grupo.tipo];
    if (
      !(await c.execute(`SELECT 1 FROM ${tabla} WHERE ${col}=:id AND ACTIVO=1`, { id: grupo.id }))
        .rows?.length
    )
      throw new ErrorConflicto('Un destinatario ya no está activo. Selecciona un grupo vigente.');
  }
}
export async function reloj(c: Connection) {
  return (
    await c.execute<{ ahora: string }>(
      `SELECT TO_CHAR(${ahoraSql},'YYYY-MM-DD"T"HH24:MI:SS') "ahora" FROM DUAL`,
      {},
      opts,
    )
  ).rows![0]!.ahora;
}
export async function guardar(c: Connection, tipo: Tipo, d: Datos, actor: number, id?: number) {
  const t = config[tipo],
    formato = tipo === 'anuncios' ? 'YYYY-MM-DD' : 'YYYY-MM-DD"T"HH24:MI';
  const binds: BindParameters = {
    titulo: d.titulo,
    contenido: { val: d.contenido, type: oracledb.CLOB },
    inicio: d.inicio,
    fin: d.fin,
    todos: d.paraTodos ? 1 : 0,
    actor,
  };
  if (tipo === 'eventos') binds.lugar = d.lugar;
  if (id) {
    const r = await c.execute(
      `UPDATE ${t.tabla} SET TITULO=:titulo,${t.contenido}=:contenido,${t.inicio}=TO_DATE(:inicio,'${formato}'),${t.fin}=TO_DATE(:fin,'${formato}'),PARA_TODOS=:todos,${tipo === 'eventos' ? 'LUGAR=:lugar,' : ''}MODIFICADO_POR=:actor,VERSION=VERSION+1 WHERE ${t.id}=:id AND VERSION=:version AND ACTIVO=1`,
      { ...binds, id, version: d.version },
    );
    if (r.rowsAffected !== 1)
      throw new ErrorConflicto('La publicación cambió o fue eliminada. Recarga antes de editar.');
  } else {
    const r = await c.execute(
      `INSERT INTO ${t.tabla} (TITULO,${t.contenido},${t.inicio},${t.fin},PARA_TODOS,${tipo === 'eventos' ? 'LUGAR,' : ''}CREADO_POR) VALUES (:titulo,:contenido,TO_DATE(:inicio,'${formato}'),TO_DATE(:fin,'${formato}'),:todos,${tipo === 'eventos' ? ':lugar,' : ''}:actor) RETURNING ${t.id} INTO :nuevo`,
      { ...binds, nuevo: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
    );
    id = (r.outBinds as { nuevo: number[] }).nuevo[0]!;
  }
  // Reemplaza únicamente relaciones de la publicación; su historia queda en auditoría.
  await c.execute(`DELETE FROM ${t.audiencia} WHERE ${t.id}=:id`, { id });
  for (const g of d.destinatarios)
    await c.execute(
      `INSERT INTO ${t.audiencia} (${t.id},${grupos[g.tipo][1]},CREADO_POR) VALUES (:id,:grupo,:actor)`,
      { id, grupo: g.id, actor },
    );
  return id;
}
export async function retirarAvisos(c: Connection, tipo: Tipo, id: number, actor: number) {
  await c.execute(
    `UPDATE NOTIFICACIONES SET ACTIVO=0,MODIFICADO_POR=:actor WHERE ${config[tipo].id}=:id AND ACTIVO=1`,
    { id, actor },
  );
}
export async function notificar(c: Connection, tipo: Tipo, id: number, actor: number) {
  const t = config[tipo];
  await retirarAvisos(c, tipo, id, actor);
  await c.execute(
    `INSERT INTO NOTIFICACIONES (ID_USUARIO,TIPO,TITULO,MENSAJE,CLAVE_EVENTO,${t.id},CREADO_POR)
    SELECT E.ID_USUARIO,:tipo,T.TITULO,:mensaje,:tipo||':'||T.${t.id}||':'||T.VERSION,T.${t.id},:actor FROM ${t.tabla} T JOIN EMPLEADOS E ON E.ACTIVO=1 AND E.ESTADO='ACTIVO' AND E.FECHA_INGRESO<=TRUNC(${ahoraSql}) JOIN USUARIOS U ON U.ID_USUARIO=E.ID_USUARIO AND U.ACTIVO=1 JOIN ROLES R ON R.ID_ROL=U.ID_ROL AND R.CODIGO='EMPLEADO' AND R.ACTIVO=1 WHERE T.${t.id}=:id AND ${audienciaSql(tipo)}`,
    {
      id,
      actor,
      tipo: t.tipo,
      mensaje:
        tipo === 'anuncios'
          ? 'RRHH publicó un anuncio. Consúltalo en Anuncios durante su vigencia.'
          : 'RRHH publicó o actualizó un evento. Revisa fecha, hora y lugar en tu agenda.',
    },
  );
}
export async function eliminar(
  c: Connection,
  tipo: Tipo,
  id: number,
  version: number,
  actor: number,
) {
  const t = config[tipo];
  const r = await c.execute(
    `UPDATE ${t.tabla} SET ACTIVO=0,VERSION=VERSION+1,MODIFICADO_POR=:actor WHERE ${t.id}=:id AND VERSION=:version AND ACTIVO=1`,
    { id, version, actor },
  );
  if (r.rowsAffected !== 1)
    throw new ErrorConflicto('La publicación cambió o ya fue eliminada. Recarga la consulta.');
  await retirarAvisos(c, tipo, id, actor);
}
