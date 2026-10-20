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
import { calcularSaldo } from './vacaciones.reglas.js';
import * as repo from './vacaciones.repository.js';

let db: BaseDatos, empleado: number;
let antes: unknown[];
const logger = crearLogger('silent');
const scalar = (sql: string) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(sql)).rows![0]![0]);
describe('FASE V1-8: migración de vacaciones sin alterar aprobaciones', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version < 26),
        crearMigracionesRepository(c),
        logger,
      ),
    );
    await ejecutarSeeds(db, logger, validarEntornoSeeds(process.env));
    await enTransaccion(db, async (c) => {
      await c.execute("INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES ('Vacaciones histórico')");
      await c.execute(
        "INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) SELECT 'Puesto vacaciones',ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NOMBRE='Vacaciones histórico'",
      );
      await c.execute(
        "INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES ('Centro vacaciones','GUATEMALA_CIUDAD')",
      );
      await c.execute(
        "INSERT INTO EMPLEADOS(NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) SELECT 'Persona','Histórica','1234567890123','1234567-9',DATE '1990-01-01','M','SOLTERO','Dirección','55551234','historico@example.test',P.ID_PUESTO,P.ID_DEPARTAMENTO,(SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO),(SELECT MIN(ID_CENTRO_TRABAJO) FROM CENTROS_TRABAJO),DATE '2026-01-15' FROM PUESTOS P WHERE P.NOMBRE='Puesto vacaciones'",
      );
      await c.execute(
        "INSERT INTO SOLICITUDES(ID_EMPLEADO,ID_TIPO_SOLICITUD,ESTADO,RESUELTO_POR,RESUELTO_EN) SELECT ID_EMPLEADO,(SELECT ID_TIPO_SOLICITUD FROM TIPOS_SOLICITUD WHERE CODIGO_ANTERIOR='VACACIONES'),'APROBADA',(SELECT MIN(ID_USUARIO) FROM USUARIOS),SYSDATE FROM EMPLEADOS",
      );
      await c.execute(
        "INSERT INTO VACACIONES_SOLICITUDES(ID_EMPLEADO,ID_SOLICITUD,FECHA_INICIO,FECHA_FIN,DIAS_SOLICITADOS,SALDO_AL_SOLICITAR,SALDO_AL_RESOLVER,ESTADO,RESUELTO_POR,RESUELTO_EN,CREADO_POR) SELECT ID_EMPLEADO,(SELECT ID_SOLICITUD FROM SOLICITUDES),DATE '2095-01-03',DATE '2095-01-04',2,8,8,'APROBADA',(SELECT MIN(ID_USUARIO) FROM USUARIOS),SYSDATE,(SELECT MIN(ID_USUARIO) FROM USUARIOS) FROM EMPLEADOS",
      );
      await c.execute(
        "INSERT INTO VACACIONES_MOVIMIENTOS(ID_EMPLEADO,TIPO,FECHA,DIAS,CLAVE_ORIGEN,MOTIVO) SELECT ID_EMPLEADO,'ACUMULACION',DATE '2026-02-15',2,'MES:2026-02-15','Snapshot histórico distinto' FROM EMPLEADOS",
      );
      await c.execute(
        "INSERT INTO VACACIONES_MOVIMIENTOS(ID_EMPLEADO,ID_VACACIONES_SOLICITUD,TIPO,FECHA,DIAS,CLAVE_ORIGEN,MOTIVO) SELECT ID_EMPLEADO,ID_VACACIONES_SOLICITUD,'DISFRUTE',DATE '2026-10-15',-2,'SOLICITUD:'||ID_VACACIONES_SOLICITUD,'Aprobación original' FROM VACACIONES_SOLICITUDES",
      );
      await c.execute(
        "INSERT INTO VACACIONES_MOVIMIENTOS(ID_EMPLEADO,TIPO,FECHA,DIAS,CLAVE_ORIGEN,MOTIVO) SELECT ID_EMPLEADO,'AJUSTE',DATE '2026-10-15',-1,'PREVIAS:1','Vacaciones previas' FROM EMPLEADOS",
      );
    });
    empleado = Number(await scalar('SELECT ID_EMPLEADO FROM EMPLEADOS'));
    antes = await db.conConexion(
      async (c) =>
        (
          await c.execute<unknown[]>(
            'SELECT ID_VACACIONES_SOLICITUD,ID_EMPLEADO,ID_SOLICITUD,FECHA_INICIO,FECHA_FIN,DIAS_SOLICITADOS,SALDO_AL_SOLICITAR,SALDO_AL_RESOLVER,ESTADO,RESUELTO_POR,RESUELTO_EN,CREADO_POR FROM VACACIONES_SOLICITUDES',
          )
        ).rows![0]!,
    );
    expect(await ejecutarMigraciones(db, logger)).toBe(
      migraciones.filter((m) => m.version >= 26).length,
    );
    // El ensayo tiene corte fijo: el ajuste recién migrado debe pertenecer a ese corte,
    // no al día real de ejecución de Oracle (que puede ser posterior al 15/10/2026).
    await enTransaccion(db, (c) =>
      c.execute(
        "UPDATE VACACIONES_MOVIMIENTOS SET FECHA=DATE '2026-10-15' WHERE CLAVE_ORIGEN='MIGRACION_V1_8'",
      ),
    );
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('mantiene solicitud, débito y snapshots; añade solo la diferencia de acumulación', async () => {
    const despues = await db.conConexion(
      async (c) =>
        (
          await c.execute<unknown[]>(
            'SELECT ID_VACACIONES_SOLICITUD,ID_EMPLEADO,ID_SOLICITUD,FECHA_INICIO,FECHA_FIN,DIAS_SOLICITADOS,SALDO_AL_SOLICITAR,SALDO_AL_RESOLVER,ESTADO,RESUELTO_POR,RESUELTO_EN,CREADO_POR FROM VACACIONES_SOLICITUDES',
          )
        ).rows![0],
    );
    expect(despues).toEqual(antes);
    expect(await scalar("SELECT DIAS FROM VACACIONES_MOVIMIENTOS WHERE TIPO='DISFRUTE'")).toBe(-2);
    expect(
      await scalar("SELECT DIAS FROM VACACIONES_MOVIMIENTOS WHERE CLAVE_ORIGEN='MES:2026-02-15'"),
    ).toBe(2);
    expect(
      await scalar("SELECT DIAS FROM VACACIONES_MOVIMIENTOS WHERE CLAVE_ORIGEN='MIGRACION_V1_8'"),
    ).toBe(0.75);
    const s = await db.conConexion(async (c) =>
      calcularSaldo(
        '2026-01-15',
        '2026-10-15',
        await repo.parametros(c),
        await repo.movimientos(c, empleado),
      ),
    );
    expect(s).toMatchObject({
      acumulado: '11.25',
      tomados: '2.00',
      previas: '0.25',
      disponible: '9.00',
      solicitables: 9,
    });
  });
  it('conserva la apertura certificada y consumos posteriores sin necesitar tasas antiguas', async () => {
    await enTransaccion(db, async (c) => {
      await c.execute(
        "INSERT INTO VACACIONES_MOVIMIENTOS(ID_EMPLEADO,TIPO,FECHA,DIAS,CLAVE_ORIGEN,MOTIVO) VALUES (:id,'SALDO_INICIAL',DATE '2026-03-15',4.5,'APERTURA','Historia certificada')",
        { id: empleado },
      );
    });
    const s = await db.conConexion(async (c) =>
      calcularSaldo(
        '2026-01-15',
        '2026-10-15',
        await repo.parametros(c),
        await repo.movimientos(c, empleado),
      ),
    );
    // 4.50 de apertura + 7 meses × 1.25 - 2 aprobados - 1 previa + 0.75 compensación.
    expect(s.disponible).toBe('11.00');
    expect(await ejecutarMigraciones(db, logger)).toBe(0);
    expect(await scalar("SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'")).toBe(0);
  });
});
