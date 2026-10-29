import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import { nombrePersonaSql } from '../../shared/utils/nombre.js';
import type { SaldosQuery } from './vacaciones.saldos.schemas.js';
import type { Movimiento } from './vacaciones.reglas.js';
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
export interface EmpleadoSaldo {
  id: number;
  codigo: string;
  nombre: string;
  departamento: string;
  centro: string | null;
  jefatura: string | null;
  ingreso: string;
  egreso: string | null;
  activo: boolean;
}
export async function empleados(c: Connection, q: SaldosQuery, alcance?: readonly number[]) {
  const where = ['1=1'];
  const binds: oracledb.BindParameters = {};
  for (const [campo, columna] of [
    ['idDepartamento', 'ID_DEPARTAMENTO'],
    ['idCentroTrabajo', 'ID_CENTRO_TRABAJO'],
    ['idJefatura', 'ID_JEFATURA'],
  ] as const) {
    if (q[campo]) {
      where.push(`E.${columna}=:${campo}`);
      binds[campo] = q[campo];
    }
  }
  if (q.activos !== 'todos')
    where.push(
      q.activos === 'true'
        ? "E.ACTIVO=1 AND E.ESTADO='ACTIVO'"
        : "(E.ACTIVO=0 OR E.ESTADO<>'ACTIVO')",
    );
  if (q.buscar) {
    where.push("INSTR(UPPER(E.CODIGO||' '||E.NOMBRES||' '||E.APELLIDOS),UPPER(:buscar))>0");
    binds.buscar = q.buscar;
  }
  // La lista se resuelve desde la sesión en el servicio; nunca viene de la query pública.
  if (alcance !== undefined) {
    where.push(
      "E.ID_EMPLEADO IN (SELECT ID FROM JSON_TABLE(:alcance,'$[*]' COLUMNS(ID NUMBER PATH '$')))",
    );
    binds.alcance = { val: JSON.stringify(alcance), type: oracledb.CLOB };
  }
  return (
    (
      await c.execute<Omit<EmpleadoSaldo, 'activo'> & { activo: number }>(
        `SELECT E.ID_EMPLEADO "id",E.CODIGO "codigo",${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} "nombre",D.NOMBRE "departamento",C.NOMBRE "centro",J.NOMBRE "jefatura",TO_CHAR(E.FECHA_INGRESO,'YYYY-MM-DD') "ingreso",TO_CHAR(E.FECHA_EGRESO,'YYYY-MM-DD') "egreso",CASE WHEN E.ACTIVO=1 AND E.ESTADO='ACTIVO' THEN 1 ELSE 0 END "activo" FROM EMPLEADOS E JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO LEFT JOIN CENTROS_TRABAJO C ON C.ID_CENTRO_TRABAJO=E.ID_CENTRO_TRABAJO LEFT JOIN JEFATURAS J ON J.ID_JEFATURA=E.ID_JEFATURA WHERE ${where.join(' AND ')} ORDER BY E.ID_EMPLEADO`,
        binds,
        opts,
      )
    ).rows?.map((e) => ({ ...e, activo: e.activo === 1 })) ?? []
  );
}
export async function movimientosLote(c: Connection, ids: readonly number[]) {
  if (!ids.length) return [];
  return (
    (
      await c.execute<Movimiento & { idEmpleado: number }>(
        `SELECT M.ID_EMPLEADO "idEmpleado",TO_CHAR(M.FECHA,'YYYY-MM-DD') "fecha",M.TIPO "tipo",TO_CHAR(M.DIAS,'TM9','NLS_NUMERIC_CHARACTERS=''.,''') "dias",M.CLAVE_ORIGEN "clave" FROM VACACIONES_MOVIMIENTOS M WHERE M.ACTIVO=1 AND M.ID_EMPLEADO IN (SELECT ID FROM JSON_TABLE(:ids,'$[*]' COLUMNS(ID NUMBER PATH '$'))) ORDER BY M.ID_EMPLEADO,M.FECHA,M.ID_VACACIONES_MOVIMIENTO`,
        { ids: { val: JSON.stringify(ids), type: oracledb.CLOB } },
        opts,
      )
    ).rows ?? []
  );
}
export async function umbral(c: Connection, corte: string) {
  return (
    (
      await c.execute<{ id: number; valor: string }>(
        `SELECT ID_PARAMETRO_LEGAL "id",TO_CHAR(VALOR,'TM9','NLS_NUMERIC_CHARACTERS=''.,''') "valor" FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA='VACACIONES_ALERTA_DIAS' AND UNIDAD='DIAS' AND ACTIVO=1 AND VIGENTE_DESDE<=TO_DATE(:corte,'YYYY-MM-DD') AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TO_DATE(:corte,'YYYY-MM-DD'))`,
        { corte },
        opts,
      )
    ).rows ?? []
  );
}
