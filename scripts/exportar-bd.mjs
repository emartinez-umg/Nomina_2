import assert from 'node:assert/strict';
import console from 'node:console';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { consultar, sqlplus, literal, identificador } from './exportar-bd-oracle.mjs';
import {
  metadatos,
  diferencias,
  generarEsquema,
  leerCatalogos,
  generarCatalogos,
  generarScriptCompleto,
  sentencia,
  auditarSeguridad,
} from './exportar-bd-modelo.mjs';
import { cargarMigraciones } from '../backend/src/shared/db/migraciones.archivos.ts';
import { crearMigracionesRepository } from '../backend/src/shared/db/migraciones.repository.ts';

const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const { hash, verify, argon2id } = requireBackend('argon2');
const prettier = requireBackend('prettier');
const raiz = fileURLToPath(new URL('../', import.meta.url));
const temporales = [];
let carpetaHost;
let carpetaContenedor;
const resumen = (meta) => Object.fromEntries(meta.inventario.map((r) => [r.OBJECT_TYPE, r.TOTAL]));

function docker(args) {
  const r = spawnSync('docker', ['compose', ...args], { encoding: 'utf8', timeout: 30000 });
  assert.ok(
    !r.error && r.status === 0,
    'Falló la transferencia/limpieza de los scripts temporales.',
  );
}

async function guardarMarkdown(path, contenido) {
  const configuracion = await prettier.resolveConfig(path);
  await writeFile(path, await prettier.format(contenido, { ...configuracion, filepath: path }));
}

function crearTemporal() {
  const acceso = {
    usuario: `N2EXP_${randomBytes(6).toString('hex').toUpperCase()}`,
    clave: `T${randomBytes(12).toString('hex')}`,
  };
  assert.match(acceso.usuario, /^N2EXP_[A-F0-9]{12}$/);
  sqlplus(
    `CREATE USER ${acceso.usuario} IDENTIFIED BY "${acceso.clave}";\nGRANT CREATE SESSION,CREATE TABLE,CREATE SEQUENCE,CREATE PROCEDURE,CREATE TRIGGER,CREATE VIEW,CREATE TYPE,CREATE SYNONYM,UNLIMITED TABLESPACE TO ${acceso.usuario};`,
    'sys',
  );
  temporales.push(acceso);
  return acceso;
}

function generarVersiones(migraciones) {
  return `-- Historial técnico necesario para que el runner no reaplique DDL al conectar la API.
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF SQLBLANKLINES ON
${migraciones
  .map((m) =>
    sentencia(`MERGE INTO VERSION_ESQUEMA D USING (SELECT ${m.version} VERSION,${literal(m.archivo)} ARCHIVO,${literal(m.checksum)} CHECKSUM FROM DUAL) O
ON (D.VERSION=O.VERSION)
WHEN NOT MATCHED THEN INSERT (VERSION,ARCHIVO,CHECKSUM,ESTADO,FECHA_APLICACION)
VALUES (O.VERSION,O.ARCHIVO,O.CHECKSUM,'APLICADA',SYSTIMESTAMP)`),
  )
  .join('\n')}COMMIT;\n`;
}

function generarAdmin(hashAdmin) {
  return `-- Credencial SINTÉTICA, pública y exclusiva de esta instalación. No procede de la fuente.
-- Usuario: admin.inicial / contraseña temporal: Nomina2!Temporal2026
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF SQLBLANKLINES ON
DECLARE
  N NUMBER;
BEGIN
  SELECT COUNT(*) INTO N FROM USUARIOS U JOIN ROLES R ON R.ID_ROL=U.ID_ROL
  WHERE U.USUARIO='admin.inicial' AND (R.CODIGO<>'ADMIN' OR U.CORREO<>'admin@example.invalid');
  IF N>0 THEN RAISE_APPLICATION_ERROR(-20090,'El usuario inicial ya existe con otra identidad; no se modificarán sus permisos.'); END IF;
END;
/
MERGE INTO USUARIOS D
USING (SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN') O
ON (D.USUARIO='admin.inicial')
WHEN NOT MATCHED THEN INSERT (ID_ROL,USUARIO,CORREO,CONTRASENA_HASH,CAMBIO_OBLIGATORIO)
VALUES (O.ID_ROL,'admin.inicial','admin@example.invalid',${literal(hashAdmin)},1);
COMMIT;
`;
}

