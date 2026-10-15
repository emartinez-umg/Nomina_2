import oracledb from 'oracledb';
import type { Connection } from 'oracledb';

export interface DepartamentoGt {
  id: number;
  codigo: string;
  nombre: string;
}
export interface MunicipioGt extends DepartamentoGt {
  idDepartamentoGt: number;
  departamento: string;
}
const opciones = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const normalizar = (columna: string) => `TRANSLATE(UPPER(${columna}),'ÁÉÍÓÚÜÑ','AEIOUUN')`;
export async function departamentos(c: Connection, buscar: string) {
  const r = await c.execute<DepartamentoGt>(
    `SELECT ID_DEPARTAMENTO_GT "id",CODIGO_INE "codigo",NOMBRE "nombre" FROM DEPARTAMENTOS_GT
     WHERE ACTIVO=1 AND (:buscar IS NULL OR INSTR(${normalizar('NOMBRE')},${normalizar(':buscar')})>0)
     ORDER BY NOMBRE,ID_DEPARTAMENTO_GT`,
    { buscar: buscar || null },
    opciones,
  );
  return r.rows ?? [];
}
export async function municipios(c: Connection, buscar: string, idDepartamentoGt?: number) {
  const r = await c.execute<MunicipioGt>(
    `SELECT M.ID_MUNICIPIO_GT "id",M.CODIGO_INE "codigo",M.NOMBRE "nombre",
     M.ID_DEPARTAMENTO_GT "idDepartamentoGt",D.NOMBRE "departamento"
     FROM MUNICIPIOS_GT M JOIN DEPARTAMENTOS_GT D ON D.ID_DEPARTAMENTO_GT=M.ID_DEPARTAMENTO_GT
     WHERE M.ACTIVO=1 AND D.ACTIVO=1 AND (:departamento IS NULL OR M.ID_DEPARTAMENTO_GT=:departamento)
     AND (:buscar IS NULL OR INSTR(${normalizar('M.NOMBRE')},${normalizar(':buscar')})>0)
     ORDER BY M.NOMBRE,M.ID_MUNICIPIO_GT`,
    { buscar: buscar || null, departamento: idDepartamentoGt ?? null },
    opciones,
  );
  return r.rows ?? [];
}
export async function municipio(c: Connection, id: number) {
  const r = await c.execute<MunicipioGt>(
    `SELECT M.ID_MUNICIPIO_GT "id",M.CODIGO_INE "codigo",M.NOMBRE "nombre",
     M.ID_DEPARTAMENTO_GT "idDepartamentoGt",D.NOMBRE "departamento"
     FROM MUNICIPIOS_GT M JOIN DEPARTAMENTOS_GT D ON D.ID_DEPARTAMENTO_GT=M.ID_DEPARTAMENTO_GT
     WHERE M.ID_MUNICIPIO_GT=:id AND M.ACTIVO=1 AND D.ACTIVO=1`,
    { id },
    opciones,
  );
  return r.rows?.[0] ?? null;
}
