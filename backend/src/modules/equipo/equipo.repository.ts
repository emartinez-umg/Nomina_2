import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import { nombrePersonaSql } from '../../shared/utils/nombre.js';
import type { PermisoEquipo, EquipoQuery } from './equipo.schemas.js';
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
export async function empleadoSesion(c: Connection, idUsuario: number) {
  return (
    await c.execute<{ id: number }>(
      `SELECT ID_EMPLEADO "id" FROM EMPLEADOS WHERE ID_USUARIO=:idUsuario AND ACTIVO=1 AND ESTADO='ACTIVO'`,
      { idUsuario },
      opts,
    )
  ).rows?.[0]?.id;
}
export async function concesiones(c: Connection, idJefe: number) {
  return (
    (
      await c.execute<{ jefatura: number; permiso: PermisoEquipo }>(
        `SELECT J.ID_JEFATURA "jefatura",P.CODIGO_PERMISO "permiso" FROM JEFATURAS J JOIN PERMISOS_JEFATURA P ON P.ID_JEFATURA=J.ID_JEFATURA AND P.ACTIVO=1 JOIN PERMISOS_EQUIPO C ON C.CODIGO=P.CODIGO_PERMISO AND C.ACTIVO=1 JOIN EMPLEADOS E ON E.ID_EMPLEADO=J.ID_EMPLEADO_RESPONSABLE AND E.ID_DEPARTAMENTO=J.ID_DEPARTAMENTO AND E.ACTIVO=1 AND E.ESTADO='ACTIVO' WHERE J.ACTIVO=1 AND E.ID_EMPLEADO=:idJefe`,
        { idJefe },
        opts,
      )
    ).rows ?? []
  );
}
export async function jefatura(c: Connection, id: number, bloquear = false) {
  return (
    await c.execute<{ id: number; nombre: string; responsable: number | null; activo: number }>(
      `SELECT ID_JEFATURA "id",NOMBRE "nombre",ID_EMPLEADO_RESPONSABLE "responsable",ACTIVO "activo" FROM JEFATURAS WHERE ID_JEFATURA=:id${bloquear ? ' FOR UPDATE' : ''}`,
      { id },
      opts,
    )
  ).rows?.[0];
}
export async function catalogoPermisos(c: Connection, id: number) {
  return (
    (
      await c.execute<{
        codigo: PermisoEquipo;
        nombre: string;
        descripcion: string;
        activo: number;
      }>(
        `SELECT C.CODIGO "codigo",C.NOMBRE "nombre",C.DESCRIPCION "descripcion",NVL(P.ACTIVO,0) "activo" FROM PERMISOS_EQUIPO C LEFT JOIN PERMISOS_JEFATURA P ON P.CODIGO_PERMISO=C.CODIGO AND P.ID_JEFATURA=:id WHERE C.ACTIVO=1 ORDER BY C.CODIGO`,
        { id },
        opts,
      )
    ).rows ?? []
  );
}
export async function guardarPermiso(
  c: Connection,
  id: number,
  permiso: PermisoEquipo,
  activo: boolean,
  actor: number,
) {
  await c.execute(
    `MERGE INTO PERMISOS_JEFATURA P USING (SELECT :id J,:permiso C FROM DUAL) D ON (P.ID_JEFATURA=D.J AND P.CODIGO_PERMISO=D.C) WHEN MATCHED THEN UPDATE SET ACTIVO=:activo,MODIFICADO_POR=:actor,FECHA_MODIFICACION=SYSTIMESTAMP WHEN NOT MATCHED THEN INSERT(ID_JEFATURA,CODIGO_PERMISO,ACTIVO,CREADO_POR) VALUES(D.J,D.C,:activo,:actor)`,
    { id, permiso, activo: activo ? 1 : 0, actor },
  );
}
export interface PersonaEquipo {
  id: number;
  codigo: string;
  nombre: string;
  puesto: string;
  departamento: string;
  centro: string | null;
  idDepartamento: number;
  idCentroTrabajo: number | null;
  idJefatura: number | null;
  jefatura: string | null;
}
// Proyección explícita: jamás lee la ficha completa, dinero, documentos ni datos personales.
export async function personas(c: Connection, ids: readonly number[], q: EquipoQuery) {
  const where = [
    "E.ACTIVO=1 AND E.ESTADO='ACTIVO'",
    "E.ID_EMPLEADO IN (SELECT ID FROM JSON_TABLE(:ids,'$[*]' COLUMNS(ID NUMBER PATH '$')))",
  ];
  const binds: oracledb.BindParameters = { ids: { val: JSON.stringify(ids), type: oracledb.CLOB } };
  for (const [k, col] of [
    ['idDepartamento', 'ID_DEPARTAMENTO'],
    ['idCentroTrabajo', 'ID_CENTRO_TRABAJO'],
    ['idJefatura', 'ID_JEFATURA'],
  ] as const)
    if (q[k]) {
      where.push(`E.${col}=:${k}`);
      binds[k] = q[k];
    }
  if (q.buscar) {
    where.push("INSTR(UPPER(E.CODIGO||' '||E.NOMBRES||' '||E.APELLIDOS),UPPER(:buscar))>0");
    binds.buscar = q.buscar;
  }
  return (
    (
      await c.execute<PersonaEquipo>(
        `SELECT E.ID_EMPLEADO "id",E.CODIGO "codigo",${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} "nombre",P.NOMBRE "puesto",D.NOMBRE "departamento",C.NOMBRE "centro",E.ID_DEPARTAMENTO "idDepartamento",E.ID_CENTRO_TRABAJO "idCentroTrabajo",E.ID_JEFATURA "idJefatura",J.NOMBRE "jefatura" FROM EMPLEADOS E JOIN PUESTOS P ON P.ID_PUESTO=E.ID_PUESTO JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO LEFT JOIN CENTROS_TRABAJO C ON C.ID_CENTRO_TRABAJO=E.ID_CENTRO_TRABAJO LEFT JOIN JEFATURAS J ON J.ID_JEFATURA=E.ID_JEFATURA WHERE ${where.join(' AND ')}`,
        binds,
        opts,
      )
    ).rows ?? []
  );
}

export async function permisosDeSesion(
  c: Connection,
  sesion: { idUsuario: number; rol: string; cambioObligatorio: boolean },
) {
  if (sesion.rol !== 'EMPLEADO' || sesion.cambioObligatorio) return [];
  const id = await empleadoSesion(c, sesion.idUsuario);
  return id ? [...new Set((await concesiones(c, id)).map((p) => p.permiso))].sort() : [];
}