function generarVerificacion(meta, datos, migraciones) {
  const pruebas = [
    ["SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'", 0, 'Objetos inválidos'],
    [
      "SELECT COUNT(*) FROM USER_CONSTRAINTS WHERE STATUS<>'ENABLED' OR VALIDATED<>'VALIDATED'",
      0,
      'Constraints deshabilitadas o no validadas',
    ],
    [
      'SELECT COUNT(*) FROM USER_TAB_IDENTITY_COLS',
      meta.columnas.filter((c) => c.IDENTITY_COLUMN === 'YES').length,
      'Identities',
    ],
    [
      "SELECT COUNT(*) FROM VERSION_ESQUEMA WHERE ESTADO='APLICADA'",
      migraciones.length,
      'Migraciones',
    ],
    [
      "SELECT COUNT(*) FROM USUARIOS U JOIN ROLES R ON R.ID_ROL=U.ID_ROL WHERE U.USUARIO='admin.inicial' AND R.CODIGO='ADMIN' AND U.CAMBIO_OBLIGATORIO=1",
      1,
      'ADMIN inicial con cambio obligatorio',
    ],
    ['SELECT COUNT(*) FROM USUARIOS', 1, 'Solo el usuario sintético'],
    [
      "SELECT COUNT(*) FROM REGISTRO_CODIGOS WHERE ENTIDAD NOT IN ('tipos-contrato','tipos-descuento','tipos-ausencia','tipos-solicitud','parametros-legales','feriados')",
      0,
      'Reservas privadas excluidas',
    ],
    ...meta.inventario.map((o) => [
      `SELECT COUNT(*) FROM USER_OBJECTS WHERE OBJECT_TYPE=${literal(o.OBJECT_TYPE)}`,
      o.TOTAL,
      `Objetos ${o.OBJECT_TYPE}`,
    ]),
    ...datos.map((c) => [
      `SELECT COUNT(*) FROM ${identificador(c.tabla)}`,
      c.filas.length,
      `Catálogo ${c.tabla}`,
    ]),
    ...meta.objetos
      .filter(
        (o) =>
          o.TIPO === 'TABLE' &&
          !datos.some((c) => c.tabla === o.NOMBRE) &&
          !['USUARIOS', 'VERSION_ESQUEMA', 'REGISTRO_CODIGOS'].includes(o.NOMBRE),
      )
      .map((o) => [
        `SELECT COUNT(*) FROM ${identificador(o.NOMBRE)}`,
        0,
        `Tabla vacía ${o.NOMBRE}`,
      ]),
    [
      'SELECT COUNT(*) FROM MUNICIPIOS_GT M WHERE NOT EXISTS (SELECT 1 FROM DEPARTAMENTOS_GT D WHERE D.ID_DEPARTAMENTO_GT=M.ID_DEPARTAMENTO_GT)',
      0,
      'Municipios sin departamento',
    ],
  ];
  return `-- Verificación de instalación nueva, antes de empezar a operar (conteos exactos).
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF SQLBLANKLINES ON SERVEROUTPUT ON
DECLARE N NUMBER;
BEGIN
${pruebas.map(([sql, n, mensaje]) => `  ${sql.replace(/^SELECT COUNT\(\*\)/, 'SELECT COUNT(*) INTO N')};\n  IF N<>${n} THEN RAISE_APPLICATION_ERROR(-20091,${literal(mensaje + ': se esperaba ' + n)}); END IF;`).join('\n')}
  DBMS_OUTPUT.PUT_LINE('Instalación verificada: esquema, catálogos, integridad, ADMIN temporal y ausencia de datos privados.');
END;
/
`;
}

