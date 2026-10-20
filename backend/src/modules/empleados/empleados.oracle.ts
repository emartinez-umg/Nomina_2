import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { crearBaseDatos } from '../../shared/db/pool.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { validarEntorno } from '../../config/env.schema.js';
import { crearLogger } from '../../config/logger.js';
import { cargarMigraciones } from '../../shared/db/migraciones.archivos.js';
import { aplicarMigraciones, ejecutarMigraciones } from '../../shared/db/migraciones.js';
import { crearMigracionesRepository } from '../../shared/db/migraciones.repository.js';
import { ejecutarSeeds } from '../../shared/db/seeds.js';
import { validarEntornoSeeds } from '../../shared/db/seeds.env.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
let db: BaseDatos;
let codigo: string;
const logger = crearLogger('silent');
const seed = validarEntornoSeeds(process.env);
const scalar = (sql: string) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(sql)).rows![0]![0]);
describe('FASE V1-7: migración de empleados sin pérdida', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version < 25),
        crearMigracionesRepository(c),
        logger,
      ),
    );
    await ejecutarSeeds(db, logger, seed);
    await enTransaccion(db, async (c) => {
      await c.execute("INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES ('Departamento histórico')");
      await c.execute(
        "INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) SELECT 'Puesto histórico',ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NOMBRE='Departamento histórico'",
      );
      await c.execute(
        "INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES ('Centro histórico','Guatemala')",
      );
      await c.execute(
        "INSERT INTO EMPLEADOS(NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) SELECT 'Persona','Histórica','1234567890123','1234567-9',DATE '1990-01-01','O','SOLTERO','Texto de dirección histórico','55551234','historico@example.test',P.ID_PUESTO,P.ID_DEPARTAMENTO,(SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO),(SELECT MIN(ID_CENTRO_TRABAJO) FROM CENTROS_TRABAJO),DATE '2026-01-01' FROM PUESTOS P WHERE P.NOMBRE='Puesto histórico'",
      );
      await c.execute(
        "INSERT INTO EMPLEADO_CONTACTOS_EMERGENCIA(ID_EMPLEADO,NOMBRE,PARENTESCO,TELEFONO,PRIORIDAD) SELECT ID_EMPLEADO,'Persona contacto','Hermana','55554321',1 FROM EMPLEADOS",
      );
    });
    codigo = String(await scalar('SELECT CODIGO FROM EMPLEADOS'));
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version < 34),
        crearMigracionesRepository(c),
        logger,
      ),
    );
    await enTransaccion(db, (c) => c.execute("UPDATE EMPLEADOS SET NUMERO_CASA='12-A'"));
    expect(await ejecutarMigraciones(db, logger)).toBe(1);
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('conserva código, dirección y parentesco anteriores; no inventa ubicación ni sexo', async () => {
    const r = await db.conConexion(
      async (c) =>
        (
          await c.execute<unknown[]>(
            'SELECT CODIGO,DIRECCION_COMPLETA,DIRECCION_ANTERIOR,SEXO,SEXO_ANTERIOR,ID_DEPARTAMENTO_GT,ID_MUNICIPIO_GT FROM EMPLEADOS',
          )
        ).rows![0],
    );
    expect(r).toEqual([
      codigo,
      'Texto de dirección histórico',
      'Texto de dirección histórico',
      null,
      'O',
      null,
      null,
    ]);
    expect(await scalar('SELECT PARENTESCO_ANTERIOR FROM EMPLEADO_CONTACTOS_EMERGENCIA')).toBe(
      'Hermana',
    );
    expect(await scalar('SELECT PARENTESCO FROM EMPLEADO_CONTACTOS_EMERGENCIA')).toBe('Hermana');
  });
  it('R2-6: renombra y amplía Dirección sin perder el valor ni la dirección compuesta', async () => {
    expect(await scalar('SELECT DIRECCION FROM EMPLEADOS')).toBe('12-A');
    expect(
      await scalar(
        "SELECT COUNT(*) FROM USER_TAB_COLUMNS WHERE TABLE_NAME='EMPLEADOS' AND COLUMN_NAME='NUMERO_CASA'",
      ),
    ).toBe(0);
    expect(
      await scalar(
        "SELECT CHAR_LENGTH FROM USER_TAB_COLUMNS WHERE TABLE_NAME='EMPLEADOS' AND COLUMN_NAME='DIRECCION'",
      ),
    ).toBe(100);
    await enTransaccion(db, async (c) => {
      await c.execute('UPDATE EMPLEADOS SET DIRECCION=:direccion', { direccion: 'Á'.repeat(100) });
    });
    expect(await scalar('SELECT DIRECCION FROM EMPLEADOS')).toBe('Á'.repeat(100));
    await expect(
      enTransaccion(db, (c) => c.execute("UPDATE EMPLEADOS SET DIRECCION='@!'")),
    ).rejects.toMatchObject({ errorNum: 2290 });
    expect(
      await scalar("SELECT VALOR FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA='VALIDAR_DIGITO_NIT'"),
    ).toBe(0);
  });
  it('catálogo completo, contratos sincronizados, seeds repetibles y objetos válidos', async () => {
    expect(await scalar('SELECT COUNT(*) FROM PARENTESCOS')).toBe(12);
    expect(
      await scalar(
        "SELECT REQUIERE_FECHA_FIN FROM TIPOS_CONTRATO WHERE CODIGO_ANTERIOR='OBRA_DETERMINADA'",
      ),
    ).toBe(1);
    expect(
      await scalar('SELECT COUNT(*) FROM TIPOS_CONTRATO WHERE REQUIERE_FIN<>REQUIERE_FECHA_FIN'),
    ).toBe(0);
    await ejecutarSeeds(db, logger, seed);
    expect(await scalar('SELECT COUNT(*) FROM PARENTESCOS')).toBe(12);
    expect(await ejecutarMigraciones(db, logger)).toBe(0);
    expect(await scalar("SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'")).toBe(0);
  });
});
