import assert from 'node:assert/strict';
import test from 'node:test';
import { literal, identificador } from './exportar-bd-oracle.mjs';
import {
  auditarSeguridad,
  ordenarDependencias,
  normalizarDdl,
  diferencias,
  generarCatalogos,
} from './exportar-bd-modelo.mjs';

test('literales preservan comillas y entradas SQL; identificadores rechazan inyección', () => {
  assert.equal(
    literal("San Juan O'Connor; DROP TABLE USUARIOS;"),
    "'San Juan O''Connor; DROP TABLE USUARIOS;'",
  );
  assert.equal(literal(null), 'NULL');
  assert.throws(() => identificador('ROLES; DROP TABLE USUARIOS'));
});

test('dependencias respetan padres y resuelven ciclos mediante FK posteriores', () => {
  assert.deepEqual(
    ordenarDependencias(
      ['HIJA', 'PADRE', 'ABUELO'],
      [
        ['HIJA', 'PADRE'],
        ['PADRE', 'ABUELO'],
      ],
    ),
    ['ABUELO', 'PADRE', 'HIJA'],
  );
  assert.deepEqual(
    new Set(
      ordenarDependencias(
        ['A', 'B'],
        [
          ['A', 'B'],
          ['B', 'A'],
        ],
      ),
    ),
    new Set(['A', 'B']),
  );
});

test('normalización ignora solo nombres generados y contador, conserva cambios de reglas', () => {
  assert.equal(
    normalizarDdl('CONSTRAINT "SYS_C11" CHECK (N>0) START WITH 21'),
    normalizarDdl('CONSTRAINT "SYS_C99" CHECK (N>0) START WITH 1'),
  );
  assert.notEqual(normalizarDdl('CHECK (N>0)'), normalizarDdl('CHECK (N>=0)'));
  const base = {
    objetos: [{ TIPO: 'TABLE', NOMBRE: 'A', DDL: 'CHECK (N>0)' }],
    fk: [],
    columnas: [],
    inventario: [],
    restricciones: [],
    comentarios: [],
    triggers: [],
  };
  assert.deepEqual(
    diferencias(base, { ...base, objetos: [{ TIPO: 'TABLE', NOMBRE: 'A', DDL: 'CHECK (N>=0)' }] }),
    [{ objeto: 'TABLE:A', diferencia: 'definicion_distinta' }],
  );
});

test('comparación conserva columnas y literales y tolera orden de constraints de Oracle', () => {
  const a =
    'CREATE TABLE "A" ("X" NUMBER, "Y" VARCHAR2(20), CONSTRAINT "B" CHECK ("X">0), CONSTRAINT "C" UNIQUE ("X"))';
  const b =
    'CREATE TABLE "A" ("X" NUMBER, "Y" VARCHAR2(20), CONSTRAINT "C" UNIQUE ("X"), CONSTRAINT "B" CHECK ("X">0))';
  assert.equal(normalizarDdl(a), normalizarDdl(b));
  assert.notEqual(
    normalizarDdl(a),
    normalizarDdl(b.replace('"X" NUMBER, "Y" VARCHAR2(20)', '"Y" VARCHAR2(20), "X" NUMBER')),
  );
  assert.notEqual(normalizarDdl("CHECK (NOMBRE='a  b')"), normalizarDdl("CHECK (NOMBRE='a b')"));
  assert.equal(
    literal('texto\r\n/\nHOST comando'),
    "'texto'||CHR(13)||''||CHR(10)||'/'||CHR(10)||'HOST comando'",
  );
});

test('catálogos preservan JSON CLOB sin convertir listas a texto separado por comas', () => {
  const sql = generarCatalogos(
    [
      {
        tabla: 'PLANTILLAS_DOCUMENTO',
        claves: ['CODIGO'],
        columnas: ['CODIGO', 'VARIABLES_PERMITIDAS'],
        filas: [
          { CODIGO: 'PLANTILLA', VARIABLES_PERMITIDAS: ['nombre', 'dpi'], TIPO_CODIGO: 'TRAMITE' },
        ],
      },
    ],
    {
      triggers: [],
      columnas: [
        { TABLE_NAME: 'PLANTILLAS_DOCUMENTO', COLUMN_NAME: 'CODIGO', DATA_TYPE: 'VARCHAR2' },
        {
          TABLE_NAME: 'PLANTILLAS_DOCUMENTO',
          COLUMN_NAME: 'VARIABLES_PERMITIDAS',
          DATA_TYPE: 'CLOB',
        },
      ],
    },
  );
  assert.ok(sql.includes('TO_CLOB(\'["nombre","dpi"]\')'));
  assert.ok(!sql.includes("TO_CLOB('nombre,dpi')"));
});

test('auditoría admite solo credencial sintética y rechaza datos privados/patrones', () => {
  const hash = '$argon2id$v=19$m=65536,t=3,p=1$ejemplo$ejemplo';
  const seguro = {
    '03.sql': `'${hash}' admin@example.invalid`,
    '01.sql': "CHECK (CONTRASENA_HASH LIKE '$argon2id$%')",
  };
  assert.equal(auditarSeguridad(seguro, hash).hashes_reales, 0);
  for (const contaminacion of [
    'persona@empresa.com',
    '1234 56789 0123',
    '1234567890123',
    '/Users/persona/archivo',
    '/home/persona/archivo',
    'C:\\Users\\persona\\archivo',
    hash.replaceAll('ejemplo', 'otro'),
    'dato privado de origen',
  ]) {
    assert.throws(() =>
      auditarSeguridad({ ...seguro, '02.sql': contaminacion }, hash, ['dato privado de origen']),
    );
  }
});
