import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import { nombrePersonaSql } from '../../shared/utils/nombre.js';
import type { ColisionVacaciones, AprobacionColisiones } from './vacaciones.colisiones.js';

// V/E son la solicitud revisada y su empleado; X/O son la otra solicitud y su empleado.
// Se comparte el predicado en detalle, insignia, filtro y exportación.
const coincidencia = `X.ACTIVO=1 AND X.ESTADO IN ('APROBADA','EN_PROCESO')
  AND X.ID_EMPLEADO<>V.ID_EMPLEADO
  AND X.FECHA_INICIO<=V.FECHA_FIN AND X.FECHA_FIN>=V.FECHA_INICIO
  AND (O.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO OR
       (E.ID_CENTRO_TRABAJO IS NOT NULL AND O.ID_CENTRO_TRABAJO=E.ID_CENTRO_TRABAJO))`;
export const contarColisionesSql = `(SELECT COUNT(*) FROM VACACIONES_SOLICITUDES X
  JOIN EMPLEADOS O ON O.ID_EMPLEADO=X.ID_EMPLEADO WHERE ${coincidencia})`;

export async function buscarColisiones(c: Connection, id: number) {
  return (
    (
      await c.execute<ColisionVacaciones>(
        `SELECT X.ID_VACACIONES_SOLICITUD "idSolicitud", S.CODIGO "codigoSolicitud",
       O.ID_EMPLEADO "idEmpleado", O.CODIGO "codigo",
       ${nombrePersonaSql('O.NOMBRES', 'O.APELLIDOS')} "empleado",
       D.NOMBRE "departamento", C.NOMBRE "centro",
       TO_CHAR(X.FECHA_INICIO,'YYYY-MM-DD') "inicio", TO_CHAR(X.FECHA_FIN,'YYYY-MM-DD') "fin",
       TO_CHAR(GREATEST(V.FECHA_INICIO,X.FECHA_INICIO),'YYYY-MM-DD') "inicioCoincidencia",
       TO_CHAR(LEAST(V.FECHA_FIN,X.FECHA_FIN),'YYYY-MM-DD') "finCoincidencia",
       TRUNC(LEAST(V.FECHA_FIN,X.FECHA_FIN))-TRUNC(GREATEST(V.FECHA_INICIO,X.FECHA_INICIO))+1 "diasCoincidentes",
       X.ESTADO "estado",
       CASE WHEN O.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO AND O.ID_CENTRO_TRABAJO=E.ID_CENTRO_TRABAJO THEN 'Ambos'
            WHEN O.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO THEN 'Mismo departamento'
            ELSE 'Mismo centro de trabajo' END "tipoCoincidencia"
       FROM VACACIONES_SOLICITUDES V JOIN EMPLEADOS E ON E.ID_EMPLEADO=V.ID_EMPLEADO
       JOIN VACACIONES_SOLICITUDES X ON X.FECHA_INICIO<=V.FECHA_FIN AND X.FECHA_FIN>=V.FECHA_INICIO
       JOIN EMPLEADOS O ON O.ID_EMPLEADO=X.ID_EMPLEADO
       JOIN SOLICITUDES S ON S.ID_SOLICITUD=X.ID_SOLICITUD
       JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=O.ID_DEPARTAMENTO
       LEFT JOIN CENTROS_TRABAJO C ON C.ID_CENTRO_TRABAJO=O.ID_CENTRO_TRABAJO
       WHERE V.ID_VACACIONES_SOLICITUD=:id AND ${coincidencia}
       ORDER BY X.FECHA_INICIO,O.CODIGO,X.ID_VACACIONES_SOLICITUD`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      )
    ).rows ?? []
  );
}
export async function tamanoEquipo(c: Connection, idEmpleado: number) {
  return (
    await c.execute<{ total: number }>(
      `SELECT COUNT(*) "total" FROM EMPLEADOS O JOIN EMPLEADOS E ON E.ID_EMPLEADO=:idEmpleado
       WHERE O.ACTIVO=1 AND (O.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO OR
       (E.ID_CENTRO_TRABAJO IS NOT NULL AND O.ID_CENTRO_TRABAJO=E.ID_CENTRO_TRABAJO))`,
      { idEmpleado },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    )
  ).rows![0]!.total;
}
export async function aprobacionColisiones(c: Connection, id: number) {
  const fila = (
    await c.execute<{ copia: string | null }>(
      'SELECT COLISIONES_APROBACION "copia" FROM VACACIONES_SOLICITUDES WHERE ID_VACACIONES_SOLICITUD=:id',
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { copia: { type: oracledb.STRING } } },
    )
  ).rows?.[0];
  return fila?.copia ? (JSON.parse(fila.copia) as AprobacionColisiones) : null;
}
