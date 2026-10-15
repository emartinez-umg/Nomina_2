import type { Connection, BindParameters } from 'oracledb';
import { filas, num } from './mensuales.repository.js';
export interface Pendiente {
  id: number | null;
  idEmpleado: number;
  tipo: string;
  mes: string;
  cantidad: string;
  monto: string | null;
  autorizacion: string;
  idSuscripcion: number | null;
  descripcion: string;
}
// Parqueo se proyecta sin escrituras al consultar. El consumidor materializa al confirmar el pago.
export async function pendientes(c: Connection, mes: string, idEmpleado?: number) {
  const binds = { mes, empleado: idEmpleado ?? null };
  return filas<Pendiente>(
    c,
    `SELECT M.ID_NOVEDAD_MENSUAL "id",M.ID_EMPLEADO "idEmpleado",M.TIPO "tipo",TO_CHAR(M.MES,'YYYY-MM') "mes",${num('M.CANTIDAD')} "cantidad",${num('M.MONTO')} "monto",M.AUTORIZACION "autorizacion",M.ID_PARQUEO_SUSCRIPCION "idSuscripcion",M.DESCRIPCION "descripcion" FROM NOVEDADES_MENSUALES M WHERE M.ACTIVO=1 AND M.ESTADO='PENDIENTE' AND M.AUTORIZACION<>'RECHAZADA' AND M.MES<=TO_DATE(:mes||'-01','YYYY-MM-DD') AND (:empleado IS NULL OR M.ID_EMPLEADO=:empleado)
 UNION ALL SELECT NULL "id",S.ID_EMPLEADO "idEmpleado",'PARQUEO' "tipo",TO_CHAR(ADD_MONTHS(S.MES_INICIO,X.N),'YYYY-MM') "mes",'1' "cantidad",${num('T.MONTO')} "monto",'APROBADA' "autorizacion",S.ID_PARQUEO_SUSCRIPCION "idSuscripcion",'Suscripción de parqueo '||NVL(S.VEHICULO,'pendiente de vehículo') "descripcion" FROM PARQUEO_SUSCRIPCIONES S CROSS JOIN (SELECT LEVEL-1 N FROM DUAL CONNECT BY LEVEL<=GREATEST(1,MONTHS_BETWEEN(TO_DATE(:mes||'-01','YYYY-MM-DD'),(SELECT MIN(MES_INICIO) FROM PARQUEO_SUSCRIPCIONES))+1)) X LEFT JOIN PARQUEO_TARIFAS T ON T.VEHICULO=S.VEHICULO AND T.ACTIVO=1 AND T.VIGENTE_DESDE<=ADD_MONTHS(S.MES_INICIO,X.N) AND (T.VIGENTE_HASTA IS NULL OR T.VIGENTE_HASTA>=ADD_MONTHS(S.MES_INICIO,X.N)) WHERE S.ACTIVO=1 AND (:empleado IS NULL OR S.ID_EMPLEADO=:empleado) AND ADD_MONTHS(S.MES_INICIO,X.N)<=TO_DATE(:mes||'-01','YYYY-MM-DD') AND (S.MES_FIN IS NULL OR ADD_MONTHS(S.MES_INICIO,X.N)<=S.MES_FIN) AND NOT EXISTS(SELECT 1 FROM NOVEDADES_MENSUALES M WHERE M.ID_PARQUEO_SUSCRIPCION=S.ID_PARQUEO_SUSCRIPCION AND M.MES=ADD_MONTHS(S.MES_INICIO,X.N)) AND NOT EXISTS(SELECT 1 FROM PERIODOS_NOMINA P WHERE P.ESTADO='CERRADO' AND P.FECHA_INICIO<=LAST_DAY(ADD_MONTHS(S.MES_INICIO,X.N)) AND P.FECHA_FIN>=ADD_MONTHS(S.MES_INICIO,X.N))`,
    binds,
  );
}
export async function empleadosResumen(
  c: Connection,
  q: {
    pagina: number;
    limite: number;
    buscar?: string | undefined;
    idDepartamento?: number | undefined;
    ordenarPor?: 'empleado' | 'departamento' | undefined;
    direccion?: 'asc' | 'desc' | undefined;
    mes: string;
  },
) {
  const binds: BindParameters = { mes: q.mes },
    condiciones = [
      'E.ACTIVO=1',
      "E.FECHA_INGRESO<=LAST_DAY(TO_DATE(:mes||'-01','YYYY-MM-DD'))",
      "(E.FECHA_EGRESO IS NULL OR E.FECHA_EGRESO>=TO_DATE(:mes||'-01','YYYY-MM-DD'))",
    ];
  if (q.buscar) {
    condiciones.push("INSTR(UPPER(E.CODIGO||' '||E.NOMBRES||' '||E.APELLIDOS),UPPER(:buscar))>0");
    binds.buscar = q.buscar;
  }
  if (q.idDepartamento) {
    condiciones.push('E.ID_DEPARTAMENTO=:departamento');
    binds.departamento = q.idDepartamento;
  }
  const from = `EMPLEADOS E JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO WHERE ${condiciones.join(' AND ')}`;
  const total = (
    await filas<{ total: number }>(c, `SELECT COUNT(*) "total" FROM ${from}`, binds)
  )[0]!.total;
  const orden = q.ordenarPor === 'empleado' ? 'E.NOMBRES' : 'D.NOMBRE';
  const registros = await filas<{
    id: number;
    empleado: string;
    idDepartamento: number;
    departamento: string;
  }>(
    c,
    `SELECT E.ID_EMPLEADO "id",E.CODIGO||' · '||E.NOMBRES||' '||E.APELLIDOS "empleado",D.ID_DEPARTAMENTO "idDepartamento",D.NOMBRE "departamento" FROM ${from} ORDER BY ${orden} ${q.direccion === 'desc' ? 'DESC' : 'ASC'},E.NOMBRES,E.ID_EMPLEADO OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
    { ...binds, offset: (q.pagina - 1) * q.limite, limite: q.limite },
  );
  return { registros, total, pagina: q.pagina, limite: q.limite };
}
