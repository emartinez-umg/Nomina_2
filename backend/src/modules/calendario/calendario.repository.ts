import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { FuenteAnios } from './calendario.schemas.js';
// Fragmentos constantes de una lista blanca; ningún identificador procede del cliente.
const fuentes: Record<FuenteAnios, string> = {
  planillas: `SELECT P.FECHA_INICIO inicio,P.FECHA_FIN fin FROM PERIODOS_NOMINA P
    WHERE P.ACTIVO=1 AND (:usuario IS NULL OR EXISTS (SELECT 1 FROM NOMINA_EMPLEADO N
      JOIN EMPLEADOS E ON E.ID_EMPLEADO=N.ID_EMPLEADO WHERE N.ID_PERIODO_NOMINA=P.ID_PERIODO_NOMINA
      AND N.ACTIVO=1 AND E.ID_USUARIO=:usuario))`,
  'calculo-nomina': `SELECT GREATEST(H.VIGENTE_DESDE,E.FECHA_INGRESO) inicio,
    LEAST(NVL(H.VIGENTE_HASTA,CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)),
      NVL(E.FECHA_EGRESO,CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)),
      CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)) fin
    FROM HISTORIAL_SALARIAL H JOIN EMPLEADOS E ON E.ID_EMPLEADO=H.ID_EMPLEADO WHERE H.ACTIVO=1`,
  comisiones:
    "SELECT MES inicio,MES fin FROM NOVEDADES_MENSUALES WHERE ACTIVO=1 AND TIPO='COMISION' UNION ALL SELECT P.FECHA_INICIO,P.FECHA_FIN FROM COMISIONES C JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=C.ID_PERIODO_NOMINA WHERE C.ACTIVO=1",
  'horas-extra':
    "SELECT MES inicio,MES fin FROM NOVEDADES_MENSUALES WHERE ACTIVO=1 AND TIPO='HORAS_EXTRA' UNION ALL SELECT FECHA,FECHA FROM HORAS_EXTRA WHERE ACTIVO=1",
  'consumos-tienda':
    "SELECT MES inicio,MES fin FROM NOVEDADES_MENSUALES WHERE ACTIVO=1 AND TIPO='CONSUMO_TIENDA'",
  ausencias: 'SELECT FECHA_INICIO inicio,FECHA_FIN fin FROM AUSENCIAS WHERE ACTIVO=1',
  vacaciones: `SELECT V.FECHA_INICIO inicio,V.FECHA_FIN fin FROM VACACIONES_SOLICITUDES V
    JOIN EMPLEADOS E ON E.ID_EMPLEADO=V.ID_EMPLEADO WHERE V.ACTIVO=1 AND (:usuario IS NULL OR E.ID_USUARIO=:usuario)`,
  parqueo: `SELECT S.MES_INICIO inicio,NVL(S.MES_FIN,TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),'MM')) fin
    FROM PARQUEO_SUSCRIPCIONES S JOIN EMPLEADOS E ON E.ID_EMPLEADO=S.ID_EMPLEADO
    WHERE S.ACTIVO=1 AND (:usuario IS NULL OR E.ID_USUARIO=:usuario)`,
  novedades: 'SELECT MES inicio,MES fin FROM NOVEDADES_MENSUALES WHERE ACTIVO=1',
  'tarifas-parqueo':
    'SELECT VIGENTE_DESDE inicio,NVL(VIGENTE_HASTA,VIGENTE_DESDE) fin FROM PARQUEO_TARIFAS WHERE ACTIVO=1',
};
export async function aniosConDatos(c: Connection, fuente: FuenteAnios, usuario: number | null) {
  const sql = fuentes[fuente];
  const r = await c.execute<{ anio: number }>(
    `WITH rangos AS (${sql}),
    limites AS (SELECT MIN(EXTRACT(YEAR FROM inicio)) minimo,MAX(EXTRACT(YEAR FROM fin)) maximo FROM rangos),
    anios AS (SELECT minimo+LEVEL-1 anio FROM limites CONNECT BY LEVEL<=maximo-minimo+1)
    SELECT DISTINCT A.anio "anio" FROM anios A JOIN rangos R
      ON A.anio BETWEEN EXTRACT(YEAR FROM R.inicio) AND EXTRACT(YEAR FROM R.fin) ORDER BY A.anio`,
    sql.includes(':usuario') ? { usuario } : {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (r.rows ?? []).map((r) => r.anio);
}
