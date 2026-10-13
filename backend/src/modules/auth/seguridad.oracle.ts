import { crearNominaService } from '../nomina/nomina.service.js';
import { entradaPrueba } from '../nomina/nomina.fixture.js';
import { crearVacacionesService } from '../vacaciones/vacaciones.service.js';
import express from 'express';
import type { Express } from 'express';
import type { BindParameters } from 'oracledb';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../app.js';
import { validarEntorno } from '../../config/env.schema.js';
import { crearLogger } from '../../config/logger.js';
import { crearBaseDatos } from '../../shared/db/pool.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { ejecutarMigraciones } from '../../shared/db/migraciones.js';
import { ejecutarSeeds } from '../../shared/db/seeds.js';
import { validarEntornoSeeds } from '../../shared/db/seeds.env.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { autenticar } from '../../shared/security/autenticar.js';
import { COOKIE_SESION } from '../../shared/security/csrf.js';
import {
  autenticacionDe,
  exigirCambioCompletado,
  permitirRoles,
  verificarPropiedad,
} from '../../shared/security/rbac.js';
import { politicaContrasena } from '../../shared/security/credenciales.js';
import { manejarErrores } from '../../shared/middleware/error-handler.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { crearUsuariosService, crearUsuarioInterno } from '../usuarios/usuarios.service.js';
import { crearAuthService } from './auth.service.js';
import type { AuthService, ConfigSeguridad } from './auth.service.js';
import type { ActorAuditoria, Rol } from './auth.types.js';

import { crearEmpleadosService } from '../empleados/empleados.service.js';
import { columnasCsv, escribirCsv } from '../empleados/empleados.csv.js';
import { crearCatalogosService } from '../catalogos/catalogos.service.js';
import { crearNovedadesService, registrarCobroCuota } from '../novedades/novedades.service.js';

const logger = crearLogger('silent');
let db: BaseDatos;
let auth: AuthService;
let app: Express;
let admin: ActorAuditoria;
let secuencia = 0;
const config: ConfigSeguridad = {
  NODE_ENV: 'test',
  SESSION_IDLE_MINUTES: 7,
  LOGIN_RATE_LIMIT: 1000,
  LOGIN_RATE_WINDOW_MINUTES: 15,
  TRUST_PROXY_CIDRS: '',
};
const claveNueva = 'MiClaveNueva!2026';
const seed = validarEntornoSeeds(process.env);
const crearApi = (opciones = config) =>
  crearApp(
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
      auth,
      nomina: crearNominaService(db),
      empleados: crearEmpleadosService(db),
      novedades: crearNovedadesService(db),
      vacaciones: crearVacacionesService(db),
      catalogos: crearCatalogosService(db),
      config: opciones,
      usuarios: crearUsuariosService(db),
      auditoria: crearAuditoriaService(db),
    },
  );
async function escalar(sql: string, binds: BindParameters = {}) {
  return db.conConexion(async (c) => (await c.execute<unknown[]>(sql, binds)).rows?.[0]?.[0]);
}
async function ejecutar(sql: string, binds: BindParameters = {}) {
  return enTransaccion(db, (c) => c.execute(sql, binds));
}
async function crearCuenta(rol: Rol = 'EMPLEADO', temporal = false) {
  const cuenta = await enTransaccion(db, (c) =>
    crearUsuarioInterno(c, admin, {
      nombre: 'Persona',
      apellido: `Prueba${++secuencia}`,
      correo: `persona${secuencia}@example.test`,
      rol,
    }),
  );
  if (!temporal)
    await ejecutar('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO = 0 WHERE ID_USUARIO = :id', {
      id: cuenta.idUsuario,
    });
  return cuenta;
}
async function entrar(usuario: string, contrasena: string, api = app) {
  const agent = request.agent(api);
  const inicio = await agent.get('/api/auth/csrf').expect(200);
  const login = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', inicio.body.data.csrfToken as string)
    .send({ usuario, contrasena })
    .expect(200);
  return { agent, csrf: login.body.data.csrfToken as string, respuesta: login };
}
async function entrarAdmin() {
  return entrar(seed.ADMIN_USER, claveNueva);
}
async function entrarCuenta(rol: Rol = 'EMPLEADO', temporal = false) {
  const cuenta = await crearCuenta(rol, temporal);
  return { ...(await entrar(cuenta.usuario, cuenta.contrasenaTemporal)), cuenta };
}
function cookiesDe(res: { headers: Record<string, unknown> }) {
  return (res.headers['set-cookie'] as string[]).map((cookie) => cookie.split(';')[0]!).join('; ');
}

