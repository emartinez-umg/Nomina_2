import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { BindParameters } from 'oracledb';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearBaseDatos } from '../../shared/db/pool.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { ejecutarMigraciones } from '../../shared/db/migraciones.js';
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
import { crearAlmacenPrivado } from '../../shared/archivos/almacen.js';
import { crearActasService } from './actas.service.js';
import { crearSolicitudesService } from '../solicitudes/solicitudes.service.js';
import { crearCatalogosService } from '../catalogos/catalogos.service.js';
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
let dep: number, tipos: { id: number; nombre: string; suspension: number }[], hoy: string;
async function entrar(usuario: string, contrasena: string) {
  const agent = request.agent(app),
    csrf = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const r = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf)
    .send({ usuario, contrasena })
    .expect(200);
  return { agent, csrf: r.body.data.csrfToken as string };
}
let admin: Awaited<ReturnType<typeof entrar>>,
  rh: typeof admin,
  empleado: typeof admin,
  jefe: typeof admin,
  temporal: typeof admin;
async function cuenta(rol: Rol, nombre: string, ficha?: number, cambio = false) {
  const u = await enTransaccion(db, (c) =>
    crearUsuarioInterno(c, actor, {
      nombre,
      apellido: 'Actas',
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
const base = '/api/actas';
const datos = () => ({
  idEmpleado: ids[1],
  idTipo: tipos.find((t) => !t.suspension)!.id,
  fechaHecho: hoy,
  lugar: 'Oficina de operaciones',
  descripcion: 'Se documenta el incumplimiento observado y su contexto de forma objetiva.',
  testigos: 'Persona presente',
  norma: 'Reglamento interno de trabajo',
  medida: 'Amonestación escrita con seguimiento',
  descargos: 'Explicación recibida del empleado',
  diasSuspension: 0,
});
const post = (ruta: string, d: unknown, sesion = rh) =>
  sesion.agent
    .post(base + ruta)
    .set('X-CSRF-Token', sesion.csrf)
    .send(d as object);
const crear = async (extra: object = {}) =>
  (await post('', { ...datos(), ...extra }).expect(201)).body.data.id as number;
const detalle = async (id: number, sesion = rh) =>
  (await sesion.agent.get(`${base}/${id}`).expect(200)).body.data;
const estado = async (id: number, accion: string, extra: object = {}, status = 200, sesion = rh) =>
  post(
    `/${id}/estado`,
    { accion, version: (await detalle(id)).version, confirmado: true, ...extra },
    sesion,
  ).expect(status);
const subir = (
  id: number,
  version: number,
  clase = 'EVIDENCIA',
  sesion = rh,
  bytes = png,
  nombre = 'respaldo.png',
) =>
  sesion.agent
    .post(`${base}/${id}/adjuntos`)
    .query({ clase, version, confirmado: '1' })
    .set('X-CSRF-Token', sesion.csrf)
    .set('Content-Type', 'image/png')
    .set('X-Nombre-Archivo', encodeURIComponent(nombre))
    .send(bytes);
let acta: number, suspension: number;
let pdf: Buffer;
describe('R3-12 C8: flujo completo real en Oracle y HTTP', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    dir = await mkdtemp(join(tmpdir(), 'n2actas-'));
    db = await crearBaseDatos(validarEntorno(process.env));
    await ejecutarMigraciones(db, logger);
    expect(await ejecutarMigraciones(db, logger)).toBe(0);
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
        actas: crearActasService(db, crearAlmacenPrivado(dir)),
        solicitudes: crearSolicitudesService(db),
        catalogos: crearCatalogosService(db),
        config,
      },
    );
    admin = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD);
    await admin.agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', admin.csrf)
      .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'ActasPrueba!2026' })
      .expect(200);
    admin.csrf = (await admin.agent.get('/api/auth/csrf')).body.data.csrfToken;
    actor = {
      idUsuario: Number(
        await scalar('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO=:u', { u: seed.ADMIN_USER }),
      ),
      idRol: Number(await scalar("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN'")),
      rol: 'ADMIN',
      ip: '127.0.0.1',
    };
    await sql("INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES('Relaciones laborales')");
    dep = Number(await scalar('SELECT MAX(ID_DEPARTAMENTO) FROM DEPARTAMENTOS'));
    await sql(
      "INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) VALUES('Responsable de Recursos Humanos',:dep)",
      { dep },
    );
    const puesto = Number(await scalar('SELECT MAX(ID_PUESTO) FROM PUESTOS'));
    await sql(
      "INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES('Sede de actas','GUATEMALA_CIUDAD')",
    );
    const centro = Number(await scalar('SELECT MAX(ID_CENTRO_TRABAJO) FROM CENTROS_TRABAJO'));
    for (let i = 0; i < 3; i++) {
      await sql(
        `INSERT INTO EMPLEADOS(CODIGO,NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) VALUES(:codigo,:nombre,'López Pérez',:dpi,:nit,DATE '1990-01-01','F','SOLTERO','Calle 1','55551234',:correo,:puesto,:dep,(SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO),:centro,DATE '2020-01-01')`,
        {
          codigo: `EMP_ACT_${i}`,
          nombre: ['Emisora', 'Titular', 'Jefa'][i]!,
          dpi: `123456789012${i}`,
          nit: `123456${i}-1`,
          correo: `actas${i}@example.test`,
          puesto,
          dep,
          centro,
        },
      );
      ids.push(Number(await scalar('SELECT MAX(ID_EMPLEADO) FROM EMPLEADOS')));
      await sql(
        "INSERT INTO HISTORIAL_SALARIAL(ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES(:id,9000,DATE '2020-01-01','Salario para aceptación')",
        { id: ids[i]! },
      );
    }
    rh = await cuenta('RH', 'Emisora', ids[0]);
    empleado = await cuenta('EMPLEADO', 'Titular', ids[1]);
    jefe = await cuenta('EMPLEADO', 'Jefa', ids[2]);
    temporal = await cuenta('RH', 'Temporal', undefined, true);
    await sql(
      "INSERT INTO JEFATURAS(NOMBRE,ID_DEPARTAMENTO,ID_EMPLEADO_RESPONSABLE) VALUES('Supervisión de actas',:dep,:jefe)",
      { dep, jefe: ids[2]! },
    );
    const j = Number(await scalar('SELECT MAX(ID_JEFATURA) FROM JEFATURAS'));
    await sql('UPDATE EMPLEADOS SET ID_JEFATURA=:j WHERE ID_EMPLEADO=:id', { j, id: ids[1]! });
    for (const codigo of ['VER_EQUIPO', 'VER_COMISIONES_EQUIPO', 'VER_VACACIONES_EQUIPO'])
      await sql('INSERT INTO PERMISOS_JEFATURA(ID_JEFATURA,CODIGO_PERMISO) VALUES(:j,:codigo)', {
        j,
        codigo,
      });
    await sql(
      "INSERT INTO CONFIGURACION_EMPRESA(RAZON_SOCIAL,NIT,DIRECCION,TELEFONO,CORREO) VALUES('Empresa de aceptación de actas','1234567-9','Guatemala','55551234','rh@example.test')",
    );
    const r = (await rh.agent.get(base + '/reglas').expect(200)).body.data;
    tipos = r.tipos;
    hoy = r.hoy;
  });
  afterAll(async () => {
    await db?.cerrar();
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  it('catálogo, parámetros, código automático y validación de datos/fechas', async () => {
    expect(tipos).toHaveLength(4);
    expect(tipos.filter((x) => x.suspension)).toHaveLength(1);
    for (const extra of [
      { fechaHecho: '2099-12-31' },
      { fechaHecho: '2019-12-31' },
      { descripcion: 'Muy corta' },
      { descripcion: 'a'.repeat(4001) },
      { diasSuspension: 1 },
      { estado: 'EMITIDA' },
    ])
      await post('', { ...datos(), ...extra }).expect(400);
    acta = await crear();
    expect((await detalle(acta)).codigo).toMatch(/^ACT_\d{4}_\d{4,}$/);
    const [a, b] = await Promise.all([crear(), crear()]);
    expect((await detalle(a)).codigo).not.toBe((await detalle(b)).codigo);
  });
  it('401, CSRF, cambio obligatorio, empleado y jefe sin acceso de gestión', async () => {
    await request(app).get(base).expect(401);
    await rh.agent.post(base).send(datos()).expect(403);
    await temporal.agent.get(base + '/reglas').expect(403);
    for (const sesion of [empleado, jefe]) {
      await post('', datos(), sesion).expect(403);
      await sesion.agent.get(base + '/reglas').expect(403);
      await sesion.agent.get(base + '/antecedentes/' + ids[1]).expect(403);
      await sesion.agent.get(`${base}/${acta}`).expect(403);
      await subir(acta, 1, 'EVIDENCIA', sesion).expect(403);
    }
    expect((await empleado.agent.get(base).expect(200)).body.data.total).toBe(0);
    await request(app).delete(`${base}/${acta}`).expect(401);
    await rh.agent.delete(`${base}/${acta}`).set('X-CSRF-Token', rh.csrf).send({}).expect(404);
  });
  it('edita solo borrador/version vigente y valida archivos privados antes de guardar', async () => {
    await rh.agent
      .patch(`${base}/${acta}`)
      .set('X-CSRF-Token', rh.csrf)
      .send({ ...datos(), version: 1, descargos: 'Descargos completados' })
      .expect(200);
    await rh.agent
      .patch(`${base}/${acta}`)
      .set('X-CSRF-Token', rh.csrf)
      .send({ ...datos(), version: 1 })
      .expect(409);
    expect(
      await scalar(
        "SELECT JSON_VALUE(VALORES_NUEVOS,'$.version' RETURNING NUMBER) FROM BITACORA_AUDITORIA WHERE ENTIDAD='ACTAS_ADMINISTRATIVAS' AND ACCION='EDITAR_ACTA' AND ID_ENTIDAD=:id",
        { id: acta },
      ),
    ).toBe(2);
    const v = (await detalle(acta)).version;
    await subir(acta, v, 'EVIDENCIA', rh, Buffer.from('<html>Falso</html>')).expect(400);
    await subir(acta, v, 'EVIDENCIA', rh, png, '../escape.png').expect(400);
    await subir(acta, v, 'EVIDENCIA', rh, Buffer.alloc(10 * 1024 * 1024 + 1)).expect(413);
    await subir(acta, v).expect(201);
    const d = await detalle(acta);
    expect(d.adjuntos).toHaveLength(1);
    expect(d.historial).toHaveLength(1);
    expect(JSON.stringify(d)).not.toMatch(/clave|\.bin/);
    expect(await readdir(dir)).toHaveLength(1);
    await empleado.agent.get(`${base}/adjuntos/${d.adjuntos[0].id}`).expect(403);
  });
  it('emite PDF membretado con emisor, notificación y bloqueo posterior de edición', async () => {
    await estado(acta, 'EMITIR');
    const d = await detalle(acta);
    expect(d.estado).toBe('EMITIDA');
    expect(d.emisorNombre).toBe('Emisora López Pérez');
    expect(d.emisorCargo).toBe('Responsable de Recursos Humanos');
    const r = await rh.agent.get(`${base}/${acta}/pdf`).expect(200);
    pdf = r.body;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.headers['content-disposition']).toContain(d.codigo);
    expect(r.headers['cache-control']).toContain('no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    await rh.agent
      .patch(`${base}/${acta}`)
      .set('X-CSRF-Token', rh.csrf)
      .send({ ...datos(), version: d.version })
      .expect(409);
    await estado(acta, 'EMITIR', {}, 409);
    await subir(acta, d.version).expect(409);
    expect(
      await scalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE ID_ACTA=:id', { id: acta }),
    ).toBe(1);
    expect(
      (await db.conConexion((c) => alertas(c))).some((a) => a.tipo === 'ACTA' && a.id === acta),
    ).toBe(true);
  });
  it('empleado solo ve sus actas emitidas, documentos y adjuntos; jefe no ve las del equipo', async () => {
    const r = (await empleado.agent.get(base).expect(200)).body.data;
    expect(r.total).toBe(1);
    expect(r.registros[0].id).toBe(acta);
    await empleado.agent.get(`${base}/${acta}`).expect(200);
    await empleado.agent.get(`${base}/${acta}/pdf`).expect(200);
    const adjunto = (await detalle(acta)).adjuntos[0].id;
    await empleado.agent.get(`${base}/adjuntos/${adjunto}?vista=1`).expect(200);
    for (const ruta of [`/${acta}`, `/${acta}/pdf`, `/adjuntos/${adjunto}`])
      await jefe.agent.get(base + ruta).expect(403);
    expect((await jefe.agent.get(base + '?idEmpleado=' + ids[1]).expect(200)).body.data.total).toBe(
      0,
    );
    const csv = await empleado.agent.get(base + '/exportar').expect(200);
    expect(csv.text).toContain((await detalle(acta)).codigo);
    expect(csv.text).not.toContain('Descripción');
  });
  it('firma exige escaneo, cambia estado de forma atómica y no permite volver atrás', async () => {
    await estado(acta, 'FIRMAR', {}, 400);
    const v = (await detalle(acta)).version;
    const responses = await Promise.all([subir(acta, v, 'FIRMA'), subir(acta, v, 'FIRMA')]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await detalle(acta)).estado).toBe('FIRMADA');
    expect(
      (await detalle(acta)).adjuntos.filter((a: { clase: string }) => a.clase === 'FIRMA'),
    ).toHaveLength(1);
    await estado(acta, 'NEGATIVA', { testigos: 'Testigos tardíos' }, 409);
    expect(
      (await db.conConexion((c) => alertas(c))).some((a) => a.tipo === 'ACTA' && a.id === acta),
    ).toBe(false);
  });
  it('negativa requiere testigos y anulación exige motivo y conserva PDF/historial', async () => {
    const id = await crear();
    await estado(id, 'EMITIR');
    await estado(id, 'NEGATIVA', {}, 400);
    await estado(id, 'NEGATIVA', { testigos: 'Ana Pérez y Juan López, presentes' }, 200);
    expect((await detalle(id)).estado).toBe('SE_NEGO_A_FIRMAR');
    await estado(id, 'ANULAR', {}, 400);
    await estado(id, 'ANULAR', { motivo: 'Medida dejada sin efecto tras revisión' });
    const d = await detalle(id);
    expect(d.estado).toBe('ANULADA');
    expect(d.historial.map((h: { estado: string }) => h.estado)).toEqual([
      'BORRADOR',
      'EMITIDA',
      'SE_NEGO_A_FIRMAR',
      'ANULADA',
    ]);
    expect(d.historial[2].testigos).toContain('Ana Pérez');
    await estado(id, 'ANULAR', { motivo: 'Otra anulación' }, 409);
    await rh.agent.get(`${base}/${id}/pdf`).expect(200);
    await estado(acta, 'ANULAR', { motivo: 'Revisión de medida firmada' });
    expect((await rh.agent.get(`${base}/${acta}/pdf`).expect(200)).body).toEqual(pdf);
  });
  it('suspensión crea ausencia aprobada y novedades mensuales usando reglas compartidas', async () => {
    suspension = await crear({ idTipo: tipos.find((t) => t.suspension)!.id, diasSuspension: 2 });
    await estado(suspension, 'EMITIR', { registrarAusencia: true, fechaInicio: hoy });
    const d = await detalle(suspension);
    expect(d.idAusencia).toBeGreaterThan(0);
    expect(
      await scalar('SELECT DIAS FROM AUSENCIAS WHERE ID_AUSENCIA=:id', { id: d.idAusencia }),
    ).toBe(2);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM NOVEDADES_MENSUALES WHERE ID_AUSENCIA=:id AND AUTORIZACION='APROBADA' AND ESTADO='PENDIENTE'",
        { id: d.idAusencia },
      ),
    ).toBeGreaterThan(0);
    expect(
      Number(
        await scalar('SELECT SUM(MONTO) FROM NOVEDADES_MENSUALES WHERE ID_AUSENCIA=:id', {
          id: d.idAusencia,
        }),
      ),
    ).toBe(600);
    await estado(suspension, 'ANULAR', { motivo: 'Se retira la medida para revisión' });
    expect(
      await scalar('SELECT ACTIVO FROM AUSENCIAS WHERE ID_AUSENCIA=:id', { id: d.idAusencia }),
    ).toBe(1);
  });
  it('traslapes y cierres revierten toda emisión; tope se relee antes de emitir', async () => {
    const id = await crear({ idTipo: tipos.find((t) => t.suspension)!.id, diasSuspension: 2 });
    await estado(id, 'EMITIR', { registrarAusencia: true, fechaInicio: hoy }, 422);
    expect((await detalle(id)).estado).toBe('BORRADOR');
    expect(await scalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE ID_ACTA=:id', { id })).toBe(0);
    const futuro = new Date(hoy + 'T00:00:00Z');
    futuro.setUTCMonth(futuro.getUTCMonth() + 1, 16);
    const f = futuro.toISOString().slice(0, 10);
    await sql(
      "INSERT INTO PERIODOS_NOMINA(FECHA_INICIO,FECHA_FIN,QUINCENA,ESTADO,CREADO_POR,APROBADO_POR,APROBADO_EN,CERRADO_POR,CERRADO_EN) VALUES(TO_DATE(:f,'YYYY-MM-DD'),LAST_DAY(TO_DATE(:f,'YYYY-MM-DD')),2,'CERRADO',:a,:a,SYSDATE,:a,SYSDATE)",
      { f, a: actor.idUsuario },
    );
    await estado(id, 'EMITIR', { registrarAusencia: true, fechaInicio: f }, 422);
    expect((await detalle(id)).estado).toBe('BORRADOR');
    await sql(
      "UPDATE PARAMETROS_LEGALES SET VALOR=1 WHERE CLAVE_INTERNA='ACTAS_MAX_DIAS_SUSPENSION'",
    );
    await estado(id, 'EMITIR', {}, 400);
    await sql(
      "UPDATE PARAMETROS_LEGALES SET VALOR=8 WHERE CLAVE_INTERNA='ACTAS_MAX_DIAS_SUSPENSION'",
    );
  });
  it('auditoría fallida revierte emisión/ausencia/firma y bloquea bytes', async () => {
    const id = await crear();
    const conFirma = await crear();
    await estado(conFirma, 'EMITIR');
    const conAusencia = await crear({
      idEmpleado: ids[2],
      idTipo: tipos.find((t) => t.suspension)!.id,
      diasSuspension: 1,
    });
    const ausenciasAntes = await scalar('SELECT COUNT(*) FROM AUSENCIAS');
    const firmaVersion = (await detalle(conFirma)).version;
    await sql(
      "CREATE OR REPLACE TRIGGER FALLAR_ACT_AUD BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ENTIDAD='ACTAS_ADMINISTRATIVAS' THEN RAISE_APPLICATION_ERROR(-20099,'Fallo de auditoría'); END IF; END;",
    );
    const n = (await readdir(dir)).length;
    try {
      await post(`/${id}/estado`, { accion: 'EMITIR', version: 1, confirmado: true }).expect(500);
      await rh.agent.get(`${base}/${acta}/pdf`).expect(500);
      await subir(id, 1).expect(500);
      await subir(conFirma, firmaVersion, 'FIRMA').expect(500);
      await post(`/${conAusencia}/estado`, {
        accion: 'EMITIR',
        version: 1,
        confirmado: true,
        registrarAusencia: true,
        fechaInicio: hoy,
      }).expect(500);
    } finally {
      await sql('DROP TRIGGER FALLAR_ACT_AUD');
    }
    expect((await detalle(id)).estado).toBe('BORRADOR');
    expect((await detalle(conFirma)).estado).toBe('EMITIDA');
    expect((await detalle(conAusencia)).estado).toBe('BORRADOR');
    expect(await scalar('SELECT COUNT(*) FROM AUSENCIAS')).toBe(ausenciasAntes);
    expect(await readdir(dir)).toHaveLength(n);
    expect(await scalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE ID_ACTA=:id', { id })).toBe(0);
  });
  it('plantilla versionada no altera documentos emitidos y filtros/antecedentes son del servidor', async () => {
    const p = (await rh.agent.get(base + '/plantilla').expect(200)).body.data;
    await rh.agent
      .patch(base + '/plantilla')
      .set('X-CSRF-Token', rh.csrf)
      .send({
        ...p,
        id: undefined,
        variables: undefined,
        contenido: p.contenido + '\nDocumento revisado',
        motivo: 'Nueva presentación documental',
        confirmado: true,
      })
      .expect(200);
    await rh.agent
      .patch(base + '/plantilla')
      .set('X-CSRF-Token', rh.csrf)
      .send({
        version: p.version,
        nombre: p.nombre,
        contenido: p.contenido,
        motivo: 'Edición obsoleta',
        confirmado: true,
      })
      .expect(409);
    expect((await rh.agent.get(`${base}/${acta}/pdf`).expect(200)).body).toEqual(pdf);
    const listado = (
      await rh.agent
        .get(base)
        .query({
          idEmpleado: ids[1],
          idDepartamento: dep,
          estado: 'ANULADA',
          desde: hoy,
          hasta: hoy,
          limite: 1,
        })
        .expect(200)
    ).body.data;
    expect(listado.total).toBe(3);
    expect(listado.registros).toHaveLength(1);
    const antecedentes = (await rh.agent.get(`${base}/antecedentes/${ids[1]}`).expect(200)).body
      .data;
    expect(antecedentes.total).toBeGreaterThan(3);
    expect(antecedentes.ingreso).toBe('2020-01-01');
    await rh.agent.get(base + '?ordenarPor=DESCRIPCION').expect(400);
    await rh.agent.get(base + '?desde=2026-02-30').expect(400);
    await admin.agent.get(base).expect(200);
    expect(await scalar("SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'")).toBe(0);
  });
  it('exige perfil del emisor y empresa completa, sin emitir parcialmente', async () => {
    const id = await crear();
    await estado(id, 'EMITIR', {}, 409, admin);
    expect((await detalle(id)).estado).toBe('BORRADOR');
    await sql('UPDATE CONFIGURACION_EMPRESA SET TELEFONO=NULL');
    try {
      await estado(id, 'EMITIR', {}, 409);
    } finally {
      await sql("UPDATE CONFIGURACION_EMPRESA SET TELEFONO='55551234'");
    }
    expect((await detalle(id)).estado).toBe('BORRADOR');
  });
});
