import { createHash } from 'node:crypto';
import type { Connection } from 'oracledb';
import { filas, escalar, huella, propiedades, tablas } from './repository.js';
import type { Dataset } from './datos.js';
import { catalogos } from '../../../modules/catalogos/catalogos.definiciones.js';

export const colecciones = {
  departamentos: 'DEPARTAMENTOS',
  puestos: 'PUESTOS',
  centros: 'CENTROS_TRABAJO',
  horarios: 'HORARIOS',
  bancos: 'BANCOS',
} as const;
export async function cobertura(c: Connection, d: Dataset) {
  const resultado = [];
  for (const [coleccion, tabla] of Object.entries(colecciones) as [
    keyof typeof colecciones,
    (typeof colecciones)[keyof typeof colecciones],
  ][]) {
    const origen = JSON.stringify(d[coleccion].map(({ clave, nombre }) => ({ clave, nombre })));
    const pk = tablas[tabla];
    resultado.push({
      coleccion,
      tabla,
      esperados: d[coleccion].length,
      total: await escalar(c, `SELECT COUNT(*) FROM ${tabla}`),
      registros: await filas<{
        CLAVE: string;
        ID: number | null;
        ACTIVO: number | null;
        CODIGO: string | null;
      }>(
        c,
        `SELECT O.CLAVE,T.${pk} ID,T.ACTIVO,T.CODIGO FROM JSON_TABLE(:origen,'$[*]' COLUMNS(CLAVE VARCHAR2(100) PATH '$.clave',NOMBRE VARCHAR2(200) PATH '$.nombre')) O LEFT JOIN ${tabla} T ON T.NOMBRE_NORMALIZADO=N2_NOMBRE_NORMALIZADO(O.NOMBRE) ORDER BY O.CLAVE`,
        { origen },
      ),
      catalogo: catalogos.find((t) => t.tabla === tabla)!,
    });
  }
  return resultado;
}
export interface FilaEmpleado {
  CLAVE: string;
  ID: number | null;
  USUARIO_ID: number | null;
  USUARIO: string | null;
  HASH: string | null;
  CAMBIO: number | null;
  ROL: string | null;
  USUARIO_ACTIVO: number | null;
  CORREO_USUARIO: string | null;
  SALARIOS: number;
  HORARIOS: number;
  UBICACION: number;
  CODIGO_RESERVADO: number;
  CONTADOR: number | null;
  REQUIERE_FIN: number | null;
}
export function empleadosVerificacion(c: Connection, d: Dataset) {
  return filas<FilaEmpleado>(
    c,
    `SELECT O.CLAVE,E.ID_EMPLEADO ID,U.ID_USUARIO USUARIO_ID,U.USUARIO,U.CONTRASENA_HASH HASH,U.CAMBIO_OBLIGATORIO CAMBIO,R.CODIGO ROL,U.ACTIVO USUARIO_ACTIVO,U.CORREO CORREO_USUARIO,
    (SELECT COUNT(*) FROM HISTORIAL_SALARIAL H WHERE H.ID_EMPLEADO=E.ID_EMPLEADO AND H.ACTIVO=1 AND H.VIGENTE_DESDE<=GREATEST(TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)),E.FECHA_INGRESO) AND (H.VIGENTE_HASTA IS NULL OR H.VIGENTE_HASTA>=GREATEST(TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)),E.FECHA_INGRESO))) SALARIOS,
    (SELECT COUNT(*) FROM EMPLEADO_HORARIO H WHERE H.ID_EMPLEADO=E.ID_EMPLEADO AND H.ACTIVO=1 AND H.VIGENTE_DESDE<=GREATEST(TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)),E.FECHA_INGRESO) AND (H.VIGENTE_HASTA IS NULL OR H.VIGENTE_HASTA>=GREATEST(TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)),E.FECHA_INGRESO))) HORARIOS,
    (SELECT COUNT(*) FROM MUNICIPIOS_GT M JOIN DEPARTAMENTOS_GT D ON D.ID_DEPARTAMENTO_GT=M.ID_DEPARTAMENTO_GT WHERE M.ID_MUNICIPIO_GT=E.ID_MUNICIPIO_GT AND D.ID_DEPARTAMENTO_GT=E.ID_DEPARTAMENTO_GT AND M.ACTIVO=1 AND D.ACTIVO=1) UBICACION,
    (SELECT COUNT(*) FROM REGISTRO_CODIGOS C WHERE C.ENTIDAD='empleados' AND C.CODIGO=E.CODIGO) CODIGO_RESERVADO,
    (SELECT S.ULTIMO_NUMERO FROM SECUENCIAS_CODIGOS S JOIN DEPARTAMENTOS D ON S.AMBITO=TO_CHAR(D.ID_DEPARTAMENTO,'TM9') WHERE S.ENTIDAD='empleados' AND D.CODIGO=REGEXP_SUBSTR(E.CODIGO,'^EMP_(.+)_[0-9]+$',1,1,NULL,1)) CONTADOR,
    T.REQUIERE_FECHA_FIN REQUIERE_FIN
    FROM JSON_TABLE(:origen,'$[*]' COLUMNS(CLAVE VARCHAR2(100) PATH '$.clave',CORREO VARCHAR2(254) PATH '$.correo')) O
    LEFT JOIN EMPLEADOS E ON E.CORREO=O.CORREO LEFT JOIN USUARIOS U ON U.ID_USUARIO=E.ID_USUARIO
    LEFT JOIN ROLES R ON R.ID_ROL=U.ID_ROL AND R.ACTIVO=1 LEFT JOIN TIPOS_CONTRATO T ON T.ID_TIPO_CONTRATO=E.ID_TIPO_CONTRATO
    ORDER BY O.CLAVE`,
    { origen: JSON.stringify(d.empleados.map(({ clave, correo }) => ({ clave, correo }))) },
  );
}
export async function duplicados(c: Connection) {
  const r: Record<string, number> = {};
  for (const [tabla, col] of [
    ['EMPLEADOS', 'DPI'],
    ['EMPLEADOS', 'NIT'],
    ['EMPLEADOS', 'AFILIACION_IGSS'],
    ['EMPLEADOS', 'CORREO'],
    ['USUARIOS', 'USUARIO'],
    ['USUARIOS', 'CORREO'],
  ] as const)
    r[`${tabla}.${col}`] = await escalar(
      c,
      `SELECT COUNT(*) FROM (SELECT ${col} FROM ${tabla} WHERE ${col} IS NOT NULL GROUP BY ${col} HAVING COUNT(*)>1)`,
    );
  return r;
}
export async function estadoExtras(c: Connection, id: number) {
  const resultado: Record<string, number> = {};
  for (const tabla of [
    'HISTORIAL_SALARIAL',
    'PARQUEO_SUSCRIPCIONES',
    'PRESTAMOS',
    'AUSENCIAS',
    'NOVEDADES_MENSUALES',
    'ISR_APERTURAS',
  ] as const)
    resultado[tabla] = await escalar(
      c,
      `SELECT COUNT(*) FROM ${tabla} WHERE ID_EMPLEADO=:id AND ACTIVO=1`,
      { id },
    );
  return resultado;
}
export function aperturaVerificacion(c: Connection, id: number, anio: number, fecha: string) {
  return escalar(
    c,
    "SELECT COUNT(*) FROM ISR_APERTURAS WHERE ID_EMPLEADO=:id AND ANIO=:anio AND FECHA_CORTE=TO_DATE(:fecha,'YYYY-MM-DD') AND ACTIVO=1",
    { id, anio, fecha },
  );
}
export async function capturaVerificacion(c: Connection, conjunto: string) {
  const conteos: Record<string, number> = {};
  for (const tabla of [
    ...Object.keys(tablas),
    'BITACORA_AUDITORIA',
    'REGISTRO_CODIGOS',
    'SECUENCIAS_CODIGOS',
    'SESIONES',
    'PAGOS_NOMINA',
    'VACACIONES_MOVIMIENTOS',
    'PERIODOS_NOMINA',
    'NOMINA_EMPLEADO',
    'NOMINA_DETALLE',
  ])
    conteos[tabla] = await escalar(c, `SELECT COUNT(*) FROM ${tabla}`);
  const datos = [];
  for (const tabla of ['USUARIOS', 'EMPLEADOS', 'REGISTRO_CODIGOS', 'SECUENCIAS_CODIGOS'] as const)
    datos.push(
      await filas(
        c,
        `SELECT * FROM ${tabla} ORDER BY ${tabla === 'REGISTRO_CODIGOS' ? 'ID_REGISTRO_CODIGO' : tabla === 'SECUENCIAS_CODIGOS' ? 'ID_SECUENCIA_CODIGO' : tablas[tabla]}`,
      ),
    );
  for (const p of (await propiedades(c, conjunto)).values())
    datos.push([p.tabla, p.id, await huella(c, p.tabla, p.id)]);
  return { conteos, huella: createHash('sha256').update(JSON.stringify(datos)).digest('hex') };
}
