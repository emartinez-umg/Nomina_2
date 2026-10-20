import { nombrePersonaSql, nombreUsuarioSql } from '../../shared/utils/nombre.js';
import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import { ahoraSql } from '../comunicacion/comunicacion.repository.js';
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const hoy = `TRUNC(${ahoraSql})`;
const activo = `E.ACTIVO=1 AND E.ESTADO='ACTIVO' AND E.FECHA_INGRESO<=${hoy}`;
const str = (col: string) => `TO_CHAR(${col},'TM9','NLS_NUMERIC_CHARACTERS=''.,''')`;
export interface Periodo {
  id: number;
  inicio: string;
  fin: string;
  estado: string;
  version: number;
  bruto: string | null;
  neto: string | null;
  costoPatronal: string | null;
  empleados: number;
}
export async function periodo(c: Connection) {
  return (
    (
      await c.execute<Periodo>(
        `SELECT P.ID_PERIODO_NOMINA "id",TO_CHAR(P.FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(P.FECHA_FIN,'YYYY-MM-DD') "fin",P.ESTADO "estado",P.VERSION_CALCULO "version",${str('SUM(N.TOTAL_INGRESOS)')} "bruto",${str('SUM(N.NETO)')} "neto",${str('SUM(N.COSTO_PATRONAL)')} "costoPatronal",COUNT(DISTINCT N.ID_EMPLEADO) "empleados" FROM PERIODOS_NOMINA P LEFT JOIN NOMINA_EMPLEADO N ON N.ID_PERIODO_NOMINA=P.ID_PERIODO_NOMINA AND ((P.MOTOR='V0' AND N.VERSION_CALCULO=P.VERSION_CALCULO) OR (P.MOTOR='V1' AND EXISTS(SELECT 1 FROM PAGOS_NOMINA PN WHERE PN.ID_NOMINA_EMPLEADO=N.ID_NOMINA_EMPLEADO AND PN.ESTADO='PAGADO'))) AND N.ACTIVO=1 WHERE P.ACTIVO=1 AND ${hoy} BETWEEN P.FECHA_INICIO AND P.FECHA_FIN GROUP BY P.ID_PERIODO_NOMINA,P.FECHA_INICIO,P.FECHA_FIN,P.ESTADO,P.VERSION_CALCULO,P.MOTOR`,
        {},
        opts,
      )
    ).rows?.[0] ?? null
  );
}
export async function indicadoresRh(c: Connection) {
  return (
    await c.execute<{
      activos: number;
      altas: number;
      bajas: number;
      solicitudes: number;
      vacaciones: number;
    }>(
      `SELECT (SELECT COUNT(*) FROM EMPLEADOS E WHERE ${activo}) "activos",(SELECT COUNT(*) FROM EMPLEADOS WHERE FECHA_INGRESO>=TRUNC(${hoy},'MM') AND FECHA_INGRESO<=${hoy}) "altas",(SELECT COUNT(*) FROM EMPLEADOS WHERE FECHA_EGRESO>=TRUNC(${hoy},'MM') AND FECHA_EGRESO<=${hoy}) "bajas",(SELECT COUNT(*) FROM SOLICITUDES WHERE ACTIVO=1 AND ESTADO='EN_PROCESO') "solicitudes",(SELECT COUNT(*) FROM VACACIONES_SOLICITUDES WHERE ACTIVO=1 AND ESTADO='EN_PROCESO') "vacaciones" FROM DUAL`,
      {},
      opts,
    )
  ).rows![0]!;
}
export async function departamentos(c: Connection) {
  return (
    (
      await c.execute<{ nombre: string; cantidad: number }>(
        `SELECT D.NOMBRE "nombre",COUNT(*) "cantidad" FROM EMPLEADOS E JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO WHERE ${activo} GROUP BY D.ID_DEPARTAMENTO,D.NOMBRE ORDER BY "cantidad" DESC,D.NOMBRE`,
        {},
        opts,
      )
    ).rows ?? []
  );
}
export async function evolucion(c: Connection) {
  return (
    (
      await c.execute<Periodo>(
        `WITH ULTIMOS AS (SELECT ID_PERIODO_NOMINA,FECHA_INICIO,FECHA_FIN,ESTADO,VERSION_CALCULO,MOTOR FROM PERIODOS_NOMINA WHERE ACTIVO=1 AND FECHA_INICIO<=${hoy} ORDER BY FECHA_INICIO DESC FETCH FIRST 6 ROWS ONLY) SELECT P.ID_PERIODO_NOMINA "id",TO_CHAR(P.FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(P.FECHA_FIN,'YYYY-MM-DD') "fin",P.ESTADO "estado",P.VERSION_CALCULO "version",${str('SUM(N.TOTAL_INGRESOS)')} "bruto",${str('SUM(N.NETO)')} "neto",${str('SUM(N.COSTO_PATRONAL)')} "costoPatronal",COUNT(DISTINCT N.ID_EMPLEADO) "empleados" FROM ULTIMOS P LEFT JOIN NOMINA_EMPLEADO N ON N.ID_PERIODO_NOMINA=P.ID_PERIODO_NOMINA AND ((P.MOTOR='V0' AND N.VERSION_CALCULO=P.VERSION_CALCULO) OR (P.MOTOR='V1' AND EXISTS(SELECT 1 FROM PAGOS_NOMINA PN WHERE PN.ID_NOMINA_EMPLEADO=N.ID_NOMINA_EMPLEADO AND PN.ESTADO='PAGADO'))) AND N.ACTIVO=1 GROUP BY P.ID_PERIODO_NOMINA,P.FECHA_INICIO,P.FECHA_FIN,P.ESTADO,P.VERSION_CALCULO,P.MOTOR ORDER BY P.FECHA_INICIO`,
        {},
        opts,
      )
    ).rows ?? []
  );
}
// Traslada mes y día sin convertir un 28/02 en 29/02 por la regla de fin de mes de Oracle.
export function aniversarioSql(origen: string, extra = 0) {
  const mes = `ADD_MONTHS(TRUNC(${origen},'MM'),12*(EXTRACT(YEAR FROM ${hoy})-EXTRACT(YEAR FROM ${origen})+${extra}))`;
  return `(${mes}+LEAST(EXTRACT(DAY FROM ${origen}),EXTRACT(DAY FROM LAST_DAY(${mes})))-1)`;
}
export async function celebraciones(c: Connection) {
  return (
    (
      await c.execute<{ id: number; nombre: string; tipo: string; fecha: string; anios: number }>(
        `WITH BASE AS (SELECT E.ID_EMPLEADO,${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} NOMBRE,'CUMPLEANOS' TIPO,E.FECHA_NACIMIENTO ORIGEN,${aniversarioSql('E.FECHA_NACIMIENTO')} ESTE FROM EMPLEADOS E WHERE ${activo} UNION ALL SELECT E.ID_EMPLEADO,${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')},'ANIVERSARIO',E.FECHA_INGRESO,${aniversarioSql('E.FECHA_INGRESO')} FROM EMPLEADOS E WHERE ${activo}), PROXIMOS AS (SELECT B.*,CASE WHEN ESTE<${hoy} THEN ${aniversarioSql('ORIGEN', 1)} ELSE ESTE END PROXIMO FROM BASE B) SELECT ID_EMPLEADO "id",NOMBRE "nombre",TIPO "tipo",TO_CHAR(PROXIMO,'YYYY-MM-DD') "fecha",EXTRACT(YEAR FROM PROXIMO)-EXTRACT(YEAR FROM ORIGEN) "anios" FROM PROXIMOS WHERE PROXIMO<${hoy}+31 AND PROXIMO>=${hoy} AND EXTRACT(YEAR FROM PROXIMO)>EXTRACT(YEAR FROM ORIGEN) ORDER BY PROXIMO,NOMBRE,TIPO FETCH FIRST 50 ROWS ONLY`,
        {},
        opts,
      )
    ).rows ?? []
  );
}
export async function alertas(c: Connection) {
  return (
    (
      await c.execute<{ id: number; tipo: string; mensaje: string; fecha: string }>(
        `SELECT * FROM (SELECT ID_PERIODO_NOMINA "id",'PERIODO' "tipo",'Periodo sin cerrar · '||ESTADO "mensaje",TO_CHAR(FECHA_FIN,'YYYY-MM-DD') "fecha" FROM PERIODOS_NOMINA WHERE ACTIVO=1 AND ESTADO<>'CERRADO' AND FECHA_INICIO<=${hoy} UNION ALL SELECT E.ID_EMPLEADO,'CONTRATO',${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')}||CASE WHEN E.FECHA_FIN_CONTRATO<${hoy} THEN ' · Contrato vencido' ELSE ' · Contrato por vencer' END,TO_CHAR(E.FECHA_FIN_CONTRATO,'YYYY-MM-DD') FROM EMPLEADOS E WHERE ${activo} AND E.FECHA_FIN_CONTRATO<=${hoy}+30 UNION ALL SELECT E.ID_EMPLEADO,'PERFIL',${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')}||' · Perfil incompleto: falta salario base. Excluido de planilla.',TO_CHAR(E.FECHA_INGRESO,'YYYY-MM-DD') FROM EMPLEADOS E WHERE ${activo} AND NOT EXISTS(SELECT 1 FROM HISTORIAL_SALARIAL S WHERE S.ID_EMPLEADO=E.ID_EMPLEADO AND S.ACTIVO=1 AND S.VIGENTE_DESDE<=GREATEST(${hoy},E.FECHA_INGRESO) AND (S.VIGENTE_HASTA IS NULL OR S.VIGENTE_HASTA>=GREATEST(${hoy},E.FECHA_INGRESO)))) ORDER BY "fecha","tipo","id" FETCH FIRST 50 ROWS ONLY`,
        {},
        opts,
      )
    ).rows ?? []
  );
}
export async function ultimaBoleta(c: Connection, usuario: number) {
  return (
    (
      await c.execute<{ id: number; inicio: string; fin: string; bruto: string; neto: string }>(
        `SELECT N.ID_NOMINA_EMPLEADO "id",TO_CHAR(P.FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(P.FECHA_FIN,'YYYY-MM-DD') "fin",${str('N.TOTAL_INGRESOS')} "bruto",${str('N.NETO')} "neto" FROM NOMINA_EMPLEADO N JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA AND P.ACTIVO=1 AND ((P.MOTOR='V0' AND P.VERSION_CALCULO=N.VERSION_CALCULO AND P.ESTADO='CERRADO') OR (P.MOTOR='V1' AND EXISTS(SELECT 1 FROM PAGOS_NOMINA PN WHERE PN.ID_NOMINA_EMPLEADO=N.ID_NOMINA_EMPLEADO AND PN.ESTADO='PAGADO'))) JOIN EMPLEADOS E ON E.ID_EMPLEADO=N.ID_EMPLEADO AND E.ID_USUARIO=:usuario AND E.ACTIVO=1 WHERE N.ACTIVO=1 ORDER BY P.FECHA_FIN DESC FETCH FIRST 1 ROW ONLY`,
        { usuario },
        opts,
      )
    ).rows?.[0] ?? null
  );
}
export async function administracion(c: Connection) {
  const usuarios =
    (
      await c.execute<{ rol: string; total: number; activos: number }>(
        `SELECT R.CODIGO "rol",COUNT(U.ID_USUARIO) "total",NVL(SUM(U.ACTIVO),0) "activos" FROM ROLES R LEFT JOIN USUARIOS U ON U.ID_ROL=R.ID_ROL GROUP BY R.CODIGO ORDER BY R.CODIGO`,
        {},
        opts,
      )
    ).rows ?? [];
  const sesiones =
    (
      await c.execute<{ id: number; usuario: string; rol: string; fecha: string; vigente: number }>(
        `SELECT S.ID_SESION "id",${nombreUsuarioSql('U')} "usuario",R.CODIGO "rol",TO_CHAR(S.ULTIMA_ACTIVIDAD,'YYYY-MM-DD"T"HH24:MI:SS')||'-06:00' "fecha",CASE WHEN S.ACTIVO=1 AND S.REVOCADA_EN IS NULL AND S.EXPIRA_EN>${ahoraSql} AND U.ACTIVO=1 AND R.ACTIVO=1 THEN 1 ELSE 0 END "vigente" FROM SESIONES S JOIN USUARIOS U ON U.ID_USUARIO=S.ID_USUARIO JOIN ROLES R ON R.ID_ROL=U.ID_ROL ORDER BY S.ULTIMA_ACTIVIDAD DESC,S.ID_SESION DESC FETCH FIRST 10 ROWS ONLY`,
        {},
        opts,
      )
    ).rows ?? [];
  const sistema = (
    await c.execute<{
      version: number | null;
      migracionesPendientes: number;
      sesionesActivas: number;
      objetosInvalidos: number;
    }>(
      `SELECT (SELECT MAX(VERSION) FROM VERSION_ESQUEMA WHERE ESTADO='APLICADA') "version",(SELECT COUNT(*) FROM VERSION_ESQUEMA WHERE ESTADO<>'APLICADA') "migracionesPendientes",(SELECT COUNT(*) FROM SESIONES S JOIN USUARIOS U ON U.ID_USUARIO=S.ID_USUARIO JOIN ROLES R ON R.ID_ROL=U.ID_ROL WHERE S.ACTIVO=1 AND S.REVOCADA_EN IS NULL AND S.EXPIRA_EN>${ahoraSql} AND U.ACTIVO=1 AND R.ACTIVO=1) "sesionesActivas",(SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID') "objetosInvalidos" FROM DUAL`,
      {},
      opts,
    )
  ).rows![0]!;
  return {
    usuarios,
    sesiones,
    sistema: { ...sistema, baseDatos: 'CONECTADA' as const, modo: 'thin' as const },
  };
}
