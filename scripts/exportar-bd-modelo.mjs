import assert from 'node:assert/strict';
import { consultar, identificador, literal } from './exportar-bd-oracle.mjs';

export const catalogos = [
  ['ROLES', ['CODIGO'], 'CODIGO,NOMBRE,DESCRIPCION,ACTIVO'],
  ['CONFIG_CODIGOS', ['ENTIDAD'], 'ENTIDAD,PREFIJO,LONGITUD_MAXIMA,PATRON,ACTIVO'],
  ['DEPARTAMENTOS_GT', ['CODIGO_INE'], 'CODIGO_INE,NOMBRE,ACTIVO'],
  ['MUNICIPIOS_GT', ['CODIGO_INE'], 'CODIGO_INE,NOMBRE,ACTIVO'],
  [
    'TIPOS_CONTRATO',
    ['CODIGO'],
    'CODIGO,CODIGO_ANTERIOR,NOMBRE,DESCRIPCION,REQUIERE_FIN,REQUIERE_FECHA_FIN,ACTIVO',
  ],
  ['TIPOS_DESCUENTO', ['CODIGO'], 'CODIGO,CODIGO_ANTERIOR,NOMBRE,DESCRIPCION,ACTIVO'],
  ['TIPOS_AUSENCIA', ['CODIGO'], 'CODIGO,CODIGO_ANTERIOR,NOMBRE,DESCRIPCION,EFECTO,ACTIVO'],
  [
    'TIPOS_SOLICITUD',
    ['CODIGO'],
    'CODIGO,CODIGO_ANTERIOR,NOMBRE,DESCRIPCION,GENERA_PDF,ES_DIRECTA,ACTIVO',
  ],
  ['PARENTESCOS', ['NOMBRE'], 'NOMBRE,ACTIVO'],
  [
    'CONCEPTOS_NOMINA',
    ['CODIGO', 'VIGENTE_DESDE'],
    'CODIGO,NOMBRE,NATURALEZA,AFECTA_IGSS,AFECTA_ISR,AFECTA_PRESTACIONES,VIGENTE_DESDE,VIGENTE_HASTA,ACTIVO',
  ],
  [
    'PARAMETROS_LEGALES',
    ['CLAVE_INTERNA', 'VIGENTE_DESDE'],
    'CODIGO,CODIGO_ANTERIOR,CLAVE_INTERNA,NOMBRE,VALOR,UNIDAD,VIGENTE_DESDE,VIGENTE_HASTA,FUNDAMENTO,ACTIVO',
  ],
  ['TIPOS_DEDUCCION_ISR', ['CODIGO'], 'CODIGO,NOMBRE,DESCRIPCION,CODIGO_PARAMETRO_TOPE,ACTIVO'],
  [
    'TRAMOS_ISR',
    ['VIGENTE_DESDE', 'LIMITE_INFERIOR'],
    'VIGENTE_DESDE,VIGENTE_HASTA,LIMITE_INFERIOR,LIMITE_SUPERIOR,TASA_PORCENTAJE,CUOTA_FIJA,ACTIVO',
  ],
  [
    'FERIADOS',
    ['CODIGO', 'FECHA'],
    'CODIGO,CODIGO_ANTERIOR,NOMBRE,FECHA,FECHA_CONMEMORACION,AMBITO,LOCALIDAD,MINUTO_INICIO,MINUTO_FIN,FUNDAMENTO,ACTIVO',
  ],
  [
    'PLANTILLAS_DOCUMENTO',
    ['CODIGO', 'VERSION'],
    'CODIGO,VERSION,NOMBRE,CONTENIDO,VARIABLES_PERMITIDAS,VIGENTE_DESDE,VIGENTE_HASTA,ACTIVO',
  ],
].map(([tabla, claves, columnas]) => ({ tabla, claves, columnas: columnas.split(',') }));

const transformaciones = `BEGIN
  DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'DEFAULT');
  DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'SEGMENT_ATTRIBUTES',FALSE);
  DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'EMIT_SCHEMA',FALSE);
  DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'REF_CONSTRAINTS',FALSE);
  DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'SQLTERMINATOR',FALSE);
END;\n/`;

