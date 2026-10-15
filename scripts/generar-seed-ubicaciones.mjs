import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Los nombres se conservan tal como aparecen en la fuente oficial versionada.
export function generarSeed(datos) {
  const literal = (v) => `'${v.replaceAll("'", "''")}'`;
  const departamentos = datos.departamentos.map(
    ({ codigo, nombre }) =>
      `MERGE INTO DEPARTAMENTOS_GT T USING (SELECT ${literal(codigo)} CODIGO_INE,${literal(nombre)} NOMBRE FROM DUAL) S
ON (T.CODIGO_INE=S.CODIGO_INE)
WHEN NOT MATCHED THEN INSERT (CODIGO_INE,NOMBRE) VALUES (S.CODIGO_INE,S.NOMBRE);\n/`,
  );
  const municipios = datos.municipios.map(
    ({ codigo, codigoDepartamento, nombre }) =>
      `MERGE INTO MUNICIPIOS_GT T USING (SELECT ${literal(codigo)} CODIGO_INE,${literal(nombre)} NOMBRE,ID_DEPARTAMENTO_GT FROM DEPARTAMENTOS_GT WHERE CODIGO_INE=${literal(codigoDepartamento)}) S
ON (T.CODIGO_INE=S.CODIGO_INE)
WHEN NOT MATCHED THEN INSERT (CODIGO_INE,NOMBRE,ID_DEPARTAMENTO_GT) VALUES (S.CODIGO_INE,S.NOMBRE,S.ID_DEPARTAMENTO_GT);\n/`,
  );
  // Solo coincidencias completas y únicas; nunca confirma automáticamente una ubicación histórica.
  const normalizar = (sql) =>
    `REGEXP_REPLACE(TRANSLATE(UPPER(${sql}),'ÁÉÍÓÚÜÑ','AEIOUUN'),'[^A-Z0-9]','')`;
  const propuesta = `MERGE INTO CENTROS_TRABAJO T USING (
 SELECT C.ID_CENTRO_TRABAJO,MIN(M.ID_MUNICIPIO_GT) ID_MUNICIPIO_GT
 FROM CENTROS_TRABAJO C CROSS JOIN MUNICIPIOS_GT M
 JOIN DEPARTAMENTOS_GT D ON D.ID_DEPARTAMENTO_GT=M.ID_DEPARTAMENTO_GT
 WHERE C.LOCALIDAD_ANTERIOR IS NOT NULL AND C.ID_MUNICIPIO_GT IS NULL
 AND (${normalizar('C.LOCALIDAD_ANTERIOR')} IN (${normalizar('M.NOMBRE')},${normalizar('M.NOMBRE||D.NOMBRE')},${normalizar('D.NOMBRE||M.NOMBRE')})
 OR (M.CODIGO_INE='0101' AND ${normalizar('C.LOCALIDAD_ANTERIOR')} IN ('GUATEMALACIUDAD','CIUDADDEGUATEMALA')))
 GROUP BY C.ID_CENTRO_TRABAJO HAVING COUNT(*)=1
) S ON (T.ID_CENTRO_TRABAJO=S.ID_CENTRO_TRABAJO)
WHEN MATCHED THEN UPDATE SET T.ID_MUNICIPIO_GT_PROPUESTO=S.ID_MUNICIPIO_GT WHERE T.ID_MUNICIPIO_GT_PROPUESTO IS NULL;\n/`;
  return `-- Generado desde db/data/ubicaciones-gt.json por scripts/generar-seed-ubicaciones.mjs.\n-- Fuente INE y SHA-256 en db/data/ine/README.md. Repetible sin sobrescribir datos.\n${[...departamentos, ...municipios, propuesta].join('\n\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const datos = JSON.parse(
    await readFile(new URL('../db/data/ubicaciones-gt.json', import.meta.url), 'utf8'),
  );
  await writeFile(
    new URL('../db/seeds/S006__ubicaciones_guatemala.sql', import.meta.url),
    generarSeed(datos),
  );
}
