import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
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
import { crearApp } from '../../app.js';
import { crearAuthService } from '../auth/auth.service.js';
import { crearUsuariosService, crearUsuarioInterno } from '../usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { crearEmpresaService, firmante } from './empresa.service.js';
import { obtenerEmpresa, guardarFirma, obtenerFirma } from './empresa.repository.js';
import { membrete } from './empresa.service.js';
import type { ActorAuditoria } from '../auth/auth.types.js';
let db: BaseDatos,
  app: ReturnType<typeof crearApp>,
  admin: ReturnType<typeof request.agent>,
  csrf: string,
  rh: typeof admin,
  rhCsrf: string,
  empleado: typeof admin,
  rhId: number;
const logger = crearLogger('silent'),
  seed = validarEntornoSeeds(process.env);
const datos = {
  razonSocial: 'Empresa migrada',
  nombreComercial: 'Nombre comercial',
  nit: '1234567-9',
  direccion: 'Zona 1, Guatemala',
  telefono: '55551234',
  correo: 'rh@example.test',
  sitioWeb: 'https://example.test',
  version: 1,
};
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="blue"/></svg>',
).toString('base64');
const scalar = (sql: string) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(sql)).rows![0]![0]);
const sql = (query: string) => enTransaccion(db, (c) => c.execute(query));
async function entrar(usuario: string, contrasena: string) {
  const agent = request.agent(app),
    t = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const r = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', t)
    .send({ usuario, contrasena })
    .expect(200);
  return { agent, csrf: r.body.data.csrfToken as string };
}
describe('FASE V1-5: empresa privada y firma en Oracle', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version < 23),
        crearMigracionesRepository(c),
        logger,
      ),
    );
    await sql(
      "INSERT INTO CONFIGURACION_EMPRESA(RAZON_SOCIAL,NIT,DIRECCION) VALUES ('Empresa migrada','1234567-9','Dirección anterior')",
    );
    await ejecutarSeeds(db, logger, seed);
    await sql(
      "UPDATE PLANTILLAS_DOCUMENTO SET CONTENIDO='Texto histórico {{representante}}' WHERE CODIGO='CONSTANCIA_LABORAL'",
    );
    expect(await ejecutarMigraciones(db, logger)).toBe(8);
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
        empresa: crearEmpresaService(db),
        config,
      },
    );
    const s = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD);
    admin = s.agent;
    csrf = (
      await admin
        .post('/api/auth/cambiar-contrasena')
        .set('X-CSRF-Token', s.csrf)
        .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'EmpresaPrueba!2026' })
        .expect(200)
    ).body.data.csrfToken;
    const actor: ActorAuditoria = {
      idUsuario: Number(await scalar('SELECT MIN(ID_USUARIO) FROM USUARIOS')),
      idRol: 1,
      rol: 'ADMIN',
      ip: '127.0.0.1',
    };
    for (const rol of ['RH', 'EMPLEADO'] as const) {
      const u = await enTransaccion(db, (c) =>
        crearUsuarioInterno(c, actor, {
          nombre: rol === 'RH' ? 'Ana' : 'Luis',
          apellido: 'Prueba',
          correo: `${rol.toLowerCase()}@example.test`,
          rol,
        }),
      );
      await sql(`UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=${u.idUsuario}`);
      const s = await entrar(u.usuario, u.contrasenaTemporal);
      if (rol === 'RH') {
        rh = s.agent;
        rhCsrf = s.csrf;
        rhId = u.idUsuario;
      } else empleado = s.agent;
    }
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('migra sin perder empresa ni plantillas y conserva versiones originales', async () => {
    const e = (await admin.get('/api/empresa').expect(200)).body.data;
    expect(e.razonSocial).toBe('Empresa migrada');
    expect(e.direccion).toBe('Dirección anterior');
    expect(e.version).toBe(1);
    expect(e.logo).toBeNull();
    expect(
      await scalar(
        "SELECT COUNT(*) FROM PLANTILLAS_DOCUMENTO WHERE CODIGO='CONSTANCIA_LABORAL' AND VERSION=1 AND DBMS_LOB.INSTR(CONTENIDO,'{{representante}}')>0",
      ),
    ).toBe(1);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM PLANTILLAS_DOCUMENTO WHERE CODIGO='CONSTANCIA_LABORAL' AND ACTIVO=1 AND DBMS_LOB.INSTR(CONTENIDO,'{{firmante_nombre}}')>0",
      ),
    ).toBe(1);
    expect(await scalar("SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'")).toBe(0);
    await expect(db.conConexion((c) => membrete(c))).rejects.toThrow('Configura');
  });
  it('protege datos/logo por sesión, cambio obligatorio, rol y CSRF', async () => {
    await request(app).get('/api/empresa').expect(401);
    await empleado.get('/api/empresa').expect(403);
    expect((await empleado.get('/api/empresa/estado').expect(200)).body.data.configurada).toBe(
      false,
    );
    await rh.patch('/api/empresa').send(datos).expect(403);
    await rh.get('/api/empresa?ajeno=1').expect(400);
  });
  it('valida identidad/NIT, guarda SVG como PNG privado y audita sin binarios', async () => {
    await rh
      .patch('/api/empresa')
      .set('X-CSRF-Token', rhCsrf)
      .send({ ...datos, nit: '1234567-0' })
      .expect(400);
    const r = await rh
      .patch('/api/empresa')
      .set('X-CSRF-Token', rhCsrf)
      .send({ ...datos, logo: { mime: 'image/svg+xml', base64: svg } })
      .expect(200);
    expect(r.body.data.version).toBe(2);
    expect(r.body.data.logo.mime).toBe('image/png');
    expect(Buffer.from(r.body.data.logo.base64, 'base64').subarray(1, 4).toString()).toBe('PNG');
    expect((await rh.get('/api/empresa/estado')).body.data.configurada).toBe(true);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ACCION='CONFIGURAR_EMPRESA' AND DBMS_LOB.INSTR(VALORES_NUEVOS,'base64')=0",
      ),
    ).toBe(1);
    await rh.patch('/api/empresa').set('X-CSRF-Token', rhCsrf).send(datos).expect(409);
  });
  it('rechaza SVG activo, archivos falsos y tamaño excedido sin cambiar empresa', async () => {
    for (const logo of [
      { mime: 'image/png', base64: svg },
      {
        mime: 'image/svg+xml',
        base64: Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64'),
      },
      { mime: 'image/png', base64: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') },
    ])
      await rh
        .patch('/api/empresa')
        .set('X-CSRF-Token', rhCsrf)
        .send({ ...datos, version: 2, logo })
        .expect(logo.base64.length > 2796204 ? 400 : 422);
    expect((await rh.get('/api/empresa')).body.data.version).toBe(2);
  });
  it('bloquea firma sin ficha/nombre/cargo y conserva snapshot después de cambiar puesto', async () => {
    await expect(db.conConexion((c) => firmante(c, rhId))).rejects.toThrow('ficha de empleado');
    await sql("INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES ('Recursos Humanos')");
    await sql(
      "INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) SELECT 'Jefa de RRHH',MIN(ID_DEPARTAMENTO) FROM DEPARTAMENTOS",
    );
    await sql(
      "INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES ('Central','GUATEMALA_CIUDAD')",
    );
    await sql(
      `INSERT INTO EMPLEADOS(NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) SELECT 'Ana','López Pérez','9876543210123','6-K',DATE '1990-01-01','F','SOLTERO','Guatemala','55551234','ficha@example.test',(SELECT MIN(ID_PUESTO) FROM PUESTOS),(SELECT MIN(ID_DEPARTAMENTO) FROM DEPARTAMENTOS),(SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO),(SELECT MIN(ID_CENTRO_TRABAJO) FROM CENTROS_TRABAJO),DATE '2020-01-01' FROM DUAL`,
    );
    const id = Number(await scalar('SELECT MIN(ID_EMPLEADO) FROM EMPLEADOS'));
    await rh
      .post(`/api/usuarios/${rhId}/expediente`)
      .set('X-CSRF-Token', rhCsrf)
      .send({ idEmpleado: id, motivo: 'Asociar identidad real', confirmado: true })
      .expect(403);
    await admin
      .post(`/api/usuarios/${rhId}/expediente`)
      .set('X-CSRF-Token', csrf)
      .send({ idEmpleado: id, motivo: 'Asociar identidad real', confirmado: true })
      .expect(200);
    const firma = await enTransaccion(db, async (c) => {
      const f = await firmante(c, rhId);
      await guardarFirma(c, 'PRUEBA', 1, f);
      return f;
    });
    expect(firma.nombre).toBe('Ana López Pérez');
    expect(firma.cargo).toBe('Jefa de RRHH');
    await sql("UPDATE EMPLEADOS SET NOMBRES=' ' WHERE ID_USUARIO=" + rhId);
    await expect(db.conConexion((c) => firmante(c, rhId))).rejects.toThrow('nombre completo');
    await sql("UPDATE EMPLEADOS SET NOMBRES='Ana' WHERE ID_USUARIO=" + rhId);
    await sql("UPDATE PUESTOS SET NOMBRE=' '");
    await expect(db.conConexion((c) => firmante(c, rhId))).rejects.toThrow('cargo');
    await sql("UPDATE PUESTOS SET NOMBRE='Otro puesto'");
    expect((await db.conConexion((c) => obtenerFirma(c, 'PRUEBA', 1)))?.cargo).toBe('Jefa de RRHH');
    await sql('UPDATE PUESTOS SET ACTIVO=0');
    await expect(db.conConexion((c) => firmante(c, rhId))).rejects.toThrow('puesto activo');
    await sql('UPDATE PUESTOS SET ACTIVO=1');
  });
  it('revierte datos y logo cuando falla la auditoría', async () => {
    await sql(
      "CREATE OR REPLACE TRIGGER N2_PRUEBA_AUDIT BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='CONFIGURAR_EMPRESA' THEN RAISE_APPLICATION_ERROR(-20001,'Prueba de rollback'); END IF; END;",
    );
    await rh
      .patch('/api/empresa')
      .set('X-CSRF-Token', rhCsrf)
      .send({ ...datos, version: 2, razonSocial: 'No guardar', logo: null })
      .expect(500);
    await sql('DROP TRIGGER N2_PRUEBA_AUDIT');
    const e = await db.conConexion((c) => obtenerEmpresa(c));
    expect(e?.version).toBe(2);
    expect(e?.razonSocial).toBe(datos.razonSocial);
    expect(e?.logo).not.toBeNull();
    await rh
      .patch('/api/empresa')
      .set('X-CSRF-Token', rhCsrf)
      .send({ ...datos, version: 2, logo: null })
      .expect(200);
    expect((await rh.get('/api/empresa')).body.data.logo).toBeNull();
  });
});