export function ordenarDependencias(nombres, dependencias) {
  const pendientes = new Set([...nombres].sort());
  const orden = [];
  while (pendientes.size) {
    const disponibles = [...pendientes].filter(
      (n) => !dependencias.some(([h, p]) => h === n && h !== p && pendientes.has(p)),
    );
    // Los ciclos se resuelven con todas las FK diferidas hasta después de crear tablas/índices.
    if (!disponibles.length) {
      const vuelveAlOrigen = (origen, actual = origen, visitados = new Set([origen])) =>
        dependencias
          .filter(([h, p]) => h === actual && h !== p && pendientes.has(p))
          .some(
            ([, p]) =>
              p === origen ||
              (!visitados.has(p) && vuelveAlOrigen(origen, p, new Set([...visitados, p]))),
          );
      const circular = [...pendientes]
        .filter((n) => vuelveAlOrigen(n))
        .sort(
          (a, b) =>
            dependencias.filter(([h, p]) => h === a && pendientes.has(p)).length -
            dependencias.filter(([h, p]) => h === b && pendientes.has(p)).length,
        )[0];
      pendientes.delete(circular);
      orden.push(circular);
      continue;
    }
    for (const n of disponibles) {
      pendientes.delete(n);
      orden.push(n);
    }
  }
  return orden;
}

