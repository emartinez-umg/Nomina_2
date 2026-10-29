import oracledb from 'oracledb';
import type { Connection, BindParameters } from 'oracledb';
import { nombrePersonaSql } from '../../shared/utils/nombre.js';
import type { ComisionesQuery, ComisionesHistorial } from './comisiones.schemas.js';
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const numero = (col: string) => `TO_CHAR(${col},'TM9','NLS_NUMERIC_CHARACTERS=''.,''')`;
export interface VendedorComision {
  idEmpleado: number;
  codigo: string;
  nombre: string;
  puesto: string;
  idDepartamento: number;
  departamento: string;
  centro: string | null;
}
export interface MesVendedor extends VendedorComision {
  mes: string;
  total: string;
  cantidad: number;
}
const persona = `E.ID_EMPLEADO "idEmpleado",E.CODIGO "codigo",${nombrePersonaSql('E.NOMBRES', 'E.APELLIDOS')} "nombre",P.NOMBRE "puesto",E.ID_DEPARTAMENTO "idDepartamento",D.NOMBRE "departamento",C.NOMBRE "centro"`;
const organizacion = `EMPLEADOS E JOIN PUESTOS P ON P.ID_PUESTO=E.ID_PUESTO
  JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO
  LEFT JOIN CENTROS_TRABAJO C ON C.ID_CENTRO_TRABAJO=E.ID_CENTRO_TRABAJO`;
const idsJson = (valor: readonly number[]) => ({ val: JSON.stringify(valor), type: oracledb.CLOB });

