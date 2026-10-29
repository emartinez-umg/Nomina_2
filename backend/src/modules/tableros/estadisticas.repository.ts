import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import { nombrePersonaSql } from '../../shared/utils/nombre.js';
import type { QueryVacacionesTablero } from './tableros.schemas.js';
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const fecha = (bind: string) => `TO_DATE(:${bind},'YYYY-MM-DD')`;
const numeroTexto = (col: string) => `TO_CHAR(${col},'TM9','NLS_NUMERIC_CHARACTERS=''.,''')`;
export interface Inasistencia {
  id: number;
  nombre: string;
  IGSS_JUSTIFICADA: string;
  JUSTIFICADA_CON_GOCE: string;
  JUSTIFICADA_SIN_GOCE: string;
  SIN_JUSTIFICAR: string;
  total: string;
}
export function inasistenciasSql(agrupar: 'empleado' | 'departamento') {
  const dep = agrupar === 'departamento';
  return `WITH BASE AS (
    SELECT ${dep ? 'D.ID_DEPARTAMENTO' : 'E.ID_EMPLEADO'} ID,${dep ? 'D.NOMBRE' : nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} NOMBRE,T.CATEGORIA_INASISTENCIA CATEGORIA,
    A.DIAS*(LEAST(A.FECHA_FIN,${fecha('fin')})-GREATEST(A.FECHA_INICIO,${fecha('inicio')})+1)/(A.FECHA_FIN-A.FECHA_INICIO+1) DIAS
    FROM AUSENCIAS A JOIN TIPOS_AUSENCIA T ON T.ID_TIPO_AUSENCIA=A.ID_TIPO_AUSENCIA JOIN EMPLEADOS E ON E.ID_EMPLEADO=A.ID_EMPLEADO JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO
    WHERE A.ACTIVO=1 AND A.ESTADO='APROBADA' AND A.FECHA_FIN>=${fecha('inicio')} AND A.FECHA_INICIO<=${fecha('fin')}
  ), SUMAS AS (
    SELECT ID,MIN(NOMBRE) NOMBRE,
    SUM(CASE WHEN CATEGORIA='IGSS_JUSTIFICADA' THEN DIAS ELSE 0 END) IGSS,
    SUM(CASE WHEN CATEGORIA='JUSTIFICADA_CON_GOCE' THEN DIAS ELSE 0 END) GOCE,
    SUM(CASE WHEN CATEGORIA='JUSTIFICADA_SIN_GOCE' THEN DIAS ELSE 0 END) SIN_GOCE,
    SUM(CASE WHEN CATEGORIA='SIN_JUSTIFICAR' THEN DIAS ELSE 0 END) INJUSTIFICADA
    FROM BASE GROUP BY ID
  ) SELECT ID "id",NOMBRE "nombre",${numeroTexto('IGSS')} "IGSS_JUSTIFICADA",${numeroTexto('GOCE')} "JUSTIFICADA_CON_GOCE",${numeroTexto('SIN_GOCE')} "JUSTIFICADA_SIN_GOCE",${numeroTexto('INJUSTIFICADA')} "SIN_JUSTIFICAR",${numeroTexto('IGSS+GOCE+SIN_GOCE+INJUSTIFICADA')} "total",
  ${numeroTexto('SUM(IGSS) OVER()')} "totalIgss",${numeroTexto('SUM(GOCE) OVER()')} "totalGoce",${numeroTexto('SUM(SIN_GOCE) OVER()')} "totalSinGoce",${numeroTexto('SUM(INJUSTIFICADA) OVER()')} "totalInjustificada"
  FROM SUMAS ORDER BY IGSS+GOCE+SIN_GOCE+INJUSTIFICADA DESC,ID FETCH FIRST 5 ROWS ONLY`;
}
export async function inasistencias(
  c: Connection,
  agrupar: 'empleado' | 'departamento',
  rango: { inicio: string; fin: string },
) {
  return (
    (
      await c.execute<
        Inasistencia & {
          totalIgss: string;
          totalGoce: string;
          totalSinGoce: string;
          totalInjustificada: string;
        }
      >(inasistenciasSql(agrupar), rango, opts)
    ).rows ?? []
  );
}
export const vacacionesBaseSql = `WITH BASE AS (
  SELECT V.*,E.CODIGO,${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} NOMBRE,E.ID_CENTRO_TRABAJO,
  CASE WHEN V.FECHA_INICIO<=${fecha('hoy')} THEN 'EN_CURSO' ELSE 'PROXIMAS' END GRUPO
  FROM VACACIONES_SOLICITUDES V JOIN EMPLEADOS E ON E.ID_EMPLEADO=V.ID_EMPLEADO
  WHERE V.ACTIVO=1 AND V.ESTADO IN ('APROBADA','TOMADA') AND V.FECHA_FIN>=${fecha('hoy')} AND V.FECHA_INICIO<=${fecha('hoy')}+:dias
  AND E.ACTIVO=1 AND E.ESTADO='ACTIVO' AND E.FECHA_INGRESO<=${fecha('hoy')} AND (E.FECHA_EGRESO IS NULL OR E.FECHA_EGRESO>=${fecha('hoy')})
)`;
export const vacacionesConteoSql = `${vacacionesBaseSql}
SELECT COUNT(CASE WHEN GRUPO='EN_CURSO' THEN 1 END) "totalEnCurso",COUNT(CASE WHEN GRUPO='PROXIMAS' THEN 1 END) "totalProximas",
COUNT(DISTINCT CASE WHEN GRUPO='EN_CURSO' AND EXISTS (
  SELECT 1 FROM EMPLEADO_HORARIO EH JOIN HORARIO_BLOQUES HB ON HB.ID_HORARIO=EH.ID_HORARIO AND HB.ACTIVO=1 JOIN HORARIO_BLOQUE_DIAS HD ON HD.ID_HORARIO_BLOQUE=HB.ID_HORARIO_BLOQUE AND HD.ACTIVO=1
  WHERE EH.ID_EMPLEADO=B.ID_EMPLEADO AND EH.ACTIVO=1 AND EH.VIGENTE_DESDE<=${fecha('hoy')} AND (EH.VIGENTE_HASTA IS NULL OR EH.VIGENTE_HASTA>=${fecha('hoy')})
  AND HD.DIA_SEMANA=${fecha('hoy')}-TRUNC(${fecha('hoy')},'IW')+1
) AND NOT EXISTS (SELECT 1 FROM FERIADOS F JOIN CENTROS_TRABAJO CT ON CT.ID_CENTRO_TRABAJO=B.ID_CENTRO_TRABAJO WHERE F.ACTIVO=1 AND F.FECHA=${fecha('hoy')} AND (F.AMBITO='NACIONAL' OR F.LOCALIDAD=CT.LOCALIDAD)) THEN ID_EMPLEADO END) "ausentesHoy" FROM BASE B`;
export interface VacacionTablero {
  id: number;
  idEmpleado: number;
  codigo: string;
  nombre: string;
  inicio: string;
  fin: string;
  diasLaborales: string;
  grupo: 'EN_CURSO' | 'PROXIMAS';
}
export async function vacaciones(c: Connection, q: QueryVacacionesTablero, hoy: string) {
  const binds = { hoy, dias: q.dias };
  const conteo = (
    await c.execute<{ totalEnCurso: number; totalProximas: number; ausentesHoy: number }>(
      vacacionesConteoSql,
      binds,
      opts,
    )
  ).rows![0]!;
  const filas =
    (
      await c.execute<VacacionTablero>(
        `${vacacionesBaseSql}, ORDENADOS AS (SELECT B.*,ROW_NUMBER() OVER(PARTITION BY GRUPO ORDER BY FECHA_INICIO,ID_VACACIONES_SOLICITUD) RN FROM BASE B)
    SELECT ID_VACACIONES_SOLICITUD "id",ID_EMPLEADO "idEmpleado",CODIGO "codigo",NOMBRE "nombre",TO_CHAR(FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(FECHA_FIN,'YYYY-MM-DD') "fin",${numeroTexto('DIAS_SOLICITADOS')} "diasLaborales",GRUPO "grupo" FROM ORDENADOS WHERE RN>:offset AND RN<=:offset+:limite ORDER BY GRUPO,RN`,
        { ...binds, offset: (q.pagina - 1) * q.limite, limite: q.limite },
        opts,
      )
    ).rows ?? [];
  return { ...conteo, filas };
}
// Calendario de 31 fechas (hoy y 30 días siguientes), sin depender de NLS ni de ADD_MONTHS sobre el día natal.
export const celebracionesSql = `WITH DIAS AS (SELECT CAST(${fecha('hoy')}+LEVEL-1 AS DATE) FECHA FROM DUAL CONNECT BY LEVEL<=31), CELEBRACIONES AS (
  SELECT E.ID_EMPLEADO,E.CODIGO,${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} NOMBRE,'CUMPLEANOS' TIPO,D.FECHA,CAST(NULL AS NUMBER) ANIOS
  FROM DIAS D JOIN EMPLEADOS E ON (TO_CHAR(E.FECHA_NACIMIENTO,'MM-DD')=TO_CHAR(D.FECHA,'MM-DD') OR (TO_CHAR(D.FECHA,'MM-DD')='02-28' AND TO_CHAR(D.FECHA+1,'MM-DD')='03-01' AND TO_CHAR(E.FECHA_NACIMIENTO,'MM-DD')='02-29'))
  WHERE E.ACTIVO=1 AND E.ESTADO='ACTIVO' AND E.FECHA_INGRESO<=${fecha('hoy')} AND (E.FECHA_EGRESO IS NULL OR E.FECHA_EGRESO>=D.FECHA)
  UNION ALL
  SELECT E.ID_EMPLEADO,E.CODIGO,${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')},'ANIVERSARIO',D.FECHA,EXTRACT(YEAR FROM D.FECHA)-EXTRACT(YEAR FROM E.FECHA_INGRESO)
  FROM DIAS D JOIN EMPLEADOS E ON (TO_CHAR(E.FECHA_INGRESO,'MM-DD')=TO_CHAR(D.FECHA,'MM-DD') OR (TO_CHAR(D.FECHA,'MM-DD')='02-28' AND TO_CHAR(D.FECHA+1,'MM-DD')='03-01' AND TO_CHAR(E.FECHA_INGRESO,'MM-DD')='02-29'))
  WHERE E.ACTIVO=1 AND E.ESTADO='ACTIVO' AND E.FECHA_INGRESO<=${fecha('hoy')} AND (E.FECHA_EGRESO IS NULL OR E.FECHA_EGRESO>=D.FECHA) AND EXTRACT(YEAR FROM D.FECHA)>EXTRACT(YEAR FROM E.FECHA_INGRESO)
) SELECT ID_EMPLEADO "idEmpleado",CODIGO "codigo",NOMBRE "nombre",TIPO "tipo",TO_CHAR(FECHA,'YYYY-MM-DD') "fecha",ANIOS "anios",CASE WHEN FECHA=${fecha('hoy')} THEN 1 ELSE 0 END "esHoy" FROM CELEBRACIONES ORDER BY FECHA,ID_EMPLEADO,TIPO`;
export async function celebraciones(c: Connection, hoy: string) {
  return (
    (
      await c.execute<{
        idEmpleado: number;
        codigo: string;
        nombre: string;
        tipo: 'CUMPLEANOS' | 'ANIVERSARIO';
        fecha: string;
        anios: number | null;
        esHoy: number;
      }>(celebracionesSql, { hoy }, opts)
    ).rows ?? []
  );
}