export function normalizarDdl(sql) {
  // Oracle reordena constraints al recrear CREATE TABLE. Mantener orden de columnas,
  // expresiones y literales; normalizar solo formato, nombres internos y contadores.
  const limpio = (sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|[^'"]+/g) ?? [])
    .map((token) =>
      token.startsWith("'")
        ? token
        : token
            .replace(/"SYS_C\d+"/g, '"SYS_CONSTRAINT"')
            .replace(/"SYS_NC\d+\$"/g, '"SYS_COLUMN"')
            .replace(/START WITH \d+/g, 'START WITH 1')
            .replace(/\s+/g, ' '),
    )
    .join('')
    .trim();
  if (!/^CREATE TABLE\b/.test(limpio)) return limpio;
  const inicio = limpio.indexOf('(');
  const partes = [];
  let profundidad = 1;
  let comilla = '';
  let desde = inicio + 1;
  for (let i = desde; i < limpio.length; i++) {
    const c = limpio[i];
    if (comilla) {
      if (c === comilla && limpio[i + 1] === comilla) i++;
      else if (c === comilla) comilla = '';
    } else if (c === "'" || c === '"') comilla = c;
    else if (c === '(') profundidad++;
    else if (c === ')') {
      profundidad--;
      if (profundidad === 0) {
        partes.push(limpio.slice(desde, i).trim());
        const columnas = partes.filter((p) => p.startsWith('"'));
        const constraints = partes.filter((p) => !p.startsWith('"')).sort();
        return (
          limpio.slice(0, inicio) +
          '(' +
          [...columnas, ...constraints].join(',') +
          ')' +
          limpio.slice(i + 1)
        );
      }
    } else if (c === ',' && profundidad === 1) {
      partes.push(limpio.slice(desde, i).trim());
      desde = i + 1;
    }
  }
  throw new Error('DDL de tabla incompleto.');
}

export function metadatos(acceso = 'aplicacion') {
  const inventario = consultar(
    'SELECT OBJECT_TYPE,COUNT(*) TOTAL FROM USER_OBJECTS GROUP BY OBJECT_TYPE ORDER BY OBJECT_TYPE',
    acceso,
  );
  const soportados = [
    'TABLE',
    'INDEX',
    'SEQUENCE',
    'LOB',
    'PACKAGE',
    'PACKAGE BODY',
    'TRIGGER',
    'VIEW',
    'FUNCTION',
    'PROCEDURE',
    'TYPE',
    'TYPE BODY',
    'SYNONYM',
  ];
  assert.ok(
    inventario.every((r) => soportados.includes(r.OBJECT_TYPE)),
    'Hay objetos sin exportador; no se omitirán silenciosamente.',
  );
  const objetos = consultar(
    `SELECT O.OBJECT_TYPE TIPO,O.OBJECT_NAME NOMBRE,
    DBMS_METADATA.GET_DDL(CASE O.OBJECT_TYPE WHEN 'PACKAGE' THEN 'PACKAGE_SPEC' WHEN 'PACKAGE BODY' THEN 'PACKAGE_BODY' WHEN 'TYPE' THEN 'TYPE_SPEC' WHEN 'TYPE BODY' THEN 'TYPE_BODY' ELSE O.OBJECT_TYPE END,O.OBJECT_NAME) DDL
    FROM USER_OBJECTS O WHERE O.OBJECT_TYPE NOT IN ('LOB','INDEX')
    AND NOT (O.OBJECT_TYPE='SEQUENCE' AND EXISTS (SELECT 1 FROM USER_TAB_IDENTITY_COLS I WHERE I.SEQUENCE_NAME=O.OBJECT_NAME))
    UNION ALL SELECT 'INDEX',I.INDEX_NAME,DBMS_METADATA.GET_DDL('INDEX',I.INDEX_NAME)
    FROM USER_INDEXES I WHERE I.INDEX_TYPE<>'LOB' AND NOT EXISTS
    (SELECT 1 FROM USER_CONSTRAINTS C WHERE C.INDEX_NAME=I.INDEX_NAME AND C.CONSTRAINT_TYPE IN ('P','U'))`,
    acceso,
    transformaciones,
  );
  const fk = consultar(
    `SELECT C.TABLE_NAME HIJA,P.TABLE_NAME PADRE,C.CONSTRAINT_NAME NOMBRE,
    (SELECT LISTAGG(CC.COLUMN_NAME,',') WITHIN GROUP(ORDER BY CC.POSITION)
     FROM USER_CONS_COLUMNS CC WHERE CC.CONSTRAINT_NAME=C.CONSTRAINT_NAME) COLUMNAS,
    DBMS_METADATA.GET_DDL('REF_CONSTRAINT',C.CONSTRAINT_NAME) DDL
    FROM USER_CONSTRAINTS C JOIN USER_CONSTRAINTS P ON P.CONSTRAINT_NAME=C.R_CONSTRAINT_NAME
    WHERE C.CONSTRAINT_TYPE='R' ORDER BY C.TABLE_NAME,C.CONSTRAINT_NAME`,
    acceso,
    transformaciones,
  );
  const columnas = consultar(
    `SELECT CAST(TABLE_NAME AS VARCHAR2(128)) TABLE_NAME,
    CAST(COLUMN_NAME AS VARCHAR2(128)) COLUMN_NAME,DATA_TYPE,COLUMN_ID,NULLABLE,
    DATA_PRECISION,DATA_SCALE,CHAR_LENGTH,CHAR_USED,IDENTITY_COLUMN
    FROM USER_TAB_COLUMNS ORDER BY TABLE_NAME,COLUMN_ID`,
    acceso,
  );
  const comentarios = consultar(
    `SELECT TABLE_NAME,CAST(NULL AS VARCHAR2(128)) COLUMN_NAME,COMMENTS FROM USER_TAB_COMMENTS WHERE COMMENTS IS NOT NULL
    UNION ALL SELECT TABLE_NAME,COLUMN_NAME,COMMENTS FROM USER_COL_COMMENTS WHERE COMMENTS IS NOT NULL
    ORDER BY TABLE_NAME,COLUMN_NAME`,
    acceso,
  );
  const restricciones = consultar(
    'SELECT CONSTRAINT_TYPE,COUNT(*) TOTAL FROM USER_CONSTRAINTS GROUP BY CONSTRAINT_TYPE ORDER BY CONSTRAINT_TYPE',
    acceso,
  );
  const triggers = consultar(
    'SELECT TRIGGER_NAME,TABLE_NAME,STATUS FROM USER_TRIGGERS ORDER BY TRIGGER_NAME',
    acceso,
  );
  return { inventario, objetos, fk, columnas, comentarios, restricciones, triggers };
}

export function diferencias(a, b) {
  const mapa = (meta) =>
    new Map([
      ...meta.objetos.map((o) => [
        `${o.TIPO}:${o.NOMBRE.startsWith('SYS_C') ? 'SYS_CONSTRAINT' : o.NOMBRE}`,
        normalizarDdl(o.DDL),
      ]),
      ...meta.fk.map((f) => [
        `FK:${f.HIJA}:${f.NOMBRE.startsWith('SYS_C') ? normalizarDdl(f.DDL) : f.NOMBRE}`,
        normalizarDdl(f.DDL),
      ]),
      ['COLUMNAS', JSON.stringify(meta.columnas)],
      ['CONTEOS', JSON.stringify(meta.inventario)],
      ['RESTRICCIONES', JSON.stringify(meta.restricciones)],
      ['COMENTARIOS', JSON.stringify(meta.comentarios)],
      ['TRIGGERS_ESTADO', JSON.stringify(meta.triggers)],
    ]);
  const izquierda = mapa(a);
  const derecha = mapa(b);
  return [...new Set([...izquierda.keys(), ...derecha.keys()])]
    .sort()
    .filter((k) => izquierda.get(k) !== derecha.get(k))
    .map((objeto) => ({
      objeto,
      diferencia: !izquierda.has(objeto)
        ? 'solo_destino'
        : !derecha.has(objeto)
          ? 'solo_origen'
          : 'definicion_distinta',
    }));
}

export function sentencia(sql) {
  // SQLPlus necesita / sin ; para DDL SQL, y END; seguido de / para PL/SQL.
  return `${sql.trim()}\n/\n`;
}

export function generarScriptCompleto(archivos) {
  const nombres = [
    '01_esquema.sql',
    '02_catalogos.sql',
    '03_admin_inicial.sql',
    '04_versiones.sql',
    '05_verificar.sql',
  ];
  const cabecera = `-- NOMINA2: instalación completa y autónoma para Oracle 21c XE.
-- Comparte únicamente este archivo; no necesita otros archivos SQL.
-- Conectar con un usuario de aplicación de un esquema VACÍO en XEPDB1.
-- Ejecutar en modo SCRIPT completo (SQLPlus/SQLcl o Ejecutar script en SQL Developer).
-- ADMIN de la aplicación: admin.inicial / Nomina2!Temporal2026 (cambio obligatorio).
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF
SET SQLBLANKLINES ON
SET SERVEROUTPUT ON
DECLARE
  N NUMBER;
BEGIN
  SELECT COUNT(*) INTO N FROM USER_TABLES;
  IF USER IN ('SYS','SYSTEM') OR N<>0 THEN
    RAISE_APPLICATION_ERROR(-20093,'Conéctate con un usuario de aplicación cuyo esquema esté vacío y ejecuta el archivo completo.');
  END IF;
END;
/
`;
  const partes = nombres.map((nombre) => {
    assert.ok(typeof archivos[nombre] === 'string' && archivos[nombre].trim(), `Falta ${nombre}.`);
    // SQL normal termina en ; y PL/SQL en END; seguido de /. Así no se ejecuta
    // dos veces un DDL al abrir el archivo en clientes con ejecución de scripts.
    const contenido = archivos[nombre]
      .split(/^[\t ]*\/[\t ]*\r?$/m)
      .map((bloque) => {
        const original = bloque.trim();
        if (!original) return '';
        const significativo = original
          .replace(/^[\t ]*(?:--[^\n]*|(?:WHENEVER|SET|PROMPT)\b[^\n]*)$/gim, '')
          .replace(/^(?:\s|\/\*[\s\S]*?\*\/)+/, '');
        const plsql =
          /^(?:DECLARE|BEGIN|CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:NON)?EDITIONABLE\s+)?(?:PACKAGE|TRIGGER|PROCEDURE|FUNCTION|TYPE))\b/i.test(
            significativo,
          );
        return plsql ? original + '\n/\n' : original.replace(/;\s*$/, '') + ';\n';
      })
      .join('\n');
    return `\n-- ==================== ${nombre} ====================\n${contenido}`;
  });
  return cabecera + partes.join('\n');
}

