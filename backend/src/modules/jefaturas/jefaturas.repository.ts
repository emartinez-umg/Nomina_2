import type { Connection } from 'oracledb';
import oracledb from 'oracledb';
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
export async function jerarquia(c: Connection) {
  return (
    (
      await c.execute<{ id: number; superior: number | null }>(
        'SELECT ID_JEFATURA "id",ID_JEFATURA_SUPERIOR "superior" FROM JEFATURAS',
        {},
        opts,
      )
    ).rows ?? []
  );
}
export async function destino(c: Connection, id: number) {
  return (
    await c.execute<{ id: number; departamento: number }>(
      `SELECT J.ID_JEFATURA "id",J.ID_DEPARTAMENTO "departamento"
    FROM JEFATURAS J WHERE J.ID_JEFATURA=:id AND J.ACTIVO=1`,
      { id },
      opts,
    )
  ).rows?.[0];
}
export async function miembro(c: Connection, id: number) {
  return (
    await c.execute<{
      id: number;
      departamento: number;
      idJefatura: number | null;
      activo: number;
      estado: string;
    }>(
      'SELECT ID_EMPLEADO "id",ID_DEPARTAMENTO "departamento",ID_JEFATURA "idJefatura",ACTIVO "activo",ESTADO "estado" FROM EMPLEADOS WHERE ID_EMPLEADO=:id FOR UPDATE',
      { id },
      opts,
    )
  ).rows?.[0];
}
export async function asignar(c: Connection, id: number, jefatura: number, actor: number) {
  await c.execute(
    'UPDATE EMPLEADOS SET ID_JEFATURA=:jefatura,MODIFICADO_POR=:actor,FECHA_MODIFICACION=SYSTIMESTAMP WHERE ID_EMPLEADO=:id',
    { id, jefatura, actor },
  );
}
export async function resumen(c: Connection) {
  return (
    await c.execute<{ total: number; sinJefatura: number; sinJefe: number }>(
      `SELECT (SELECT COUNT(*) FROM JEFATURAS) "total",
    (SELECT COUNT(*) FROM EMPLEADOS E WHERE E.ACTIVO=1 AND E.ESTADO='ACTIVO' AND NOT EXISTS (SELECT 1 FROM JEFATURAS J WHERE J.ID_JEFATURA=E.ID_JEFATURA AND J.ACTIVO=1)) "sinJefatura",
    (SELECT COUNT(*) FROM JEFATURAS J WHERE J.ACTIVO=1 AND NOT EXISTS (SELECT 1 FROM EMPLEADOS E WHERE E.ID_EMPLEADO=J.ID_EMPLEADO_RESPONSABLE AND E.ACTIVO=1 AND E.ESTADO='ACTIVO' AND E.ID_DEPARTAMENTO=J.ID_DEPARTAMENTO)) "sinJefe" FROM DUAL`,
      {},
      opts,
    )
  ).rows![0]!;
}
// Las raíces opcionales provienen de permisos resueltos en servidor, nunca de la query pública.
export async function equipo(c: Connection, idJefe: number, raices?: readonly number[]) {
  return (
    (
      await c.execute<{ id: number }>(
        `SELECT E.ID_EMPLEADO "id" FROM EMPLEADOS E WHERE E.ACTIVO=1 AND E.ESTADO='ACTIVO' AND E.ID_EMPLEADO<>:idJefe AND E.ID_JEFATURA IN (
      SELECT J.ID_JEFATURA FROM JEFATURAS J WHERE J.ACTIVO=1
      START WITH J.ACTIVO=1 AND J.ID_EMPLEADO_RESPONSABLE=:idJefe ${raices === undefined ? '' : "AND J.ID_JEFATURA IN (SELECT ID FROM JSON_TABLE(:raices,'$[*]' COLUMNS(ID NUMBER PATH '$')))"} AND EXISTS (SELECT 1 FROM EMPLEADOS R WHERE R.ID_EMPLEADO=:idJefe AND R.ACTIVO=1 AND R.ESTADO='ACTIVO' AND R.ID_DEPARTAMENTO=J.ID_DEPARTAMENTO)
      CONNECT BY NOCYCLE PRIOR J.ID_JEFATURA=J.ID_JEFATURA_SUPERIOR AND J.ACTIVO=1
    ) ORDER BY E.ID_EMPLEADO`,
        {
          idJefe,
          ...(raices === undefined
            ? {}
            : { raices: { val: JSON.stringify(raices), type: oracledb.CLOB } }),
        },
        opts,
      )
    ).rows?.map((e) => e.id) ?? []
  );
}