function generarErd(meta) {
  const tablas = meta.objetos
    .filter((o) => o.TIPO === 'TABLE')
    .map((o) => o.NOMBRE)
    .sort();
  const definiciones = tablas
    .map(
      (t) =>
        `  ${t} {\n${meta.columnas
          .filter((c) => c.TABLE_NAME === t && /^ID_/.test(c.COLUMN_NAME))
          .map(
            (c) =>
              `    ${c.DATA_TYPE.toLowerCase()} ${c.COLUMN_NAME}${c.IDENTITY_COLUMN === 'YES' ? ' PK' : meta.fk.some((f) => f.HIJA === t && f.COLUMNAS.split(',').includes(c.COLUMN_NAME)) ? ' FK' : ''}`,
          )
          .join('\n')}\n  }`,
    )
    .join('\n');
  const relaciones = meta.fk
    .map((f) => {
      const opcional = f.COLUMNAS.split(',').some((n) =>
        meta.columnas.some(
          (c) => c.TABLE_NAME === f.HIJA && c.COLUMN_NAME === n && c.NULLABLE === 'Y',
        ),
      );
      return `  ${f.PADRE} ${opcional ? 'o|' : '||'}--o{ ${f.HIJA} : "${f.NOMBRE.replace(/^SYS_C\d+$/, 'FK generada')}"`;
    })
    .join('\n');
  return `<!-- EXPORTACION_ERD_INICIO -->
## Esquema completo comprobado mediante Oracle (V000–V030)

Diagrama generado por \`npm run db:export\`: **${tablas.length} tablas**, **${meta.fk.length} FK**.
Incluye relaciones de auditoría y ciclos; la obligatoriedad exacta se consulta en \`01_esquema.sql\`.
Las entidades muestran columnas ID; las cardinalidades representan referencias, incluidas FK compuestas.
Las secuencias identity, índices, restricciones, comentarios y código PL/SQL están en la exportación.
La tabla VERSION_ESQUEMA pertenece al runner; PRUEBA_INFRAESTRUCTURA corresponde a V000.

\`\`\`mermaid
erDiagram
${definiciones}
${relaciones}
\`\`\`
<!-- EXPORTACION_ERD_FIN -->
`;
}