export function generarEsquema(meta) {
  const bloques = [
    `-- DDL real de Oracle 21c XE mediante DBMS_METADATA. Ejecutar en un esquema vacío.
-- Opcional: como SYS en XEPDB1, antes de conectar con el usuario de aplicación:
-- CREATE USER NOMINA2 IDENTIFIED BY "CAMBIA_ESTA_CLAVE";
-- GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE PROCEDURE,
--       CREATE TRIGGER, CREATE VIEW, CREATE TYPE, CREATE SYNONYM TO NOMINA2;
-- GRANT UNLIMITED TABLESPACE TO NOMINA2;
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF SQLBLANKLINES ON
ALTER SESSION SET TIME_ZONE='America/Guatemala';
`,
  ];
  const ordenTablas = ordenarDependencias(
    meta.objetos.filter((o) => o.TIPO === 'TABLE').map((o) => o.NOMBRE),
    meta.fk.map((f) => [f.HIJA, f.PADRE]),
  );
  const tipos = [
    'SEQUENCE',
    'TYPE',
    'TABLE',
    'PACKAGE',
    'VIEW',
    'FUNCTION',
    'PROCEDURE',
    'PACKAGE BODY',
    'TYPE BODY',
    'SYNONYM',
    'INDEX',
    'TRIGGER',
  ];
  for (const tipo of tipos) {
    const objetos = meta.objetos
      .filter((o) => o.TIPO === tipo)
      .sort((a, b) =>
        tipo === 'TABLE'
          ? ordenTablas.indexOf(a.NOMBRE) - ordenTablas.indexOf(b.NOMBRE)
          : a.NOMBRE.localeCompare(b.NOMBRE),
      );
    for (const objeto of objetos) {
      bloques.push(`\n-- ${tipo}: ${objeto.NOMBRE}\n`);
      // GET_DDL de triggers añade ALTER TRIGGER separado incluso sin SQLTERMINATOR.
      const partes = objeto.DDL.split(/\n(?=ALTER TRIGGER )/);
      for (const parte of partes) bloques.push(sentencia(parte));
    }
  }
  bloques.push(
    '\n-- FK: todas las tablas y claves padre ya existen, incluidos ciclos de auditoría.\n',
  );
  for (const f of meta.fk) bloques.push(sentencia(f.DDL));
  for (const c of meta.comentarios)
    bloques.push(
      sentencia(
        `COMMENT ON ${c.COLUMN_NAME ? 'COLUMN' : 'TABLE'} ${identificador(c.TABLE_NAME)}${c.COLUMN_NAME ? '.' + identificador(c.COLUMN_NAME) : ''} IS ${literal(c.COMMENTS)}`,
      ),
    );
  bloques.push(sentencia('BEGIN DBMS_UTILITY.COMPILE_SCHEMA(USER, FALSE); END;'));
  return bloques.join('');
}

