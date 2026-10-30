import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { BindParameters } from 'oracledb';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearBaseDatos } from '../../shared/db/pool.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { aplicarMigraciones, ejecutarMigraciones } from '../../shared/db/migraciones.js';
import { cargarMigraciones } from '../../shared/db/migraciones.archivos.js';
import { crearMigracionesRepository } from '../../shared/db/migraciones.repository.js';
import { ejecutarSeeds } from '../../shared/db/seeds.js';
import { validarEntornoSeeds } from '../../shared/db/seeds.env.js';
import { validarEntorno } from '../../config/env.schema.js';
import { crearLogger } from '../../config/logger.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { crearApp } from '../../app.js';
import { crearAuthService } from '../auth/auth.service.js';
import { crearUsuarioInterno, crearUsuariosService } from '../usuarios/usuarios.service.js';
import type { ActorAuditoria, Rol } from '../auth/auth.types.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { crearEmpleadosService } from '../empleados/empleados.service.js';
import { crearTablerosService } from '../tableros/tableros.service.js';
import { crearAlmacenPrivado } from '../../shared/archivos/almacen.js';
import { crearExpedientesService } from './expedientes.service.js';
import { alertas } from '../tableros/tableros.repository.js';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=',
  'base64',
);
let db: BaseDatos, app: Express, dir: string, actor: ActorAuditoria;
const seed = validarEntornoSeeds(process.env),
  logger = crearLogger('silent');
const sql = (q: string, b: BindParameters = {}) => enTransaccion(db, (c) => c.execute(q, b));
const scalar = (q: string, b: BindParameters = {}) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(q, b)).rows![0]![0]);
const ids: number[] = [];
let tipos: { id: number; nombre: string; requiereVencimiento: boolean; obligatorio: boolean }[] =
  [];
async function entrar(usuario: string, contrasena: string) {
  const agent = request.agent(app),
    token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const r = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', token)
    .send({ usuario, contrasena })
    .expect(200);
  return { agent, csrf: r.body.data.csrfToken as string };
}
let admin: Awaited<ReturnType<typeof entrar>>,
  rh: typeof admin,
  empleado: typeof admin,
  otro: typeof admin,
  jefe: typeof admin,
  temporal: typeof admin;
async function cuenta(rol: Rol, nombre: string, ficha?: number, cambio = false) {
  const u = await enTransaccion(db, (c) =>
    crearUsuarioInterno(c, actor, {
      nombre,
      apellido: 'Expediente',
      correo: `${nombre.toLowerCase()}@example.test`,
      rol,
    }),
  );
  if (!cambio)
    await sql('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', { id: u.idUsuario });
  if (ficha)
    await sql('UPDATE EMPLEADOS SET ID_USUARIO=:u WHERE ID_EMPLEADO=:id', {
      u: u.idUsuario,
      id: ficha,
    });
  return entrar(u.usuario, u.contrasenaTemporal);
}
const base = '/api/expedientes';
const listado = (sesion = rh, id = ids[1]!) => sesion.agent.get(`${base}/empleados/${id}`);
const subir = (
  tipo: number,
  extra: Record<string, string | number> = {},
  bytes = png,
  nombre = 'documento.png',
  sesion = rh,
) =>
  sesion.agent
    .post(`${base}/empleados/${ids[1]}`)
    .query({ tipo, ...extra })
    .set('X-CSRF-Token', sesion.csrf)
    .set('Content-Type', 'image/png')
    .set('X-Nombre-Archivo', encodeURIComponent(nombre))
    .send(bytes);