try {
  console.log('Leyendo DDL real y catálogos permitidos del contenedor nomina2-db…');
  const original = metadatos();
  const migraciones = await cargarMigraciones(raiz + 'db/migrations');
  const historial = consultar(
    'SELECT VERSION,ARCHIVO,CHECKSUM,ESTADO FROM VERSION_ESQUEMA ORDER BY VERSION',
  );
  assert.equal(historial.length, migraciones.length, 'Faltan migraciones aplicadas.');
  for (const [i, m] of migraciones.entries())
    assert.deepEqual(
      historial[i],
      { VERSION: m.version, ARCHIVO: m.archivo, CHECKSUM: m.checksum, ESTADO: 'APLICADA' },
      'El historial/checksum de migraciones difiere del repositorio.',
    );
  const datos = leerCatalogos();
  assert.equal(datos.find((c) => c.tabla === 'DEPARTAMENTOS_GT').filas.length, 22);
  assert.equal(datos.find((c) => c.tabla === 'MUNICIPIOS_GT').filas.length, 340);
  const privado = [];
  const nombresIne = new Set(
    datos
      .filter((c) => ['DEPARTAMENTOS_GT', 'MUNICIPIOS_GT'].includes(c.tabla))
      .flatMap((c) => c.filas.map((fila) => fila.NOMBRE)),
  );
  for (const tabla of ['USUARIOS', 'EMPLEADOS']) {
    const columnas = original.columnas
      .filter(
        (c) =>
          c.TABLE_NAME === tabla &&
          /^(DPI|NIT|AFILIACION_IGSS|CUENTA_BANCARIA|DIRECCION|DIRECCION_ANTERIOR|TELEFONO|CORREO|CONTRASENA_HASH|USUARIO)$/.test(
            c.COLUMN_NAME,
          ),
      )
      .map((c) => c.COLUMN_NAME);
    const filas = consultar(`SELECT ${columnas.map(identificador).join(',')} FROM ${tabla}`);
    for (const fila of filas)
      for (const [campo, valor] of Object.entries(fila)) {
        // Una dirección histórica que es solo el nombre oficial de un municipio no
        // convierte en privado ese nombre público del catálogo INE obligatorio.
        if (/^DIRECCION/.test(campo) && nombresIne.has(valor)) continue;
        if (typeof valor === 'string' && valor.length >= 5) privado.push(valor);
      }
  }
  // Salt público determinista: únicamente una contraseña de ejemplo, nunca una credencial operativa.
  const hashAdmin = await hash('Nomina2!Temporal2026', {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    salt: createHash('sha256').update('nomina2/export/admin/sintetico/v1').digest().subarray(0, 16),
  });
  const archivos = {
    '00_instalar_todo.sql': `-- Ejecutar conectado al usuario de aplicación de un esquema VACÍO en XEPDB1.
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF SQLBLANKLINES ON
@@01_esquema.sql
@@02_catalogos.sql
@@03_admin_inicial.sql
@@04_versiones.sql
@@05_verificar.sql
`,
    '01_esquema.sql': generarEsquema(original),
    '02_catalogos.sql': generarCatalogos(datos, original),
    '03_admin_inicial.sql': generarAdmin(hashAdmin),
    '04_versiones.sql': generarVersiones(migraciones),
    '05_verificar.sql': generarVerificacion(original, datos, migraciones),
  };
  const seguridad = auditarSeguridad(archivos, hashAdmin, privado);
  archivos['nomina2_completo.sql'] = generarScriptCompleto(archivos);
  auditarSeguridad(
    { 'nomina2_completo.sql': archivos['nomina2_completo.sql'] },
    hashAdmin,
    privado,
  );
  console.log('Reconstruyendo V000–V030 en un esquema desechable para contrastar definiciones…');
  const referencia = crearTemporal();
  let preparacion;
  await crearMigracionesRepository({
    execute: async (sql) => {
      preparacion = sql;
    },
  }).preparar();
  sqlplus(
    sentencia(preparacion) +
      migraciones
        .flatMap((m) => m.sentencias)
        .map(sentencia)
        .join('\n'),
    referencia,
  );
  const desdeMigraciones = metadatos(referencia);
  const diferenciasMigraciones = diferencias(original, desdeMigraciones);
  console.log(
    `Comparación con migraciones: ${diferenciasMigraciones.length} diferencias de definición.`,
  );
  console.log('Importando los archivos generados en otro esquema vacío…');
  const destino = crearTemporal();
  carpetaHost = await mkdtemp(join(tmpdir(), 'nomina2-export-'));
  carpetaContenedor = `/tmp/${destino.usuario}`;
  for (const [nombre, contenido] of Object.entries(archivos))
    await writeFile(join(carpetaHost, nombre), contenido);
  docker(['exec', '-T', 'nomina2-db', 'mkdir', '-p', '--', carpetaContenedor]);
  docker(['cp', carpetaHost + '/.', 'nomina2-db:' + carpetaContenedor]);
  sqlplus(`@${carpetaContenedor}/nomina2_completo.sql`, destino);
  const nueva = metadatos(destino);
  const diferenciasImportacion = diferencias(original, nueva);
  assert.deepEqual(diferenciasImportacion, [], 'La importación no reproduce el esquema original.');
  assert.deepEqual(leerCatalogos(destino), datos, 'Los valores de catálogos no coinciden.');
  const admin = consultar(
    "SELECT CONTRASENA_HASH,CAMBIO_OBLIGATORIO FROM USUARIOS WHERE USUARIO='admin.inicial'",
    destino,
  )[0];
  assert.equal(admin.CAMBIO_OBLIGATORIO, 1);
  assert.ok(await verify(admin.CONTRASENA_HASH, 'Nomina2!Temporal2026'));
  const reservas = consultar(
    'SELECT ENTIDAD,CODIGO,LEGADO FROM REGISTRO_CODIGOS ORDER BY ENTIDAD,CODIGO',
    destino,
  );
  for (const nombre of ['02_catalogos.sql', '03_admin_inicial.sql', '04_versiones.sql'])
    sqlplus(archivos[nombre], destino);
  assert.deepEqual(leerCatalogos(destino), datos, 'MERGE no idempotente.');
  assert.deepEqual(
    consultar(
      'SELECT ENTIDAD,CODIGO,LEGADO FROM REGISTRO_CODIGOS ORDER BY ENTIDAD,CODIGO',
      destino,
    ),
    reservas,
  );
  assert.deepEqual(
    consultar(
      "SELECT CONTRASENA_HASH,CAMBIO_OBLIGATORIO FROM USUARIOS WHERE USUARIO='admin.inicial'",
      destino,
    )[0],
    admin,
  );
  sqlplus(archivos['05_verificar.sql'], destino);
  // Inserción real en destino: identities y reservas de códigos deben continuar sin colisiones.
  sqlplus(
    `DECLARE V_ID NUMBER; V_CODIGO VARCHAR2(80); N NUMBER; BEGIN
    INSERT INTO TIPOS_DESCUENTO (NOMBRE,DESCRIPCION) VALUES ('Verificación temporal de exportación','Solo esquema desechable') RETURNING ID_TIPO_DESCUENTO,CODIGO INTO V_ID,V_CODIGO;
    SELECT COUNT(*) INTO N FROM REGISTRO_CODIGOS WHERE ENTIDAD='tipos-descuento' AND CODIGO=V_CODIGO;
    IF N<>1 OR V_ID IS NULL THEN RAISE_APPLICATION_ERROR(-20092,'Identity o código no continúan correctamente.'); END IF;
    ROLLBACK;
  END;\n/`,
    destino,
  );
  const reporte = {
    version: 'V000–V030',
    original: resumen(original),
    desde_migraciones: resumen(desdeMigraciones),
    importada: resumen(nueva),
    restricciones: Object.fromEntries(
      original.restricciones.map((r) => [r.CONSTRAINT_TYPE, r.TOTAL]),
    ),
    identities: original.columnas.filter((c) => c.IDENTITY_COLUMN === 'YES').length,
    catalogos: Object.fromEntries(datos.map((c) => [c.tabla, c.filas.length])),
    diferencias_migraciones: diferenciasMigraciones,
    diferencias_importacion: diferenciasImportacion,
    seguridad,
    idempotencia: true,
    insercion_identity_y_codigo: true,
    instalador_sqlplus: true,
    instalador_unico: true,
    sha256: Object.fromEntries(
      Object.entries(archivos).map(([n, c]) => [n, createHash('sha256').update(c).digest('hex')]),
    ),
  };
  await mkdir(raiz + 'db/export', { recursive: true });
  for (const [nombre, contenido] of Object.entries(archivos))
    await writeFile(raiz + 'db/export/' + nombre, contenido);
  await writeFile(raiz + 'db/export/verificacion.json', JSON.stringify(reporte, null, 2) + '\n');
  const erdPath = raiz + 'docs/ERD.md';
  const erd = await readFile(erdPath, 'utf8');
  const sinGenerado = erd.replace(
    /<!-- EXPORTACION_ERD_INICIO -->[\s\S]*?<!-- EXPORTACION_ERD_FIN -->\n*/,
    '',
  );
  await guardarMarkdown(erdPath, generarErd(original) + '\n' + sinGenerado);
  const progresoPath = raiz + 'docs/PROGRESO_V1.md';
  const progreso = await readFile(progresoPath, 'utf8');
  const nota = `<!-- EXPORTACION_VERIFICACION_INICIO -->
### Comprobación automática de la exportación (V000–V030)

- Objetos originales/importados: ${Object.entries(reporte.original)
    .map(([t, n]) => `${t} ${n}/${reporte.importada[t]}`)
    .join(', ')}.
- Restricciones originales/importadas: ${JSON.stringify(reporte.restricciones)}; ${reporte.identities} identities.
- Diferencias frente a migraciones reconstruidas: ${diferenciasMigraciones.length}. ${diferenciasMigraciones.map((d) => `${d.objeto} (${d.diferencia})`).join('; ') || 'Ninguna.'}
- Diferencias de la importación: 0. MERGE repetidos, ADMIN sintético argon2id/cambio obligatorio,
  tablas privadas vacías e inserción identity/código verificados. Ningún dato operativo modificado.
- Auditoría: cero hashes/correos/DPI reales, tokens o rutas locales; un hash sintético público permitido.
- Informe reproducible: db/export/verificacion.json. Los esquemas exclusivos N2EXP se eliminan al terminar.
<!-- EXPORTACION_VERIFICACION_FIN -->`;
  await guardarMarkdown(
    progresoPath,
    progreso.includes('<!-- EXPORTACION_VERIFICACION_INICIO -->')
      ? progreso.replace(
          /<!-- EXPORTACION_VERIFICACION_INICIO -->[\s\S]*?<!-- EXPORTACION_VERIFICACION_FIN -->/,
          nota,
        )
      : progreso + '\n' + nota + '\n',
  );
  console.log(
    `✓ Exportación verificada: ${reporte.original.TABLE} tablas, ${reporte.original.INDEX} índices, ${reporte.original.TRIGGER} triggers; importación idéntica, catálogos idempotentes y sin datos privados.`,
  );
} finally {
  const erroresLimpieza = [];
  for (const acceso of temporales.reverse()) {
    assert.match(acceso.usuario, /^N2EXP_[A-F0-9]{12}$/);
    try {
      sqlplus(`DROP USER ${acceso.usuario} CASCADE;`, 'sys');
    } catch {
      erroresLimpieza.push(`No se pudo retirar el esquema temporal ${acceso.usuario}.`);
    }
  }
  if (carpetaContenedor) {
    assert.match(carpetaContenedor, /^\/tmp\/N2EXP_[A-F0-9]{12}$/);
    try {
      docker(['exec', '-T', 'nomina2-db', 'rm', '-rf', '--', carpetaContenedor]);
    } catch {
      erroresLimpieza.push('No se pudo retirar la carpeta temporal del contenedor.');
    }
  }
  if (carpetaHost) await rm(carpetaHost, { recursive: true, force: true });
  assert.equal(erroresLimpieza.length, 0, erroresLimpieza.join(' '));
}
