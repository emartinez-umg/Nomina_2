import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';

// Las credenciales del contenedor se resuelven dentro de bash, nunca en argumentos o logs.
export function sqlplus(sql, acceso = 'aplicacion') {
  const comando =
    acceso === 'aplicacion'
      ? 'export NLS_LANG=.AL32UTF8; { printf \'CONNECT "%s"/"%s"@//localhost:1521/XEPDB1\\n\' "$APP_USER" "$APP_USER_PASSWORD"; cat; } | sqlplus -s -L /nolog'
      : 'export NLS_LANG=.AL32UTF8; sqlplus -s -L / as sysdba';
  const conexion =
    typeof acceso === 'object'
      ? `CONNECT ${acceso.usuario}/"${acceso.clave}"@//localhost:1521/XEPDB1\n`
      : acceso === 'sys'
        ? 'ALTER SESSION SET CONTAINER=XEPDB1;\n'
        : '';
  const resultado = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'nomina2-db', 'bash', '-c', comando],
    {
      input: `WHENEVER OSERROR EXIT FAILURE\nWHENEVER SQLERROR EXIT FAILURE ROLLBACK\n${conexion}SET ECHO OFF VERIFY OFF FEEDBACK OFF HEADING OFF PAGESIZE 0 LINESIZE 32767 LONG 100000000 LONGCHUNKSIZE 32767 SERVEROUTPUT ON SIZE UNLIMITED DEFINE OFF SQLBLANKLINES ON\nALTER SESSION SET TIME_ZONE='America/Guatemala';\nALTER SESSION SET NLS_DATE_FORMAT='YYYY-MM-DD"T"HH24:MI:SS';\nALTER SESSION SET NLS_NUMERIC_CHARACTERS='.,';\n${sql}\nEXIT SUCCESS\n`,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  // No propagar SQL fallido: puede contener datos de la fuente o credenciales sintéticas.
  const error = resultado.stdout?.match(/(?:ORA|PLS|SP2)-\d+/)?.[0];
  if (resultado.error || resultado.status !== 0 || error) {
    const restriccion = resultado.stdout?.match(
      /check constraint \((?:[^.()]+\.)?([A-Z0-9_]+)\) violated/i,
    )?.[1];
    throw new Error(
      `Falló SQLPlus (${error ?? 'Docker/conexión/tiempo de espera'}${restriccion ? ', ' + restriccion : ''}).`,
    );
  }
  return resultado.stdout;
}

export function consultar(sql, acceso = 'aplicacion', preambulo = '') {
  // Base64 por fragmentos evita truncamiento de CLOB, saltos de línea y caracteres del INE.
  const salida = sqlplus(
    `${preambulo}\nDECLARE
    V CLOB; FRAGMENTO VARCHAR2(6000); POSICION PLS_INTEGER;
  BEGIN
    FOR R IN (SELECT JSON_OBJECT(* RETURNING CLOB) DOC FROM (${sql})) LOOP
      V:=R.DOC; POSICION:=1;
      WHILE POSICION<=DBMS_LOB.GETLENGTH(V) LOOP
        FRAGMENTO:=DBMS_LOB.SUBSTR(V,6000,POSICION);
        DBMS_OUTPUT.PUT_LINE('N2JSON:'||REPLACE(REPLACE(UTL_RAW.CAST_TO_VARCHAR2(UTL_ENCODE.BASE64_ENCODE(UTL_RAW.CAST_TO_RAW(FRAGMENTO))),CHR(10),''),CHR(13),''));
        POSICION:=POSICION+LENGTH(FRAGMENTO);
      END LOOP;
      DBMS_OUTPUT.PUT_LINE('N2FIN');
    END LOOP;
    DBMS_OUTPUT.PUT_LINE('N2OK');
  END;\n/`,
    acceso,
  );
  const filas = [];
  let fragmentos = [];
  for (const linea of salida.split(/\r?\n/)) {
    if (linea.startsWith('N2JSON:'))
      fragmentos.push(Buffer.from(linea.slice(7), 'base64').toString('utf8'));
    if (linea === 'N2FIN') {
      filas.push(JSON.parse(fragmentos.join('')));
      fragmentos = [];
    }
  }
  assert.equal(fragmentos.length, 0, 'Respuesta de Oracle incompleta.');
  assert.ok(salida.split(/\r?\n/).includes('N2OK'), 'Oracle no devolvió el cierre de la consulta.');
  return filas;
}

export function identificador(valor) {
  assert.match(valor, /^[A-Za-z][A-Za-z0-9_$#]{0,127}$/);
  return `"${valor}"`;
}

export function literal(valor) {
  return valor === null
    ? 'NULL'
    : `'${String(valor).replaceAll("'", "''").replaceAll('\r', "'||CHR(13)||'").replaceAll('\n', "'||CHR(10)||'")}'`;
}