export function leerCatalogos(acceso = 'aplicacion') {
  return catalogos.map((c) => ({
    ...c,
    filas: consultar(
      `SELECT ${c.columnas.map(identificador).join(',')}${c.tabla === 'MUNICIPIOS_GT' ? ',(SELECT CODIGO_INE FROM DEPARTAMENTOS_GT D WHERE D.ID_DEPARTAMENTO_GT=T.ID_DEPARTAMENTO_GT) DEPARTAMENTO_INE' : ''}${c.tabla === 'PLANTILLAS_DOCUMENTO' ? ',(SELECT CODIGO FROM TIPOS_SOLICITUD S WHERE S.ID_TIPO_SOLICITUD=T.ID_TIPO_SOLICITUD) TIPO_CODIGO' : ''} FROM ${identificador(c.tabla)} T ORDER BY ${c.claves.map(identificador).join(',')}`,
      acceso,
    ),
  }));
}

function valorSql(valor, tipo) {
  if (valor === null) return 'NULL';
  if (tipo === 'NUMBER') {
    assert.equal(typeof valor, 'number');
    assert.ok(Number.isFinite(valor));
    return String(valor);
  }
  if (tipo === 'DATE') return `TO_DATE(${literal(valor)},'YYYY-MM-DD"T"HH24:MI:SS')`;
  if (tipo === 'CLOB') {
    // Literales pequeños y SQLPlus con líneas < 2499 bytes, incluso con UTF-8.
    const texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
    const trozos = texto.match(/[\s\S]{1,450}/g) ?? [''];
    return trozos.map((t) => `TO_CLOB(${literal(t)})`).join(' ||\n');
  }
  assert.ok(
    ['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR'].includes(tipo),
    'Tipo de catálogo no permitido.',
  );
  return literal(valor);
}