describe('Fase 2: HTTP y transacciones contra Oracle thin real', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo se admiten esquemas temporales N2SEC del verificador.');
    process.env.TZ = 'America/Guatemala';
    db = await crearBaseDatos(validarEntorno(process.env));
    await ejecutarMigraciones(db, logger);
    await ejecutarSeeds(db, logger, seed);
    admin = {
      idUsuario: Number(
        await escalar('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO = :usuario', {
          usuario: seed.ADMIN_USER,
        }),
      ),
      idRol: Number(await escalar("SELECT ID_ROL FROM ROLES WHERE CODIGO = 'ADMIN'")),
      rol: 'ADMIN',
      ip: '127.0.0.1',
    };
    auth = await crearAuthService(db, config);
    app = crearApi();
    const inicial = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD);
    await inicial.agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', inicial.csrf)
      .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: claveNueva })
      .expect(200);
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  beforeEach(() => {
    app = crearApi();
  });

  it('deniega rutas protegidas sin sesión y rechaza cookies falsificadas', async () => {
    for (const ruta of ['/api/usuarios', '/api/auditoria', '/api/futura', '/api/auth/sesion'])
      await request(app).get(ruta).expect(401);
    await request(app)
      .get('/api/usuarios')
      .set('Cookie', `${COOKIE_SESION}=${'a'.repeat(64)}`)
      .expect(401);
    await request(app).get('/api/salud').expect(200);
  });
  it('login exige CSRF aun antes de autenticar', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ usuario: seed.ADMIN_USER, contrasena: claveNueva })
      .expect(403);
    expect(r.body.error.codigo).toBe('CSRF_INVALIDO');
  });
  it('login guarda solo hashes, entrega cookies httpOnly Strict y recupera CSRF', async () => {
    const { agent, csrf, respuesta, cuenta } = await entrarCuenta();
    expect(respuesta.headers['cache-control']).toBe('no-store');
    expect(respuesta.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/nomina2_sesion=.*HttpOnly; SameSite=Strict/)]),
    );
    const r = await agent.get('/api/auth/sesion').expect(200);
    expect(r.body.data.idUsuario).toBe(cuenta.idUsuario);
    expect(r.text).not.toMatch(/contrasenaHash|csrfHash|idSesion/);
    const rec = await agent.get('/api/auth/csrf').expect(200);
    expect(rec.body.data.csrfToken).toBe(csrf);
    expect(
      await escalar(
        'SELECT UTL_RAW.LENGTH(TOKEN_HASH) FROM SESIONES WHERE ID_USUARIO = :id AND ACTIVO = 1',
        { id: cuenta.idUsuario },
      ),
    ).toBe(32);
    expect(
      await escalar(
        'SELECT UTL_RAW.LENGTH(CSRF_HASH) FROM SESIONES WHERE ID_USUARIO = :id AND ACTIVO = 1',
        { id: cuenta.idUsuario },
      ),
    ).toBe(32);
  });
  it('producción añade Secure a las cookies de sesión y CSRF', async () => {
    const api = crearApi({ ...config, NODE_ENV: 'production' });
    const r = await request(api).get('/api/auth/csrf').expect(200);
    const login = await request(api)
      .post('/api/auth/login')
      .set('Cookie', cookiesDe(r))
      .set('X-CSRF-Token', r.body.data.csrfToken as string)
      .send({ usuario: seed.ADMIN_USER, contrasena: claveNueva })
      .expect(200);
    for (const cookie of login.headers['set-cookie'] as unknown as string[])
      expect(cookie).toContain('Secure');
  });
  it('bloquea tras cinco fallos concurrentes y permite reintentar al vencer los 15 minutos', async () => {
    const cuenta = await crearCuenta();
    const agent = request.agent(app);
    const inicio = await agent.get('/api/auth/csrf');
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, () =>
        agent
          .post('/api/auth/login')
          .set('X-CSRF-Token', inicio.body.data.csrfToken as string)
          .send({ usuario: cuenta.usuario, contrasena: 'Incorrecta!123' }),
      ),
    );
    expect(respuestas.map((r) => r.status).sort()).toEqual([401, 401, 401, 401, 423]);
    expect(
      await escalar('SELECT INTENTOS_FALLIDOS FROM USUARIOS WHERE ID_USUARIO = :id', {
        id: cuenta.idUsuario,
      }),
    ).toBe(5);
    const diferencia = Number(
      await escalar(
        "SELECT ROUND((BLOQUEADO_HASTA - CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE))*1440) FROM USUARIOS WHERE ID_USUARIO = :id",
        { id: cuenta.idUsuario },
      ),
    );
    expect(diferencia).toBe(15);
    await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', inicio.body.data.csrfToken as string)
      .send({ usuario: cuenta.usuario, contrasena: cuenta.contrasenaTemporal })
      .expect(423);
    await ejecutar(
      "UPDATE USUARIOS SET BLOQUEADO_HASTA = CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE) - 1/1440 WHERE ID_USUARIO = :id",
      { id: cuenta.idUsuario },
    );
    await entrar(cuenta.usuario, cuenta.contrasenaTemporal);
    expect(
      await escalar('SELECT INTENTOS_FALLIDOS FROM USUARIOS WHERE ID_USUARIO = :id', {
        id: cuenta.idUsuario,
      }),
    ).toBe(0);
  });
  it('rate limit responde 429 con Retry-After y error uniforme', async () => {
    const api = crearApi({ ...config, LOGIN_RATE_LIMIT: 5 });
    const agent = request.agent(api);
    const inicio = await agent.get('/api/auth/csrf');
    for (let i = 0; i < 5; i++)
      await agent
        .post('/api/auth/login')
        .set('X-CSRF-Token', inicio.body.data.csrfToken as string)
        .send({ usuario: 'no.existe', contrasena: 'Incorrecta!123' })
        .expect(401);
    const r = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', inicio.body.data.csrfToken as string)
      .send({ usuario: 'no.existe', contrasena: 'Incorrecta!123' })
      .expect(429);
    expect(r.body.error.codigo).toBe('LIMITE_INTENTOS');
    expect(r.headers['retry-after']).toBeTruthy();
  });
  it('primer login bloquea toda la API, valida política y rota sesión tras cambiar la clave', async () => {
    const { agent, csrf, respuesta, cuenta } = await entrarCuenta('EMPLEADO', true);
    for (const ruta of ['/api/usuarios', '/api/auditoria', '/api/futura']) {
      const r = await agent.get(ruta).expect(403);
      expect(r.body.error.codigo).toBe('CAMBIO_CONTRASENA_OBLIGATORIO');
    }
    await agent.get('/api/auth/sesion').expect(200);
    await agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', csrf)
      .send({ contrasenaActual: cuenta.contrasenaTemporal, contrasenaNueva: 'debil' })
      .expect(400);
    await agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', csrf)
      .send({ contrasenaActual: 'Incorrecta!123', contrasenaNueva: claveNueva })
      .expect(401);
    const cambio = await agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', csrf)
      .send({ contrasenaActual: cuenta.contrasenaTemporal, contrasenaNueva: claveNueva })
      .expect(200);
    expect(cambio.body.data.usuario.cambioObligatorio).toBe(false);
    expect(cambio.body.data.csrfToken).not.toBe(csrf);
    await request(app).get('/api/auth/sesion').set('Cookie', cookiesDe(respuesta)).expect(401);
    await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf).send({}).expect(403);
    await agent.get('/api/auth/sesion').expect(200);
    await entrar(cuenta.usuario, claveNueva);
  });
  it('logout requiere CSRF, revoca en Oracle y limpia las cookies', async () => {
    const { agent, csrf, respuesta } = await entrarCuenta();
    await agent.post('/api/auth/logout').send({}).expect(403);
    await agent.post('/api/auth/logout').set('X-CSRF-Token', 'x'.repeat(64)).send({}).expect(403);
    const r = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf).send({}).expect(200);
    expect(r.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/nomina2_sesion=;/)]),
    );
    await request(app).get('/api/auth/sesion').set('Cookie', cookiesDe(respuesta)).expect(401);
  });
  it('inactividad configurable: renueva 7 minutos y rechaza sesión vencida', async () => {
    const { agent, cuenta } = await entrarCuenta();
    await agent.get('/api/auth/sesion').expect(200);
    expect(
      await escalar(
        'SELECT ROUND((EXPIRA_EN - ULTIMA_ACTIVIDAD)*1440) FROM SESIONES WHERE ID_USUARIO = :id AND ACTIVO = 1',
        { id: cuenta.idUsuario },
      ),
    ).toBe(7);
    await ejecutar(
      "UPDATE SESIONES SET ULTIMA_ACTIVIDAD = CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE) - 10/1440, EXPIRA_EN = CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE) - 3/1440 WHERE ID_USUARIO = :id",
      { id: cuenta.idUsuario },
    );
    await agent.get('/api/auth/sesion').expect(401);
  });
  it('CSRF limpia cookies vencidas para permitir un nuevo login', async () => {
    const { agent, cuenta } = await entrarCuenta();
    await ejecutar(
      "UPDATE SESIONES SET ULTIMA_ACTIVIDAD = CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE) - 10/1440, EXPIRA_EN = CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE) - 3/1440 WHERE ID_USUARIO = :id",
      { id: cuenta.idUsuario },
    );
    const vencida = await agent.get('/api/auth/csrf').expect(401);
    expect(vencida.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/nomina2_sesion=;/)]),
    );
    const bootstrap = await agent.get('/api/auth/csrf').expect(200);
    await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', bootstrap.body.data.csrfToken as string)
      .send({ usuario: cuenta.usuario, contrasena: cuenta.contrasenaTemporal })
      .expect(200);
  });
  it('no confía en una IP falsificada de X-Forwarded-For', async () => {
    const agent = request.agent(app);
    const inicio = await agent.get('/api/auth/csrf');
    await agent
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.77')
      .set('X-CSRF-Token', inicio.body.data.csrfToken as string)
      .send({ usuario: seed.ADMIN_USER, contrasena: claveNueva })
      .expect(200);
    const ip = await escalar(
      'SELECT IP FROM SESIONES WHERE ID_USUARIO = :id ORDER BY ID_SESION DESC FETCH FIRST 1 ROW ONLY',
      { id: admin.idUsuario },
    );
    expect(ip).not.toBe('203.0.113.77');
  });
  it.each(['RH', 'EMPLEADO'] as const)(
    'RBAC deniega todos los endpoints administrativos a %s',
    async (rol) => {
      const { agent, csrf } = await entrarCuenta(rol);
      await agent.get('/api/usuarios').expect(403);
      await agent.get('/api/auditoria').expect(403);
      await agent
        .patch(`/api/usuarios/${admin.idUsuario}/estado`)
        .set('X-CSRF-Token', csrf)
        .send({ activo: false, motivo: 'Intento sin permiso' })
        .expect(403);
      await agent
        .patch(`/api/usuarios/${admin.idUsuario}/rol`)
        .set('X-CSRF-Token', csrf)
        .send({ rol: 'EMPLEADO', motivo: 'Intento sin permiso' })
        .expect(403);
      await agent
        .post(`/api/usuarios/${admin.idUsuario}/restablecer-contrasena`)
        .set('X-CSRF-Token', csrf)
        .send({ motivo: 'Intento sin permiso' })
        .expect(403);
    },
  );
  it('helper de propiedad evita leer otro recurso aunque se falsifique propietario en query', async () => {
    const cuenta = await crearCuenta();
    const ajena = await crearCuenta();
    const api = express();
    api.use(express.json());
    api.use((await import('cookie-parser')).default());
    api.use('/api/auth', (await import('./auth.routes.js')).crearAuthRouter(auth, config));
    api.get(
      '/api/recurso/:id',
      autenticar(auth),
      permitirRoles('ADMIN', 'RH', 'EMPLEADO'),
      exigirCambioCompletado,
      async (req, res) => {
        const propietario = Number(
          await escalar('SELECT ID_USUARIO FROM USUARIOS WHERE ID_USUARIO = :id', {
            id: Number(req.params.id),
          }),
        );
        verificarPropiedad(autenticacionDe(req), propietario);
        res.json({ idUsuario: propietario });
      },
    );
    api.use(manejarErrores(logger));
    const { agent } = await entrar(cuenta.usuario, cuenta.contrasenaTemporal, api);
    await agent.get(`/api/recurso/${cuenta.idUsuario}`).expect(200);
    const r = await agent
      .get(`/api/recurso/${ajena.idUsuario}?idUsuario=${cuenta.idUsuario}`)
      .expect(403);
    expect(r.body.error.codigo).toBe('RECURSO_AJENO');
  });
  it('ADMIN lista con filtros combinados y rechaza SQL/orden/campos fuera de lista blanca', async () => {
    const cuenta = await crearCuenta('RH');
    const { agent } = await entrarAdmin();
    const r = await agent
      .get('/api/usuarios')
      .query({
        usuario: cuenta.usuario,
        rol: 'RH',
        activo: '1',
        cambioObligatorio: '0',
        limite: 1,
        direccion: 'asc',
      })
      .expect(200);
    expect(r.body.data.total).toBe(1);
    expect(r.body.data.usuarios[0].idUsuario).toBe(cuenta.idUsuario);
    expect(r.text).not.toMatch(/contrasenaHash|CONTRASENA_HASH|csrf|TOKEN_HASH/);
    await agent.get('/api/usuarios').query({ ordenarPor: 'CONTRASENA_HASH' }).expect(400);
    const vacio = await agent.get('/api/usuarios').query({ buscar: "' OR 1=1 --" }).expect(200);
    expect(vacio.body.data.total).toBe(0);
    await agent.get('/api/auditoria').query({ desde: '2026-02-30' }).expect(400);
    await agent
      .get('/api/auditoria')
      .query({ desde: '2026-12-01', hasta: '2026-01-01' })
      .expect(400);
    await agent.get('/api/auditoria').query({ sql: 'SELECT' }).expect(400);
  });
  it('ADMIN desactiva/activa, cambia rol y revoca sesiones previas', async () => {
    const empleado = await entrarCuenta();
    const { agent, csrf } = await entrarAdmin();
    const id = empleado.cuenta.idUsuario;
    await agent
      .patch(`/api/usuarios/${id}/estado`)
      .set('X-CSRF-Token', csrf)
      .send({ activo: false, motivo: 'Baja temporal de prueba' })
      .expect(200);
    await empleado.agent.get('/api/auth/sesion').expect(401);
    await agent
      .patch(`/api/usuarios/${id}/estado`)
      .set('X-CSRF-Token', csrf)
      .send({ activo: true, motivo: 'Reactivación de prueba' })
      .expect(200);
    const vigente = await entrar(empleado.cuenta.usuario, empleado.cuenta.contrasenaTemporal);
    await agent
      .patch(`/api/usuarios/${id}/rol`)
      .set('X-CSRF-Token', csrf)
      .send({ rol: 'RH', motivo: 'Cambio de funciones' })
      .expect(200);
    await vigente.agent.get('/api/auth/sesion').expect(401);
    const nuevo = await entrar(empleado.cuenta.usuario, empleado.cuenta.contrasenaTemporal);
    const sesion = await nuevo.agent.get('/api/auth/sesion').expect(200);
    expect(sesion.body.data.rol).toBe('RH');
    await agent
      .patch(`/api/usuarios/${id}/rol`)
      .set('X-CSRF-Token', csrf)
      .send({ rol: 'ADMIN', motivo: '' })
      .expect(400);
  });
  it('restablecimiento entrega clave temporal una vez, revoca sesiones y queda auditado sin secretos', async () => {
    const empleado = await entrarCuenta();
    const { agent, csrf } = await entrarAdmin();
    const id = empleado.cuenta.idUsuario;
    const r = await agent
      .post(`/api/usuarios/${id}/restablecer-contrasena`)
      .set('X-CSRF-Token', csrf)
      .send({ motivo: 'Credencial olvidada' })
      .expect(200);
    politicaContrasena.parse(r.body.data.contrasenaTemporal);
    await empleado.agent.get('/api/auth/sesion').expect(401);
    const nueva = await entrar(empleado.cuenta.usuario, r.body.data.contrasenaTemporal as string);
    const restringida = await nueva.agent.get('/api/usuarios').expect(403);
    expect(restringida.body.error.codigo).toBe('CAMBIO_CONTRASENA_OBLIGATORIO');
    const bitacora = await agent
      .get('/api/auditoria')
      .query({
        usuario: admin.idUsuario,
        entidad: 'USUARIOS',
        accion: 'RESTABLECER_CONTRASENA',
        desde: '2000-01-01',
        hasta: '2100-01-01',
      })
      .expect(200);
    expect(bitacora.body.data.registros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idUsuario: admin.idUsuario,
          rol: 'ADMIN',
          idEntidad: id,
          motivo: 'Credencial olvidada',
          ip: expect.any(String),
          fecha: expect.stringContaining('-06:00'),
        }),
      ]),
    );
    expect(bitacora.text).not.toContain(r.body.data.contrasenaTemporal as string);
    expect(bitacora.text).not.toMatch(/argon2|contrasenaHash|csrf|TOKEN_HASH/);
  });
  it('si falla auditoría se revierte contraseña, cambio obligatorio y revocación de sesiones', async () => {
    const empleado = await entrarCuenta();
    const { agent, csrf } = await entrarAdmin();
    const id = empleado.cuenta.idUsuario;
    const antes = await escalar('SELECT CONTRASENA_HASH FROM USUARIOS WHERE ID_USUARIO = :id', {
      id,
    });
    await ejecutar(`CREATE OR REPLACE TRIGGER TR_N2SEC_FALLO BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW
      BEGIN IF :NEW.ACCION = 'RESTABLECER_CONTRASENA' THEN RAISE_APPLICATION_ERROR(-20999, 'Fallo de prueba'); END IF; END;`);
    try {
      await agent
        .post(`/api/usuarios/${id}/restablecer-contrasena`)
        .set('X-CSRF-Token', csrf)
        .send({ motivo: 'Comprobar atomicidad' })
        .expect(500);
      expect(
        await escalar('SELECT CONTRASENA_HASH FROM USUARIOS WHERE ID_USUARIO = :id', { id }),
      ).toBe(antes);
      expect(
        await escalar('SELECT CAMBIO_OBLIGATORIO FROM USUARIOS WHERE ID_USUARIO = :id', { id }),
      ).toBe(0);
      await empleado.agent.get('/api/auth/sesion').expect(200);
    } finally {
      await ejecutar('DROP TRIGGER TR_N2SEC_FALLO');
    }
  });
  it('último ADMIN activo no se puede desactivar ni degradar', async () => {
    const { agent, csrf } = await entrarAdmin();
    await agent
      .patch(`/api/usuarios/${admin.idUsuario}/estado`)
      .set('X-CSRF-Token', csrf)
      .send({ activo: false, motivo: 'Intentar quitar último admin' })
      .expect(409);
    await agent
      .patch(`/api/usuarios/${admin.idUsuario}/rol`)
      .set('X-CSRF-Token', csrf)
      .send({ rol: 'RH', motivo: 'Intentar degradar último admin' })
      .expect(409);
    await agent.get('/api/usuarios').expect(200);
  });
  it('generación interna normaliza acentos, reserva sufijos y no permite a RH crear ADMIN', async () => {
    const entrada = { nombre: 'José', apellido: 'López', correo: 'jose1@example.test' };
    const primero = await enTransaccion(db, (c) => crearUsuarioInterno(c, admin, entrada));
    const segundo = await enTransaccion(db, (c) =>
      crearUsuarioInterno(c, admin, { ...entrada, correo: 'jose2@example.test' }),
    );
    expect(primero.usuario).toBe('jose.lopez');
    expect(segundo.usuario).toBe('jose.lopez2');
    await expect(
      enTransaccion(db, (c) =>
        crearUsuarioInterno(
          c,
          { ...admin, rol: 'RH' },
          { ...entrada, correo: 'noadmin@example.test', rol: 'ADMIN' },
        ),
      ),
    ).rejects.toThrow('permiso');
  });

  describe('FASE 4: catálogos Oracle/HTTP', () => {
    const base = { codigo: 'F4_PRUEBA', nombre: 'Catálogo fase 4', descripcion: null };
    const dias = Array.from({ length: 7 }, (_, i) => ({
      diaSemana: i + 1,
      laborable: i < 5,
      entrada: i < 5 ? '08:00' : null,
      salida: i < 5 ? (i === 4 ? '14:00' : '17:00') : null,
      cruzaMedianoche: false,
      minutosDescanso: i < 4 ? 60 : 0,
    }));
    it('permite solo RH y ADMIN, exige CSRF y lista definiciones sin SQL', async () => {
      const empleado = await entrarCuenta();
      await empleado.agent.get('/api/catalogos').expect(403);
      const rh = await entrarCuenta('RH');
      const r = await rh.agent.get('/api/catalogos').expect(200);
      expect(r.body.data).toHaveLength(12);
      expect(r.text).not.toContain('columna');
      await rh.agent.post('/api/catalogos/departamentos').send(base).expect(403);
      await rh.agent.get('/api/catalogos/departamentos').query({ sql: 'SELECT' }).expect(400);
    });
    it('CRUD de organización, filtros combinados, paginación y baja en uso', async () => {
      const { agent, csrf } = await entrarCuenta('RH');
      const crear = (slug: string, body: object) =>
        agent.post(`/api/catalogos/${slug}`).set('X-CSRF-Token', csrf).send(body);
      const dep = await crear('departamentos', base).expect(201);
      const id = dep.body.data.id as number;
      const puesto = {
        ...base,
        codigo: 'F4_PUESTO',
        idDepartamento: id,
        salarioMinimo: '1234.56',
        salarioMaximo: '6000.00',
      };
      const p = await crear('puestos', puesto).expect(201);
      const j = await crear('jefaturas', {
        ...base,
        codigo: 'F4_JEFE',
        idDepartamento: id,
        idEmpleadoResponsable: null,
      }).expect(201);
      const lista = await agent
        .get('/api/catalogos/puestos')
        .query({
          idDepartamento: id,
          salarioMinimoMin: '1234.56',
          salarioMinimoMax: '1234.56',
          activo: '1',
          limite: 1,
          ordenarPor: 'salarioMaximo',
          direccion: 'asc',
        })
        .expect(200);
      expect(lista.body.data.total).toBe(1);
      expect(lista.body.data.registros[0].idDepartamentoEtiqueta).toBe(base.nombre);
      await agent
        .get('/api/catalogos/puestos')
        .query({ buscar: "' OR 1=1 --" })
        .expect(200)
        .then((r) => expect(r.body.data.total).toBe(0));
      const enUso = await agent.get(`/api/catalogos/departamentos/${id}`).expect(200);
      expect(enUso.body.data.enUso).toBe(true);
      await agent
        .delete(`/api/catalogos/departamentos/${id}`)
        .set('X-CSRF-Token', csrf)
        .send({ motivo: 'Eliminar unidad', confirmado: true })
        .expect(409);
      await agent
        .patch(`/api/catalogos/departamentos/${id}/estado`)
        .set('X-CSRF-Token', csrf)
        .send({ activo: false, motivo: 'Desactivar unidad' })
        .expect(200);
      await crear('puestos', { ...puesto, codigo: 'F4_INACTIVO' }).expect(409);
      await agent
        .patch(`/api/catalogos/departamentos/${id}/estado`)
        .set('X-CSRF-Token', csrf)
        .send({ activo: true, motivo: 'Activar unidad' })
        .expect(200);
      for (const [slug, nuevoId, datos] of [
        ['puestos', p.body.data.id, puesto],
        [
          'jefaturas',
          j.body.data.id,
          { ...base, codigo: 'F4_JEFE', idDepartamento: id, idEmpleadoResponsable: null },
        ],
      ] as const) {
        await agent
          .patch(`/api/catalogos/${slug}/${nuevoId}`)
          .set('X-CSRF-Token', csrf)
          .send({ ...datos, nombre: 'Nombre editado' })
          .expect(200);
        await agent
          .delete(`/api/catalogos/${slug}/${nuevoId}`)
          .set('X-CSRF-Token', csrf)
          .send({ motivo: 'Baja de catálogo', confirmado: true })
          .expect(200);
      }
      await agent
        .delete(`/api/catalogos/departamentos/${id}`)
        .set('X-CSRF-Token', csrf)
        .send({ motivo: 'Intento físico RH', fisica: true, confirmado: true })
        .expect(403);
      expect(
        await escalar(
          "SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ENTIDAD='PUESTOS' AND ID_ENTIDAD=:id AND ACCION='EDITAR_CATALOGO'",
          { id: String(p.body.data.id) },
        ),
      ).toBe(1);
    });
    it.each(['tipos-ausencia', 'tipos-descuento', 'tipos-contrato', 'horarios', 'feriados'])(
      'CRUD completo y filtrado de %s',
      async (slug) => {
        const { agent, csrf } = await entrarAdmin();
        const body = {
          ...base,
          codigo: `F4_${slug.toUpperCase().replace(/-/g, '_')}`,
          ...(slug === 'tipos-ausencia' ? { efecto: 'SIN_GOCE' } : {}),
          ...(slug === 'tipos-contrato' ? { requiereFin: true } : {}),
          ...(slug === 'horarios' ? { jornada: 'DIURNA', dias } : {}),
          ...(slug === 'feriados'
            ? {
                fecha: '2027-05-05',
                fechaConmemoracion: '2027-05-05',
                ambito: 'LOCAL',
                localidad: 'PRUEBA_F4',
                minutoInicio: 720,
                minutoFin: 1440,
                fundamento: 'Norma de prueba',
              }
            : {}),
        };
        if (slug === 'feriados') delete (body as Record<string, unknown>).descripcion;
        const r = await agent
          .post(`/api/catalogos/${slug}`)
          .set('X-CSRF-Token', csrf)
          .send(body)
          .expect(201);
        const id = r.body.data.id as number;
        const filtro =
          slug === 'horarios'
            ? {
                jornada: 'DIURNA',
                diaSemana: '5',
                horasMax: '6',
                entradaMin: '480',
                entradaMax: '480',
                salidaMin: '840',
                salidaMax: '840',
                descansoMax: '0',
                cruzaMedianoche: '0',
              }
            : slug === 'feriados'
              ? { anio: '2027', ambito: 'LOCAL', localidad: 'PRUEBA_F4' }
              : slug === 'tipos-contrato'
                ? { requiereFin: '1' }
                : slug === 'tipos-ausencia'
                  ? { efecto: 'SIN_GOCE' }
                  : {};
        const lista = await agent
          .get(`/api/catalogos/${slug}`)
          .query({ ...filtro, codigo: body.codigo, limite: 1 })
          .expect(200);
        expect(lista.body.data.total).toBe(1);
        if (slug === 'horarios') {
          const descanso = await agent
            .get('/api/catalogos/horarios')
            .query({ codigo: body.codigo, diaSemana: 7, laborable: '0' })
            .expect(200);
          expect(descanso.body.data.total).toBe(1);
        }
        await agent
          .get(`/api/catalogos/${slug}/${id}`)
          .expect(200)
          .then((r) => {
            if (slug === 'horarios') {
              expect(r.body.data.dias).toHaveLength(7);
              expect(r.body.data.dias[4].salida).toBe('14:00');
            }
          });
        await agent
          .patch(`/api/catalogos/${slug}/${id}`)
          .set('X-CSRF-Token', csrf)
          .send({ ...body, nombre: 'Editado F4' })
          .expect(200);
        await agent
          .patch(`/api/catalogos/${slug}/${id}/estado`)
          .set('X-CSRF-Token', csrf)
          .send({ activo: false, motivo: 'Baja temporal' })
          .expect(200);
        await agent
          .patch(`/api/catalogos/${slug}/${id}/estado`)
          .set('X-CSRF-Token', csrf)
          .send({ activo: true, motivo: 'Reactivar prueba' })
          .expect(200);
        await agent
          .delete(`/api/catalogos/${slug}/${id}`)
          .set('X-CSRF-Token', csrf)
          .send({ fisica: true, motivo: 'Eliminar prueba', confirmado: true })
          .expect(200);
        await agent.get(`/api/catalogos/${slug}/${id}`).expect(404);
      },
    );
    it('valida al jefe responsable y conserva patrones de horarios ya asignados', async () => {
      const { agent, csrf } = await entrarAdmin();
      const crear = (slug: string, body: object) =>
        agent.post(`/api/catalogos/${slug}`).set('X-CSRF-Token', csrf).send(body).expect(201);
      const dep = await crear('departamentos', { ...base, codigo: 'F4_RESP_DEP' });
      const dep2 = await crear('departamentos', { ...base, codigo: 'F4_OTRO_DEP' });
      const puesto = await crear('puestos', {
        ...base,
        codigo: 'F4_RESP_PUESTO',
        idDepartamento: dep.body.data.id,
        salarioMinimo: null,
        salarioMaximo: null,
      });
      await ejecutar(
        "INSERT INTO CENTROS_TRABAJO (CODIGO,NOMBRE,LOCALIDAD) VALUES ('F4_CENTRO','Centro temporal','PRUEBA')",
      );
      const centro = Number(
        await escalar("SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE CODIGO='F4_CENTRO'"),
      );
      const contrato = Number(
        await escalar('SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO WHERE ACTIVO=1'),
      );
      await ejecutar(
        "INSERT INTO EMPLEADOS (CODIGO,NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) VALUES ('F4_EMPLEADO','Persona','Prueba','1234567890101','1234567-9',DATE '1990-01-01','O','SOLTERO','Dirección temporal','55551234','f4empleado@example.test',:puesto,:departamento,:contrato,:centro,DATE '2026-01-01')",
        { puesto: puesto.body.data.id, departamento: dep.body.data.id, contrato, centro },
      );
      const empleado = Number(
        await escalar("SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CODIGO='F4_EMPLEADO'"),
      );
      await crear('jefaturas', {
        ...base,
        codigo: 'F4_RESP_JEFE',
        idDepartamento: dep.body.data.id,
        idEmpleadoResponsable: empleado,
      });
      await agent
        .post('/api/catalogos/jefaturas')
        .set('X-CSRF-Token', csrf)
        .send({
          ...base,
          codigo: 'F4_JEFE_INVALIDO',
          idDepartamento: dep2.body.data.id,
          idEmpleadoResponsable: empleado,
        })
        .expect(409);
      const body = { ...base, codigo: 'F4_ASIGNADO', jornada: 'DIURNA', dias };
      const h = await crear('horarios', body);
      const id = h.body.data.id as number;
      await ejecutar(
        "INSERT INTO EMPLEADO_HORARIO (ID_EMPLEADO,ID_HORARIO,VIGENTE_DESDE,MOTIVO) VALUES (:empleado,:horario,DATE '2027-01-01','Prueba de asignación')",
        { empleado, horario: id },
      );
      await agent
        .patch(`/api/catalogos/horarios/${id}`)
        .set('X-CSRF-Token', csrf)
        .send({ ...body, dias: dias.map((d, i) => (i === 0 ? { ...d, salida: '16:00' } : d)) })
        .expect(409);
      await agent
        .delete(`/api/catalogos/horarios/${id}`)
        .set('X-CSRF-Token', csrf)
        .send({ motivo: 'Baja de horario', confirmado: true })
        .expect(409);
      await agent
        .patch(`/api/catalogos/horarios/${id}/estado`)
        .set('X-CSRF-Token', csrf)
        .send({ activo: false, motivo: 'Nueva distribución' })
        .expect(200);
      const opciones = await agent
        .get('/api/catalogos/opciones/empleados')
        .query({ buscar: 'Persona' })
        .expect(200);
      expect(opciones.body.data.some((o: { value: string }) => o.value === String(empleado))).toBe(
        true,
      );
    });
    it('conserva versiones legales, serializa cambios concurrentes y revierte si falla auditoría', async () => {
      const { agent, csrf } = await entrarCuenta('RH');
      const body = {
        codigo: 'F4_TASA',
        nombre: 'Tasa de prueba',
        valor: '4.83',
        unidad: 'PORCENTAJE',
        vigenteDesde: '2027-01-01',
        vigenteHasta: null,
        fundamento: 'Norma de prueba',
        motivo: 'Prueba de vigencia',
        confirmado: true,
      };
      const r = await agent
        .post('/api/catalogos/parametros-legales')
        .set('X-CSRF-Token', csrf)
        .send(body)
        .expect(201);
      const id = r.body.data.id as number;
      await agent
        .patch(`/api/catalogos/parametros-legales/${id}`)
        .set('X-CSRF-Token', csrf)
        .send({ ...body, confirmado: false })
        .expect(400);
      const respuestas = await Promise.all(
        [1, 2].map(() =>
          agent
            .patch(`/api/catalogos/parametros-legales/${id}`)
            .set('X-CSRF-Token', csrf)
            .send({ ...body, valor: '5.00', vigenteDesde: '2027-02-01' }),
        ),
      );
      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
      await agent
        .get(`/api/catalogos/parametros-legales/${id}`)
        .expect(200)
        .then((r) => {
          expect(r.body.data.valor).toBe('4.83');
          expect(r.body.data.vigenteHasta).toBe('2027-01-31');
        });
      await ejecutar(
        "CREATE OR REPLACE TRIGGER F4_FALLAR_AUD BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ENTIDAD='PARAMETROS_LEGALES' THEN RAISE_APPLICATION_ERROR(-20044,'Fallo de prueba'); END IF; END;",
      );
      try {
        await agent
          .post('/api/catalogos/parametros-legales')
          .set('X-CSRF-Token', csrf)
          .send({ ...body, codigo: 'F4_ROLLBACK' })
          .expect(500);
        expect(
          await escalar("SELECT COUNT(*) FROM PARAMETROS_LEGALES WHERE CODIGO='F4_ROLLBACK'"),
        ).toBe(0);
        const nuevaId = respuestas.find((r) => r.status === 200)!.body.data.id as number;
        await agent
          .patch(`/api/catalogos/parametros-legales/${nuevaId}`)
          .set('X-CSRF-Token', csrf)
          .send({ ...body, valor: '6', vigenteDesde: '2027-03-01' })
          .expect(500);
        await agent
          .get(`/api/catalogos/parametros-legales/${nuevaId}`)
          .expect(200)
          .then((r) => expect(r.body.data.vigenteHasta).toBe(null));
        expect(
          await escalar("SELECT COUNT(*) FROM PARAMETROS_LEGALES WHERE CODIGO='F4_TASA'"),
        ).toBe(2);
      } finally {
        await ejecutar('DROP TRIGGER F4_FALLAR_AUD');
      }
      const a = await entrarAdmin();
      const bit = await a.agent
        .get('/api/auditoria')
        .query({ entidad: 'PARAMETROS_LEGALES', accion: 'VERSIONAR_CATALOGO' })
        .expect(200);
      expect(bit.body.data.total).toBeGreaterThan(0);
    });
    it('CRUD de tramos rechaza traslapes y preserva vigencia anterior', async () => {
      const { agent, csrf } = await entrarAdmin();
      const list = await agent.get('/api/catalogos/tramos-isr').expect(200);
      const inicial = list.body.data.registros.find(
        (r: { limiteInferior: string }) => r.limiteInferior === '0',
      );
      const body = {
        limiteInferior: '0',
        limiteSuperior: '300000.00',
        tasaPorcentaje: '6',
        cuotaFija: '0',
        vigenteDesde: '2027-01-01',
        vigenteHasta: null,
        motivo: 'Cambio de tasa ISR',
        confirmado: true,
      };
      const nuevo = await agent
        .patch(`/api/catalogos/tramos-isr/${inicial.id}`)
        .set('X-CSRF-Token', csrf)
        .send(body)
        .expect(200);
      await agent
        .get(`/api/catalogos/tramos-isr/${inicial.id}`)
        .expect(200)
        .then((r) => expect(r.body.data.vigenteHasta).toBe('2026-12-31'));
      await agent
        .post('/api/catalogos/tramos-isr')
        .set('X-CSRF-Token', csrf)
        .send({ ...body, limiteInferior: '1', limiteSuperior: '300000.01' })
        .expect(409);
      await agent
        .delete(`/api/catalogos/tramos-isr/${nuevo.body.data.id}`)
        .set('X-CSRF-Token', csrf)
        .send({ motivo: 'Baja de versión', confirmado: true })
        .expect(200);
    });
    it('impide cualquier cambio legal retroactivo que afecte periodos cerrados', async () => {
      await ejecutar(
        "INSERT INTO PERIODOS_NOMINA (FECHA_INICIO,FECHA_FIN,QUINCENA,ESTADO,APROBADO_EN,CERRADO_EN,APROBADO_POR,CERRADO_POR) VALUES (DATE '2026-12-01',DATE '2026-12-15',1,'CERRADO',SYSDATE,SYSDATE,:actor,:actor)",
        { actor: admin.idUsuario },
      );
      const { agent, csrf } = await entrarAdmin();
      const r = await agent
        .get('/api/catalogos/parametros-legales')
        .query({ codigo: 'IGSS_LABORAL' })
        .expect(200);
      const fila = r.body.data.registros[0];
      const body = {
        codigo: fila.codigo,
        nombre: fila.nombre,
        valor: '5',
        unidad: fila.unidad,
        vigenteDesde: '2026-12-16',
        vigenteHasta: null,
        fundamento: fila.fundamento,
        motivo: 'Cambio de referencia',
        confirmado: true,
      };
      await agent
        .patch(`/api/catalogos/parametros-legales/${fila.id}`)
        .set('X-CSRF-Token', csrf)
        .send({ ...body, vigenteDesde: '2026-12-01' })
        .expect(409);
      await agent
        .patch(`/api/catalogos/parametros-legales/${fila.id}/estado`)
        .set('X-CSRF-Token', csrf)
        .send({ activo: false, motivo: 'Baja no permitida', confirmado: true })
        .expect(409);
      await agent
        .delete(`/api/catalogos/parametros-legales/${fila.id}`)
        .set('X-CSRF-Token', csrf)
        .send({ motivo: 'Eliminar histórico', confirmado: true })
        .expect(409);
      await agent
        .patch(`/api/catalogos/parametros-legales/${fila.id}`)
        .set('X-CSRF-Token', csrf)
        .send(body)
        .expect(200);
      await agent
        .get('/api/catalogos/restricciones')
        .expect(200)
        .then((r) => expect(r.body.data.ultimoCierre).toBe('2026-12-15'));
    });
  });
  describe('Fase 5: gestión de empleados y cargas Oracle', () => {
    let refs: {
      idDepartamento: number;
      idPuesto: number;
      idJefatura: number;
      idTipoContrato: number;
      idCentroTrabajo: number;
      idHorario: number;
      idBanco: number;
    };
    let serial = 200;
    let hoy = '';
    const nitDe = (n: number) => {
      const c = String(n);
      const v = (11 - ([...c].reverse().reduce((s, d, i) => s + Number(d) * (i + 2), 0) % 11)) % 11;
      return `${c}-${v === 10 ? 'K' : v}`;
    };
    const datos = () => {
      const n = ++serial;
      return {
        codigo: `F5_${n}`,
        nombres: 'Ana',
        apellidos: 'Prueba',
        dpi: String(1000000000000 + n),
        nit: nitDe(800000 + n),
        afiliacionIgss: String(99000 + n),
        fechaNacimiento: '1995-05-15',
        sexo: 'F',
        estadoCivil: 'SOLTERO',
        direccion: 'Dirección de prueba',
        telefono: '55551234',
        correo: `f5_${n}@example.test`,
        ...refs,
        fechaIngreso: hoy,
        fechaFinContrato: null,
        salarioBase: '5000.00',
        cuentaBancaria: '123456',
        tipoCuenta: 'AHORRO',
        contactoNombre: 'Contacto Familiar',
        contactoParentesco: 'Hermana',
        contactoTelefono: '55554321',
        estado: 'ACTIVO',
        generarUsuario: false,
      };
    };
    const csvDe = (filas: Record<string, unknown>[]) =>
      escribirCsv([Array.from(columnasCsv), ...filas.map((d) => columnasCsv.map((k) => d[k]))]);
    beforeAll(async () => {
      const { agent, csrf } = await entrarAdmin();
      const crear = async (slug: string, body: object) => {
        const r = await agent
          .post(`/api/catalogos/${slug}`)
          .set('X-CSRF-Token', csrf)
          .send(body)
          .expect(201);
        return r.body.data.id as number;
      };
      const base = { codigo: 'F5_ORG', nombre: 'Organización fase cinco', descripcion: null };
      const idDepartamento = await crear('departamentos', base);
      const idPuesto = await crear('puestos', {
        ...base,
        idDepartamento,
        salarioMinimo: null,
        salarioMaximo: null,
      });
      const idJefatura = await crear('jefaturas', {
        ...base,
        idDepartamento,
        idEmpleadoResponsable: null,
      });
      const idTipoContrato = Number(
        await escalar('SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO WHERE ACTIVO=1'),
      );
      const idCentroTrabajo = await crear('centros-trabajo', {
        ...base,
        localidad: 'GUATEMALA_CIUDAD',
        direccion: null,
      });
      const idBanco = await crear('bancos', base);
      const idHorario = await crear('horarios', {
        ...base,
        jornada: 'DIURNA',
        dias: Array.from({ length: 7 }, (_, i) => ({
          diaSemana: i + 1,
          laborable: i < 5,
          entrada: i < 5 ? '08:00' : null,
          salida: i < 5 ? '17:00' : null,
          cruzaMedianoche: false,
          minutosDescanso: i < 5 ? 60 : 0,
        })),
      });
      refs = {
        idDepartamento,
        idPuesto,
        idJefatura,
        idTipoContrato,
        idCentroTrabajo,
        idBanco,
        idHorario,
      };
      const r = await agent.get('/api/empleados/reglas').expect(200);
      hoy = r.body.data.hoy;
      await ejecutar(
        "INSERT INTO PARAMETROS_LEGALES (CODIGO,NOMBRE,VALOR,UNIDAD,VIGENTE_DESDE,FUNDAMENTO,MOTIVO) VALUES ('SALARIO_MINIMO_MENSUAL','Mínimo de prueba',6000,'QUETZALES',DATE '2026-01-01','Solo esquema de prueba','Prueba de advertencia')",
      );
    });
    it('deniega empleado, CSRF ausente y acceso sin sesión', async () => {
      await request(app).get('/api/empleados').expect(401);
      const { agent, csrf } = await entrarCuenta();
      await agent.get('/api/empleados').expect(403);
      await agent.post('/api/empleados').set('X-CSRF-Token', csrf).send(datos()).expect(403);
      const a = await entrarAdmin();
      await a.agent.post('/api/empleados').send(datos()).expect(403);
    });
    it('alta individual guarda expediente, contacto, salario y horario atómicamente', async () => {
      const { agent, csrf } = await entrarCuenta('RH');
      const d = datos();
      const r = await agent.post('/api/empleados').set('X-CSRF-Token', csrf).send(d).expect(201);
      expect(r.body.data.advertencias[0]).toContain('6000.00');
      const id = r.body.data.empleado.id as number;
      expect(r.body.data.empleado.dpi).toBe(d.dpi);
      expect(r.body.data.empleado.salarioBase).toBe('5000.00');
      expect(
        await escalar('SELECT COUNT(*) FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id', { id }),
      ).toBe(1);
      expect(
        await escalar('SELECT COUNT(*) FROM EMPLEADO_HORARIO WHERE ID_EMPLEADO=:id', { id }),
      ).toBe(1);
      expect(
        await escalar('SELECT TELEFONO FROM EMPLEADO_CONTACTOS_EMERGENCIA WHERE ID_EMPLEADO=:id', {
          id,
        }),
      ).toBe(d.contactoTelefono);
      for (const tipo of ['salario', 'descuentos', 'vacaciones', 'documentos', 'historial'])
        await agent.get(`/api/empleados/${id}/pestanas/${tipo}`).expect(200);
      for (const campo of ['dpi', 'nit', 'afiliacionIgss', 'correo', 'codigo']) {
        const duplicado = { ...datos(), [campo]: d[campo as keyof typeof d] };
        const e = await agent
          .post('/api/empleados')
          .set('X-CSRF-Token', csrf)
          .send(duplicado)
          .expect(409);
        expect(e.body.error.campos).toHaveProperty(campo);
      }
    });
    it('valida edades, ingreso futuro, pertenencia a departamento y datos bancarios', async () => {
      const { agent, csrf } = await entrarAdmin();
      for (const cambio of [
        { fechaNacimiento: '2027-01-01' },
        { fechaIngreso: '2099-01-01' },
        { idDepartamento: 999999 },
        { tipoCuenta: null },
        { fechaFinContrato: '2001-01-01' },
      ]) {
        const r = await agent
          .post('/api/empleados')
          .set('X-CSRF-Token', csrf)
          .send({ ...datos(), ...cambio });
        expect([400, 409]).toContain(r.status);
      }
    });
    it('filtros combinados, orden, paginación y exportación protegen documentos', async () => {
      const { agent, csrf } = await entrarAdmin();
      const d = datos();
      const n = await agent.post('/api/empleados').set('X-CSRF-Token', csrf).send(d).expect(201);
      const filtros = {
        nombre: 'Ana',
        dpi: d.dpi,
        nit: d.nit,
        idDepartamento: refs.idDepartamento,
        idPuesto: refs.idPuesto,
        idJefatura: refs.idJefatura,
        idTipoContrato: refs.idTipoContrato,
        estado: 'ACTIVO',
        ingresoDesde: hoy,
        ingresoHasta: hoy,
        salarioMin: '4999.99',
        salarioMax: '5000.00',
        ordenarPor: 'salarioBase',
        direccion: 'desc',
        limite: 1,
      };
      const r = await agent.get('/api/empleados').query(filtros).expect(200);
      expect(r.body.data.total).toBe(1);
      expect(r.body.data.registros[0].id).toBe(n.body.data.empleado.id);
      expect(r.text).not.toContain(d.dpi);
      expect(r.text).not.toContain(d.nit);
      const csv = await agent.get('/api/empleados/exportar').query(filtros).expect(200);
      expect(csv.body.data).toContain(d.codigo);
      expect(csv.body.data).not.toContain(d.dpi);
      await agent.get('/api/empleados').query({ ordenarPor: 'DPI DESC' }).expect(400);
    });
    it('edición guiada conserva ingreso y rechaza escritura de salario', async () => {
      const { agent, csrf } = await entrarAdmin();
      const d = datos();
      const n = await agent.post('/api/empleados').set('X-CSRF-Token', csrf).send(d).expect(201);
      const id = n.body.data.empleado.id as number;
      const edit: Record<string, unknown> = { ...d };
      delete edit.salarioBase;
      delete edit.generarUsuario;
      const r = await agent
        .patch(`/api/empleados/${id}`)
        .set('X-CSRF-Token', csrf)
        .send({ ...edit, telefono: '55550000', motivo: 'Corregir contacto' })
        .expect(200);
      expect(r.body.data.telefono).toBe('55550000');
      await agent
        .patch(`/api/empleados/${id}`)
        .set('X-CSRF-Token', csrf)
        .send({ ...edit, salarioBase: '9000', motivo: 'Cambio inválido' })
        .expect(400);
      await agent
        .patch(`/api/empleados/${id}`)
        .set('X-CSRF-Token', csrf)
        .send({ ...edit, fechaIngreso: '2026-10-01', motivo: 'Cambio inválido' })
        .expect(422);
    });
    it('usuario con sufijo, cambio obligatorio y baja que revoca sesiones', async () => {
      const { agent, csrf } = await entrarCuenta('RH');
      const d = { ...datos(), generarUsuario: true };
      const a = await agent.post('/api/empleados').set('X-CSRF-Token', csrf).send(d).expect(201);
      const b = await agent
        .post('/api/empleados')
        .set('X-CSRF-Token', csrf)
        .send({ ...datos(), generarUsuario: true })
        .expect(201);
      expect(a.body.data.credenciales.usuario).toBe('ana.prueba');
      expect(b.body.data.credenciales.usuario).toBe('ana.prueba2');
      const cred = a.body.data.credenciales;
      const empleado = await entrar(cred.usuario, cred.contrasenaTemporal);
      await empleado.agent.get('/api/empleados').expect(403);
      const id = a.body.data.empleado.id as number;
      await agent
        .get(`/api/empleados/${id}`)
        .expect(200)
        .then((r) => expect(r.text).not.toContain(cred.contrasenaTemporal));
      await agent
        .post(`/api/empleados/${id}/baja`)
        .set('X-CSRF-Token', csrf)
        .send({ fechaEgreso: '2027-01-01', motivo: 'Finalización del contrato', confirmado: true })
        .expect(200);
      expect(
        await escalar('SELECT ACTIVO FROM USUARIOS WHERE ID_USUARIO=:id', { id: cred.idUsuario }),
      ).toBe(0);
      await empleado.agent.get('/api/auth/sesion').expect(401);
    });
    it('salario cierra vigencias, conserva futuro, exige motivo y protege periodos cerrados', async () => {
      const { agent, csrf } = await entrarAdmin();
      const r = await agent
        .post('/api/empleados')
        .set('X-CSRF-Token', csrf)
        .send(datos())
        .expect(201);
      const id = r.body.data.empleado.id as number;
      const body = {
        salarioBase: '7000.01',
        fechaEfectiva: '2027-01-01',
        motivo: 'Ajuste salarial anual',
        confirmado: true,
      };
      await agent
        .post(`/api/empleados/${id}/salario`)
        .set('X-CSRF-Token', csrf)
        .send({ ...body, fechaEfectiva: '2026-12-01' })
        .expect(422);
      await agent
        .post(`/api/empleados/${id}/salario`)
        .set('X-CSRF-Token', csrf)
        .send({ ...body, motivo: '' })
        .expect(400);
      const cambios = await Promise.all(
        [1, 2].map(() =>
          agent.post(`/api/empleados/${id}/salario`).set('X-CSRF-Token', csrf).send(body),
        ),
      );
      expect(cambios.map((r) => r.status).sort()).toEqual([200, 422]);
      expect(
        await escalar(
          "SELECT TO_CHAR(VIGENTE_HASTA,'YYYY-MM-DD') FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id AND SALARIO_BASE=5000",
          { id },
        ),
      ).toBe('2026-12-31');
      await agent
        .get(`/api/empleados/${id}`)
        .expect(200)
        .then((r) => expect(r.body.data.salarioBase).toBe('5000.00'));
      const h = await agent.get(`/api/empleados/${id}/pestanas/salario`).expect(200);
      expect(h.body.data.registros[0]['Salario mensual']).toBe('7000.01');
      expect(h.body.data.registros[0]['Registrado por']).toBe(seed.ADMIN_USER);
    });
    it('rollback de alta y cambio salarial si falla auditoría', async () => {
      const { agent, csrf } = await entrarAdmin();
      const d = { ...datos(), generarUsuario: true };
      const n = await agent
        .post('/api/empleados')
        .set('X-CSRF-Token', csrf)
        .send(datos())
        .expect(201);
      const id = n.body.data.empleado.id as number;
      await ejecutar(
        "CREATE OR REPLACE TRIGGER F5_FALLAR_AUD BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ENTIDAD='EMPLEADOS' THEN RAISE_APPLICATION_ERROR(-20045,'Fallo de prueba'); END IF; END;",
      );
      try {
        await agent.post('/api/empleados').set('X-CSRF-Token', csrf).send(d).expect(500);
        expect(
          await escalar('SELECT COUNT(*) FROM EMPLEADOS WHERE CODIGO=:codigo', {
            codigo: d.codigo,
          }),
        ).toBe(0);
        expect(
          await escalar('SELECT COUNT(*) FROM USUARIOS WHERE CORREO=:correo', { correo: d.correo }),
        ).toBe(0);
        await agent
          .post(`/api/empleados/${id}/salario`)
          .set('X-CSRF-Token', csrf)
          .send({
            salarioBase: '8000',
            fechaEfectiva: '2027-01-01',
            motivo: 'Cambio con fallo',
            confirmado: true,
          })
          .expect(500);
        expect(
          await escalar('SELECT COUNT(*) FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id', { id }),
        ).toBe(1);
        expect(
          await escalar('SELECT VIGENTE_HASTA FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id', {
            id,
          }),
        ).toBe(null);
      } finally {
        await ejecutar('DROP TRIGGER F5_FALLAR_AUD');
      }
    });
    it('carga: vista previa por fila, propiedad, todo o nada, solo válidas y reporte sin claves', async () => {
      const { agent, csrf } = await entrarCuenta('RH');
      const valida = { ...datos(), generarUsuario: true },
        invalida = { ...datos(), telefono: '12' };
      const p = await agent
        .post('/api/empleados/cargas')
        .set('X-CSRF-Token', csrf)
        .send({ nombreArchivo: 'empleados.csv', csv: csvDe([valida, invalida]) })
        .expect(201);
      const id = p.body.data.id as number;
      expect(p.body.data.filas[1].errores).toHaveProperty('telefono');
      expect(p.body.data.filas[1].errores.telefono).toHaveLength(1);
      expect(
        await escalar('SELECT COUNT(*) FROM EMPLEADOS WHERE CODIGO=:codigo', {
          codigo: valida.codigo,
        }),
      ).toBe(0);
      const otro = await entrarAdmin();
      await otro.agent.get(`/api/empleados/cargas/${id}/reporte`).expect(403);
      await agent
        .post(`/api/empleados/cargas/${id}/confirmar`)
        .set('X-CSRF-Token', csrf)
        .send({ modalidad: 'TODO_O_NADA', confirmado: true })
        .expect(409);
      const r = await agent
        .post(`/api/empleados/cargas/${id}/confirmar`)
        .set('X-CSRF-Token', csrf)
        .send({ modalidad: 'SOLO_VALIDAS', confirmado: true })
        .expect(200);
      expect(r.body.data.importadas).toBe(1);
      expect(r.body.data.credenciales).toHaveLength(1);
      const rep = await agent.get(`/api/empleados/cargas/${id}/reporte`).expect(200);
      expect(rep.body.data).toContain('IMPORTADA');
      expect(rep.body.data).toContain('INVALIDA');
      expect(rep.body.data).not.toContain(r.body.data.credenciales[0].contrasenaTemporal);
      await agent
        .post(`/api/empleados/cargas/${id}/confirmar`)
        .set('X-CSRF-Token', csrf)
        .send({ modalidad: 'SOLO_VALIDAS', confirmado: true })
        .expect(409);
    });
    it('carga detecta duplicados internos y revalida cambios tras la vista previa', async () => {
      const { agent, csrf } = await entrarAdmin();
      const d = datos();
      const dup = await agent
        .post('/api/empleados/cargas')
        .set('X-CSRF-Token', csrf)
        .send({ nombreArchivo: 'duplicados.csv', csv: csvDe([d, { ...datos(), dpi: d.dpi }]) })
        .expect(201);
      expect(
        dup.body.data.filas.every((f: { errores: Record<string, unknown> }) => f.errores.dpi),
      ).toBe(true);
      const p = await agent
        .post('/api/empleados/cargas')
        .set('X-CSRF-Token', csrf)
        .send({ nombreArchivo: 'cambio.csv', csv: csvDe([d]) })
        .expect(201);
      await agent.post('/api/empleados').set('X-CSRF-Token', csrf).send(d).expect(201);
      await agent
        .post(`/api/empleados/cargas/${p.body.data.id}/confirmar`)
        .set('X-CSRF-Token', csrf)
        .send({ modalidad: 'TODO_O_NADA', confirmado: true })
        .expect(409);
    });
    it('carga revierte todo el lote y usuarios cuando la última fila falla', async () => {
      const { agent, csrf } = await entrarAdmin();
      const ds = [
        { ...datos(), generarUsuario: true },
        { ...datos(), generarUsuario: true },
      ];
      const p = await agent
        .post('/api/empleados/cargas')
        .set('X-CSRF-Token', csrf)
        .send({ nombreArchivo: 'rollback.csv', csv: csvDe(ds) })
        .expect(201);
      const id = p.body.data.id as number;
      await ejecutar(
        `CREATE OR REPLACE TRIGGER F5_FALLAR_FILA BEFORE INSERT ON EMPLEADOS FOR EACH ROW BEGIN IF :NEW.CODIGO='${ds[1]!.codigo}' THEN RAISE_APPLICATION_ERROR(-20046,'Fallo de prueba'); END IF; END;`,
      );
      try {
        await agent
          .post(`/api/empleados/cargas/${id}/confirmar`)
          .set('X-CSRF-Token', csrf)
          .send({ modalidad: 'TODO_O_NADA', confirmado: true })
          .expect(500);
        for (const d of ds) {
          expect(
            await escalar('SELECT COUNT(*) FROM EMPLEADOS WHERE CODIGO=:codigo', {
              codigo: d.codigo,
            }),
          ).toBe(0);
          expect(
            await escalar('SELECT COUNT(*) FROM USUARIOS WHERE CORREO=:correo', {
              correo: d.correo,
            }),
          ).toBe(0);
        }
        expect(
          await escalar('SELECT ESTADO FROM CARGAS_MASIVAS WHERE ID_CARGA_MASIVA=:id', { id }),
        ).toBe('VALIDADA');
      } finally {
        await ejecutar('DROP TRIGGER F5_FALLAR_FILA');
      }
      await agent
        .post(`/api/empleados/cargas/${id}/confirmar`)
        .set('X-CSRF-Token', csrf)
        .send({ modalidad: 'TODO_O_NADA', confirmado: true })
        .expect(200);
    });
    describe('Fase 7: flujo de vacaciones con Oracle real', () => {
      let idEmpleado = 0;
      let cuenta: { idUsuario: number; usuario: string; contrasenaTemporal: string };
      let solicitud = 0;
      const tramo = { inicio: '2095-01-03', fin: '2095-01-04' };
      const apertura = (dias = '5') => ({
        tipo: 'SALDO_INICIAL',
        dias,
        referencia: 'F7_APERTURA',
        motivo: 'Saldo certificado del expediente previo',
        confirmado: true,
      });
      const empleado = () => entrar(cuenta.usuario, cuenta.contrasenaTemporal);
      beforeAll(async () => {
        const { agent, csrf } = await entrarAdmin();
        const r = await agent
          .post('/api/empleados')
          .set('X-CSRF-Token', csrf)
          .send({ ...datos(), generarUsuario: true })
          .expect(201);
        idEmpleado = r.body.data.empleado.id;
        cuenta = r.body.data.credenciales;
        await ejecutar('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', {
          id: cuenta.idUsuario,
        });
        // Fechas de este escenario: lunes 3 y martes 4 de enero de 2095.
      });
      it('protege propiedad, roles, CSRF e identificadores enviados por el cliente', async () => {
        await request(app).get('/api/vacaciones/mi-saldo').expect(401);
        const e = await empleado(),
          otro = await entrarCuenta();
        await otro.agent.get('/api/vacaciones/mi-saldo').expect(409);
        await e.agent.get(`/api/vacaciones/empleados/${idEmpleado}/saldo`).expect(403);
        await e.agent.post('/api/vacaciones/solicitudes').send(tramo).expect(403);
        await e.agent
          .post('/api/vacaciones/solicitudes')
          .set('X-CSRF-Token', e.csrf)
          .send({ ...tramo, idEmpleado })
          .expect(400);
        await e.agent
          .post('/api/vacaciones/solicitudes/1/resolver')
          .set('X-CSRF-Token', e.csrf)
          .send({ estado: 'APROBADA', confirmado: true })
          .expect(403);
      });
      it('carga apertura una sola vez, incluyendo cero, y conserva kardex real', async () => {
        const a = await entrarCuenta('RH');
        const r = await a.agent
          .post(`/api/vacaciones/empleados/${idEmpleado}/cargar`)
          .set('X-CSRF-Token', a.csrf)
          .send(apertura())
          .expect(201);
        expect(r.body.data.disponible).toBe('5.00');
        expect(r.body.data.kardex[0].tipo).toBe('SALDO_INICIAL');
        await a.agent
          .post(`/api/vacaciones/empleados/${idEmpleado}/cargar`)
          .set('X-CSRF-Token', a.csrf)
          .send(apertura())
          .expect(409);
        const e = await empleado();
        expect(
          (await e.agent.get('/api/vacaciones/mi-saldo').expect(200)).body.data.disponible,
        ).toBe('5.00');
      });
      it('calendario excluye descanso, feriado nacional y local; permite trabajo entre semana', async () => {
        const a = await entrarAdmin();
        for (const [codigo, fecha, ambito, localidad] of [
          ['F7_NACIONAL', '2095-01-05', 'NACIONAL', '*'],
          ['F7_LOCAL', '2095-01-06', 'LOCAL', 'GUATEMALA_CIUDAD'],
        ])
          await ejecutar(
            "INSERT INTO FERIADOS (CODIGO,NOMBRE,FECHA,FECHA_CONMEMORACION,AMBITO,LOCALIDAD,FUNDAMENTO) VALUES (:codigo,'Feriado prueba',TO_DATE(:fecha,'YYYY-MM-DD'),TO_DATE(:fecha,'YYYY-MM-DD'),:ambito,:localidad,'Prueba aislada')",
            { codigo: codigo!, fecha: fecha!, ambito: ambito!, localidad: localidad! },
          );
        const e = await empleado(),
          r = await e.agent
            .get('/api/vacaciones/mi-calendario?inicio=2095-01-03&fin=2095-01-09')
            .expect(200);
        expect(r.body.data.dias.filter((d: { laborable: boolean }) => d.laborable)).toHaveLength(3);
        await e.agent
          .post('/api/vacaciones/previsualizar')
          .set('X-CSRF-Token', e.csrf)
          .send({ inicio: '2095-01-03', fin: '2095-01-09' })
          .expect(200)
          .then((r) => expect(r.body.data.dias).toBe('3.00'));
        await a.agent.get('/api/vacaciones/solicitudes?ordenarPor=SQL').expect(400);
      });
      it('empleado solicita, RH ve verde y recibe aviso sin descontar antes de aprobar', async () => {
        const e = await empleado();
        const r = await e.agent
          .post('/api/vacaciones/solicitudes')
          .set('X-CSRF-Token', e.csrf)
          .send(tramo)
          .expect(201);
        solicitud = r.body.data.id;
        const a = await entrarCuenta('RH');
        const listado = await a.agent
          .get(
            `/api/vacaciones/solicitudes?idEmpleado=${idEmpleado}&estado=EN_PROCESO&desde=2095-01-01&hasta=2095-01-31&limite=1`,
          )
          .expect(200);
        expect(listado.body.data.registros[0]).toMatchObject({
          alcanza: true,
          puedeAprobar: true,
          disponible: '5.00',
          dias: '2.00',
        });
        expect((await e.agent.get('/api/vacaciones/mi-saldo')).body.data.disponible).toBe('5.00');
        expect(
          await escalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE CLAVE_EVENTO=:clave', {
            clave: `VACACIONES:${solicitud}:EN_PROCESO`,
          }),
        ).toBeGreaterThan(0);
        const ajena = await entrarCuenta();
        expect(
          (
            await ajena.agent
              .get(`/api/vacaciones/solicitudes?idEmpleado=${idEmpleado}`)
              .expect(409)
          ).body.ok,
        ).toBe(false);
        const csv = await a.agent
          .get(`/api/vacaciones/exportar?idEmpleado=${idEmpleado}`)
          .expect(200);
        expect(csv.body.data).toContain('EN_PROCESO');
      });
      it('bloquea traslapes, fechas pasadas y saldo insuficiente', async () => {
        const e = await empleado();
        await e.agent
          .post('/api/vacaciones/solicitudes')
          .set('X-CSRF-Token', e.csrf)
          .send(tramo)
          .expect(422);
        await e.agent
          .post('/api/vacaciones/solicitudes')
          .set('X-CSRF-Token', e.csrf)
          .send({ inicio: '2020-01-01', fin: '2020-01-02' })
          .expect(422);
        await e.agent
          .post('/api/vacaciones/solicitudes')
          .set('X-CSRF-Token', e.csrf)
          .send({ inicio: '2095-02-07', fin: '2095-02-18' })
          .expect(422);
      });
      it('RH ve rojo tras cargar previas, backend rechaza aprobar y exige motivo al rechazar', async () => {
        const a = await entrarCuenta('RH');
        const carga = {
          tipo: 'TOMADAS',
          dias: '4',
          referencia: 'F7_PREVIAS',
          motivo: 'Registro de días disfrutados antes del sistema',
          confirmado: true,
        };
        await a.agent
          .post(`/api/vacaciones/empleados/${idEmpleado}/cargar`)
          .set('X-CSRF-Token', a.csrf)
          .send(carga)
          .expect(201);
        await a.agent
          .post(`/api/vacaciones/empleados/${idEmpleado}/cargar`)
          .set('X-CSRF-Token', a.csrf)
          .send(carga)
          .expect(409);
        const r = await a.agent
          .get(`/api/vacaciones/solicitudes?idEmpleado=${idEmpleado}`)
          .expect(200);
        expect(r.body.data.registros[0]).toMatchObject({
          alcanza: false,
          puedeAprobar: false,
          disponible: '1.00',
        });
        await a.agent
          .post(`/api/vacaciones/solicitudes/${solicitud}/resolver`)
          .set('X-CSRF-Token', a.csrf)
          .send({ estado: 'APROBADA', confirmado: true })
          .expect(409);
        await a.agent
          .post(`/api/vacaciones/solicitudes/${solicitud}/resolver`)
          .set('X-CSRF-Token', a.csrf)
          .send({ estado: 'RECHAZADA', motivo: '', confirmado: true })
          .expect(400);
        await a.agent
          .post(`/api/vacaciones/solicitudes/${solicitud}/resolver`)
          .set('X-CSRF-Token', a.csrf)
          .send({
            estado: 'RECHAZADA',
            motivo: 'El saldo ya no alcanza; reduce el rango.',
            confirmado: true,
          })
          .expect(200);
        const e = await empleado();
        expect(
          (await e.agent.get('/api/vacaciones/solicitudes')).body.data.registros[0].estado,
        ).toBe('RECHAZADA');
      });
      it('aprobaciones concurrentes descuentan una sola vez y notifican al dueño', async () => {
        const e = await empleado(),
          a = await entrarAdmin();
        const r = await e.agent
          .post('/api/vacaciones/solicitudes')
          .set('X-CSRF-Token', e.csrf)
          .send({ inicio: tramo.inicio, fin: tramo.inicio })
          .expect(201);
        const id = r.body.data.id;
        const resultados = await Promise.all(
          Array.from({ length: 2 }, () =>
            a.agent
              .post(`/api/vacaciones/solicitudes/${id}/resolver`)
              .set('X-CSRF-Token', a.csrf)
              .send({ estado: 'APROBADA', confirmado: true }),
          ),
        );
        expect(resultados.map((r) => r.status).sort()).toEqual([200, 409]);
        const s = await e.agent.get('/api/vacaciones/mi-saldo').expect(200);
        expect(s.body.data.disponible).toBe('0.00');
        expect(
          await escalar('SELECT COUNT(*) FROM VACACIONES_MOVIMIENTOS WHERE CLAVE_ORIGEN=:clave', {
            clave: `SOLICITUD:${id}`,
          }),
        ).toBe(1);
        const avisos = await e.agent.get('/api/vacaciones/notificaciones').expect(200);
        expect(avisos.body.data.pendientes).toBe(2);
        const nid = avisos.body.data.registros[0].id;
        const otro = await entrarCuenta();
        await otro.agent
          .post(`/api/vacaciones/notificaciones/${nid}/leida`)
          .set('X-CSRF-Token', otro.csrf)
          .send({})
          .expect(200);
        expect((await e.agent.get('/api/vacaciones/notificaciones')).body.data.pendientes).toBe(2);
        await e.agent
          .post(`/api/vacaciones/notificaciones/${nid}/leida`)
          .set('X-CSRF-Token', e.csrf)
          .send({})
          .expect(200);
        expect((await e.agent.get('/api/vacaciones/notificaciones')).body.data.pendientes).toBe(1);
        await a.agent
          .get(`/api/vacaciones/empleados/${idEmpleado}/finiquito?corte=${hoy}`)
          .expect(409);
      });
      it('materializa aniversarios una sola vez y permite apertura cero sin tasas históricas inventadas', async () => {
        const a = await entrarAdmin();
        const reciente = await a.agent
          .post('/api/empleados')
          .set('X-CSRF-Token', a.csrf)
          .send({ ...datos(), fechaIngreso: '2026-01-12' })
          .expect(201);
        const id = reciente.body.data.empleado.id;
        const primero = await a.agent.get(`/api/vacaciones/empleados/${id}/saldo`).expect(200);
        expect(primero.body.data.disponible).toBe('11.25');
        const segundo = await a.agent.get(`/api/vacaciones/empleados/${id}/saldo`).expect(200);
        expect(segundo.body.data.kardex).toHaveLength(9);
        const antiguo = await a.agent
          .post('/api/empleados')
          .set('X-CSRF-Token', a.csrf)
          .send({ ...datos(), fechaIngreso: '2020-01-12' })
          .expect(201);
        const antiguoId = antiguo.body.data.empleado.id;
        await a.agent.get(`/api/vacaciones/empleados/${antiguoId}/saldo`).expect(409);
        const cero = await a.agent
          .post(`/api/vacaciones/empleados/${antiguoId}/cargar`)
          .set('X-CSRF-Token', a.csrf)
          .send(apertura('0'))
          .expect(201);
        expect(cero.body.data.disponible).toBe('0.00');
      });
      it('revierte saldo, solicitud y notificación si falla la auditoría de aprobación', async () => {
        const a = await entrarAdmin();
        const nuevo = await a.agent
          .post('/api/empleados')
          .set('X-CSRF-Token', a.csrf)
          .send({ ...datos(), generarUsuario: true })
          .expect(201);
        const id = nuevo.body.data.empleado.id,
          cred = nuevo.body.data.credenciales;
        await ejecutar('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', {
          id: cred.idUsuario,
        });
        await a.agent
          .post(`/api/vacaciones/empleados/${id}/cargar`)
          .set('X-CSRF-Token', a.csrf)
          .send(apertura('3'))
          .expect(201);
        const valoracion = await a.agent
          .get(`/api/vacaciones/empleados/${id}/finiquito?corte=${hoy}`)
          .expect(200);
        expect(valoracion.body.data.monto).toBe('500.00');
        const e = await entrar(cred.usuario, cred.contrasenaTemporal);
        const r = await e.agent
          .post('/api/vacaciones/solicitudes')
          .set('X-CSRF-Token', e.csrf)
          .send(tramo)
          .expect(201);
        await ejecutar(
          "CREATE OR REPLACE TRIGGER F7_FALLAR_AUD BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='VACACIONES_APROBADA' THEN RAISE_APPLICATION_ERROR(-20047,'Fallo de prueba'); END IF; END;",
        );
        try {
          await a.agent
            .post(`/api/vacaciones/solicitudes/${r.body.data.id}/resolver`)
            .set('X-CSRF-Token', a.csrf)
            .send({ estado: 'APROBADA', confirmado: true })
            .expect(500);
          expect((await e.agent.get('/api/vacaciones/mi-saldo')).body.data.disponible).toBe('3.00');
          expect(
            await escalar(
              'SELECT ESTADO FROM VACACIONES_SOLICITUDES WHERE ID_VACACIONES_SOLICITUD=:id',
              { id: r.body.data.id },
            ),
          ).toBe('EN_PROCESO');
          expect(
            await escalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE CLAVE_EVENTO=:clave', {
              clave: `VACACIONES:${r.body.data.id}:APROBADA`,
            }),
          ).toBe(0);
        } finally {
          await ejecutar('DROP TRIGGER F7_FALLAR_AUD');
        }
      });
    });
    describe('Fase 6: novedades con Oracle real', () => {
      let idEmpleado = 0;
      let descuento = 0;
      let prestamo = 0;
      let ausencia = 0;
      let serialN = 0;
      const fecha = '2090-01-02';
      const motivo = 'Novedad autorizada de prueba';
      const base = () => ({ idEmpleado, motivo });
      const dDescuento = () => ({
        ...base(),
        idTipo: descuento,
        modalidad: 'CUOTAS',
        monto: '100.00',
        cuotas: 3,
        fechaInicio: fecha,
        fechaFin: null,
      });
      const dPrestamo = () => ({
        ...base(),
        idTipo: prestamo,
        monto: '100.00',
        cuotas: 3,
        fechaInicio: fecha,
        fechaDesembolso: fecha,
        referencia: `F6_P_${++serialN}`,
      });
      const dComision = () => ({
        ...base(),
        monto: '300.25',
        fecha,
        referencia: `F6_C_${++serialN}`,
      });
      const dHora = () => ({
        ...base(),
        fecha,
        horas: '2',
        jornada: 'DIURNA',
        estado: 'APROBADA',
        confirmado: true,
      });
      const dAusencia = () => ({
        ...base(),
        idTipo: ausencia,
        fechaInicio: '2090-03-01',
        fechaFin: '2090-03-03',
        estado: 'APROBADA',
        confirmado: true,
      });
      beforeAll(async () => {
        const { agent, csrf } = await entrarAdmin();
        idEmpleado = (
          await agent.post('/api/empleados').set('X-CSRF-Token', csrf).send(datos()).expect(201)
        ).body.data.empleado.id;
        descuento = Number(
          await escalar("SELECT ID_TIPO_DESCUENTO FROM TIPOS_DESCUENTO WHERE CODIGO='PARQUEO'"),
        );
        prestamo = Number(
          await escalar("SELECT ID_TIPO_DESCUENTO FROM TIPOS_DESCUENTO WHERE CODIGO='PRESTAMO'"),
        );
        ausencia = Number(
          await escalar(
            "SELECT ID_TIPO_AUSENCIA FROM TIPOS_AUSENCIA WHERE CODIGO='PERMISO_SIN_GOCE'",
          ),
        );
      });
      it('protege RH/ADMIN, CSRF y schemas estrictos sin errores internos', async () => {
        await request(app).get('/api/novedades/descuentos').expect(401);
        const e = await entrarCuenta();
        await e.agent.get('/api/novedades/descuentos').expect(403);
        await e.agent.get('/api/novedades/ausencias/1/adjunto').expect(403);
        const a = await entrarAdmin();
        await a.agent.post('/api/novedades/descuentos').send(dDescuento()).expect(403);
        await a.agent
          .post('/api/novedades/comisiones')
          .set('X-CSRF-Token', a.csrf)
          .send({ ...dComision(), monto: 'abc' })
          .expect(400);
        await a.agent.get('/api/novedades/descuentos?ordenarPor=SQL').expect(400);
      });
      it('registra fijo, único, cuotas, amortización exacta y filtros/exportación', async () => {
        const { agent, csrf } = await entrarCuenta('RH');
        const d = await agent
          .post('/api/novedades/descuentos')
          .set('X-CSRF-Token', csrf)
          .send(dDescuento())
          .expect(201);
        expect(d.body.data.saldo).toBe('100');
        expect(d.body.data.cuotasDetalle.map((c: { monto: string }) => c.monto)).toEqual([
          '33.33',
          '33.33',
          '33.34',
        ]);
        const lista = await agent
          .get(
            `/api/novedades/descuentos?idEmpleado=${idEmpleado}&modalidad=CUOTAS&saldoMin=100&montoMax=100&cuotasMin=3&desde=2090-01-01&hasta=2090-02-28`,
          )
          .expect(200);
        expect(lista.body.data.registros.some((r: { id: number }) => r.id === d.body.data.id)).toBe(
          true,
        );
        const unico = await agent
          .post('/api/novedades/descuentos')
          .set('X-CSRF-Token', csrf)
          .send({ ...dDescuento(), modalidad: 'UNICO', cuotas: 1 })
          .expect(201);
        expect(unico.body.data.cuotasDetalle).toHaveLength(1);
        const fijo = await agent
          .post('/api/novedades/descuentos')
          .set('X-CSRF-Token', csrf)
          .send({ ...dDescuento(), modalidad: 'FIJO', cuotas: null, fechaFin: '2090-01-31' })
          .expect(201);
        expect(fijo.body.data.saldo).toBeNull();
        expect(fijo.body.data.cuotasDetalle).toHaveLength(0);
        await agent
          .patch(`/api/novedades/descuentos/${fijo.body.data.id}`)
          .set('X-CSRF-Token', csrf)
          .send({
            ...dDescuento(),
            modalidad: 'FIJO',
            cuotas: null,
            fechaFin: '2090-01-31',
            monto: '55',
          })
          .expect(200);
        await agent
          .post(`/api/novedades/descuentos/${fijo.body.data.id}/anular`)
          .set('X-CSRF-Token', csrf)
          .send({ motivo, confirmado: true })
          .expect(200);
        const csv = await agent
          .get(`/api/novedades/descuentos/exportar?idEmpleado=${idEmpleado}`)
          .expect(200);
        expect(csv.body.data).toContain('Saldo');
        expect(
          await escalar(
            "SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ENTIDAD='DESCUENTOS_EMPLEADO' AND ID_ENTIDAD=:id",
            { id: fijo.body.data.id },
          ),
        ).toBe(3);
      });
      it('valida primera cuota, importes, modalidades y referencias del préstamo', async () => {
        const { agent, csrf } = await entrarAdmin();
        const past = new Date(Date.parse(hoy) - 86400000).toISOString().slice(0, 10);
        await agent
          .post('/api/novedades/prestamos')
          .set('X-CSRF-Token', csrf)
          .send({ ...dPrestamo(), fechaInicio: past, fechaDesembolso: past })
          .expect(422);
        await agent
          .post('/api/novedades/descuentos')
          .set('X-CSRF-Token', csrf)
          .send({ ...dDescuento(), monto: '0.01', cuotas: 3 })
          .expect(409);
        await agent
          .post('/api/novedades/descuentos')
          .set('X-CSRF-Token', csrf)
          .send({ ...dDescuento(), idTipo: prestamo })
          .expect(422);
        const d = dPrestamo();
        const r = await agent
          .post('/api/novedades/prestamos')
          .set('X-CSRF-Token', csrf)
          .send(d)
          .expect(201);
        expect(r.body.data.cuotasDetalle).toHaveLength(3);
        await agent.post('/api/novedades/prestamos').set('X-CSRF-Token', csrf).send(d).expect(409);
        await agent
          .post('/api/novedades/prestamos/previsualizar')
          .set('X-CSRF-Token', csrf)
          .send(dPrestamo())
          .expect(200);
        expect(
          await escalar('SELECT COUNT(*) FROM PRESTAMOS WHERE ID_DESCUENTO_EMPLEADO=:id', {
            id: r.body.data.id,
          }),
        ).toBe(1);
        await agent
          .post(`/api/novedades/prestamos/${r.body.data.id}/anular`)
          .set('X-CSRF-Token', csrf)
          .send({ motivo, confirmado: true })
          .expect(200);
        expect(
          await escalar('SELECT ACTIVO FROM PRESTAMOS WHERE ID_DESCUENTO_EMPLEADO=:id', {
            id: r.body.data.id,
          }),
        ).toBe(0);
      });
      it('carga comisiones por quincena, filtra y evita duplicar el origen', async () => {
        const { agent, csrf } = await entrarAdmin();
        const d = dComision();
        const r = await agent
          .post('/api/novedades/comisiones')
          .set('X-CSRF-Token', csrf)
          .send(d)
          .expect(201);
        expect(r.body.data.fechaInicio).toBe('2090-01-01');
        expect(r.body.data.fechaFin).toBe('2090-01-15');
        await agent.post('/api/novedades/comisiones').set('X-CSRF-Token', csrf).send(d).expect(409);
        const lista = await agent
          .get(
            `/api/novedades/comisiones?idEmpleado=${idEmpleado}&idPeriodo=${r.body.data.idPeriodo}&montoMin=300&buscar=Prueba`,
          )
          .expect(200);
        expect(lista.body.data.total).toBeGreaterThan(0);
        await agent
          .patch(`/api/novedades/comisiones/${r.body.data.id}`)
          .set('X-CSRF-Token', csrf)
          .send({ ...d, monto: '301.25' })
          .expect(200);
      });
      it('valora horas con salario/recargo vigentes y exige confirmación al aprobar', async () => {
        const { agent, csrf } = await entrarAdmin();
        const d = dHora();
        await agent
          .post('/api/novedades/horas-extra')
          .set('X-CSRF-Token', csrf)
          .send({ ...d, confirmado: false })
          .expect(422);
        const r = await agent
          .post('/api/novedades/horas-extra')
          .set('X-CSRF-Token', csrf)
          .send(d)
          .expect(201);
        expect(r.body.data.calculo).toEqual({ valorHora: '20.83', recargo: '50', monto: '62.50' });
        await agent
          .post('/api/novedades/horas-extra')
          .set('X-CSRF-Token', csrf)
          .send(d)
          .expect(409);
        await agent
          .get(`/api/novedades/horas-extra?idEmpleado=${idEmpleado}&jornada=DIURNA&horasMin=2`)
          .expect(200);
        const p = await agent
          .post('/api/novedades/horas-extra/previsualizar')
          .set('X-CSRF-Token', csrf)
          .send({ ...d, jornada: 'MIXTA' })
          .expect(200);
        expect(p.body.data.calculo.monto).toBe('71.43');
      });
      it('rechaza traslapes inclusivos y serializa dos capturas concurrentes', async () => {
        const { agent, csrf } = await entrarAdmin();
        const d = dAusencia();
        const resultados = await Promise.all(
          [1, 2].map(() =>
            agent.post('/api/novedades/ausencias').set('X-CSRF-Token', csrf).send(d),
          ),
        );
        expect(resultados.map((r) => r.status).sort()).toEqual([201, 422]);
        await agent
          .post('/api/novedades/ausencias')
          .set('X-CSRF-Token', csrf)
          .send({ ...d, fechaInicio: '2090-03-03', fechaFin: '2090-03-04' })
          .expect(422);
        const r = await agent
          .post('/api/novedades/ausencias')
          .set('X-CSRF-Token', csrf)
          .send({ ...d, fechaInicio: '2090-03-04', fechaFin: '2090-03-04', estado: 'PENDIENTE' })
          .expect(201);
        await agent
          .patch(`/api/novedades/ausencias/${r.body.data.id}`)
          .set('X-CSRF-Token', csrf)
          .send({ ...d, fechaInicio: '2090-03-04', fechaFin: '2090-03-05' })
          .expect(200);
        const l = await agent
          .get(
            `/api/novedades/ausencias?idEmpleado=${idEmpleado}&efecto=SIN_GOCE&desde=2090-03-01&hasta=2090-03-31`,
          )
          .expect(200);
        expect(l.body.data.total).toBe(2);
        const cat = await agent.get(`/api/catalogos/tipos-ausencia/${ausencia}`).expect(200);
        await agent
          .patch(`/api/catalogos/tipos-ausencia/${ausencia}`)
          .set('X-CSRF-Token', csrf)
          .send({
            codigo: cat.body.data.codigo,
            nombre: cat.body.data.nombre,
            descripcion: cat.body.data.descripcion,
            efecto: 'CON_GOCE',
          })
          .expect(409);
      });
      it('impide rangos ocupados por vacaciones y admite días contiguos', async () => {
        const { agent, csrf } = await entrarAdmin();
        await ejecutar(
          "INSERT INTO SOLICITUDES (ID_EMPLEADO,ID_TIPO_SOLICITUD) SELECT :id,ID_TIPO_SOLICITUD FROM TIPOS_SOLICITUD WHERE CODIGO='VACACIONES'",
          { id: idEmpleado },
        );
        const idSolicitud = Number(
          await escalar('SELECT MAX(ID_SOLICITUD) FROM SOLICITUDES WHERE ID_EMPLEADO=:id', {
            id: idEmpleado,
          }),
        );
        await ejecutar(
          "INSERT INTO VACACIONES_SOLICITUDES (ID_EMPLEADO,ID_SOLICITUD,FECHA_INICIO,FECHA_FIN,DIAS_SOLICITADOS,SALDO_AL_SOLICITAR) VALUES (:id,:solicitud,DATE '2090-04-01',DATE '2090-04-03',3,10)",
          { id: idEmpleado, solicitud: idSolicitud },
        );
        await agent
          .post('/api/novedades/ausencias')
          .set('X-CSRF-Token', csrf)
          .send({ ...dAusencia(), fechaInicio: '2090-04-02', fechaFin: '2090-04-02' })
          .expect(422);
        const r = await agent.get(`/api/novedades/restricciones/${idEmpleado}`).expect(200);
        expect(r.body.data.rangos).toEqual(
          expect.arrayContaining([expect.objectContaining({ inicio: '2090-04-01' })]),
        );
      });
      it('guarda un adjunto privado, comprueba contenido y permite quitarlo', async () => {
        const { agent, csrf } = await entrarAdmin();
        const adjunto = {
          nombre: 'respaldo.pdf',
          tipo: 'application/pdf',
          base64: Buffer.from('%PDF-1.7\nRespaldo de prueba').toString('base64'),
        };
        const d = { ...dAusencia(), fechaInicio: '2090-05-01', fechaFin: '2090-05-01', adjunto };
        await agent
          .post('/api/novedades/ausencias')
          .set('X-CSRF-Token', csrf)
          .send({ ...d, adjunto: { ...adjunto, tipo: 'image/png' } })
          .expect(422);
        const r = await agent
          .post('/api/novedades/ausencias')
          .set('X-CSRF-Token', csrf)
          .send(d)
          .expect(201);
        const id = r.body.data.id;
        const archivo = await agent.get(`/api/novedades/ausencias/${id}/adjunto`).expect(200);
        expect(archivo.body.data).toEqual(adjunto);
        expect(r.body.data).not.toHaveProperty('adjunto');
        await agent
          .patch(`/api/novedades/ausencias/${id}`)
          .set('X-CSRF-Token', csrf)
          .send({ ...d, adjunto: null })
          .expect(200);
        await agent.get(`/api/novedades/ausencias/${id}/adjunto`).expect(404);
      });
      it('revierte calendario, préstamo y periodo si falla la auditoría', async () => {
        const { agent, csrf } = await entrarAdmin();
        await ejecutar(
          "CREATE OR REPLACE TRIGGER F6_FALLAR_AUD BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='CREAR_NOVEDAD' THEN RAISE_APPLICATION_ERROR(-20046,'Fallo de prueba'); END IF; END;",
        );
        const d = dPrestamo();
        const antes = await escalar('SELECT COUNT(*) FROM DESCUENTOS_CUOTAS');
        try {
          await agent
            .post('/api/novedades/prestamos')
            .set('X-CSRF-Token', csrf)
            .send(d)
            .expect(500);
          expect(
            await escalar('SELECT COUNT(*) FROM PRESTAMOS WHERE REFERENCIA=:ref', {
              ref: d.referencia,
            }),
          ).toBe(0);
          expect(await escalar('SELECT COUNT(*) FROM DESCUENTOS_CUOTAS')).toBe(antes);
          await agent
            .post('/api/novedades/comisiones')
            .set('X-CSRF-Token', csrf)
            .send({ ...dComision(), fecha: '2093-06-01' })
            .expect(500);
          expect(
            await escalar(
              "SELECT COUNT(*) FROM PERIODOS_NOMINA WHERE FECHA_INICIO=DATE '2093-06-01'",
            ),
          ).toBe(0);
        } finally {
          await ejecutar('DROP TRIGGER F6_FALLAR_AUD');
        }
      });
      it('aplica la última cuota y liquida saldo automáticamente en una sola transacción', async () => {
        const { agent, csrf } = await entrarAdmin();
        const r = await agent
          .post('/api/novedades/prestamos')
          .set('X-CSRF-Token', csrf)
          .send({ ...dPrestamo(), cuotas: 1 })
          .expect(201);
        const idCuota = r.body.data.cuotasDetalle[0].id as number;
        const periodo = Number(
          await escalar(
            "SELECT ID_PERIODO_NOMINA FROM PERIODOS_NOMINA WHERE FECHA_INICIO=DATE '2090-01-01'",
          ),
        );
        await ejecutar(
          `INSERT INTO NOMINA_EMPLEADO (ID_PERIODO_NOMINA,ID_EMPLEADO,ID_HISTORIAL_SALARIAL,VERSION_CALCULO,DIAS_PAGADOS,SALARIO_BASE,TOTAL_INGRESOS,TOTAL_DESCUENTOS,NETO,COSTO_PATRONAL,DATOS_EMPLEADO) SELECT :periodo,:id,ID_HISTORIAL_SALARIAL,1,15,5000,2500,100,2400,0,'{}' FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id AND VIGENTE_HASTA IS NULL`,
          { periodo, id: idEmpleado },
        );
        const nomina = Number(
          await escalar(
            'SELECT ID_NOMINA_EMPLEADO FROM NOMINA_EMPLEADO WHERE ID_EMPLEADO=:id AND ID_PERIODO_NOMINA=:periodo',
            { id: idEmpleado, periodo },
          ),
        );
        await expect(
          enTransaccion(db, (c) => registrarCobroCuota(c, admin, idCuota, nomina, '100.01')),
        ).rejects.toThrow();
        await ejecutar(
          "CREATE OR REPLACE TRIGGER F6_FALLAR_COBRO BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='APLICAR_CUOTA' THEN RAISE_APPLICATION_ERROR(-20047,'Fallo de prueba'); END IF; END;",
        );
        try {
          await expect(
            enTransaccion(db, (c) => registrarCobroCuota(c, admin, idCuota, nomina, '100')),
          ).rejects.toThrow();
          expect(
            await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO WHERE ID_DESCUENTO_EMPLEADO=:id', {
              id: r.body.data.id,
            }),
          ).toBe(100);
          expect(
            await escalar(
              'SELECT MONTO_PAGADO FROM DESCUENTOS_CUOTAS WHERE ID_DESCUENTO_CUOTA=:id',
              { id: idCuota },
            ),
          ).toBe(0);
        } finally {
          await ejecutar('DROP TRIGGER F6_FALLAR_COBRO');
        }
        expect(
          await enTransaccion(db, (c) => registrarCobroCuota(c, admin, idCuota, nomina, '100')),
        ).toEqual({ saldo: '0.00', estado: 'LIQUIDADO' });
        const saldados = await agent
          .get(`/api/novedades/prestamos?idEmpleado=${idEmpleado}&saldoMax=0`)
          .expect(200);
        expect(
          saldados.body.data.registros.some((f: { id: number }) => f.id === r.body.data.id),
        ).toBe(true);
        await expect(
          enTransaccion(db, (c) => registrarCobroCuota(c, admin, idCuota, nomina, '100')),
        ).rejects.toThrow();
        await agent
          .patch(`/api/novedades/prestamos/${r.body.data.id}`)
          .set('X-CSRF-Token', csrf)
          .send(dPrestamo())
          .expect(409);
        expect(
          await escalar(
            'SELECT COUNT(*) FROM DESCUENTOS_APLICACIONES WHERE ID_DESCUENTO_CUOTA=:id',
            { id: idCuota },
          ),
        ).toBe(1);
      });
      it('bloquea altas, ediciones, movimientos de fecha y anulaciones en periodos cerrados', async () => {
        const { agent, csrf } = await entrarAdmin();
        const casos = [
          ['descuentos', { ...dDescuento(), cuotas: 1 }],
          ['prestamos', { ...dPrestamo(), cuotas: 1 }],
          ['comisiones', dComision()],
          ['horas-extra', { ...dHora(), fecha: '2090-01-03' }],
          ['ausencias', { ...dAusencia(), fechaInicio: '2090-01-04', fechaFin: '2090-01-04' }],
        ] as const;
        const registros = [];
        for (const [tipo, body] of casos)
          registros.push({
            tipo,
            body,
            id: (
              await agent
                .post(`/api/novedades/${tipo}`)
                .set('X-CSRF-Token', csrf)
                .send(body)
                .expect(201)
            ).body.data.id,
          });
        await ejecutar(
          "INSERT INTO PERIODOS_NOMINA (FECHA_INICIO,FECHA_FIN,QUINCENA,ESTADO,APROBADO_EN,CERRADO_EN,APROBADO_POR,CERRADO_POR) VALUES (DATE '2092-01-01',DATE '2092-01-15',1,'CERRADO',SYSDATE,SYSDATE,:actor,:actor)",
          { actor: admin.idUsuario },
        );
        for (const { tipo, body, id } of registros) {
          const nuevo =
            'fecha' in body
              ? { ...body, fecha: '2092-01-02' }
              : {
                  ...body,
                  fechaInicio: '2092-01-02',
                  ...('fechaFin' in body && tipo === 'ausencias' ? { fechaFin: '2092-01-03' } : {}),
                };
          await agent
            .patch(`/api/novedades/${tipo}/${id}`)
            .set('X-CSRF-Token', csrf)
            .send(nuevo)
            .expect(422);
        }
        await ejecutar(
          "UPDATE PERIODOS_NOMINA SET ESTADO='CERRADO',APROBADO_EN=SYSDATE,CERRADO_EN=SYSDATE,APROBADO_POR=:actor,CERRADO_POR=:actor WHERE FECHA_INICIO=DATE '2090-01-01'",
          { actor: admin.idUsuario },
        );
        for (const { tipo, body, id } of registros) {
          await agent
            .patch(`/api/novedades/${tipo}/${id}`)
            .set('X-CSRF-Token', csrf)
            .send(body)
            .expect(409);
          await agent
            .post(`/api/novedades/${tipo}/${id}/anular`)
            .set('X-CSRF-Token', csrf)
            .send({ motivo, confirmado: true })
            .expect(409);
          const d = await agent.get(`/api/novedades/${tipo}/${id}`).expect(200);
          expect(d.body.data.bloqueada).toBe(1);
          await agent
            .post(`/api/novedades/${tipo}`)
            .set('X-CSRF-Token', csrf)
            .send(body)
            .expect(422);
        }
      });
    });
  });
  describe('Fase 8: motor, cierre y boletas Oracle reales', () => {
    let empleadoId = 0,
      otroId = 0,
      centroId = 0,
      periodoId = 0,
      nominaId = 0,
      descuentoId = 0;
    let cuentaF8: { idUsuario: number; usuario: string; contrasenaTemporal: string };
    const post = async (ruta: string, body: object, status = 200) => {
      const { agent, csrf } = await entrarAdmin();
      return agent
        .post('/api/nomina' + ruta)
        .set('X-CSRF-Token', csrf)
        .send(body)
        .expect(status);
    };
    const actuar = async (accion: string, version = 1, status = 200, motivo = '') =>
      post(`/periodos/${periodoId}/${accion}`, { version, confirmado: true, motivo }, status);
    beforeAll(async () => {
      // Fixtures exclusivos del esquema N2SEC desechable: otras fases quedan fuera de esta quincena.
      await ejecutar('UPDATE EMPLEADOS SET ACTIVO=0');
      await ejecutar(
        "UPDATE PARAMETROS_LEGALES SET VIGENTE_HASTA=DATE '2098-12-31' WHERE VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>DATE '2098-12-31'",
      );
      const fixture = entradaPrueba();
      for (const p of fixture.parametros)
        await ejecutar(
          "INSERT INTO PARAMETROS_LEGALES (CODIGO,NOMBRE,VALOR,UNIDAD,VIGENTE_DESDE,FUNDAMENTO,MOTIVO) VALUES (:codigo,:codigo,TO_NUMBER(:valor,'999999D999999','NLS_NUMERIC_CHARACTERS=''.,'''),:unidad,DATE '2099-01-01','Referencia de prueba','Fixture Oracle F8')",
          { codigo: p.codigo, valor: p.valor, unidad: p.unidad },
        );
      await ejecutar(
        "UPDATE TRAMOS_ISR SET VIGENTE_HASTA=DATE '2098-12-31' WHERE VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>DATE '2098-12-31'",
      );
      await ejecutar(
        "INSERT INTO TRAMOS_ISR (VIGENTE_DESDE,LIMITE_INFERIOR,LIMITE_SUPERIOR,TASA_PORCENTAJE,CUOTA_FIJA,MOTIVO) VALUES (DATE '2099-01-01',0,300000,5,0,'Fixture F8')",
      );
      await ejecutar(
        "INSERT INTO TRAMOS_ISR (VIGENTE_DESDE,LIMITE_INFERIOR,LIMITE_SUPERIOR,TASA_PORCENTAJE,CUOTA_FIJA,MOTIVO) VALUES (DATE '2099-01-01',300000,NULL,7,15000,'Fixture F8')",
      );
      await ejecutar(
        "INSERT INTO DEPARTAMENTOS (CODIGO,NOMBRE) VALUES ('F8_DEP','Departamento de prueba F8')",
      );
      const dep = Number(
        await escalar("SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE CODIGO='F8_DEP'"),
      );
      await ejecutar(
        "INSERT INTO PUESTOS (CODIGO,NOMBRE,ID_DEPARTAMENTO) VALUES ('F8_PUESTO','Puesto F8',:dep)",
        { dep },
      );
      const puesto = Number(
        await escalar("SELECT ID_PUESTO FROM PUESTOS WHERE CODIGO='F8_PUESTO'"),
      );
      await ejecutar(
        "INSERT INTO CENTROS_TRABAJO (CODIGO,NOMBRE,LOCALIDAD,DIRECCION) VALUES ('F8_CENTRO','Centro F8','PRUEBA','Dirección F8')",
      );
      centroId = Number(
        await escalar("SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE CODIGO='F8_CENTRO'"),
      );
      const contrato = Number(await escalar('SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO'));
      cuentaF8 = await crearCuenta('EMPLEADO');
      for (const [codigo, usuario, nit] of [
        ['F8_EMP', cuentaF8.idUsuario, '1234599-1'],
        ['F8_OTRO', null, '1234598-3'],
      ] as const) {
        await ejecutar(
          "INSERT INTO EMPLEADOS (CODIGO,ID_USUARIO,NOMBRES,APELLIDOS,DPI,NIT,AFILIACION_IGSS,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) VALUES (:codigo,:usuario,'Persona','Prueba',:dpi,:nit,:igss,DATE '1995-01-01','O','SOLTERO','Dirección F8','55551234',:correo,:puesto,:dep,:contrato,:centro,DATE '2099-01-01')",
          {
            codigo,
            usuario,
            dpi: codigo === 'F8_EMP' ? '8765432101234' : '8765432101235',
            nit,
            igss: codigo === 'F8_EMP' ? '444444441' : '444444442',
            correo: codigo.toLowerCase() + '@example.test',
            puesto,
            dep,
            contrato,
            centro: centroId,
          },
        );
      }
      empleadoId = Number(await escalar("SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CODIGO='F8_EMP'"));
      otroId = Number(await escalar("SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CODIGO='F8_OTRO'"));
      for (const id of [empleadoId, otroId])
        await ejecutar(
          "INSERT INTO HISTORIAL_SALARIAL (ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES (:id,3000,DATE '2099-01-01','Fixture F8')",
          { id },
        );
      const tipo = Number(
        await escalar("SELECT ID_TIPO_DESCUENTO FROM TIPOS_DESCUENTO WHERE CODIGO='PRESTAMO'"),
      );
      const { agent, csrf } = await entrarAdmin();
      const prestamo = await agent
        .post('/api/novedades/prestamos')
        .set('X-CSRF-Token', csrf)
        .send({
          idEmpleado: empleadoId,
          idTipo: tipo,
          fechaInicio: '2099-01-01',
          fechaDesembolso: '2099-01-01',
          monto: '100.01',
          cuotas: 2,
          referencia: 'F8_PRESTAMO',
          motivo: 'Préstamo real de la prueba',
          confirmado: true,
        })
        .expect(201);
      descuentoId = prestamo.body.data.id;
    });
    it('RBAC, CSRF y periodo exacto sin duplicados', async () => {
      const { agent } = await entrarCuenta('EMPLEADO');
      await agent.get('/api/nomina/periodos').expect(403);
      const adminF8 = await entrarAdmin();
      await adminF8.agent.post('/api/nomina/periodos').send({ fecha: '2099-01-02' }).expect(403);
      const r = await post('/periodos', { fecha: '2099-01-02' }, 201);
      periodoId = r.body.data.id;
      await post('/periodos', { fecha: '2099-01-14' }, 409);
      const p = await adminF8.agent.get(`/api/nomina/periodos/${periodoId}`).expect(200);
      expect(p.body.data).toMatchObject({
        inicio: '2099-01-01',
        fin: '2099-01-15',
        estado: 'ABIERTO',
      });
    });
    it('calcula y conserva líneas, parámetros, ISR y boleta con importes exactos', async () => {
      const r = await actuar('calcular', 0);
      expect(r.body.data.alertas).toEqual([]);
      const { agent } = await entrarAdmin();
      const tabla = await agent
        .get(`/api/nomina/periodos/${periodoId}/planilla`)
        .query({ idEmpleado: empleadoId })
        .expect(200);
      expect(tabla.body.data.total).toBe(1);
      expect(tabla.body.data.registros[0].neto).toBe('1502.55');
      nominaId = tabla.body.data.registros[0].id;
      const d = await agent.get(`/api/nomina/boletas/${nominaId}`).expect(200);
      expect(d.body.data.resultado.neto).toBe('1502.55');
      expect(
        Number(
          await escalar('SELECT COUNT(*) FROM NOMINA_DETALLE WHERE ID_NOMINA_EMPLEADO=:id', {
            id: nominaId,
          }),
        ),
      ).toBeGreaterThan(6);
      expect(
        Number(
          await escalar('SELECT COUNT(*) FROM NOMINA_PARAMETROS WHERE ID_NOMINA_EMPLEADO=:id', {
            id: nominaId,
          }),
        ),
      ).toBeGreaterThan(5);
      const pdf = await agent.get(`/api/nomina/boletas/${nominaId}/pdf`).expect(200);
      expect(Buffer.from(pdf.body.data.base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
      const emp = await entrar(cuentaF8.usuario, cuentaF8.contrasenaTemporal);
      await emp.agent.get(`/api/nomina/boletas/${nominaId}`).expect(403);
    });
    it('recalcular conserva versiones y exige revisar antes de aprobar', async () => {
      await actuar('aprobar', 1, 409);
      await actuar('revisar');
      await actuar('calcular');
      expect(
        Number(
          await escalar(
            'SELECT COUNT(DISTINCT VERSION_CALCULO) FROM NOMINA_EMPLEADO WHERE ID_PERIODO_NOMINA=:id',
            { id: periodoId },
          ),
        ),
      ).toBe(2);
      await actuar('aprobar', 2, 409);
      await actuar('revisar', 1, 409);
      await actuar('revisar', 2);
      await actuar('aprobar', 2);
    });
    it('rollback del cierre incluye cobros, saldo, estado y auditoría', async () => {
      await ejecutar(
        "CREATE OR REPLACE TRIGGER F8_FALLO_CIERRE BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='CERRAR_PERIODO' THEN RAISE_APPLICATION_ERROR(-20058,'Fallo de cierre de prueba'); END IF; END;",
      );
      try {
        await actuar('cerrar', 2, 500);
        expect(
          await escalar('SELECT ESTADO FROM PERIODOS_NOMINA WHERE ID_PERIODO_NOMINA=:id', {
            id: periodoId,
          }),
        ).toBe('APROBADO');
        expect(
          Number(
            await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO WHERE ID_DESCUENTO_EMPLEADO=:id', {
              id: descuentoId,
            }),
          ),
        ).toBe(100.01);
        expect(
          Number(
            await escalar(
              "SELECT COUNT(*) FROM DESCUENTOS_APLICACIONES WHERE ID_PERIODO_NOMINA=:id AND ESTADO='APLICADA'",
              { id: periodoId },
            ),
          ),
        ).toBe(0);
      } finally {
        await ejecutar('DROP TRIGGER F8_FALLO_CIERRE');
      }
    });
    it('dos cierres concurrentes solo cobran una vez y publican boletas propias', async () => {
      const a = await entrarAdmin(),
        b = await entrarAdmin();
      const rs = await Promise.all(
        [a, b].map(({ agent, csrf }) =>
          agent
            .post(`/api/nomina/periodos/${periodoId}/cerrar`)
            .set('X-CSRF-Token', csrf)
            .send({ version: 2, confirmado: true }),
        ),
      );
      expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        Number(
          await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO WHERE ID_DESCUENTO_EMPLEADO=:id', {
            id: descuentoId,
          }),
        ),
      ).toBe(50.01);
      await actuar('calcular', 2, 409);
      const emp = await entrar(cuentaF8.usuario, cuentaF8.contrasenaTemporal);
      const propio = await emp.agent
        .get('/api/nomina/boletas')
        .query({ idEmpleado: otroId })
        .expect(200);
      expect(propio.body.data.total).toBe(0);
      const filas = await emp.agent.get('/api/nomina/boletas').expect(200);
      expect(filas.body.data.total).toBe(1);
      nominaId = filas.body.data.registros[0].id;
      await emp.agent.get(`/api/nomina/boletas/${nominaId}/pdf`).expect(200);
      const otroNomina = Number(
        await escalar('SELECT MAX(ID_NOMINA_EMPLEADO) FROM NOMINA_EMPLEADO WHERE ID_EMPLEADO=:id', {
          id: otroId,
        }),
      );
      await emp.agent.get(`/api/nomina/boletas/${otroNomina}/pdf`).expect(403);
    });
    it('reapertura exige ADMIN/motivo, revierte cuotas y conserva versiones', async () => {
      const rh = await entrarCuenta('RH');
      await rh.agent
        .post(`/api/nomina/periodos/${periodoId}/reabrir`)
        .set('X-CSRF-Token', rh.csrf)
        .send({ version: 2, confirmado: true, motivo: 'Corrección de planilla' })
        .expect(403);
      await actuar('reabrir', 2, 409);
      await actuar('reabrir', 2, 200, 'Corrección auditada de planilla');
      expect(
        Number(
          await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO WHERE ID_DESCUENTO_EMPLEADO=:id', {
            id: descuentoId,
          }),
        ),
      ).toBe(100.01);
      expect(
        Number(
          await escalar(
            "SELECT COUNT(*) FROM DESCUENTOS_APLICACIONES WHERE ID_PERIODO_NOMINA=:id AND ESTADO='REVERTIDA'",
            { id: periodoId },
          ),
        ),
      ).toBe(1);
      await actuar('calcular', 2);
      await actuar('revisar', 3);
      await actuar('aprobar', 3);
      await actuar('cerrar', 3);
      expect(
        Number(
          await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO WHERE ID_DESCUENTO_EMPLEADO=:id', {
            id: descuentoId,
          }),
        ),
      ).toBe(50.01);
    });
    it('cambio de fuente invalida revisión y neto negativo bloquea aprobación', async () => {
      const r = await post('/periodos', { fecha: '2099-01-20' }, 201);
      periodoId = r.body.data.id;
      await actuar('calcular', 0);
      await ejecutar(
        "INSERT INTO COMISIONES (ID_EMPLEADO,ID_PERIODO_NOMINA,MONTO,REFERENCIA,DESCRIPCION) VALUES (:id,:periodo,100,'F8_COMISION','Comisión de prueba')",
        { id: empleadoId, periodo: periodoId },
      );
      await actuar('revisar', 1, 409);
      await actuar('calcular', 1);
      await ejecutar(
        "INSERT INTO DESCUENTOS_EMPLEADO (ID_EMPLEADO,ID_TIPO_DESCUENTO,MODALIDAD,MONTO_QUINCENA,FECHA_INICIO,MOTIVO) VALUES (:id,(SELECT ID_TIPO_DESCUENTO FROM TIPOS_DESCUENTO WHERE CODIGO='EMBARGO'),'FIJO',9999,DATE '2099-01-16','Neto negativo prueba')",
        { id: empleadoId },
      );
      const neg = await actuar('calcular', 2);
      expect(neg.body.data.alertas.join(' ')).toContain('negativo');
      await actuar('revisar', 3, 409);
      await ejecutar(
        "UPDATE DESCUENTOS_EMPLEADO SET ACTIVO=0,ESTADO='CANCELADO' WHERE MOTIVO='Neto negativo prueba'",
      );
      await actuar('calcular', 3);
      await actuar('revisar', 4);
      await actuar('aprobar', 4);
      await actuar('cerrar', 4);
      expect(
        Number(
          await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO WHERE ID_DESCUENTO_EMPLEADO=:id', {
            id: descuentoId,
          }),
        ),
      ).toBe(0);
      expect(
        await escalar('SELECT ESTADO FROM DESCUENTOS_EMPLEADO WHERE ID_DESCUENTO_EMPLEADO=:id', {
          id: descuentoId,
        }),
      ).toBe('LIQUIDADO');
    });
    it('exporta filtros completos, Excel/PDF/boletas e IGSS mensual parametrizado', async () => {
      const { agent, csrf } = await entrarAdmin();
      for (const f of ['excel', 'pdf', 'boletas']) {
        const r = await agent
          .get(`/api/nomina/exportar/${f}`)
          .query({ anio: 2099, mes: 1, limite: 1 })
          .expect(200);
        expect(Buffer.from(r.body.data.base64, 'base64').length).toBeGreaterThan(500);
      }
      const formato = {
        version: '2.2.0',
        patrono: '12345',
        pruebas: '1',
        nombre: 'Empresa de prueba F8',
        nit: '1234567-9',
        direccion: 'Dirección F8',
        correo: 'igss@example.test',
        centros: [
          {
            id: centroId,
            codigo: '1',
            nombre: 'Centro F8',
            direccion: 'Dirección F8',
            zona: '1',
            telefono: '',
            fax: '',
            contacto: '',
            correo: '',
            departamento: '1',
            municipio: '1',
            actividad: '451001',
          },
        ],
        tipos: [
          {
            codigo: '1',
            nombre: 'Mensual',
            afiliado: 'C',
            periodo: 'M',
            departamento: '1',
            actividad: '451001',
            clase: 'N',
            tiempo: 'TC',
          },
        ],
        empleados: [empleadoId, otroId].map((id) => ({
          id,
          tipo: '1',
          ocupacion: '4190',
          condicion: 'P',
          salario: '1',
          primerNombre: 'Persona',
          otrosNombres: '',
          primerApellido: 'Prueba',
          segundoApellido: '',
          apellidoCasada: '',
        })),
      };
      await agent
        .post('/api/nomina/igss/formato')
        .set('X-CSRF-Token', csrf)
        .send({ formato, motivo: 'Configuración certificada de prueba', confirmado: true })
        .expect(200);
      const igss = await agent
        .get('/api/nomina/igss/exportar')
        .query({ anio: 2099, mes: 1 })
        .expect(200);
      const contenido = Buffer.from(igss.body.data.base64, 'base64').toString();
      expect(contenido).toContain('[Centros]');
      expect(contenido).toContain('|3100.00|');
      expect(contenido).toContain('[Fin Planilla]');
      await agent.get('/api/nomina/igss/exportar').query({ anio: 2099, mes: 2 }).expect(409);
    });
    it('cobra cuotas vencidas al siguiente cierre y bloquea reabrir periodos con cierres posteriores', async () => {
      await ejecutar(
        "INSERT INTO DESCUENTOS_EMPLEADO (ID_EMPLEADO,ID_TIPO_DESCUENTO,MODALIDAD,MONTO_QUINCENA,MONTO_TOTAL,SALDO,NUMERO_CUOTAS,FECHA_INICIO,FECHA_FIN,MOTIVO) VALUES (:id,(SELECT ID_TIPO_DESCUENTO FROM TIPOS_DESCUENTO WHERE CODIGO='OTROS'),'UNICO',10,10,10,1,DATE '2099-01-20',DATE '2099-01-31','Cuota anterior al inicio del sistema')",
        { id: empleadoId },
      );
      const desc = Number(
        await escalar(
          'SELECT MAX(ID_DESCUENTO_EMPLEADO) FROM DESCUENTOS_EMPLEADO WHERE ID_EMPLEADO=:id',
          { id: empleadoId },
        ),
      );
      await ejecutar(
        "INSERT INTO DESCUENTOS_CUOTAS (ID_DESCUENTO_EMPLEADO,ID_EMPLEADO,NUMERO_CUOTA,FECHA_VENCIMIENTO,MONTO) VALUES (:acuerdo,:id,1,DATE '2099-01-31',10)",
        { acuerdo: desc, id: empleadoId },
      );
      const anterior = periodoId;
      const r = await post('/periodos', { fecha: '2099-02-01' }, 201);
      periodoId = r.body.data.id;
      await actuar('calcular', 0);
      await actuar('revisar');
      await actuar('aprobar');
      await actuar('cerrar');
      expect(
        Number(
          await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO WHERE ID_DESCUENTO_EMPLEADO=:id', {
            id: desc,
          }),
        ),
      ).toBe(0);
      await post(
        `/periodos/${anterior}/reabrir`,
        { version: 4, confirmado: true, motivo: 'Corrección de periodo anterior' },
        409,
      );
    });
    it('registra deducciones acreditadas/apertura única, audita su PK y no cambia boletas cerradas', async () => {
      const tipo = Number(
        await escalar(
          "SELECT ID_TIPO_DEDUCCION_ISR FROM TIPOS_DEDUCCION_ISR WHERE CODIGO='DONACION'",
        ),
      );
      const body = {
        idEmpleado: empleadoId,
        idTipo: tipo,
        anio: 2099,
        fecha: '2099-01-20',
        monto: '100',
        referencia: 'F8_DONACION',
        motivo: 'Comprobante acreditado de prueba',
        confirmado: true,
      };
      await post('/isr/deducciones', body, 201);
      await post('/isr/deducciones', body, 409);
      const { agent } = await entrarAdmin();
      const f = await agent
        .get(`/api/nomina/isr/empleados/${empleadoId}`)
        .query({ anio: 2099 })
        .expect(200);
      expect(f.body.data.deducciones).toHaveLength(1);
      const pk = Number(
        await escalar(
          "SELECT ID_DEDUCCION_ISR FROM ISR_DEDUCCIONES_EMPLEADO WHERE REFERENCIA='F8_DONACION'",
        ),
      );
      expect(
        Number(
          await escalar(
            "SELECT ID_ENTIDAD FROM BITACORA_AUDITORIA WHERE ACCION='REGISTRAR_DEDUCCION_ISR' AND ENTIDAD='ISR_DEDUCCIONES_EMPLEADO' ORDER BY ID_BITACORA_AUDITORIA DESC FETCH FIRST 1 ROW ONLY",
          ),
        ),
      ).toBe(pk);
      const apertura = {
        idEmpleado: empleadoId,
        anio: 2100,
        fecha: '2100-01-15',
        monto: '1000',
        igss: '48.30',
        isr: '0',
        motivo: 'Apertura fiscal certificada de prueba',
        confirmado: true,
      };
      await post('/isr/aperturas', apertura, 201);
      await post('/isr/aperturas', apertura, 409);
      await post('/isr/aperturas', { ...apertura, anio: 2099, fecha: '2099-01-15' }, 409);
      await post('/isr/deducciones', { ...body, idEmpleado: 99999999, referencia: 'OTRO' }, 404);
      const boleto = await agent.get(`/api/nomina/boletas/${nominaId}`).expect(200);
      expect(boleto.body.data.resultado.neto).toBe('1502.55');
    });
  });
});
