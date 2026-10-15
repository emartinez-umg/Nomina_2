import { prepararFirmantePrueba } from '../../shared/pdf/empresa.fixture.js';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Express } from 'express';
import type { BindParameters } from 'oracledb';
import { crearApp } from '../../app.js';
import { crearBaseDatos } from '../../shared/db/pool.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { ejecutarMigraciones } from '../../shared/db/migraciones.js';
import { ejecutarSeeds } from '../../shared/db/seeds.js';
import { validarEntornoSeeds } from '../../shared/db/seeds.env.js';
import { validarEntorno } from '../../config/env.schema.js';
import { crearLogger } from '../../config/logger.js';
import { crearAuthService } from '../auth/auth.service.js';
import { crearUsuariosService, crearUsuarioInterno } from '../usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { crearSolicitudesService } from './solicitudes.service.js';
import { crearNovedadesService } from '../novedades/novedades.service.js';
import { fuentes } from '../nomina/nomina.repository.js';
import { quincena } from '../novedades/novedades.reglas.js';
import { crearVacacionesService } from '../vacaciones/vacaciones.service.js';
import type { ActorAuditoria } from '../auth/auth.types.js';
let db: BaseDatos, app: Express, empleado: number, segundo: number, admin: ActorAuditoria;
let rh: { agent: ReturnType<typeof request.agent>; csrf: string },
  propio: typeof rh,
  ajeno: typeof rh;
let documento: number, sha256: string;
const seed = validarEntornoSeeds(process.env),
  logger = crearLogger('silent');
async function ejecutar(sql: string, binds: BindParameters = {}) {
  return enTransaccion(db, (c) => c.execute(sql, binds));
}
async function escalar(sql: string, binds: BindParameters = {}) {
  return db.conConexion(async (c) => (await c.execute<unknown[]>(sql, binds)).rows?.[0]?.[0]);
}
async function entrar(usuario: string, contrasena: string) {
  const a = request.agent(app),
    inicio = await a.get('/api/auth/csrf').expect(200);
  const r = await a
    .post('/api/auth/login')
    .set('X-CSRF-Token', inicio.body.data.csrfToken)
    .send({ usuario, contrasena })
    .expect(200);
  return { agent: a, csrf: r.body.data.csrfToken as string };
}
const post = (s: typeof rh, ruta: string, datos: object, status = 200) =>
  s.agent.post(`/api/solicitudes${ruta}`).set('X-CSRF-Token', s.csrf).send(datos).expect(status);