export function generarCatalogos(datos, meta) {
  const bloques = [
    `-- Únicamente catálogos permitidos. No se exportan PK ni actores de auditoría.
-- MERGE aditivo: repetir conserva valores existentes; las FK se resuelven por clave natural.
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF SQLBLANKLINES ON
ALTER SESSION SET TIME_ZONE='America/Guatemala';
`,
  ];
  const tablas = datos.map((c) => c.tabla);
  const triggersCodigo = meta.triggers.filter(
    (t) =>
      tablas.includes(t.TABLE_NAME) &&
      /^TR_.*_CODIGO$/.test(t.TRIGGER_NAME) &&
      t.STATUS === 'ENABLED',
  );
  bloques.push(
    '-- Solo durante la instalación destino: conservar códigos ya asignados sin regenerarlos.\n',
  );
  for (const t of triggersCodigo)
    bloques.push(sentencia(`ALTER TRIGGER ${identificador(t.TRIGGER_NAME)} DISABLE`));
  for (const c of datos) {
    bloques.push(`\n-- ${c.tabla}: ${c.filas.length} registros.\n`);
    for (const fila of c.filas) {
      const campos = [...c.columnas];
      const valores = campos.map((n) =>
        valorSql(
          fila[n],
          meta.columnas.find((m) => m.TABLE_NAME === c.tabla && m.COLUMN_NAME === n)?.DATA_TYPE,
        ),
      );
      if (c.tabla === 'MUNICIPIOS_GT') {
        campos.push('ID_DEPARTAMENTO_GT');
        valores.push(
          `(SELECT ID_DEPARTAMENTO_GT FROM DEPARTAMENTOS_GT WHERE CODIGO_INE=${literal(fila.DEPARTAMENTO_INE)})`,
        );
      }
      if (c.tabla === 'PLANTILLAS_DOCUMENTO') {
        campos.push('ID_TIPO_SOLICITUD');
        valores.push(
          `(SELECT ID_TIPO_SOLICITUD FROM TIPOS_SOLICITUD WHERE CODIGO=${literal(fila.TIPO_CODIGO)})`,
        );
      }
      if (['PARAMETROS_LEGALES', 'TRAMOS_ISR'].includes(c.tabla)) {
        campos.push('MOTIVO');
        valores.push("'Instalación de catálogo compartido; revisar vigencias antes de operar.'");
      }
      bloques.push(
        sentencia(
          `MERGE INTO ${identificador(c.tabla)} D\nUSING (SELECT\n  ${campos.map((n, i) => `${valores[i]} ${identificador(n)}`).join(',\n  ')}\nFROM DUAL) O\nON (${c.claves.map((k) => `D.${identificador(k)}=O.${identificador(k)}`).join(' AND ')})\nWHEN NOT MATCHED THEN INSERT (${campos.map(identificador).join(',')})\nVALUES (${campos.map((n) => `O.${identificador(n)}`).join(',')});`.replace(
            /;$/,
            '',
          ),
        ),
      );
    }
  }
  // Reconstruir exclusivamente reservas de catálogos exportados; nunca contadores/legados de empleados.
  bloques.push('\n-- Reservas de los catálogos importados para evitar futuras colisiones.\n');
  const entidades = {
    TIPOS_CONTRATO: 'tipos-contrato',
    TIPOS_DESCUENTO: 'tipos-descuento',
    TIPOS_AUSENCIA: 'tipos-ausencia',
    TIPOS_SOLICITUD: 'tipos-solicitud',
    PARAMETROS_LEGALES: 'parametros-legales',
    FERIADOS: 'feriados',
  };
  for (const [tabla, entidad] of Object.entries(entidades))
    bloques.push(
      sentencia(
        `MERGE INTO REGISTRO_CODIGOS D\nUSING (SELECT ${literal(entidad)} ENTIDAD,CODIGO,MAX(${tabla === 'PARAMETROS_LEGALES' ? 'CLAVE_INTERNA' : 'CODIGO_ANTERIOR'}) LEGADO FROM ${tabla} GROUP BY CODIGO) O\nON (D.ENTIDAD=O.ENTIDAD AND D.CODIGO=O.CODIGO)\nWHEN NOT MATCHED THEN INSERT (ENTIDAD,CODIGO,LEGADO) VALUES (O.ENTIDAD,O.CODIGO,O.LEGADO)`,
      ),
    );
  bloques.push('COMMIT;\n');
  for (const t of triggersCodigo)
    bloques.push(sentencia(`ALTER TRIGGER ${identificador(t.TRIGGER_NAME)} ENABLE`));
  return bloques.join('');
}

export function auditarSeguridad(archivos, hashAdmin, valoresPrivados = []) {
  const contenido = Object.values(archivos).join('\n');
  const hashes = contenido.match(/\$argon2(?:id|i|d)\$v=\d+\$[^'\s]+/g) ?? [];
  assert.ok(
    hashes.length === 1 && hashes[0] === hashAdmin,
    'Hay un hash ajeno al ADMIN sintético.',
  );
  const correos = contenido.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  assert.ok(
    correos.every((c) => c === 'admin@example.invalid'),
    'Se encontró un correo no genérico.',
  );
  assert.ok(
    !/\b\d{4}[ -]?\d{5}[ -]?\d{4}\b|(?:\/Users\/|\/home\/|[A-Z]:\\)/.test(contenido),
    'DPI o ruta local detectado.',
  );
  assert.ok(
    !/-----BEGIN .*PRIVATE KEY-----|ghp_[\w]{30,}|sk-proj-[\w-]{30,}/.test(contenido),
    'Token o clave privada detectado.',
  );
  for (const valor of valoresPrivados)
    assert.ok(
      !contenido.includes(valor),
      'Un dato privado de la fuente aparece en la exportación.',
    );
  return { hashes_reales: 0, correos_reales: 0, dpi: 0, rutas_locales: 0, hash_admin_sintetico: 1 };
}
