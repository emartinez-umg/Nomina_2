import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const oracledb = requireBackend('oracledb');
const { verify } = requireBackend('argon2');

// DDL administrativo exclusivo de esta prueba. Los identificadores son aleatorios y validados;
// Oracle no permite binds para nombres de esquema. Nunca se borra el esquema de aplicación.
const usuario = `N2TEST_${randomBytes(6).toString('hex').toUpperCase()}`;
const clave = `T${randomBytes(12).toString('hex')}`;
assert.match(usuario, /^N2TEST_[A-F0-9]{12}$/);
assert.match(clave, /^T[a-f0-9]{24}$/);

function administrar(sql) {
  const resultado = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'nomina2-db', 'sqlplus', '-s', '/', 'as', 'sysdba'],
    {
      input: `WHENEVER SQLERROR EXIT FAILURE\nALTER SESSION SET CONTAINER = XEPDB1;\n${sql}\nEXIT;\n`,
      encoding: 'utf8',
      timeout: 120000,
    },
  );
  if (resultado.error || resultado.status !== 0) {
    throw new Error('No se pudo administrar el esquema temporal. Comprueba Docker y Oracle.');
  }
}

const filtros = JSON.parse(await readFile(new URL('../db/filtros.json', import.meta.url), 'utf8'));
const tablas = Object.keys(filtros);
const admin = {
  ADMIN_USER: 'admin.prueba',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: `Aa!${randomBytes(20).toString('hex')}`,
};
process.env.TZ = 'America/Guatemala';
oracledb.fetchAsString = [oracledb.CLOB];
const { crearBaseDatos } = await import('../backend/src/shared/db/pool.ts');
const { validarEntorno } = await import('../backend/src/config/env.schema.ts');
const { crearLogger } = await import('../backend/src/config/logger.ts');
const { ejecutarMigraciones } = await import('../backend/src/shared/db/migraciones.ts');
const { ejecutarSeeds, aplicarSeeds } = await import('../backend/src/shared/db/seeds.ts');
const { crearSeedsRepository } = await import('../backend/src/shared/db/seeds.repository.ts');
const logger = crearLogger('silent');
let db;
let creado = false;

