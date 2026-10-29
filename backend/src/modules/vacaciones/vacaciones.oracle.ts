import { crearCatalogosService } from '../catalogos/catalogos.service.js';
import { crearSaldosVacacionesService } from './vacaciones.saldos.service.js';
import { saldosQuerySchema } from './vacaciones.saldos.schemas.js';
import { unzipSync, strFromU8 } from 'fflate';
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
import oracledb from 'oracledb';
import request from 'supertest';
import { crearApp } from '../../app.js';
import { crearAuthService } from '../auth/auth.service.js';
import { crearUsuarioInterno, crearUsuariosService } from '../usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { crearVacacionesService } from './vacaciones.service.js';
import { aprobacionColisiones, contarColisionesSql } from './vacaciones.colisiones.repository.js';
import type { ActorAuditoria } from '../auth/auth.types.js';

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
  describe('R3-6: colisiones, confirmación y privacidad con Oracle/API real', () => {
    let rh: ReturnType<typeof request.agent>, e: typeof rh, csrf: string, csrfEmpleado: string;
    let actor: ActorAuditoria, objetivo: number;
    const personas: number[] = [],
      solicitudes: number[] = [];
    const inicio = '2095-02-07',
      fin = '2095-02-11';
    const ejecutar = (sql: string, binds: oracledb.BindParameters = {}) =>
      enTransaccion(db, (c) => c.execute(sql, binds));
    const numero = (sql: string, binds: oracledb.BindParameters = {}) =>
      db.conConexion(async (c) => Number((await c.execute<unknown[]>(sql, binds)).rows![0]![0]));
    const crearSolicitud = (persona: number, desde = inicio, hasta = fin, estado = 'EN_PROCESO') =>
      enTransaccion(db, async (c) => {
        const id = await repo.crear(c, persona, desde, hasta, '1', '100', actor.idUsuario);
        if (estado === 'APROBADA' || estado === 'RECHAZADA')
          await repo.resolver(
            c,
            id,
            estado,
            estado === 'RECHAZADA' ? 'Rechazo de prueba' : '',
            '1',
            '100',
            actor.idUsuario,
          );
        else if (estado !== 'EN_PROCESO')
          await c.execute(
            'UPDATE VACACIONES_SOLICITUDES SET ESTADO=:estado WHERE ID_VACACIONES_SOLICITUD=:id',
            { id, estado },
          );
        return id;
      });
    const informe = async () =>
      (await rh.get(`/api/vacaciones/solicitudes/${objetivo}/colisiones`).expect(200)).body.data;
    const resolver = (extra: Record<string, unknown> = {}) =>
      rh
        .post(`/api/vacaciones/solicitudes/${objetivo}/resolver`)
        .set('X-CSRF-Token', csrf)
        .send({ estado: 'APROBADA', confirmado: true, ...extra });
    beforeAll(async () => {
      const config = {
        NODE_ENV: 'test' as const,
        SESSION_IDLE_MINUTES: 30,
        LOGIN_RATE_LIMIT: 1000,
        LOGIN_RATE_WINDOW_MINUTES: 15,
        TRUST_PROXY_CIDRS: '',
      };
      const app = crearApp(
        {
          consultar: async () => ({
            estado: 'OK',
            baseDatos: 'CONECTADA',
            modo: 'thin',
            fecha: new Date().toISOString(),
          }),
        },
        logger,
        {
          auth: await crearAuthService(db, config),
          usuarios: crearUsuariosService(db),
          auditoria: crearAuditoriaService(db),
          vacaciones: crearVacacionesService(db),
          catalogos: crearCatalogosService(db),
          config,
        },
      );
      const seed = validarEntornoSeeds(process.env);
      actor = {
        idUsuario: await numero('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO=:u', {
          u: seed.ADMIN_USER,
        }),
        idRol: await numero("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN'"),
        rol: 'ADMIN',
        ip: '127.0.0.1',
      };
      for (const rol of ['RH', 'EMPLEADO'] as const) {
        const cuenta = await enTransaccion(db, (c) =>
          crearUsuarioInterno(c, actor, {
            nombre: rol === 'RH' ? 'Gestora' : 'Titular',
            apellido: 'Colisiones',
            correo: `${rol}.colisiones@example.test`,
            rol,
          }),
        );
        await ejecutar('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', {
          id: cuenta.idUsuario,
        });
        const agent = request.agent(app),
          token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
        const login = await agent
          .post('/api/auth/login')
          .set('X-CSRF-Token', token)
          .send({ usuario: cuenta.usuario, contrasena: cuenta.contrasenaTemporal })
          .expect(200);
        if (rol === 'RH') {
          rh = agent;
          csrf = login.body.data.csrfToken;
        } else {
          e = agent;
          csrfEmpleado = login.body.data.csrfToken;
        }
      }
      for (const nombre of ['Departamento Colisiones', 'Otro Colisiones']) {
        await ejecutar('INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES(:nombre)', { nombre });
        await ejecutar(
          'INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) SELECT :nombre,ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NOMBRE=:nombre',
          { nombre },
        );
        await ejecutar(
          "INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES(:nombre,'GUATEMALA_CIUDAD')",
          { nombre },
        );
      }
      for (let i = 0; i < 6; i++) {
        const dep = [0, 0, 1, 0, 1, 0][i] ? 'Otro Colisiones' : 'Departamento Colisiones';
        const centro = [0, 1, 0, 0, 1, 0][i] ? 'Otro Colisiones' : 'Departamento Colisiones';
        await ejecutar(
          `INSERT INTO EMPLEADOS(NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO)
          SELECT :nombre,'Colisiones',:dpi,:nit,DATE '1990-01-01','F','SOLTERO','Calle 1','55551234',:correo,ID_PUESTO,ID_DEPARTAMENTO,(SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO),(SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE NOMBRE=:centro),DATE '2020-01-01' FROM PUESTOS WHERE NOMBRE=:dep`,
          {
            nombre: ['Titular', 'Ana', 'Bea', 'Carla', 'Diana', 'Eva'][i]!,
            dpi: `777777777777${i}`,
            nit: `777777${i}-1`,
            correo: `colision${i}@example.test`,
            centro,
            dep,
          },
        );
        personas.push(
          await numero('SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CORREO=:correo', {
            correo: `colision${i}@example.test`,
          }),
        );
      }
      await ejecutar(
        "UPDATE EMPLEADOS SET ID_USUARIO=(SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO='titular.colisiones') WHERE ID_EMPLEADO=:id",
        { id: personas[0]! },
      );
      await ejecutar("INSERT INTO HORARIOS(NOMBRE,JORNADA) VALUES('Horario Colisiones','DIURNA')");
      await ejecutar(
        "INSERT INTO HORARIO_BLOQUES(ID_HORARIO,MINUTO_ENTRADA,MINUTO_SALIDA,MINUTOS_DESCANSO) SELECT ID_HORARIO,480,1020,60 FROM HORARIOS WHERE NOMBRE='Horario Colisiones'",
      );
      for (const dia of [1, 2, 3, 4, 5])
        await ejecutar(
          "INSERT INTO HORARIO_BLOQUE_DIAS(ID_HORARIO_BLOQUE,DIA_SEMANA) SELECT ID_HORARIO_BLOQUE,:dia FROM HORARIO_BLOQUES WHERE ID_HORARIO=(SELECT ID_HORARIO FROM HORARIOS WHERE NOMBRE='Horario Colisiones')",
          { dia },
        );
      await ejecutar(
        `INSERT INTO EMPLEADO_HORARIO(ID_EMPLEADO,ID_HORARIO,VIGENTE_DESDE,MOTIVO) SELECT :id,ID_HORARIO,DATE '2020-01-01','Horario de prueba' FROM HORARIOS WHERE NOMBRE='Horario Colisiones'`,
        { id: personas[0]! },
      );
      objetivo = await crearSolicitud(personas[0]!);
      solicitudes.push(await crearSolicitud(personas[1]!, '2095-02-05', '2095-02-08', 'APROBADA'));
      solicitudes.push(await crearSolicitud(personas[2]!, '2095-02-06', '2095-02-15'));
      solicitudes.push(await crearSolicitud(personas[3]!, '2095-02-09', '2095-02-10', 'APROBADA'));
      solicitudes.push(await crearSolicitud(personas[4]!)); // Sin departamento ni centro en común.
      solicitudes.push(await crearSolicitud(personas[5]!, '2095-02-12', '2095-02-15')); // Adyacente.
      for (const estado of ['RECHAZADA', 'CANCELADA', 'TOMADA'])
        solicitudes.push(
          await crearSolicitud(
            personas[5]!,
            inicio,
            fin,
            estado === 'TOMADA' ? 'APROBADA' : estado,
          ),
        );
      await ejecutar(
        "UPDATE VACACIONES_SOLICITUDES SET ESTADO='TOMADA' WHERE ID_VACACIONES_SOLICITUD=:id",
        { id: solicitudes.at(-1)! },
      );
      const inactiva = await crearSolicitud(personas[5]!);
      await ejecutar(
        'UPDATE VACACIONES_SOLICITUDES SET ACTIVO=0 WHERE ID_VACACIONES_SOLICITUD=:id',
        { id: inactiva },
      );
      await crearSolicitud(personas[0]!, '2095-02-08', '2095-02-09'); // El propio nunca es colisión de equipo.
    });
    it('detecta traslape parcial, total, ambos alcances y excluye rangos/estados ajenos', async () => {
      const r = await informe();
      expect(r.colisiones).toHaveLength(3);
      expect(
        r.colisiones.map((s: { tipoCoincidencia: string; diasCoincidentes: number }) => [
          s.tipoCoincidencia,
          s.diasCoincidentes,
        ]),
      ).toEqual([
        ['Mismo departamento', 2],
        ['Mismo centro de trabajo', 5],
        ['Ambos', 2],
      ]);
      expect(r.ocupacion).toEqual({ tamanoEquipo: 5, maximoAusentes: 3, fechaMaximo: inicio });
      expect(r.lineaTiempo).toHaveLength(5);
      expect(r.colisiones[0]).toMatchObject({
        estado: 'APROBADA',
        departamento: 'Departamento Colisiones',
        centro: 'Otro Colisiones',
        inicioCoincidencia: inicio,
        finCoincidencia: '2095-02-08',
      });
      expect(r.colisiones[0].codigo).toMatch(/^EMP_/);
      // Quita el traslape propio de la fixture para las validaciones reales de aprobación.
      await ejecutar(
        'UPDATE VACACIONES_SOLICITUDES SET ACTIVO=0 WHERE ID_EMPLEADO=:id AND ID_VACACIONES_SOLICITUD<>:objetivo',
        { id: personas[0]!, objetivo },
      );
    });
    it('incluye aprobadas en curso y resuelve límites inclusivos', async () => {
      const fecha = await db.conConexion(
        async (c) =>
          (
            await c.execute<string[]>(
              "SELECT TO_CHAR(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),'YYYY-MM-DD') FROM DUAL",
            )
          ).rows![0]![0]!,
      );
      const actual = await crearSolicitud(personas[0]!, fecha, fecha);
      const otra = await crearSolicitud(personas[1]!, fecha, fecha, 'APROBADA');
      const r = (await rh.get(`/api/vacaciones/solicitudes/${actual}/colisiones`).expect(200)).body
        .data;
      expect(r.colisiones).toHaveLength(1);
      expect(r.colisiones[0]).toMatchObject({
        idSolicitud: otra,
        diasCoincidentes: 1,
        estado: 'APROBADA',
      });
    });
    it('un centro vacío no coincide con otro centro vacío ni con ningún centro', async () => {
      const esquema = process.env.DB_USER!;
      expect(esquema).toMatch(/^N2SEC_[A-F0-9]{12}$/);
      // El esquema actual exige centro; esta proyección ensaya también la futura ausencia sin alterar su nulabilidad.
      const total = await numero(
        `WITH EMPLEADOS AS (SELECT ID_EMPLEADO,ID_DEPARTAMENTO,CAST(NULL AS NUMBER) ID_CENTRO_TRABAJO FROM ${esquema}.EMPLEADOS)
        SELECT ${contarColisionesSql} FROM VACACIONES_SOLICITUDES V JOIN EMPLEADOS E ON E.ID_EMPLEADO=V.ID_EMPLEADO WHERE V.ID_VACACIONES_SOLICITUD=:id`,
        { id: objetivo },
      );
      expect(total).toBe(2); // Solo departamento, nunca la persona de otro departamento.
    });
    it('la insignia, el filtro paginado y CSV usan la misma consulta', async () => {
      const r = (
        await rh
          .get(`/api/vacaciones/solicitudes?idEmpleado=${personas[0]}&conColisiones=true&limite=1`)
          .expect(200)
      ).body.data;
      expect(r.total).toBe(2);
      expect(r.registros).toHaveLength(1);
      expect(r.registros[0].cantidadColisiones).toBeGreaterThan(0);
      const csv = (
        await rh
          .get(`/api/vacaciones/exportar?idEmpleado=${personas[0]}&conColisiones=true`)
          .expect(200)
      ).body.data;
      expect(csv).toContain('Colisiones');
    });
    it('exige confirmación específica y revisión actual sin descontar ni auditar al fallar', async () => {
      await resolver().expect(409);
      await resolver({ confirmarColisiones: true }).expect(409);
      const r = await resolver({
        confirmarColisiones: true,
        revisionColisiones: '0'.repeat(64),
      }).expect(409);
      expect(r.body.error.codigo).toBe('COLISIONES_SIN_CONFIRMAR');
      expect(
        await numero(
          'SELECT COUNT(*) FROM VACACIONES_MOVIMIENTOS WHERE ID_VACACIONES_SOLICITUD=:id',
          { id: objetivo },
        ),
      ).toBe(0);
      expect(
        await numero(
          "SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ID_ENTIDAD=:id AND ACCION='VACACIONES_APROBADA'",
          { id: objetivo },
        ),
      ).toBe(0);
    });
    it('mantiene el bloqueo de saldo insuficiente incluso confirmando colisiones', async () => {
      await ejecutar(
        "INSERT INTO VACACIONES_MOVIMIENTOS(ID_EMPLEADO,TIPO,FECHA,DIAS,CLAVE_ORIGEN,MOTIVO) VALUES(:id,'SALDO_INICIAL',TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)),0,'R36_APERTURA','Saldo de prueba')",
        { id: personas[0]! },
      );
      const r = await informe();
      const fallo = await resolver({
        confirmarColisiones: true,
        revisionColisiones: r.revision,
      }).expect(409);
      expect(fallo.body.error.mensaje).toMatch(/Puedes solicitar 0/);
      expect(
        await numero(
          'SELECT COUNT(*) FROM VACACIONES_MOVIMIENTOS WHERE ID_VACACIONES_SOLICITUD=:id',
          { id: objetivo },
        ),
      ).toBe(0);
      await ejecutar(
        "UPDATE VACACIONES_MOVIMIENTOS SET DIAS=20 WHERE ID_EMPLEADO=:id AND CLAVE_ORIGEN='R36_APERTURA'",
        { id: personas[0]! },
      );
    });
    it('revalida cambios entre lectura y confirmación', async () => {
      const r = await informe();
      const nueva = await crearSolicitud(personas[5]!, '2095-02-10', '2095-02-11');
      await resolver({ confirmarColisiones: true, revisionColisiones: r.revision }).expect(409);
      await ejecutar(
        'UPDATE VACACIONES_SOLICITUDES SET ACTIVO=0 WHERE ID_VACACIONES_SOLICITUD=:id',
        { id: nueva },
      );
    });
    it('revierte aprobación, copia y débito si falla la auditoría', async () => {
      const r = await informe();
      await ejecutar(
        "CREATE OR REPLACE TRIGGER R36_AUDITORIA BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='VACACIONES_APROBADA' THEN RAISE_APPLICATION_ERROR(-20001,'Fallo de prueba'); END IF; END;",
      );
      try {
        await resolver({ confirmarColisiones: true, revisionColisiones: r.revision }).expect(500);
        expect(await db.conConexion((c) => aprobacionColisiones(c, objetivo))).toBeNull();
        expect(
          await numero(
            'SELECT COUNT(*) FROM VACACIONES_MOVIMIENTOS WHERE ID_VACACIONES_SOLICITUD=:id',
            { id: objetivo },
          ),
        ).toBe(0);
      } finally {
        await ejecutar('DROP TRIGGER R36_AUDITORIA');
      }
    });
    it('aprueba con colisiones, conserva copia exacta y bitácora transaccional', async () => {
      const r = await informe();
      await resolver({ confirmarColisiones: true, revisionColisiones: r.revision }).expect(200);
      const copia = await db.conConexion((c) => aprobacionColisiones(c, objetivo));
      expect(copia).toMatchObject({
        revision: r.revision,
        colisiones: r.colisiones,
        ocupacion: r.ocupacion,
      });
      const bitacora = await db.conConexion(
        async (c) =>
          (
            await c.execute<{ despues: string }>(
              'SELECT VALORES_NUEVOS "despues" FROM BITACORA_AUDITORIA WHERE ID_ENTIDAD=:id AND ACCION=\'VACACIONES_APROBADA\'',
              { id: objetivo },
              {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
                fetchInfo: { despues: { type: oracledb.STRING } },
              },
            )
          ).rows![0]!.despues,
      );
      expect(JSON.parse(bitacora).colisionesAprobacion).toEqual(copia);
      expect(
        await numero(
          'SELECT COUNT(*) FROM VACACIONES_MOVIMIENTOS WHERE ID_VACACIONES_SOLICITUD=:id',
          { id: objetivo },
        ),
      ).toBe(1);
      await ejecutar(
        'UPDATE VACACIONES_SOLICITUDES SET ACTIVO=0 WHERE ID_VACACIONES_SOLICITUD=:id',
        { id: solicitudes[0]! },
      );
      expect((await informe()).aprobacion).toEqual(copia);
      expect((await informe()).colisiones).toHaveLength(2);
      await resolver({ confirmarColisiones: true, revisionColisiones: r.revision }).expect(409);
    });
    it('el empleado no ve colisiones, copias, conteos ni filtros en ningún endpoint propio', async () => {
      await e.get(`/api/vacaciones/solicitudes/${objetivo}/colisiones`).expect(403);
      await e.get('/api/vacaciones/solicitudes?conColisiones=true').expect(403);
      await e.get('/api/vacaciones/exportar?conColisiones=true').expect(403);
      await e
        .post(`/api/vacaciones/solicitudes/${objetivo}/resolver`)
        .set('X-CSRF-Token', csrfEmpleado)
        .send({ estado: 'APROBADA', confirmado: true })
        .expect(403);
      for (const path of [
        `/api/vacaciones/solicitudes/${objetivo}`,
        '/api/vacaciones/solicitudes',
        '/api/vacaciones/mi-saldo',
        '/api/vacaciones/exportar',
        '/api/vacaciones/notificaciones',
      ]) {
        const r = await e.get(path).expect(200);
        expect(JSON.stringify(r.body)).not.toMatch(
          /"(?:colisiones|colisionesAprobacion|COLISIONES_APROBACION|cantidadColisiones|revision|tamanoEquipo)"\s*:|Ana Colisiones|Bea Colisiones|Carla Colisiones/i,
        );
      }
      const cancelacion = await e
        .post(`/api/vacaciones/solicitudes/${objetivo}/cancelar`)
        .set('X-CSRF-Token', csrfEmpleado)
        .send({ confirmado: true, motivo: 'Cambio de planes personal' })
        .expect(200);
      expect(JSON.stringify(cancelacion.body)).not.toMatch(
        /"(?:colisiones|colisionesAprobacion|COLISIONES_APROBACION|cantidadColisiones|revision|tamanoEquipo)"\s*:|Ana Colisiones|Bea Colisiones|Carla Colisiones/i,
      );
    });

    it('R3-7: saldos con 505 empleados, filtros, orden, páginas, exportación y RBAC', async () => {
      await ejecutar(`INSERT INTO EMPLEADOS(NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO)
        SELECT 'Carga','Saldos', '888'||LPAD(LEVEL,10,'0'),'88'||LPAD(LEVEL,7,'0')||'-1',DATE '1990-01-01','F','SOLTERO','Calle 1','55551234','saldos'||LEVEL||'@example.test',
        (SELECT ID_PUESTO FROM PUESTOS WHERE NOMBRE='Departamento Colisiones'),
        (SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NOMBRE='Departamento Colisiones'),
        (SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO),
        (SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE NOMBRE='Departamento Colisiones'),
        ADD_MONTHS(TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)),-12)
        FROM DUAL CONNECT BY LEVEL<=505`);
      const ids = await db.conConexion(async (c) =>
        (
          await c.execute<{ ID: number }>(
            "SELECT ID_EMPLEADO ID FROM EMPLEADOS WHERE NOMBRES='Carga' ORDER BY ID_EMPLEADO",
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          )
        ).rows!.map((r) => r.ID),
      );
      await ejecutar(
        "INSERT INTO VACACIONES_MOVIMIENTOS(ID_EMPLEADO,TIPO,FECHA,DIAS,CLAVE_ORIGEN,MOTIVO) VALUES(:id,'AJUSTE',TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)),0.25,'SALDOS:REVERSO','Devolución de prueba')",
        { id: ids[0]! },
      );
      const base = '/api/vacaciones/saldos';
      const comienzo = performance.now();
      const r = (await rh.get(base).query({ buscar: 'Carga Saldos', limite: 1 }).expect(200)).body
        .data;
      const duracion = performance.now() - comienzo;
      expect(r.total).toBe(505);
      expect(r.registros[0]).toMatchObject({
        id: ids[0],
        disponible: '15.25',
        alerta: true,
        mesesCompletos: 12,
      });
      expect(r.indicadores).toEqual({
        empleadosAlerta: 1,
        promedioDisponible: '15.00',
        totalAcumulado: '7575.00',
      });
      expect(duracion).toBeLessThan(5000);
      console.info(`R3-7: 505 empleados, listado/indicadores en ${Math.round(duracion)} ms`);
      const pagina = (
        await rh
          .get(base)
          .query({
            buscar: 'Carga Saldos',
            pagina: 6,
            limite: 100,
            ordenarPor: 'codigo',
            direccion: 'asc',
          })
          .expect(200)
      ).body.data;
      expect(pagina.registros).toHaveLength(5);
      expect(pagina.total).toBe(505);
      const alerta = (
        await rh.get(base).query({ buscar: 'Carga Saldos', soloAlerta: true }).expect(200)
      ).body.data;
      expect(alerta.total).toBe(1);
      expect(alerta.registros[0].id).toBe(ids[0]);
      const sin = (
        await rh
          .get(base)
          .query({ buscar: 'Carga Saldos', ordenarPor: 'disponible', direccion: 'asc', limite: 1 })
          .expect(200)
      ).body.data.registros[0];
      expect(sin.disponible).toBe('15.00');
      expect(sin.alerta).toBe(false);
      const dep = await numero(
        "SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NOMBRE='Departamento Colisiones'",
      );
      const centro = await numero(
        "SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE NOMBRE='Departamento Colisiones'",
      );
      await ejecutar(
        "INSERT INTO JEFATURAS(NOMBRE,ID_DEPARTAMENTO) VALUES('Jefatura Saldos',:dep)",
        { dep },
      );
      const jefe = await numero("SELECT ID_JEFATURA FROM JEFATURAS WHERE NOMBRE='Jefatura Saldos'");
      await ejecutar('UPDATE EMPLEADOS SET ID_JEFATURA=:jefe WHERE ID_EMPLEADO=:id', {
        jefe,
        id: ids[0]!,
      });
      const combinados = {
        buscar: 'Carga Saldos',
        idDepartamento: dep,
        idCentroTrabajo: centro,
        idJefatura: jefe,
        soloAlerta: true,
      };
      expect((await rh.get(base).query(combinados).expect(200)).body.data.total).toBe(1);
      expect(
        (
          await rh
            .get(base)
            .query({ ...combinados, idDepartamento: 999999 })
            .expect(200)
        ).body.data.total,
      ).toBe(0);
      const codigo = r.registros[0].codigo;
      expect((await rh.get(base).query({ buscar: codigo }).expect(200)).body.data.total).toBe(1);
      for (const formato of ['csv', 'excel']) {
        const exportado = (
          await rh
            .get(`${base}/exportar/${formato}`)
            .query({ buscar: 'Carga Saldos', limite: 1 })
            .expect(200)
        ).body.data;
        const bytes = Buffer.from(exportado.base64, 'base64');
        const texto =
          formato === 'csv'
            ? bytes.toString()
            : strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']!);
        expect(texto.match(/EMP_/g)).toHaveLength(505);
        expect(texto).toContain('Más de 15 días');
        expect(texto).toContain('Sin alerta');
      }
      const servicio = crearSaldosVacacionesService(db, async () => [ids[0]!]);
      const acotado = await servicio.listar(
        {
          ...actor,
          idSesion: 0,
          csrfHash: Buffer.alloc(32),
          activo: true,
          usuario: 'admin.prueba',
          correo: 'admin@example.test',
          cambioObligatorio: false,
        },
        saldosQuerySchema.parse({ alcance: 'equipo', buscar: 'Carga Saldos' }),
      );
      expect(acotado.total).toBe(1);
      expect(
        (
          await crearSaldosVacacionesService(db, async () => []).listar(
            {
              ...actor,
              idSesion: 0,
              csrfHash: Buffer.alloc(32),
              activo: true,
              usuario: 'admin.prueba',
              correo: 'admin@example.test',
              cambioObligatorio: false,
            },
            saldosQuerySchema.parse({ alcance: 'equipo' }),
          )
        ).total,
      ).toBe(0);
      await ejecutar('UPDATE EMPLEADOS SET ACTIVO=0 WHERE ID_EMPLEADO=:id', { id: ids[0]! });
      expect(
        (await rh.get(base).query({ buscar: 'Carga Saldos', soloAlerta: true }).expect(200)).body
          .data.total,
      ).toBe(0);
      expect(
        (await rh.get(base).query({ buscar: 'Carga Saldos', activos: 'false' }).expect(200)).body
          .data.total,
      ).toBe(1);
      expect(
        (await rh.get(base).query({ buscar: 'Carga Saldos', activos: 'todos' }).expect(200)).body
          .data.total,
      ).toBe(505);
      for (const ruta of [base, `${base}/exportar/csv`, `${base}/exportar/excel`])
        await e.get(ruta).expect(403);
      await rh.get(base).query({ empleados: ids[0] }).expect(400);
      await rh.get(base).query({ alcance: 'equipo' }).expect(403);
      // Actor ADMIN también consulta por servicio y no recibe datos sensibles.
      expect(JSON.stringify(acotado)).not.toMatch(/salario|banco|dpi|nit|usuario/i);
    });
    it('R3-7: umbral editable solo con confirmación, motivo y copia auditada', async () => {
      const actual = (await rh.get('/api/vacaciones/saldos').expect(200)).body.data;
      const fila = (
        await rh.get(`/api/catalogos/parametros-legales/${actual.idParametro}`).expect(200)
      ).body.data;
      const cambio = {
        nombre: fila.nombre,
        valor: '20',
        unidad: 'DIAS',
        vigenteDesde: '2026-01-01',
        vigenteHasta: null,
        fundamento: 'Planeación del descanso',
        motivo: 'Ajuste operativo del umbral',
        confirmado: true,
      };
      const url = `/api/catalogos/parametros-legales/${fila.id}`;
      await rh
        .patch(url)
        .set('X-CSRF-Token', csrf)
        .send({ ...cambio, confirmado: false })
        .expect(400);
      await rh
        .patch(url)
        .set('X-CSRF-Token', csrf)
        .send({ ...cambio, motivo: '' })
        .expect(400);
      await rh
        .patch(url)
        .set('X-CSRF-Token', csrf)
        .send({ ...cambio, valor: '0' })
        .expect(409);
      await rh.patch(url).set('X-CSRF-Token', csrf).send(cambio).expect(200);
      expect((await rh.get('/api/vacaciones/saldos').expect(200)).body.data.umbral).toBe('20');
      const historial = await db.conConexion(
        async (c) =>
          (
            await c.execute<unknown[]>(
              "SELECT VALORES_ANTERIORES,VALORES_NUEVOS,MOTIVO FROM BITACORA_AUDITORIA WHERE ENTIDAD='PARAMETROS_LEGALES' AND ACCION IN ('VERSIONAR_CATALOGO','EDITAR_CATALOGO') ORDER BY ID_BITACORA_AUDITORIA DESC FETCH FIRST 1 ROW ONLY",
              {},
              {
                fetchInfo: {
                  VALORES_ANTERIORES: { type: oracledb.STRING },
                  VALORES_NUEVOS: { type: oracledb.STRING },
                },
              },
            )
          ).rows,
      );
      expect(JSON.stringify(historial)).toContain('Ajuste operativo del umbral');
    });
  });
});
