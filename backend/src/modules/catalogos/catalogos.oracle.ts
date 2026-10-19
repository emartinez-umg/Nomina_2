import { crearUsuariosService } from '../usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
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
import { crearCatalogosService } from './catalogos.service.js';
import { catalogos } from './catalogos.definiciones.js';
import { normalizarNombreCatalogo } from '../../shared/catalogos/nombre.js';
let db: BaseDatos, agent: ReturnType<typeof request.agent>, csrf: string;
const logger = crearLogger('silent'),
  seed = validarEntornoSeeds(process.env);
const sql = (query: string, binds: Record<string, string | number> = {}) =>
  enTransaccion(db, (c) => c.execute(query, binds));
const scalar = (query: string) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(query)).rows![0]![0]);
const crear = (slug: string, body: object) =>
  agent.post(`/api/catalogos/${slug}`).set('X-CSRF-Token', csrf).send(body);
const datos = (slug: string, nombre: string) => ({
  nombre,
  descripcion: null,
  ...(slug === 'parentescos' ? { descripcion: undefined } : {}),
  ...(slug === 'tipos-contrato' ? { requiereFin: false } : {}),
  ...(slug === 'tipos-ausencia' ? { efecto: 'CON_GOCE' } : {}),
  ...(slug === 'tipos-solicitud' ? { generaPdf: false, esDirecta: false } : {}),
  ...(slug === 'tipos-deduccion-isr' ? { codigoParametroTope: null } : {}),
  ...(slug === 'horarios'
    ? {
        bloques: [
          {
            dias: [1],
            entrada: '08:00',
            salida: '17:00',
            cruzaMedianoche: false,
            minutosDescanso: 60,
          },
        ],
      }
    : {}),
});
describe('R2-4: catálogos, migración y API Oracle', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version < 31),
        crearMigracionesRepository(c),
        logger,
      ),
    );
    await ejecutarSeeds(db, logger, seed);
    for (const [nombre, fecha] of [
      ['Ingeniería', '2000-01-01'],
      [' ingeniería ', '2001-01-01'],
      ['Ingeniería (duplicado 2)', '2002-01-01'],
      ['INGENIERÍA', '2003-01-01'],
    ])
      await sql(
        "INSERT INTO DEPARTAMENTOS(NOMBRE,FECHA_CREACION) VALUES(:nombre,TO_DATE(:fecha,'YYYY-MM-DD'))",
        { nombre: nombre!, fecha: fecha! },
      );
    await sql("INSERT INTO PARENTESCOS(NOMBRE,FECHA_CREACION) VALUES(' Padre ',DATE '2000-01-01')");
    await expect(
      sql("UPDATE PARENTESCOS SET NOMBRE='Padre' WHERE FECHA_CREACION=DATE '2000-01-01'"),
    ).rejects.toMatchObject({ errorNum: 1 });
    expect(await ejecutarMigraciones(db, logger)).toBe(2);
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
        catalogos: crearCatalogosService(db),
        usuarios: crearUsuariosService(db),
        auditoria: crearAuditoriaService(db),
        config,
      },
    );
    agent = request.agent(app);
    const t = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
    const r = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', t)
      .send({ usuario: seed.ADMIN_USER, contrasena: seed.ADMIN_PASSWORD })
      .expect(200);
    csrf = (
      await agent
        .post('/api/auth/cambiar-contrasena')
        .set('X-CSRF-Token', r.body.data.csrfToken)
        .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'CatalogosPrueba!2026' })
        .expect(200)
    ).body.data.csrfToken;
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('migra duplicados, conserva el más antiguo y evita colisiones con sufijos existentes', async () => {
    expect(
      await scalar("SELECT NOMBRE FROM DEPARTAMENTOS WHERE NOMBRE_NORMALIZADO='ingenieria'"),
    ).toBe('Ingeniería');
    expect(
      await scalar("SELECT COUNT(*) FROM CATALOGOS_NOMBRES_CORREGIDOS WHERE TABLA='DEPARTAMENTOS'"),
    ).toBe(2);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM DEPARTAMENTOS WHERE NOMBRE_NORMALIZADO IN ('ingenieria (duplicado 3)','ingenieria (duplicado 4)') AND ACTIVO=0",
      ),
    ).toBe(2);
    expect(
      await scalar("SELECT NOMBRE FROM PARENTESCOS WHERE FECHA_CREACION=DATE '2000-01-01'"),
    ).toBe('Padre');
    expect(
      await scalar(
        "SELECT COUNT(*) FROM PARENTESCOS WHERE NOMBRE_NORMALIZADO='padre (duplicado 2)' AND ACTIVO=0",
      ),
    ).toBe(1);
    expect(await ejecutarMigraciones(db, logger)).toBe(0);
    const invalidos = await db.conConexion(
      async (c) =>
        (await c.execute("SELECT OBJECT_NAME,OBJECT_TYPE FROM USER_OBJECTS WHERE STATUS<>'VALID'"))
          .rows,
    );
    expect(invalidos).toEqual([]);
  });
  it('normalizador Oracle/TS coincide y UNIQUE rechaza concurrencia fuera de la API', async () => {
    for (const nombre of [
      ' ÁREA   de  Ingeniería ',
      'NIÑEZ / Pingüino',
      'Cafe\u0301 & Té',
      "  A.B, / (C) - D'E  ",
    ]) {
      const normalizado = await db.conConexion(
        async (c) =>
          (await c.execute<string[]>('SELECT N2_NOMBRE_NORMALIZADO(:nombre) FROM DUAL', { nombre }))
            .rows![0]![0],
      );
      expect(normalizado).toBe(normalizarNombreCatalogo(nombre));
    }
    await expect(
      sql("INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES('  INGENIERIA  ')"),
    ).rejects.toMatchObject({ errorNum: 1 });
  });
  it('todos los catálogos reutilizan rechazo y recorte al crear/editar', async () => {
    for (const slug of [
      'bancos',
      'departamentos',
      'tipos-contrato',
      'tipos-ausencia',
      'tipos-descuento',
      'horarios',
      'parentescos',
      'tipos-solicitud',
      'tipos-deduccion-isr',
    ]) {
      for (const nombre of [' ', 'A', '123456', '/*%$#&/@#^']) {
        const r = await crear(slug, datos(slug, nombre)).expect(400);
        expect(r.body.error.campos.nombre).toBeTruthy();
      }
      const r = await crear(slug, datos(slug, '  Catálogo   común  ')).expect(201);
      expect(r.body.data.nombre).toBe('Catálogo común');
      for (const nombre of ['catálogo común', 'CATALOGO COMUN', '  catálogo   común ']) {
        const error = await crear(slug, datos(slug, nombre)).expect(409);
        expect(error.body.error.codigo).toBe('DUPLICADO');
        expect(error.body.error.campos.nombre).toBeTruthy();
      }
      await agent
        .patch(`/api/catalogos/${slug}/${r.body.data.id}`)
        .set('X-CSRF-Token', csrf)
        .send(datos(slug, '***'))
        .expect(400);
      await agent
        .patch(`/api/catalogos/${slug}/${r.body.data.id}`)
        .set('X-CSRF-Token', csrf)
        .send(datos(slug, ' Catálogo   común '))
        .expect(200);
    }
    expect((await agent.get('/api/catalogos')).body.data).toHaveLength(catalogos.length);
  });
  it('conceptos y parámetros conservan versiones de la misma identidad y rechazan otra con nombre equivalente', async () => {
    const legal = {
      nombre: 'Concepto común',
      naturaleza: 'INGRESO',
      afectaIgss: true,
      afectaIsr: true,
      afectaPrestaciones: true,
      vigenteDesde: '2027-01-01',
      vigenteHasta: null,
      motivo: 'Nueva regla de prueba',
      confirmado: true,
    };
    const r = await crear('conceptos', legal).expect(201);
    await crear('conceptos', {
      ...legal,
      nombre: ' CONCEPTO COMUN ',
      vigenteDesde: '2028-01-01',
    }).expect(409);
    const version = await agent
      .patch(`/api/catalogos/conceptos/${r.body.data.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ ...legal, vigenteDesde: '2028-01-01' })
      .expect(200);
    expect(version.body.data.codigo).toBe(r.body.data.codigo);
    expect(version.body.data.id).not.toBe(r.body.data.id);
    const p = {
      nombre: 'Parámetro común',
      valor: '10',
      unidad: 'CANTIDAD',
      vigenteDesde: '2027-01-01',
      vigenteHasta: null,
      fundamento: 'Referencia de prueba',
      motivo: 'Nueva regla de prueba',
      confirmado: true,
    };
    const parametro = await crear('parametros-legales', p).expect(201);
    const duplicado = await crear('parametros-legales', {
      ...p,
      nombre: 'PARAMETRO COMUN',
      vigenteDesde: '2030-01-01',
    }).expect(409);
    expect(duplicado.body.error.codigo).toBe('DUPLICADO');
    await agent
      .patch(`/api/catalogos/parametros-legales/${parametro.body.data.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ ...p, nombre: ' PARÁMETRO   COMÚN ', vigenteDesde: '2028-01-01' })
      .expect(200);
    // Una identidad distinta no puede apropiarse del nombre, aun con otra vigencia.
    const otro = await crear('parametros-legales', { ...p, nombre: 'Otro parámetro' }).expect(201);
    const conflicto = await agent
      .patch(`/api/catalogos/parametros-legales/${otro.body.data.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ ...p, vigenteDesde: '2029-01-01' })
      .expect(409);
    expect(conflicto.body.error.codigo).toBe('DUPLICADO');
  });
  it('detecta referencias por clave interna que no tienen FK física', async () => {
    const r = await crear('parametros-legales', {
      nombre: 'Tope deducción común',
      valor: '100',
      unidad: 'QUETZALES',
      vigenteDesde: '2027-01-01',
      vigenteHasta: null,
      fundamento: 'Referencia de prueba',
      motivo: 'Tope de prueba aislada',
      confirmado: true,
    }).expect(201);
    await crear('tipos-deduccion-isr', {
      ...datos('tipos-deduccion-isr', 'Deducción con tope'),
      codigoParametroTope: r.body.data.claveInterna,
    }).expect(201);
    const detalle = await agent
      .get(`/api/catalogos/parametros-legales/${r.body.data.id}`)
      .expect(200);
    expect(detalle.body.data).toMatchObject({ usos: 1, enUso: true });
    const error = await agent
      .delete(`/api/catalogos/parametros-legales/${r.body.data.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ motivo: 'Verificar protección de tope', confirmado: true, fisica: true })
      .expect(409);
    expect(error.body.error.codigo).toBe('REGISTRO_EN_USO');
    await agent
      .patch(`/api/catalogos/parametros-legales/${r.body.data.id}/estado`)
      .set('X-CSRF-Token', csrf)
      .send({ activo: false, motivo: 'Inactivar parámetro en uso', confirmado: true })
      .expect(200);
    await agent
      .patch(`/api/catalogos/parametros-legales/${r.body.data.id}/estado`)
      .set('X-CSRF-Token', csrf)
      .send({ activo: true, motivo: 'Reactivar parámetro en uso', confirmado: true })
      .expect(200);
  });
  it('serializa altas equivalentes concurrentes: una fila y un error de campo DUPLICADO', async () => {
    const resultados = await Promise.all([
      crear('bancos', datos('bancos', 'Banco simultáneo')),
      crear('bancos', datos('bancos', ' BANCO SIMULTANEO ')),
    ]);
    expect(resultados.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(resultados.find((r) => r.status === 409)?.body.error).toMatchObject({
      codigo: 'DUPLICADO',
      campos: { nombre: expect.any(Array) },
    });
    expect(
      await scalar("SELECT COUNT(*) FROM BANCOS WHERE NOMBRE_NORMALIZADO='banco simultaneo'"),
    ).toBe(1);
  });
  it('inactivo ofrece reactivación del mismo ID y conserva historia auditada', async () => {
    const r = await crear('bancos', datos('bancos', 'Banco inactivo')).expect(201),
      id = r.body.data.id;
    await agent
      .patch(`/api/catalogos/bancos/${id}/estado`)
      .set('X-CSRF-Token', csrf)
      .send({ activo: false, motivo: 'Inactivar para prueba' })
      .expect(200);
    const error = await crear('bancos', datos('bancos', 'BANCO INACTIVO')).expect(409);
    expect(error.body.error.duplicado).toEqual({ id, activo: false });
    expect(error.body.error.mensaje).toContain('inactivo');
    await agent
      .patch(`/api/catalogos/bancos/${id}/estado`)
      .set('X-CSRF-Token', csrf)
      .send({ activo: true, motivo: 'Reactivar registro existente' })
      .expect(200);
    const h = await agent.get(`/api/catalogos/bancos/${id}/historial`).expect(200);
    expect(h.body.data.map((a: { accion: string }) => a.accion)).toContain('ACTIVAR_CATALOGO');
  });
  it('cuenta todas las referencias, impide eliminar y conserva referencias inactivas al editar', async () => {
    const dep = await crear('departamentos', datos('departamentos', 'Departamento usado')).expect(
        201,
      ),
      id = dep.body.data.id;
    const puesto = {
      ...datos('puestos', 'Puesto usado'),
      idDepartamento: id,
      salarioMinimo: null,
      salarioMaximo: null,
    };
    const p = await crear('puestos', puesto).expect(201);
    await crear('jefaturas', {
      ...datos('jefaturas', 'Jefatura usada'),
      idDepartamento: id,
      idEmpleadoResponsable: null,
    }).expect(201);
    const fila = await agent.get(`/api/catalogos/departamentos/${id}`).expect(200);
    expect(fila.body.data).toMatchObject({ enUso: true, usos: 2 });
    for (const fisica of [false, true]) {
      const r = await agent
        .delete(`/api/catalogos/departamentos/${id}`)
        .set('X-CSRF-Token', csrf)
        .send({ motivo: 'Prueba de bloqueo', confirmado: true, fisica })
        .expect(409);
      expect(r.body.error.codigo).toBe('REGISTRO_EN_USO');
      expect(r.body.error.mensaje).toContain('2 registro(s)');
    }
    await agent
      .patch(`/api/catalogos/departamentos/${id}/estado`)
      .set('X-CSRF-Token', csrf)
      .send({ activo: false, motivo: 'Conservar uso histórico' })
      .expect(200);
    const opciones = await agent.get('/api/catalogos/opciones/departamentos').expect(200);
    expect(opciones.body.data.some((r: { value: string }) => r.value === String(id))).toBe(false);
    await agent
      .patch(`/api/catalogos/puestos/${p.body.data.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ ...puesto, nombre: 'Puesto actualizado' })
      .expect(200);
    await crear('puestos', { ...puesto, nombre: 'Puesto nuevo' }).expect(409);
  });
});