let primera: number, reemplazo: number;
describe('R3-11: aceptación del expediente privado en Oracle y HTTP real', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    dir = await mkdtemp(join(tmpdir(), 'n2expediente-'));
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations/', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version <= 41),
        crearMigracionesRepository(c),
        logger,
      ),
    );
    await ejecutarSeeds(db, logger, seed);
    const config = {
      NODE_ENV: 'test' as const,
      SESSION_IDLE_MINUTES: 30,
      LOGIN_RATE_LIMIT: 1000,
      LOGIN_RATE_WINDOW_MINUTES: 15,
      TRUST_PROXY_CIDRS: '',
    };
    app = crearApp(
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
        empleados: crearEmpleadosService(db),
        tableros: crearTablerosService(db),
        expedientes: crearExpedientesService(db, crearAlmacenPrivado(dir)),
        config,
      },
    );
    admin = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD);
    await admin.agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', admin.csrf)
      .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'ExpedientePrueba!2026' })
      .expect(200);
    actor = {
      idUsuario: Number(
        await scalar('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO=:u', { u: seed.ADMIN_USER }),
      ),
      idRol: Number(await scalar("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN'")),
      rol: 'ADMIN',
      ip: '127.0.0.1',
    };
    await sql("INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES('Documentación')");
    const dep = Number(await scalar('SELECT MAX(ID_DEPARTAMENTO) FROM DEPARTAMENTOS'));
    await sql("INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) VALUES('Gestor documental',:dep)", {
      dep,
    });
    const puesto = Number(await scalar('SELECT MAX(ID_PUESTO) FROM PUESTOS'));
    await sql(
      "INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES('Sede documental','GUATEMALA_CIUDAD')",
    );
    const centro = Number(await scalar('SELECT MAX(ID_CENTRO_TRABAJO) FROM CENTROS_TRABAJO'));
    for (let i = 0; i < 3; i++) {
      await sql(
        `INSERT INTO EMPLEADOS(CODIGO,NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) VALUES(:codigo,:nombre,'López Pérez',:dpi,:nit,DATE '1990-01-01','F','SOLTERO','Calle 1','55551234',:correo,:puesto,:dep,(SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO),:centro,DATE '2020-01-01')`,
        {
          codigo: `EMP_DOC_${i}`,
          nombre: ['Jefa', 'Titular', 'Ajena'][i]!,
          dpi: `123456789012${i}`,
          nit: `123456${i}-1`,
          correo: `documental${i}@example.test`,
          puesto,
          dep,
          centro,
        },
      );
      ids.push(Number(await scalar('SELECT MAX(ID_EMPLEADO) FROM EMPLEADOS')));
    }
    rh = await cuenta('RH', 'Gestora');
    jefe = await cuenta('EMPLEADO', 'Jefa', ids[0]);
    empleado = await cuenta('EMPLEADO', 'Titular', ids[1]);
    otro = await cuenta('EMPLEADO', 'Ajena', ids[2]);
    temporal = await cuenta('EMPLEADO', 'Temporal', undefined, true);
    await sql(
      "INSERT INTO JEFATURAS(NOMBRE,ID_DEPARTAMENTO,ID_EMPLEADO_RESPONSABLE) VALUES('Equipo documental',:dep,:jefe)",
      { dep, jefe: ids[0]! },
    );
    const j = Number(await scalar('SELECT MAX(ID_JEFATURA) FROM JEFATURAS'));
    await sql('UPDATE EMPLEADOS SET ID_JEFATURA=:j WHERE ID_EMPLEADO IN (:uno,:dos)', {
      j,
      uno: ids[1]!,
      dos: ids[2]!,
    });
    for (const codigo of ['VER_EQUIPO', 'VER_COMISIONES_EQUIPO', 'VER_VACACIONES_EQUIPO'])
      await sql('INSERT INTO PERMISOS_JEFATURA(ID_JEFATURA,CODIGO_PERMISO) VALUES(:j,:codigo)', {
        j,
        codigo,
      });
    const antes = await scalar('SELECT COUNT(*) FROM EMPLEADOS');
    expect(await ejecutarMigraciones(db, logger)).toBe(
      migraciones.filter((m) => m.version > 41).length,
    );
    expect(await ejecutarMigraciones(db, logger)).toBe(0);
    expect(await scalar('SELECT COUNT(*) FROM EMPLEADOS')).toBe(antes);
    expect(await scalar("SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'")).toBe(0);
    tipos = (await listado().expect(200)).body.data.tipos;
  });
  afterAll(async () => {
    await db?.cerrar();
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  it('catálogo completo, parámetros reales y sin claves/rutas privadas en los DTO', async () => {
    expect(tipos).toHaveLength(7);
    const d = (await listado().expect(200)).body.data;
    expect(d.maxMb).toBe(10);
    expect(d.requeridos).toBe(4);
    expect(d.completos).toBe(0);
    expect(JSON.stringify(d)).not.toContain(dir);
    await listado(admin).expect(200);
  });
  it('401, CSRF, contraseña temporal y solo RH/ADMIN pueden cargar/configurar/borrar', async () => {
    await request(app).get(`${base}/empleados/${ids[1]}`).expect(401);
    await subir(tipos[0]!.id, {}, png, 'documento.png', empleado).expect(403);
    await subir(tipos[0]!.id, {}, png, 'documento.png', jefe).expect(403);
    await listado(temporal).expect(403);
    await rh.agent
      .post(`${base}/empleados/${ids[1]}`)
      .set('Content-Type', 'image/png')
      .send(png)
      .expect(403);
    await empleado.agent
      .patch(`${base}/tipos/${tipos[0]!.id}`)
      .set('X-CSRF-Token', empleado.csrf)
      .send({
        obligatorio: false,
        requiereVencimiento: false,
        motivo: 'No autorizado',
        confirmado: true,
      })
      .expect(403);
  });
  it('rechaza extensión válida con contenido falso, MIME discordante, exceso 10 MB y path traversal', async () => {
    await subir(tipos[3]!.id, {}, Buffer.from('<html>Falso</html>'), 'contrato.png').expect(400);
    await subir(tipos[3]!.id, {}, png, 'contrato.pdf').expect(400);
    await subir(tipos[3]!.id, {}, Buffer.alloc(10 * 1024 * 1024 + 1), 'grande.png').expect(413);
    await subir(tipos[3]!.id, {}, png, '../contrato.png').expect(400);
    await subir(tipos[3]!.id, { vencimiento: '2026-02-30' }).expect(400);
    expect(await readdir(dir)).toHaveLength(0);
  });
  it('requiere vencimiento y carga expediente completo con hash y nombres aleatorios', async () => {
    await subir(tipos[0]!.id).expect(400);
    for (const t of tipos.filter((t) => t.obligatorio)) {
      const r = await subir(
        t.id,
        t.requiereVencimiento ? { vencimiento: '2099-12-31' } : {},
      ).expect(201);
      if (t.id === tipos[0]!.id) primera = r.body.data.id;
    }
    const d = (await listado().expect(200)).body.data;
    expect(d.completos).toBe(4);
    expect(d.actuales).toHaveLength(4);
    expect(d.actuales[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(d)).not.toMatch(/clave|CLAVE_ARCHIVO|\.bin/);
    expect(await readdir(dir)).toHaveLength(4);
    for (const n of await readdir(dir)) expect(n).toMatch(/^[a-f0-9]{64}\.bin$/);
  });
  it('empleado propio consulta y descarga; otro empleado y jefe con todos los permisos reciben 403', async () => {
    expect((await empleado.agent.get(`${base}/mio`).expect(200)).body.data.id).toBe(ids[1]);
    await listado(empleado).expect(200);
    await listado(otro).expect(403);
    await listado(jefe).expect(403);
    const ruta = `${base}/documentos/${primera}`;
    await otro.agent.get(ruta).expect(403);
    await jefe.agent.get(ruta + '?vista=1').expect(403);
    await empleado.agent
      .post(ruta + '/baja')
      .set('X-CSRF-Token', empleado.csrf)
      .send({ motivo: 'Prueba ajena', confirmado: true })
      .expect(403);
    const r = await empleado.agent.get(ruta).expect(200);
    expect(r.headers['content-type']).toMatch(/^image\/png/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-disposition']).toMatch(/^attachment;/);
    expect(r.headers['cache-control']).toContain('no-store');
    expect(r.body).toEqual(png);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ACCION='DESCARGAR_EXPEDIENTE' AND ID_ENTIDAD=:id",
        { id: primera },
      ),
    ).toBe(1);
    await rh.agent.get(ruta + '?vista=1').expect(200);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ACCION='VISUALIZAR_EXPEDIENTE' AND ID_ENTIDAD=:id",
        { id: primera },
      ),
    ).toBe(1);
  });
  it('versiones concurrentes no sobrescriben, conserva historial y bytes anteriores', async () => {
    const [a, b] = await Promise.all([
      subir(tipos[0]!.id, { anterior: primera, vencimiento: '2099-12-31' }),
      subir(tipos[0]!.id, { anterior: primera, vencimiento: '2099-12-31' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    reemplazo = (a.status === 201 ? a : b).body.data.id;
    await rh.agent.get(`${base}/documentos/${primera}`).expect(200);
    const d = (await listado().expect(200)).body.data;
    expect(d.actuales.find((x: { idTipo: number }) => x.idTipo === tipos[0]!.id).version).toBe(2);
    expect(
      d.historial.registros.filter((x: { idTipo: number }) => x.idTipo === tipos[0]!.id),
    ).toHaveLength(2);
  });
  it('vencimientos impactan completitud/filtro Oracle y alertas, con límite inclusivo', async () => {
    await sql(
      "UPDATE EXPEDIENTE_DOCUMENTOS SET VENCIMIENTO=TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE))-1 WHERE ID_EXPEDIENTE_DOCUMENTO=:id",
      { id: reemplazo },
    );
    const d = (await listado().expect(200)).body.data;
    expect(d.completos).toBe(3);
    expect(d.actuales.find((x: { id: number }) => x.id === reemplazo).estado).toBe('Vencido');
    const r = await rh.agent.get('/api/empleados?expedienteIncompleto=1').expect(200);
    expect(r.body.data.registros.some((x: { id: number }) => x.id === ids[1])).toBe(true);
    expect(
      (await db.conConexion((c) => alertas(c))).some(
        (a) => a.tipo === 'EXPEDIENTE' && a.id === ids[1],
      ),
    ).toBe(true);
    await sql(
      "UPDATE EXPEDIENTE_DOCUMENTOS SET VENCIMIENTO=TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE))+30 WHERE ID_EXPEDIENTE_DOCUMENTO=:id",
      { id: reemplazo },
    );
    expect(
      (await listado()).body.data.actuales.find((x: { id: number }) => x.id === reemplazo).estado,
    ).toBe('Por vencer');
    await sql(
      "UPDATE EXPEDIENTE_DOCUMENTOS SET VENCIMIENTO=TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE))+31 WHERE ID_EXPEDIENTE_DOCUMENTO=:id",
      { id: reemplazo },
    );
    expect(
      (await listado()).body.data.actuales.find((x: { id: number }) => x.id === reemplazo).estado,
    ).toBe('Vigente');
    const completo = await rh.agent.get('/api/empleados?expedienteIncompleto=1').expect(200);
    expect(completo.body.data.registros.some((x: { id: number }) => x.id === ids[1])).toBe(false);
  });
  it('auditoría fallida impide descargar y revierte carga/baja sin dejar archivo huérfano', async () => {
    await sql(
      "CREATE OR REPLACE TRIGGER FALLAR_EXP_AUD BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ENTIDAD='EXPEDIENTE_DOCUMENTOS' THEN RAISE_APPLICATION_ERROR(-20099,'Fallo de auditoría'); END IF; END;",
    );
    const antes = (await readdir(dir)).length;
    try {
      await rh.agent.get(`${base}/documentos/${reemplazo}`).expect(500);
      await subir(tipos[6]!.id).expect(500);
      await rh.agent
        .post(`${base}/documentos/${reemplazo}/baja`)
        .set('X-CSRF-Token', rh.csrf)
        .send({ motivo: 'Auditoría fallida', confirmado: true })
        .expect(500);
    } finally {
      await sql('DROP TRIGGER FALLAR_EXP_AUD');
    }
    expect(await readdir(dir)).toHaveLength(antes);
    await rh.agent.get(`${base}/documentos/${reemplazo}`).expect(200);
  });
  it('baja exige motivo y confirmación, conserva bytes y no reactiva versiones previas', async () => {
    const ruta = `${base}/documentos/${reemplazo}`;
    await rh.agent
      .post(ruta + '/baja')
      .set('X-CSRF-Token', rh.csrf)
      .send({ motivo: '', confirmado: true })
      .expect(400);
    const antes = await readdir(dir);
    await rh.agent
      .post(ruta + '/baja')
      .set('X-CSRF-Token', rh.csrf)
      .send({ motivo: 'Documento sustituido por corrección', confirmado: true })
      .expect(200);
    await rh.agent.get(ruta).expect(404);
    expect(await readdir(dir)).toEqual(antes);
    const d = (await listado().expect(200)).body.data;
    expect(d.actuales.some((x: { idTipo: number }) => x.idTipo === tipos[0]!.id)).toBe(false);
    expect(d.completos).toBe(3);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ACCION='BAJA_EXPEDIENTE' AND ID_ENTIDAD=:id AND MOTIVO IS NOT NULL",
        { id: reemplazo },
      ),
    ).toBe(1);
  });
  it('cambios motivados del catálogo y límite parametrizable se aplican sin reinicio', async () => {
    await rh.agent
      .patch(`${base}/tipos/${tipos[6]!.id}`)
      .set('X-CSRF-Token', rh.csrf)
      .send({
        obligatorio: true,
        requiereVencimiento: true,
        motivo: 'Se exige respaldo adicional',
        confirmado: true,
      })
      .expect(200);
    expect((await listado()).body.data.requeridos).toBe(5);
    await sql("UPDATE PARAMETROS_LEGALES SET VALOR=1 WHERE CLAVE_INTERNA='EXPEDIENTE_MAX_MB'");
    await subir(tipos[4]!.id, {}, Buffer.alloc(1024 * 1024 + 1)).expect(413);
    expect((await listado()).body.data.maxMb).toBe(1);
  });
  it('no expone archivos alterados, ni metadatos en rutas públicas', async () => {
    const clave = String(
      await scalar(
        'SELECT CLAVE_ARCHIVO FROM EXPEDIENTE_DOCUMENTOS WHERE ID_EXPEDIENTE_DOCUMENTO=:id',
        { id: primera },
      ),
    );
    const alterado = Buffer.from(png);
    alterado[30] = 0;
    await writeFile(join(dir, clave), alterado);
    await rh.agent.get(`${base}/documentos/${primera}`).expect(409);
    await request(app)
      .get('/' + clave)
      .expect(404);
  });
});
