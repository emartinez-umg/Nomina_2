import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { BindParameters } from 'oracledb';
import { crearApp } from '../../app.js';
import { crearBaseDatos } from '../../shared/db/pool.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { validarEntorno } from '../../config/env.schema.js';
import { crearLogger } from '../../config/logger.js';
import { ejecutarMigraciones } from '../../shared/db/migraciones.js';
import { ejecutarSeeds } from '../../shared/db/seeds.js';
import { validarEntornoSeeds } from '../../shared/db/seeds.env.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { crearAuthService } from '../auth/auth.service.js';
import { crearUsuariosService, crearUsuarioInterno } from '../usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { crearCatalogosService } from '../catalogos/catalogos.service.js';
import { crearEmpleadosService } from '../empleados/empleados.service.js';
import { alertas } from '../tableros/tableros.repository.js';
import { obtenerEquipoDeJefe } from './jefaturas.service.js';
import type { ActorAuditoria } from '../auth/auth.types.js';
let db: BaseDatos,
  rh: ReturnType<typeof request.agent>,
  csrf: string,
  empleado: typeof rh,
  csrfEmpleado: string;
const seed = validarEntornoSeeds(process.env),
  logger = crearLogger('silent');
const ids: number[] = [],
  jefaturas: number[] = [];
let dep: number, otro: number, centro: number;
const sql = (query: string, binds: BindParameters = {}) =>
  enTransaccion(db, (c) => c.execute(query, binds));
const scalar = (query: string, binds: BindParameters = {}) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(query, binds)).rows![0]![0]);
const crear = (nombre: string, responsable: number | null, superior: number | null = null) =>
  rh.post('/api/catalogos/jefaturas').set('X-CSRF-Token', csrf).send({
    nombre,
    idDepartamento: dep,
    idEmpleadoResponsable: responsable,
    idJefaturaSuperior: superior,
  });
const asignar = (idJefatura: number, empleados: number[]) =>
  rh
    .post('/api/catalogos/jefaturas/asignaciones')
    .set('X-CSRF-Token', csrf)
    .send({ idJefatura, empleados, motivo: 'Organización de equipo', confirmado: true });
