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
});