try {
  administrar(
    `CREATE USER ${usuario} IDENTIFIED BY "${clave}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS;\nGRANT CONNECT, RESOURCE TO ${usuario};`,
  );
  creado = true;
  db = await crearBaseDatos(
    validarEntorno({
      ...process.env,
      DB_USER: usuario,
      DB_PASSWORD: clave,
      DB_CALL_TIMEOUT_MS: '30000',
      DB_POOL_MIN: '1',
      DB_POOL_MAX: '1',
    }),
  );
  assert.equal(await ejecutarMigraciones(db, logger), 33, 'Deben aplicar V000–V032 desde cero.');
  assert.equal(
    await ejecutarMigraciones(db, logger),
    0,
    'Segunda ejecución sin migraciones pendientes.',
  );
  await ejecutarSeeds(db, logger, admin);

  await db.conConexion(async (conexion) => {
    const consulta = async (sql, binds = {}) => (await conexion.execute(sql, binds)).rows ?? [];
    const escalar = async (sql, binds = {}) => (await consulta(sql, binds))[0]?.[0];
    assert.equal(
      await escalar("SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS <> 'VALID'"),
      0,
      'Todos los objetos y triggers deben compilar.',
    );
    assert.equal(
      await escalar("SELECT COUNT(*) FROM VERSION_ESQUEMA WHERE ESTADO = 'APLICADA'"),
      33,
    );
    assert.equal(
      await escalar(`SELECT COUNT(*) FROM USER_CONSTRAINTS
      WHERE STATUS <> 'ENABLED' OR VALIDATED <> 'VALIDATED'`),
      0,
    );
    const columnas = await consulta('SELECT TABLE_NAME, COLUMN_NAME FROM USER_TAB_COLUMNS');
    const identities = await consulta(`SELECT TABLE_NAME, COLUMN_NAME FROM USER_TAB_IDENTITY_COLS
      WHERE GENERATION_TYPE = 'ALWAYS'`);
    for (const tabla of tablas) {
      assert.ok(
        identities.some(([t]) => t === tabla),
        `${tabla}: PK identity ALWAYS.`,
      );
      for (const campo of [
        'CREADO_POR',
        'FECHA_CREACION',
        'MODIFICADO_POR',
        'FECHA_MODIFICACION',
        'ACTIVO',
      ]) {
        assert.ok(
          columnas.some(([t, c]) => t === tabla && c === campo),
          `${tabla}: falta ${campo}.`,
        );
      }
    }
    const indices = await consulta(`SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, COLUMN_POSITION
      FROM USER_IND_COLUMNS ORDER BY TABLE_NAME, INDEX_NAME, COLUMN_POSITION`);
    const indexados = (tabla, campos) =>
      indices.some(
        ([t, nombre, columna, posicion]) =>
          t === tabla &&
          posicion === 1 &&
          columna === campos[0] &&
          campos.every((campo, i) =>
            indices.some(
              ([it, ix, ic, ip]) => it === t && ix === nombre && ic === campo && ip === i + 1,
            ),
          ),
      );
    for (const [tabla, campos] of Object.entries(filtros)) {
      for (const campo of campos)
        assert.ok(indexados(tabla, [campo]), `${tabla}.${campo}: filtro sin índice.`);
    }
    const foraneas =
      await consulta(`SELECT C.TABLE_NAME, C.CONSTRAINT_NAME, CC.COLUMN_NAME, CC.POSITION
      FROM USER_CONSTRAINTS C JOIN USER_CONS_COLUMNS CC ON CC.CONSTRAINT_NAME = C.CONSTRAINT_NAME
      WHERE C.CONSTRAINT_TYPE = 'R' ORDER BY C.TABLE_NAME, C.CONSTRAINT_NAME, CC.POSITION`);
    for (const [tabla, nombre, , posicion] of foraneas) {
      if (posicion !== 1) continue;
      const campos = foraneas.filter(([t, n]) => t === tabla && n === nombre).map(([, , c]) => c);
      assert.ok(
        indexados(tabla, campos),
        `${nombre}: FK sin índice con todas sus columnas iniciales.`,
      );
    }
    const cuentaAdmin = await consulta(
      `SELECT CONTRASENA_HASH, CAMBIO_OBLIGATORIO
      FROM USUARIOS WHERE USUARIO = :usuario`,
      { usuario: admin.ADMIN_USER },
    );
    const hash = cuentaAdmin[0]?.[0];
    assert.ok(typeof hash === 'string' && hash.startsWith('$argon2id$'));
    assert.ok(await verify(hash, admin.ADMIN_PASSWORD));
    assert.equal(cuentaAdmin[0]?.[1], 1, 'El primer inicio requiere cambio de contraseña.');
    assert.equal(await escalar('SELECT COUNT(*) FROM ROLES'), 3);
    assert.equal(await escalar('SELECT COUNT(*) FROM TRAMOS_ISR'), 2);
    assert.equal(await escalar('SELECT COUNT(*) FROM PLANTILLAS_DOCUMENTO'), 3);
    assert.equal(await escalar('SELECT COUNT(*) FROM FERIADOS'), 13);
    assert.equal(
      await escalar(
        "SELECT TO_CHAR(FECHA, 'YYYY-MM-DD') FROM FERIADOS WHERE NVL(CODIGO_ANTERIOR,CODIGO) = 'DIA_EJERCITO'",
      ),
      '2026-06-29',
    );
    assert.equal(await escalar('SELECT COUNT(*) FROM FERIADOS WHERE MINUTO_INICIO = 720'), 2);
    assert.equal(
      await escalar(
        "SELECT VALOR FROM PARAMETROS_LEGALES WHERE NVL(CODIGO_ANTERIOR,CODIGO) = 'IGSS_LABORAL_PORCENTAJE'",
      ),
      4.83,
    );

    // Simula ajustes legítimos de RRHH y un ADMIN que ya cambió la contraseña.
    await conexion.execute(
      "UPDATE TIPOS_DESCUENTO SET NOMBRE = :nombre WHERE NVL(CODIGO_ANTERIOR,CODIGO) = 'PARQUEO'",
      {
        nombre: 'Parqueo editado por RRHH',
      },
    );
    await conexion.execute(
      "UPDATE PLANTILLAS_DOCUMENTO SET CONTENIDO = :texto WHERE CODIGO = 'CONSTANCIA_LABORAL'",
      { texto: 'Plantilla editada por RRHH' },
    );
    await conexion.execute('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO = 0 WHERE USUARIO = :usuario', {
      usuario: admin.ADMIN_USER,
    });
    await conexion.commit();
  });

  async function snapshot() {
    return db.conConexion(async (conexion) => {
      const resumen = {};
      for (const tabla of tablas) {
        // Nombres del manifiesto versionado, nunca de entrada del usuario.
        assert.match(tabla, /^[A-Z_]+$/);
        const pk = (
          await conexion.execute(
            `SELECT COLUMN_NAME FROM USER_CONS_COLUMNS
          WHERE CONSTRAINT_NAME IN (SELECT CONSTRAINT_NAME FROM USER_CONSTRAINTS
          WHERE TABLE_NAME = :tabla AND CONSTRAINT_TYPE = 'P')`,
            { tabla },
          )
        ).rows[0][0];
        assert.match(pk, /^ID_[A-Z_]+$/);
        const resultado = await conexion.execute(`SELECT * FROM ${tabla} ORDER BY ${pk}`);
        resumen[tabla] = createHash('sha256').update(JSON.stringify(resultado.rows)).digest('hex');
      }
      return JSON.stringify(resumen);
    });
  }
  const antes = await snapshot();
  await ejecutarSeeds(db, logger, {
    ...admin,
    ADMIN_PASSWORD: `Bb!${randomBytes(20).toString('hex')}`,
  });
  assert.ok(
    antes === (await snapshot()),
    'Seeds idempotentes: conservar filas, valores, hash y fechas.',
  );
  console.log(
    '✓ V000–V032 desde cero; tablas del manifiesto, identities, auditoría, CHECK y FKs indexadas.',
  );
  console.log('✓ Seeds repetibles; parámetros, feriados, plantillas y ADMIN argon2id verificados.');

  await db.conConexion(async (conexion) => {
    const escalar = async (sql, binds = {}) => (await conexion.execute(sql, binds)).rows?.[0]?.[0];
    const rechaza = async (sql, binds, codigo) => {
      await assert.rejects(
        () => conexion.execute(sql, binds),
        (error) => error.errorNum === codigo,
      );
    };
    await rechaza(
      "INSERT INTO ROLES (ID_ROL, CODIGO, NOMBRE) VALUES (99, 'ADMIN', 'Prueba')",
      {},
      32795,
    );
    await rechaza("INSERT INTO ROLES (CODIGO, NOMBRE) VALUES ('ADMIN', 'Duplicado')", {}, 1);
    await rechaza(
      "INSERT INTO TIPOS_CONTRATO (CODIGO, NOMBRE, ACTIVO) VALUES ('PRUEBA', 'Prueba', 2)",
      {},
      2290,
    );
    await rechaza(
      'INSERT INTO SESIONES (ID_USUARIO, TOKEN_HASH, CSRF_HASH, EXPIRA_EN) VALUES (-1, :token, :csrf, CURRENT_DATE + 1)',
      { token: randomBytes(32), csrf: randomBytes(32) },
      2291,
    );
    await rechaza(
      "INSERT INTO PERIODOS_NOMINA (FECHA_INICIO, FECHA_FIN, QUINCENA) VALUES (DATE '2026-01-02', DATE '2026-01-16', 1)",
      {},
      2290,
    );
    await conexion.execute(
      "INSERT INTO PERIODOS_NOMINA (FECHA_INICIO, FECHA_FIN, QUINCENA) VALUES (DATE '2026-01-16', DATE '2026-01-31', 2)",
    );
    await rechaza(
      "INSERT INTO PERIODOS_NOMINA (FECHA_INICIO, FECHA_FIN, QUINCENA) VALUES (DATE '2026-01-16', DATE '2026-01-31', 2)",
      {},
      1,
    );
    await rechaza("UPDATE BITACORA_AUDITORIA SET MOTIVO = 'alterada'", {}, 20001);
    await rechaza('DELETE FROM BITACORA_AUDITORIA', {}, 20001);
    await conexion.rollback();

    async function insertar(tabla, pk, datos) {
      assert.ok(tablas.includes(tabla));
      const campos = Object.keys(datos);
      for (const campo of [pk, ...campos]) assert.match(campo, /^[A-Z][A-Z0-9_]*$/);
      const resultado = await conexion.execute(
        `INSERT INTO ${tabla} (${campos.join(', ')}) VALUES (${campos.map((c) => `:${c}`).join(', ')}) RETURNING ${pk} INTO :salida`,
        { ...datos, salida: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      );
      return resultado.outBinds.salida[0];
    }
    const departamento = await insertar('DEPARTAMENTOS', 'ID_DEPARTAMENTO', {
      CODIGO: 'PRUEBA_A',
      NOMBRE: 'Prueba A',
    });
    const otroDepartamento = await insertar('DEPARTAMENTOS', 'ID_DEPARTAMENTO', {
      CODIGO: 'PRUEBA_B',
      NOMBRE: 'Prueba B',
    });
    const puesto = await insertar('PUESTOS', 'ID_PUESTO', {
      CODIGO: 'PRUEBA_A',
      NOMBRE: 'Prueba A',
      ID_DEPARTAMENTO: departamento,
    });
    const otroPuesto = await insertar('PUESTOS', 'ID_PUESTO', {
      CODIGO: 'PRUEBA_B',
      NOMBRE: 'Prueba B',
      ID_DEPARTAMENTO: otroDepartamento,
    });
    const centro = await insertar('CENTROS_TRABAJO', 'ID_CENTRO_TRABAJO', {
      CODIGO: 'PRUEBA',
      NOMBRE: 'Centro de prueba',
      LOCALIDAD: 'GUATEMALA_CIUDAD',
    });
    const contrato = await escalar(
      "SELECT ID_TIPO_CONTRATO FROM TIPOS_CONTRATO WHERE NVL(CODIGO_ANTERIOR,CODIGO) = 'INDEFINIDO'",
    );
    const persona = {
      CODIGO: 'PRUEBA_A',
      NOMBRES: 'Persona de prueba',
      APELLIDOS: 'Integridad',
      DPI: '1234567890123',
      NIT: '1234567-1',
      FECHA_NACIMIENTO: new Date(1990, 0, 1),
      SEXO: 'F',
      ESTADO_CIVIL: 'SOLTERO',
      DIRECCION: 'Dirección de prueba',
      TELEFONO: '12345678',
      CORREO: 'persona.a@example.test',
      ID_PUESTO: puesto,
      ID_DEPARTAMENTO: departamento,
      ID_TIPO_CONTRATO: contrato,
      ID_CENTRO_TRABAJO: centro,
      FECHA_INGRESO: new Date(2026, 0, 1),
    };
    await assert.rejects(
      () =>
        insertar('EMPLEADOS', 'ID_EMPLEADO', {
          ...persona,
          ID_DEPARTAMENTO: otroDepartamento,
        }),
      (error) => error.errorNum === 2291,
    );
    const empleado = await insertar('EMPLEADOS', 'ID_EMPLEADO', persona);
    const otroEmpleado = await insertar('EMPLEADOS', 'ID_EMPLEADO', {
      ...persona,
      CODIGO: 'PRUEBA_B',
      DPI: '1234567890124',
      NIT: '1234567-2',
      CORREO: 'persona.b@example.test',
    });
    const salario = await insertar('HISTORIAL_SALARIAL', 'ID_HISTORIAL_SALARIAL', {
      ID_EMPLEADO: empleado,
      SALARIO_BASE: '4000.00',
      VIGENTE_DESDE: new Date(2026, 0, 1),
      MOTIVO: 'Prueba',
    });
    const otroSalario = await insertar('HISTORIAL_SALARIAL', 'ID_HISTORIAL_SALARIAL', {
      ID_EMPLEADO: otroEmpleado,
      SALARIO_BASE: '4000.00',
      VIGENTE_DESDE: new Date(2026, 0, 1),
      MOTIVO: 'Prueba',
    });
    const periodo = await insertar('PERIODOS_NOMINA', 'ID_PERIODO_NOMINA', {
      FECHA_INICIO: new Date(2026, 0, 1),
      FECHA_FIN: new Date(2026, 0, 15),
      QUINCENA: 1,
    });
    const resultadoNomina = {
      ID_PERIODO_NOMINA: periodo,
      ID_EMPLEADO: empleado,
      ID_HISTORIAL_SALARIAL: salario,
      VERSION_CALCULO: 1,
      DIAS_PAGADOS: 15,
      SALARIO_BASE: '4000.00',
      TOTAL_INGRESOS: '2000.00',
      TOTAL_DESCUENTOS: '100.00',
      NETO: '1900.00',
      COSTO_PATRONAL: '250.00',
      DATOS_EMPLEADO: '{}',
    };
    await assert.rejects(
      () =>
        insertar('NOMINA_EMPLEADO', 'ID_NOMINA_EMPLEADO', {
          ...resultadoNomina,
          TOTAL_DESCUENTOS: '2001.00',
          NETO: '-1.00',
        }),
      (error) => error.errorNum === 2290,
    );
    await assert.rejects(
      () =>
        insertar('NOMINA_EMPLEADO', 'ID_NOMINA_EMPLEADO', {
          ...resultadoNomina,
          ID_HISTORIAL_SALARIAL: otroSalario,
        }),
      (error) => error.errorNum === 2291,
    );
    await assert.rejects(
      () =>
        insertar('NOMINA_EMPLEADO', 'ID_NOMINA_EMPLEADO', {
          ...resultadoNomina,
          DATOS_EMPLEADO: '{invalido',
        }),
      (error) => error.errorNum === 2290,
    );
    const nomina = await insertar('NOMINA_EMPLEADO', 'ID_NOMINA_EMPLEADO', resultadoNomina);
    const otraNomina = await insertar('NOMINA_EMPLEADO', 'ID_NOMINA_EMPLEADO', {
      ...resultadoNomina,
      ID_EMPLEADO: otroEmpleado,
      ID_HISTORIAL_SALARIAL: otroSalario,
    });
    const tipoVacaciones = await escalar(
      "SELECT ID_TIPO_SOLICITUD FROM TIPOS_SOLICITUD WHERE NVL(CODIGO_ANTERIOR,CODIGO) = 'VACACIONES'",
    );
    const solicitud = await insertar('SOLICITUDES', 'ID_SOLICITUD', {
      ID_EMPLEADO: empleado,
      ID_TIPO_SOLICITUD: tipoVacaciones,
    });
    const usuarioAdmin = await escalar('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO = :usuario', {
      usuario: admin.ADMIN_USER,
    });
    await assert.rejects(
      () =>
        insertar('VACACIONES_SOLICITUDES', 'ID_VACACIONES_SOLICITUD', {
          ID_SOLICITUD: solicitud,
          ID_EMPLEADO: empleado,
          FECHA_INICIO: new Date(2026, 10, 2),
          FECHA_FIN: new Date(2026, 10, 6),
          DIAS_SOLICITADOS: 5,
          SALDO_AL_SOLICITAR: 2,
          SALDO_AL_RESOLVER: 2,
          ESTADO: 'APROBADA',
          RESUELTO_POR: usuarioAdmin,
          RESUELTO_EN: new Date(),
        }),
      (error) => error.errorNum === 2290,
    );
    const documento = {
      ID_EMPLEADO: empleado,
      ID_NOMINA_EMPLEADO: nomina,
      ID_PERIODO_NOMINA: periodo,
      VERSION: 1,
      NOMBRE_ARCHIVO: 'boleta.pdf',
      RUTA_PRIVADA: 'prueba/a.pdf',
      SHA256: randomBytes(32),
      TAMANIO_BYTES: 100,
      VARIABLES_APLICADAS: '{}',
    };
    await insertar('DOCUMENTOS_GENERADOS', 'ID_DOCUMENTO_GENERADO', documento);
    await insertar('DOCUMENTOS_GENERADOS', 'ID_DOCUMENTO_GENERADO', {
      ...documento,
      ID_EMPLEADO: otroEmpleado,
      ID_NOMINA_EMPLEADO: otraNomina,
      RUTA_PRIVADA: 'prueba/b.pdf',
    });
    await assert.rejects(
      () =>
        insertar('DOCUMENTOS_GENERADOS', 'ID_DOCUMENTO_GENERADO', {
          ...documento,
          ID_EMPLEADO: otroEmpleado,
          VERSION: 2,
          RUTA_PRIVADA: 'prueba/ajena.pdf',
        }),
      (error) => error.errorNum === 2291,
    );
    const anuncio = await insertar('ANUNCIOS', 'ID_ANUNCIO', {
      TITULO: 'Prueba de varios grupos',
      CONTENIDO: 'Prueba',
      VIGENTE_DESDE: new Date(2026, 0, 1),
      VIGENTE_HASTA: new Date(2026, 11, 31),
      PARA_TODOS: 0,
    });
    for (const idPuesto of [puesto, otroPuesto]) {
      await insertar('ANUNCIO_DESTINATARIOS', 'ID_ANUNCIO_DESTINATARIO', {
        ID_ANUNCIO: anuncio,
        ID_PUESTO: idPuesto,
      });
    }
    await assert.rejects(
      () =>
        insertar('ANUNCIO_DESTINATARIOS', 'ID_ANUNCIO_DESTINATARIO', {
          ID_ANUNCIO: anuncio,
          ID_PUESTO: puesto,
        }),
      (error) => error.errorNum === 1,
    );
    await conexion.rollback();

    await conexion.execute(
      `INSERT INTO USUARIOS (ID_ROL, USUARIO, CORREO, CONTRASENA_HASH)
      SELECT ID_ROL, 'colision.seed', 'colision@example.test', U.CONTRASENA_HASH
      FROM USUARIOS U WHERE USUARIO = :usuario`,
      { usuario: admin.ADMIN_USER },
    );
    await conexion.execute(`UPDATE USUARIOS SET ID_ROL = (SELECT ID_ROL FROM ROLES WHERE CODIGO = 'RH')
      WHERE USUARIO = 'colision.seed'`);
    await conexion.commit();
    await assert.rejects(
      () =>
        aplicarSeeds(
          ["INSERT INTO BANCOS (CODIGO, NOMBRE) VALUES ('ROLLBACK', 'Prueba transaccional')"],
          crearSeedsRepository(conexion),
          { ...admin, ADMIN_USER: 'colision.seed' },
        ),
      /otro rol/,
    );
    assert.equal(
      await escalar("SELECT COUNT(*) FROM BANCOS WHERE NVL(CODIGO_ANTERIOR,CODIGO) = 'ROLLBACK'"),
      0,
    );
  });
  console.log(
    '✓ Rechazo real de duplicados, identidades manuales, FKs inválidas, quincenas solapadas y bitácora mutable.',
  );
  console.log('✓ Colisión de ADMIN sin elevación de rol; rollback íntegro de seeds.');
  console.log(
    '✓ Neto, JSON, saldo de vacaciones, pertenencia organizativa y propiedad de salario/documentos.',
  );
  console.log('✓ Varios grupos y boletas coexistentes; índices UNIQUE condicionales de Oracle.');
} catch (error) {
  console.error(
    error.code && error.code !== 'ERR_ASSERTION'
      ? `Falló verificación Oracle: ${error.code}.`
      : error.message,
  );
  process.exitCode = 1;
} finally {
  await db?.cerrar();
  if (creado) {
    administrar(`DROP USER ${usuario} CASCADE;`);
    console.log('✓ Esquema temporal eliminado; datos de aplicación conservados.');
  }
}