describe('R3-5: jefaturas funcionales Oracle/API', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    await ejecutarMigraciones(db, logger);
    await ejecutarSeeds(db, logger, seed);
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
        catalogos: crearCatalogosService(db),
        empleados: crearEmpleadosService(db),
        config,
      },
    );
    const entrar = async (usuario: string, contrasena: string) => {
      const agent = request.agent(app),
        token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
      const r = await agent
        .post('/api/auth/login')
        .set('X-CSRF-Token', token)
        .send({ usuario, contrasena })
        .expect(200);
      return { agent, token: r.body.data.csrfToken as string };
    };
    const admin = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD);
    await admin.agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', admin.token)
      .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'PruebaJefaturas!2026' })
      .expect(200);
    const actor: ActorAuditoria = {
      idUsuario: Number(
        await scalar('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO=:u', { u: seed.ADMIN_USER }),
      ),
      idRol: Number(await scalar("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN'")),
      rol: 'ADMIN',
      ip: '127.0.0.1',
    };
    for (const rol of ['RH', 'EMPLEADO'] as const) {
      const cuenta = await enTransaccion(db, (c) =>
        crearUsuarioInterno(c, actor, {
          nombre: rol === 'RH' ? 'Gestora' : 'Persona',
          apellido: 'Jefaturas',
          correo: `${rol}@example.test`,
          rol,
        }),
      );
      await sql('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', {
        id: cuenta.idUsuario,
      });
      const login = await entrar(cuenta.usuario, cuenta.contrasenaTemporal);
      if (rol === 'RH') {
        rh = login.agent;
        csrf = login.token;
      } else {
        empleado = login.agent;
        csrfEmpleado = login.token;
      }
    }
    for (const nombre of ['Equipo Prueba', 'Otro Departamento']) {
      const r = await rh
        .post('/api/catalogos/departamentos')
        .set('X-CSRF-Token', csrf)
        .send({ nombre })
        .expect(201);
      if (!dep) dep = r.body.data.id;
      else otro = r.body.data.id;
    }
    await sql(
      "INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES('Centro Prueba','GUATEMALA_CIUDAD')",
    );
    centro = Number(await scalar('SELECT MAX(ID_CENTRO_TRABAJO) FROM CENTROS_TRABAJO'));
    for (let i = 0; i < 6; i++) {
      const departamento = i === 5 ? otro : dep;
      await sql('INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) VALUES(:nombre,:departamento)', {
        nombre: `Puesto ${i}`,
        departamento,
      });
      await sql(
        `INSERT INTO EMPLEADOS(NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO)
        SELECT :nombre,'López Pérez',:dpi,:nit,DATE '1990-01-01','F','SOLTERO','Calle 1','55551234',:correo,ID_PUESTO,:departamento,(SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO),:centro,DATE '2026-01-01' FROM PUESTOS WHERE NOMBRE=:puesto`,
        {
          nombre: ['Ana María', 'Bea', 'Carla', 'Diana', 'Eva', 'Flora'][i]!,
          dpi: `123456789012${i}`,
          nit: `123456${i}-1`,
          correo: `equipo${i}@example.test`,
          departamento,
          centro,
          puesto: `Puesto ${i}`,
        },
      );
      ids.push(Number(await scalar('SELECT MAX(ID_EMPLEADO) FROM EMPLEADOS')));
    }
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('parte vacío y cuenta empleados sin jefatura sin inventar organización', async () => {
    expect((await rh.get('/api/catalogos/jefaturas/resumen').expect(200)).body.data).toEqual({
      total: 0,
      sinJefatura: 6,
      sinJefe: 0,
    });
  });
  it('crea jerarquía de tres niveles, genera códigos y guarda responsable y etiquetas', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await crear(`Jefatura Nivel ${i + 1}`, ids[i]!, jefaturas[i - 1] ?? null).expect(
        201,
      );
      expect(r.body.data.codigo).toMatch(/^[A-Z][A-Z0-9]+$/);
      expect(r.body.data.idEmpleadoResponsableEtiqueta).toBe(
        ['Ana López', 'Bea López', 'Carla López'][i],
      );
      jefaturas.push(r.body.data.id);
    }
    const opciones = await rh.get('/api/catalogos/opciones/jefaturas').expect(200);
    expect(opciones.body.data).toHaveLength(3);
    const fila = (await rh.get(`/api/catalogos/jefaturas/${jefaturas[2]}`).expect(200)).body.data;
    expect(fila.idJefaturaSuperiorEtiqueta).toBe('Jefatura Nivel 2');
  });
  it('rechaza ciclos directos e indirectos sin alterar código ni superior', async () => {
    for (const superior of [jefaturas[0], jefaturas[2]]) {
      const r = await rh
        .patch(`/api/catalogos/jefaturas/${jefaturas[0]}`)
        .set('X-CSRF-Token', csrf)
        .send({
          nombre: 'Jefatura Nivel 1',
          idDepartamento: dep,
          idEmpleadoResponsable: ids[0],
          idJefaturaSuperior: superior,
        })
        .expect(409);
      expect(r.body.error.codigo).toBe('CICLO_JEFATURA');
    }
    expect(
      await scalar('SELECT ID_JEFATURA_SUPERIOR FROM JEFATURAS WHERE ID_JEFATURA=:id', {
        id: jefaturas[0]!,
      }),
    ).toBeNull();
  });
  it('rechaza jefe inactivo, incluso si se conserva al editar; alerta y permite corregirlo', async () => {
    await sql("UPDATE EMPLEADOS SET ESTADO='SUSPENDIDO' WHERE ID_EMPLEADO=:id", { id: ids[0]! });
    await crear('Jefe suspendido', ids[0]!).expect(409);
    await rh
      .patch(`/api/catalogos/jefaturas/${jefaturas[0]}`)
      .set('X-CSRF-Token', csrf)
      .send({
        nombre: 'Jefatura Nivel 1',
        idDepartamento: dep,
        idEmpleadoResponsable: ids[0],
        idJefaturaSuperior: null,
      })
      .expect(409);
    expect((await rh.get('/api/catalogos/jefaturas/resumen')).body.data.sinJefe).toBe(1);
    expect((await db.conConexion(alertas)).some((a) => a.tipo === 'SIN_JEFE')).toBe(true);
    await sql("UPDATE EMPLEADOS SET ESTADO='ACTIVO' WHERE ID_EMPLEADO=:id", { id: ids[0]! });
    await crear('Jefe ajeno', ids[5]!).expect(409);
  });
  it('asigna en bloque, filtra por centro/jefatura y deriva jefe inmediato en ficha/listado/CSV', async () => {
    const r = await asignar(jefaturas[0]!, [ids[1]!, ids[3]!]).expect(200);
    expect(r.body.data).toEqual({ asignados: 2, sinCambios: 0 });
    const listado = (
      await rh
        .get(
          `/api/empleados?idJefatura=${jefaturas[0]}&idCentroTrabajo=${centro}&idDepartamento=${dep}`,
        )
        .expect(200)
    ).body.data;
    expect(listado.total).toBe(2);
    expect(
      listado.registros.every((e: { jefeInmediato: string }) => e.jefeInmediato === 'Ana López'),
    ).toBe(true);
    expect((await rh.get(`/api/empleados/${ids[3]}`).expect(200)).body.data.jefeInmediato).toBe(
      'Ana López',
    );
    expect(
      (await rh.get(`/api/empleados/exportar?idJefatura=${jefaturas[0]}`).expect(200)).body.data,
    ).toContain('Ana López');
    expect((await asignar(jefaturas[0]!, [ids[3]!]).expect(200)).body.data).toEqual({
      asignados: 0,
      sinCambios: 1,
    });
    expect(
      Number(
        await scalar(
          "SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ENTIDAD='EMPLEADOS' AND ACCION='ASIGNAR_JEFATURA' AND ID_ENTIDAD=:id",
          { id: ids[3]! },
        ),
      ),
    ).toBe(1);
  });
  it('reemplaza la única jefatura y calcula el equipo descendiente sin duplicar al jefe', async () => {
    await asignar(jefaturas[1]!, [ids[2]!]).expect(200);
    await asignar(jefaturas[2]!, [ids[3]!, ids[4]!]).expect(200);
    expect(await obtenerEquipoDeJefe(db, ids[0]!)).toEqual([ids[1], ids[2], ids[3], ids[4]]);
    expect(await obtenerEquipoDeJefe(db, ids[1]!)).toEqual([ids[2], ids[3], ids[4]]);
    expect(await obtenerEquipoDeJefe(db, ids[2]!)).toEqual([ids[3], ids[4]]);
    expect(await obtenerEquipoDeJefe(db, ids[5]!)).toEqual([]);
    expect((await rh.get(`/api/empleados/${ids[3]}`)).body.data).toMatchObject({
      idJefatura: jefaturas[2],
      jefeInmediato: 'Carla López',
    });
    await sql('UPDATE JEFATURAS SET ACTIVO=0 WHERE ID_JEFATURA=:id', { id: jefaturas[1]! });
    expect(await obtenerEquipoDeJefe(db, ids[0]!)).toEqual([ids[1]]);
    await sql('UPDATE JEFATURAS SET ACTIVO=1 WHERE ID_JEFATURA=:id', { id: jefaturas[1]! });
  });
  it('revierte todo el lote si un empleado es ajeno o la auditoría falla', async () => {
    const antes = await scalar('SELECT ID_JEFATURA FROM EMPLEADOS WHERE ID_EMPLEADO=:id', {
      id: ids[3]!,
    });
    await asignar(jefaturas[0]!, [ids[3]!, ids[5]!]).expect(409);
    expect(
      await scalar('SELECT ID_JEFATURA FROM EMPLEADOS WHERE ID_EMPLEADO=:id', { id: ids[3]! }),
    ).toBe(antes);
    await sql(
      "CREATE OR REPLACE TRIGGER QA_JEFATURA_AUD BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='ASIGNAR_JEFATURA' THEN RAISE_APPLICATION_ERROR(-20001,'Fallo de auditoría QA'); END IF; END;",
    );
    try {
      await asignar(jefaturas[0]!, [ids[3]!, ids[4]!]).expect(500);
    } finally {
      await sql('DROP TRIGGER QA_JEFATURA_AUD');
    }
    expect(
      await scalar('SELECT ID_JEFATURA FROM EMPLEADOS WHERE ID_EMPLEADO=:id', { id: ids[3]! }),
    ).toBe(antes);
  });
  it('serializa cambios simultáneos que juntos formarían un ciclo', async () => {
    const a = (await crear('Rama A', ids[0]!).expect(201)).body.data,
      b = (await crear('Rama B', ids[1]!).expect(201)).body.data;
    const resultados = await Promise.all(
      [
        [a, b],
        [b, a],
      ].map(([x, y]) =>
        rh.patch(`/api/catalogos/jefaturas/${x.id}`).set('X-CSRF-Token', csrf).send({
          nombre: x.nombre,
          idDepartamento: dep,
          idEmpleadoResponsable: x.idEmpleadoResponsable,
          idJefaturaSuperior: y.id,
        }),
      ),
    );
    expect(resultados.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it('protege roles, CSRF, validación y mantiene alertas de pendientes', async () => {
    await empleado.get('/api/catalogos/jefaturas/resumen').expect(403);
    await empleado
      .post('/api/catalogos/jefaturas/asignaciones')
      .set('X-CSRF-Token', csrfEmpleado)
      .send({
        idJefatura: jefaturas[0],
        empleados: [ids[3]],
        motivo: 'No autorizado',
        confirmado: true,
      })
      .expect(403);
    await rh.post('/api/catalogos/jefaturas/asignaciones').send({}).expect(403);
    await rh
      .post('/api/catalogos/jefaturas/asignaciones')
      .set('X-CSRF-Token', csrf)
      .send({
        idJefatura: jefaturas[0],
        empleados: [ids[3], ids[3]],
        motivo: 'Duplicados',
        confirmado: true,
      })
      .expect(400);
    await crear('Pendiente de responsable', null).expect(201);
    const r = (await rh.get('/api/catalogos/jefaturas/resumen').expect(200)).body.data;
    expect(r.sinJefe).toBe(1);
    expect(r.sinJefatura).toBe(2);
    expect((await rh.get('/api/empleados?sinJefatura=1')).body.data.total).toBe(2);
    expect((await db.conConexion(alertas)).some((a) => a.tipo === 'SIN_JEFATURA')).toBe(true);
    expect(await ejecutarMigraciones(db, logger)).toBe(0);
  });
});