// V027 ya migró las comisiones v0 al libro mensual. No sumar los respaldos COMISIONES.
export function filtroComisiones(q: ComisionesQuery, alcance?: readonly number[]) {
  const condiciones = [
    "M.TIPO='COMISION'",
    'M.ACTIVO=1',
    "M.AUTORIZACION='APROBADA'",
    "M.MES>=TO_DATE(:desde||'-01','YYYY-MM-DD')",
    "M.MES<ADD_MONTHS(TO_DATE(:hasta||'-01','YYYY-MM-DD'),1)",
  ];
  const binds: BindParameters = { desde: q.desde, hasta: q.hasta };
  if (q.estado !== 'todas') {
    condiciones.push('M.ESTADO=:estado');
    binds.estado = q.estado === 'pendientes' ? 'PENDIENTE' : 'APLICADA';
  }
  if (q.idDepartamento) {
    condiciones.push('E.ID_DEPARTAMENTO=:departamento');
    binds.departamento = q.idDepartamento;
  }
  if (q.vendedores) {
    // La igualdad permite estimar correctamente el historial individual y usar su índice.
    if (q.vendedores.length === 1) {
      condiciones.push('M.ID_EMPLEADO=:vendedor');
      binds.vendedor = q.vendedores[0]!;
    } else {
      condiciones.push(
        "M.ID_EMPLEADO IN (SELECT ID FROM JSON_TABLE(:vendedores,'$[*]' COLUMNS(ID NUMBER PATH '$')))",
      );
      binds.vendedores = idsJson(q.vendedores);
    }
  }
  if (alcance !== undefined) {
    condiciones.push(
      "M.ID_EMPLEADO IN (SELECT ID FROM JSON_TABLE(:alcance,'$[*]' COLUMNS(ID NUMBER PATH '$')))",
    );
    binds.alcance = idsJson(alcance);
  }
  return { where: condiciones.join(' AND '), binds };
}
export function consultaComisiones(q: ComisionesQuery, alcance?: readonly number[]) {
  const { where, binds } = filtroComisiones(q, alcance);
  return {
    sql: `SELECT ${persona},TO_CHAR(M.MES,'YYYY-MM') "mes",${numero('SUM(M.MONTO)')} "total",COUNT(*) "cantidad"
      FROM ${organizacion} JOIN NOVEDADES_MENSUALES M ON E.ID_EMPLEADO=M.ID_EMPLEADO
      WHERE ${where} GROUP BY E.ID_EMPLEADO,E.CODIGO,E.NOMBRES,E.APELLIDOS,P.NOMBRE,E.ID_DEPARTAMENTO,D.NOMBRE,C.NOMBRE,M.MES
      ORDER BY M.MES,E.ID_EMPLEADO`,
    binds,
  };
}
export async function mesesVendedores(
  c: Connection,
  q: ComisionesQuery,
  alcance?: readonly number[],
) {
  const { sql, binds } = consultaComisiones(q, alcance);
  return (await c.execute<MesVendedor>(sql, binds, opts)).rows ?? [];
}
export async function vendedor(c: Connection, id: number) {
  return (
    await c.execute<VendedorComision>(
      `SELECT ${persona} FROM ${organizacion} WHERE E.ID_EMPLEADO=:id`,
      { id },
      opts,
    )
  ).rows?.[0];
}
export async function validarFiltros(
  c: Connection,
  q: ComisionesQuery,
  alcance?: readonly number[],
) {
  const binds: BindParameters = {};
  const consultas: string[] = [];
  if (q.idDepartamento) {
    consultas.push(
      'SELECT COUNT(*) "cantidad" FROM DEPARTAMENTOS WHERE ID_DEPARTAMENTO=:departamento',
    );
    binds.departamento = q.idDepartamento;
  }
  if (q.vendedores) {
    consultas.push(
      "SELECT COUNT(*) \"cantidad\" FROM EMPLEADOS WHERE ID_EMPLEADO IN (SELECT ID FROM JSON_TABLE(:vendedores,'$[*]' COLUMNS(ID NUMBER PATH '$')))",
    );
    binds.vendedores = idsJson(q.vendedores);
  }
  if (!consultas.length) return true;
  const r = (await c.execute<{ cantidad: number }>(consultas.join(' UNION ALL '), binds, opts))
    .rows!;
  if (q.idDepartamento && r.shift()!.cantidad !== 1) return false;
  if (q.vendedores && r.shift()!.cantidad !== q.vendedores.length) return false;
  if (q.idDepartamento && alcance !== undefined) {
    const r = await c.execute<{ cantidad: number }>(
      "SELECT COUNT(*) \"cantidad\" FROM EMPLEADOS WHERE ID_DEPARTAMENTO=:departamento AND ID_EMPLEADO IN (SELECT ID FROM JSON_TABLE(:alcance,'$[*]' COLUMNS(ID NUMBER PATH '$')))",
      { departamento: q.idDepartamento, alcance: idsJson(alcance) },
      opts,
    );
    return r.rows![0]!.cantidad > 0;
  }
  return true;
}
export async function detalleComisiones(
  c: Connection,
  id: number,
  q: ComisionesHistorial,
  alcance?: readonly number[],
) {
  const { where, binds } = filtroComisiones({ ...q, vendedores: [id] }, alcance);
  const from = `NOVEDADES_MENSUALES M JOIN EMPLEADOS E ON E.ID_EMPLEADO=M.ID_EMPLEADO WHERE ${where}`;
  const total = (
    await c.execute<{ total: number }>(`SELECT COUNT(*) "total" FROM ${from}`, binds, opts)
  ).rows![0]!.total;
  const registros =
    (
      await c.execute<{
        id: number;
        mes: string;
        monto: string;
        descripcion: string;
        referencia: string | null;
        estado: string;
      }>(
        `SELECT M.ID_NOVEDAD_MENSUAL "id",TO_CHAR(M.MES,'YYYY-MM') "mes",${numero('M.MONTO')} "monto",M.DESCRIPCION "descripcion",M.REFERENCIA "referencia",M.ESTADO "estado"
    FROM ${from} ORDER BY M.MES DESC,M.ID_NOVEDAD_MENSUAL DESC OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
        { ...binds, offset: (q.pagina - 1) * q.limite, limite: q.limite },
        opts,
      )
    ).rows ?? [];
  return { registros, total, pagina: q.pagina, limite: q.limite };
}