async function solicitar(tipo: string, datos?: object) {
  return (await post(propio, '', { tipo, ...(datos ? { datos } : {}), confirmado: true }, 201)).body
    .data.id as number;
}
async function hoy() {
  return String(
    await escalar(
      "SELECT TO_CHAR(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),'YYYY-MM-DD') FROM DUAL",
    ),
  );
}
describe('FASE 10: flujo completo con Oracle thin y sesiones reales', () => {
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
        solicitudes: crearSolicitudesService(db),
        novedades: crearNovedadesService(db),
        vacaciones: crearVacacionesService(db),
        config,
      },
    );
    const sesion = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD);
    const cambio = await sesion.agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', sesion.csrf)
      .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'FaseDiez!2026' })
      .expect(200);
    admin = {
      idUsuario: Number(
        await escalar('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO=:u', { u: seed.ADMIN_USER }),
      ),
      idRol: Number(await escalar("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN'")),
      rol: 'ADMIN',
      ip: '127.0.0.1',
    };
    expect(cambio.body.data.csrfToken).toBeTruthy();
    const cuentas = [];
    for (const [nombre, rol] of [
      ['Revisor', 'RH'],
      ['Primero', 'EMPLEADO'],
      ['Segundo', 'EMPLEADO'],
    ] as const) {
      const u = await enTransaccion(db, (c) =>
        crearUsuarioInterno(c, admin, {
          nombre,
          apellido: 'Gestiones',
          correo: `${nombre.toLowerCase()}@example.test`,
          rol,
        }),
      );
      await ejecutar('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', {
        id: u.idUsuario,
      });
      cuentas.push(u);
    }
    rh = await entrar(cuentas[0]!.usuario, cuentas[0]!.contrasenaTemporal);
    propio = await entrar(cuentas[1]!.usuario, cuentas[1]!.contrasenaTemporal);
    ajeno = await entrar(cuentas[2]!.usuario, cuentas[2]!.contrasenaTemporal);
    await ejecutar("INSERT INTO DEPARTAMENTOS (CODIGO,NOMBRE) VALUES ('F10','Gestiones')");
    const dep = Number(
      await escalar(
        "SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NVL(CODIGO_ANTERIOR,CODIGO)='F10'",
      ),
    );
    await ejecutar(
      "INSERT INTO PUESTOS (CODIGO,NOMBRE,ID_DEPARTAMENTO) VALUES ('F10','Analista de gestiones',:dep)",
      { dep },
    );
    await ejecutar(
      "INSERT INTO CENTROS_TRABAJO (CODIGO,NOMBRE,LOCALIDAD) VALUES ('F10','Oficina de pruebas','PRUEBA')",
    );
    await ejecutar(
      "INSERT INTO CONFIGURACION_EMPRESA (RAZON_SOCIAL,NIT,DIRECCION) VALUES ('Empresa de pruebas F10','1234567-9','Dirección de pruebas')",
    );
    const puesto = Number(
        await escalar("SELECT ID_PUESTO FROM PUESTOS WHERE NVL(CODIGO_ANTERIOR,CODIGO)='F10'"),
      ),
      centro = Number(
        await escalar(
          "SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE NVL(CODIGO_ANTERIOR,CODIGO)='F10'",
        ),
      ),
      contrato = Number(await escalar('SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO'));
    for (const i of [1, 2]) {
      await ejecutar(
        "INSERT INTO EMPLEADOS (CODIGO,ID_USUARIO,NOMBRES,APELLIDOS,DPI,NIT,AFILIACION_IGSS,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) VALUES (:codigo,:usuario,:nombre,'Gestiones',:dpi,:nit,:igss,DATE '1995-01-01','F','SOLTERO','Dirección','55551234',:correo,:puesto,:dep,:contrato,:centro,DATE '2026-01-01')",
        {
          codigo: `F10_${i}`,
          usuario: cuentas[i]!.idUsuario,
          nombre: i === 1 ? 'Primero' : 'Segundo',
          dpi: `987654321012${i}`,
          nit: i === 1 ? '1234567-9' : '123456-0',
          igss: `100000${i}`,
          correo: `empleado${i}@example.test`,
          puesto,
          dep,
          contrato,
          centro,
        },
      );
      const e = Number(
        await escalar('SELECT ID_EMPLEADO FROM EMPLEADOS WHERE NVL(CODIGO_ANTERIOR,CODIGO)=:c', {
          c: `F10_${i}`,
        }),
      );
      if (i === 1) empleado = e;
      else segundo = e;
      await ejecutar(
        "INSERT INTO HISTORIAL_SALARIAL (ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES (:id,5000,DATE '2026-01-01','Salario de prueba')",
        { id: e },
      );
    }
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('valida CSRF, roles y campos de propiedad', async () => {
    await propio.agent
      .post('/api/solicitudes')
      .send({ tipo: 'GAFETE', confirmado: true })
      .expect(403);
    await post(rh, '', { tipo: 'GAFETE', confirmado: true }, 403);
    await post(propio, '', { tipo: 'GAFETE', idEmpleado: segundo, confirmado: true }, 400);
    await propio.agent.get('/api/solicitudes/plantillas').expect(403);
  });
  it('nueva solicitud notifica a RH y ADMIN; pendientes no se duplican', async () => {
    documento = await solicitar('CONSTANCIA_LABORAL');
    await post(propio, '', { tipo: 'CONSTANCIA_LABORAL', confirmado: true }, 409);
    const n = await rh.agent.get('/api/notificaciones').expect(200);
    expect(
      n.body.data.registros.some(
        (r: { clave: string }) => r.clave === `SOLICITUD:${documento}:EN_PROCESO`,
      ),
    ).toBe(true);
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE ID_SOLICITUD=:id', {
          id: documento,
        }),
      ),
    ).toBe(2);
  });
  it('el empleado solo ve su listado/detalle/PDF, incluso con ids ajenos', async () => {
    const r = await ajeno.agent.get('/api/solicitudes').query({ idEmpleado: empleado }).expect(200);
    expect(r.body.data.total).toBe(0);
    await ajeno.agent.get(`/api/solicitudes/${documento}`).expect(403);
    await ajeno.agent.get(`/api/solicitudes/${documento}/documento`).expect(403);
    await post(propio, `/${documento}/resolver`, { estado: 'APROBADA', confirmado: true }, 403);
    await propio.agent.get(`/api/solicitudes/${documento}/documento`).expect(403);
  });
  it('bloquea aprobación sin ficha completa y permite completarla', async () => {
    const r = await post(
      rh,
      `/${documento}/resolver`,
      { estado: 'APROBADA', confirmado: true },
      409,
    );
    expect(r.body.error.mensaje).toMatch(/empresa|ficha/);
    await ejecutar(
      "UPDATE CONFIGURACION_EMPRESA SET TELEFONO='55551234',CORREO='empresa@example.test' WHERE ACTIVO=1",
    );
    const sinFicha = await post(
      rh,
      `/${documento}/resolver`,
      { estado: 'APROBADA', confirmado: true },
      409,
    );
    expect(sinFicha.body.error.mensaje).toContain('ficha de empleado');
    const usuario = Number(
      await escalar(
        "SELECT U.ID_USUARIO FROM USUARIOS U JOIN ROLES R ON R.ID_ROL=U.ID_ROL WHERE R.CODIGO='RH'",
      ),
    );
    await prepararFirmantePrueba(db, usuario);
  });
  it('aprobación concurrente única genera PDF privado, snapshot y aviso', async () => {
    const r = await Promise.all(
      [1, 2].map(() =>
        rh.agent
          .post(`/api/solicitudes/${documento}/resolver`)
          .set('X-CSRF-Token', rh.csrf)
          .send({ estado: 'APROBADA', confirmado: true }),
      ),
    );
    expect(r.map((r) => r.status).sort()).toEqual([200, 409]);
    const pdf = await rh.agent.get(`/api/solicitudes/${documento}/documento`).expect(200);
    const bytes = Buffer.from(pdf.body.data.base64, 'base64');
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(
      await escalar('SELECT FIRMANTE_NOMBRE FROM DOCUMENTOS_GENERADOS WHERE ID_SOLICITUD=:id', {
        id: documento,
      }),
    ).toBe('ZZ Firmante Pruebas');
    expect(
      await escalar(
        'SELECT COUNT(*) FROM DOCUMENTOS_GENERADOS WHERE ID_SOLICITUD=:id AND APROBADO_POR IS NOT NULL AND APROBADO_EN IS NOT NULL AND VERSION_MEMBRETE>0',
        { id: documento },
      ),
    ).toBe(1);
    sha256 = pdf.body.data.sha256;
    await mkdir('../tmp/pdfs', { recursive: true });
    await writeFile('../tmp/pdfs/solicitud-oracle.pdf', bytes);
    await propio.agent.get(`/api/solicitudes/${documento}/documento`).expect(403);
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM DOCUMENTOS_GENERADOS WHERE ID_SOLICITUD=:id', {
          id: documento,
        }),
      ),
    ).toBe(1);
  });
  it('plantillas editables versionadas, concurrencia y PDF aprobado inmutable', async () => {
    const r = await rh.agent.get('/api/solicitudes/plantillas').expect(200),
      p = r.body.data.registros.find((p: { tipo: string }) => p.tipo === 'CONSTANCIA_LABORAL');
    const body = {
      contenido: p.contenido + '\nTexto actualizado para futuras constancias.',
      version: p.version,
      motivo: 'Revisión de texto',
      confirmado: true,
    };
    await rh.agent
      .patch('/api/solicitudes/plantillas/CONSTANCIA_LABORAL')
      .set('X-CSRF-Token', rh.csrf)
      .send(body)
      .expect(200);
    await rh.agent
      .patch('/api/solicitudes/plantillas/CONSTANCIA_LABORAL')
      .set('X-CSRF-Token', rh.csrf)
      .send(body)
      .expect(409);
    const actual = await rh.agent.get(`/api/solicitudes/${documento}/documento`).expect(200);
    expect(actual.body.data.sha256).toBe(sha256);
  });
  it('entrega exige preview vigente; publica el mismo archivo y notifica descarga', async () => {
    await post(rh, `/${documento}/entregar`, { confirmado: true }, 409);
    await ejecutar(
      "CREATE OR REPLACE TRIGGER F10_FALLAR BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='ENTREGAR_SOLICITUD' THEN RAISE_APPLICATION_ERROR(-20099,'Fallo de prueba'); END IF; END;",
    );
    try {
      await post(rh, `/${documento}/entregar`, { confirmado: true, sha256 }, 500);
    } finally {
      await ejecutar('DROP TRIGGER F10_FALLAR');
    }
    expect(
      await escalar('SELECT ESTADO FROM SOLICITUDES WHERE ID_SOLICITUD=:id', { id: documento }),
    ).toBe('APROBADA');
    expect(
      await escalar('SELECT ESTADO FROM DOCUMENTOS_GENERADOS WHERE ID_SOLICITUD=:id', {
        id: documento,
      }),
    ).toBe('VISTA_PREVIA');
    await propio.agent.get(`/api/solicitudes/${documento}/documento`).expect(403);
    await post(rh, `/${documento}/entregar`, { confirmado: true, sha256 });
    await post(rh, `/${documento}/entregar`, { confirmado: true, sha256 }, 409);
    const pdf = await propio.agent.get(`/api/solicitudes/${documento}/documento`).expect(200);
    expect(pdf.body.data.sha256).toBe(sha256);
    const d = await propio.agent.get(`/api/solicitudes/${documento}`).expect(200);
    expect(d.body.data.historial.map((h: { estado: string }) => h.estado)).toEqual([
      'EN_PROCESO',
      'APROBADA',
      'ENTREGADA',
    ]);
    const n = await propio.agent.get('/api/notificaciones').expect(200);
    expect(
      n.body.data.registros.some(
        (n: { clave: string }) => n.clave === `SOLICITUD:${documento}:ENTREGADA`,
      ),
    ).toBe(true);
  });
  it.each(['CERTIFICADO_IGSS', 'CONSTANCIA_INTECAP'])('genera y entrega %s', async (tipo) => {
    const id = await solicitar(tipo);
    await post(rh, `/${id}/resolver`, { estado: 'APROBADA', confirmado: true });
    const pdf = await rh.agent.get(`/api/solicitudes/${id}/documento`).expect(200);
    await post(rh, `/${id}/entregar`, { confirmado: true, sha256: pdf.body.data.sha256 });
    await propio.agent.get(`/api/solicitudes/${id}/documento`).expect(200);
  });
  it('rechazo requiere motivo, es terminal y gafete se entrega sin PDF', async () => {
    const id = await solicitar('GAFETE');
    await post(rh, `/${id}/resolver`, { estado: 'RECHAZADA', motivo: '', confirmado: true }, 400);
    await post(rh, `/${id}/resolver`, {
      estado: 'RECHAZADA',
      motivo: 'Completa el detalle del gafete.',
      confirmado: true,
    });
    await post(rh, `/${id}/entregar`, { confirmado: true }, 409);
    const otro = await solicitar('GAFETE');
    await post(rh, `/${otro}/resolver`, { estado: 'APROBADA', confirmado: true });
    await post(rh, `/${otro}/entregar`, { confirmado: true });
    await propio.agent.get(`/api/solicitudes/${otro}/documento`).expect(404);
  });
  it('fallo de auditoría revierte parqueo y datos críticos junto con la resolución', async () => {
    const p = await solicitar('PARQUEO');
    const d = (await propio.agent.get('/api/solicitudes/mis-datos').expect(200)).body.data.criticos;
    const id = await solicitar('ACTUALIZACION_DATOS', { ...d, nombres: 'Propuesta temporal' });
    await ejecutar(
      "CREATE OR REPLACE TRIGGER F10_FALLAR BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='SOLICITUD_APROBADA' THEN RAISE_APPLICATION_ERROR(-20099,'Fallo de prueba'); END IF; END;",
    );
    try {
      await post(
        rh,
        `/${p}/resolver`,
        {
          estado: 'APROBADA',
          parqueo: { monto: '75.25', fechaInicio: await hoy() },
          confirmado: true,
        },
        500,
      );
      await post(rh, `/${id}/resolver`, { estado: 'APROBADA', confirmado: true }, 500);
    } finally {
      await ejecutar('DROP TRIGGER F10_FALLAR');
    }
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM DESCUENTOS_EMPLEADO WHERE ID_SOLICITUD=:id', { id: p }),
      ),
    ).toBe(0);
    expect(
      await escalar('SELECT NOMBRES FROM EMPLEADOS WHERE ID_EMPLEADO=:id', { id: empleado }),
    ).toBe('Primero');
    for (const s of [p, id]) {
      expect(
        await escalar('SELECT ESTADO FROM SOLICITUDES WHERE ID_SOLICITUD=:id', { id: s }),
      ).toBe('EN_PROCESO');
      await post(rh, `/${s}/resolver`, {
        estado: 'RECHAZADA',
        motivo: 'Terminar fixture de reversión.',
        confirmado: true,
      });
    }
  });
  it('parqueo: aprobación atómica crea un fijo de Fase 6 y evita doble cargo', async () => {
    const id = await solicitar('PARQUEO');
    const parqueo = { monto: '125.50', fechaInicio: await hoy() };
    await post(rh, `/${id}/resolver`, { estado: 'APROBADA', confirmado: true }, 422);
    await post(rh, `/${id}/resolver`, { estado: 'APROBADA', parqueo, confirmado: true });
    await post(rh, `/${id}/resolver`, { estado: 'APROBADA', parqueo, confirmado: true }, 409);
    expect(
      String(
        await escalar('SELECT MONTO_QUINCENA FROM DESCUENTOS_EMPLEADO WHERE ID_SOLICITUD=:id', {
          id,
        }),
      ),
    ).toBe('125.5');
    const listado = await rh.agent
      .get('/api/novedades/descuentos')
      .query({ idEmpleado: empleado })
      .expect(200);
    expect(listado.body.data.total).toBe(1);
    const entrada = await db.conConexion((c) =>
      fuentes(
        c,
        {
          id: 0,
          ...quincena(parqueo.fechaInicio),
          estado: 'ABIERTO',
          version: 0,
          hash: null,
          alertas: '[]',
          empleados: 0,
          ingresos: '0',
          descuentos: '0',
          neto: '0',
          patronal: '0',
        },
        empleado,
      ),
    );
    expect(entrada[0]!.descuentos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ codigo: 'PARQUEO', modalidad: 'FIJO', monto: '125.5' }),
      ]),
    );

    const nuevo = await solicitar('PARQUEO');
    await post(rh, `/${nuevo}/resolver`, { estado: 'APROBADA', parqueo, confirmado: true }, 409);
    await post(rh, `/${nuevo}/resolver`, {
      estado: 'RECHAZADA',
      motivo: 'Ya tiene parqueo vigente.',
      confirmado: true,
    });
  });
  it('contacto directo auditado y datos críticos solo al aprobar', async () => {
    const d = (await propio.agent.get('/api/solicitudes/mis-datos').expect(200)).body.data;
    const contacto = {
      ...d.contacto,
      telefono: '55559999',
      direccion: 'Nueva dirección',
      correo: 'contacto@example.test',
      contactoNombre: 'Contacto Prueba',
      contactoParentesco: 'Madre',
      contactoTelefono: '55558888',
    };
    await propio.agent
      .patch('/api/solicitudes/mis-datos/contacto')
      .set('X-CSRF-Token', propio.csrf)
      .send({ ...contacto, dpi: '123' })
      .expect(400);
    await propio.agent
      .patch('/api/solicitudes/mis-datos/contacto')
      .set('X-CSRF-Token', propio.csrf)
      .send(contacto)
      .expect(200);
    const datos = { ...d.criticos, nombres: 'Nombre actualizado' },
      id = await solicitar('ACTUALIZACION_DATOS', datos);
    expect(
      await escalar('SELECT NOMBRES FROM EMPLEADOS WHERE ID_EMPLEADO=:id', { id: empleado }),
    ).toBe('Primero');
    await post(rh, `/${id}/resolver`, { estado: 'APROBADA', confirmado: true });
    expect(
      await escalar('SELECT NOMBRES FROM EMPLEADOS WHERE ID_EMPLEADO=:id', { id: empleado }),
    ).toBe('Nombre actualizado');
    expect(
      Number(
        await escalar(
          "SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ACCION='ACTUALIZAR_CONTACTO_PROPIO'",
        ),
      ),
    ).toBe(1);
  });
  it('rechazo de datos conserva expediente y cambio concurrente obliga a solicitar otra vez', async () => {
    const d = (await propio.agent.get('/api/solicitudes/mis-datos').expect(200)).body.data.criticos;
    const id = await solicitar('ACTUALIZACION_DATOS', { ...d, estadoCivil: 'CASADO' });
    await ejecutar("UPDATE EMPLEADOS SET NOMBRES='Nombre corregido' WHERE ID_EMPLEADO=:id", {
      id: empleado,
    });
    await post(rh, `/${id}/resolver`, { estado: 'APROBADA', confirmado: true }, 409);
    await post(rh, `/${id}/resolver`, {
      estado: 'RECHAZADA',
      motivo: 'El expediente fue corregido; envía una nueva propuesta.',
      confirmado: true,
    });
    expect(
      await escalar('SELECT ESTADO_CIVIL FROM EMPLEADOS WHERE ID_EMPLEADO=:id', { id: empleado }),
    ).toBe('SOLTERO');
  });
  it('notificaciones propias: marcar ajenas no modifica y contar es consistente', async () => {
    const n = (await propio.agent.get('/api/notificaciones').expect(200)).body.data,
      id = n.registros[0].id;
    await ajeno.agent
      .post(`/api/notificaciones/${id}/leida`)
      .set('X-CSRF-Token', ajeno.csrf)
      .send({})
      .expect(200);
    expect((await propio.agent.get('/api/notificaciones').expect(200)).body.data.pendientes).toBe(
      n.pendientes,
    );
    await propio.agent
      .post(`/api/notificaciones/${id}/leida`)
      .set('X-CSRF-Token', propio.csrf)
      .send({})
      .expect(200);
    expect((await propio.agent.get('/api/notificaciones').expect(200)).body.data.pendientes).toBe(
      n.pendientes - 1,
    );
  });
  it('filtros combinados, orden y CSV no exponen datos críticos', async () => {
    const r = await rh.agent
      .get('/api/solicitudes')
      .query({
        tipo: 'CONSTANCIA_LABORAL',
        estado: 'ENTREGADA',
        idEmpleado: empleado,
        desde: await hoy(),
        hasta: await hoy(),
        ordenarPor: 'id',
        direccion: 'asc',
      })
      .expect(200);
    expect(r.body.data.total).toBe(1);
    expect(r.body.data.registros[0].datos).toBeUndefined();
    const csv = await propio.agent.get('/api/solicitudes/exportar').expect(200);
    expect(csv.body.data).toContain('Constancia laboral');
    expect(csv.body.data).not.toContain('9876543210121');
  });
  it('fallo real de auditoría revierte aprobación, PDF, historial y notificación', async () => {
    const id = await solicitar('CONSTANCIA_LABORAL');
    await ejecutar(
      "CREATE OR REPLACE TRIGGER F10_FALLAR BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='SOLICITUD_APROBADA' THEN RAISE_APPLICATION_ERROR(-20099,'Fallo de prueba'); END IF; END;",
    );
    try {
      await post(rh, `/${id}/resolver`, { estado: 'APROBADA', confirmado: true }, 500);
    } finally {
      await ejecutar('DROP TRIGGER F10_FALLAR');
    }
    expect(await escalar('SELECT ESTADO FROM SOLICITUDES WHERE ID_SOLICITUD=:id', { id })).toBe(
      'EN_PROCESO',
    );
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM DOCUMENTOS_GENERADOS WHERE ID_SOLICITUD=:id', { id }),
      ),
    ).toBe(0);
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM SOLICITUD_HISTORIAL WHERE ID_SOLICITUD=:id', { id }),
      ),
    ).toBe(1);
    expect(
      Number(
        await escalar(
          "SELECT COUNT(*) FROM NOTIFICACIONES WHERE ID_SOLICITUD=:id AND TIPO='CAMBIO_ESTADO'",
          { id },
        ),
      ),
    ).toBe(0);
  });
  it('reemite un histórico conservando archivo original y exige revisar la nueva entrega', async () => {
    await ejecutar('UPDATE DOCUMENTOS_GENERADOS SET VERSION_MEMBRETE=NULL WHERE ID_SOLICITUD=:id', {
      id: documento,
    });
    await propio.agent.get(`/api/solicitudes/${documento}/documento`).expect(409);
    await post(rh, `/${documento}/reemitir`, { confirmado: true });
    expect(
      await escalar('SELECT COUNT(*) FROM DOCUMENTOS_GENERADOS WHERE ID_SOLICITUD=:id', {
        id: documento,
      }),
    ).toBe(2);
    expect(
      await escalar(
        'SELECT COUNT(*) FROM DOCUMENTOS_GENERADOS WHERE ID_SOLICITUD=:id AND ACTIVO=0 AND VERSION=1',
        { id: documento },
      ),
    ).toBe(1);
    await propio.agent.get(`/api/solicitudes/${documento}/documento`).expect(403);
    const nuevo = (await rh.agent.get(`/api/solicitudes/${documento}/documento`).expect(200)).body
      .data;
    await post(rh, `/${documento}/entregar`, { confirmado: true, sha256: nuevo.sha256 });
    await propio.agent.get(`/api/solicitudes/${documento}/documento`).expect(200);
  });
});
