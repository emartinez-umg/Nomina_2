import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { BindParameters } from 'oracledb';
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
import { crearUsuariosService } from '../usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { crearCatalogosService } from '../catalogos/catalogos.service.js';
import { crearUbicacionesService } from './ubicaciones.service.js';

let db: BaseDatos;
let app: ReturnType<typeof crearApp>;
let admin: ReturnType<typeof request.agent>;
let csrf: string;
let departamento: number;
let municipio: number;
let otroDepartamento: number;
const logger = crearLogger('silent');
const seed = validarEntornoSeeds(process.env);
const scalar = (sql: string, binds: BindParameters = {}) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(sql, binds)).rows![0]![0]);
const sql = (query: string, binds: BindParameters = {}) =>
  enTransaccion(db, (c) => c.execute(query, binds));
async function entrar(usuario: string, clave: string) {
  const agent = request.agent(app);
  const inicial = (await agent.get('/api/auth/csrf')).body.data.csrfToken as string;
  const login = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', inicial)
    .send({ usuario, contrasena: clave })
    .expect(200);
  return { agent, csrf: login.body.data.csrfToken as string };
}
describe('FASE V1-4: ubicaciones con Oracle y API reales', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version < 22),
        crearMigracionesRepository(c),
        logger,
      ),
    );
    for (const localidad of [
      'GUATEMALA_CIUDAD',
      'San José',
      'Sede sin ubicación',
      'San Cristóbal Acasaguastlán, El Progreso',
    ])
      await sql('INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES (:nombre,:localidad)', {
        nombre: localidad,
        localidad,
      });
    expect(await ejecutarMigraciones(db, logger)).toBe(1);
    await ejecutarSeeds(db, logger, seed);
    departamento = Number(
      await scalar("SELECT ID_DEPARTAMENTO_GT FROM DEPARTAMENTOS_GT WHERE CODIGO_INE='01'"),
    );
    municipio = Number(
      await scalar("SELECT ID_MUNICIPIO_GT FROM MUNICIPIOS_GT WHERE CODIGO_INE='0101'"),
    );
    otroDepartamento = Number(
      await scalar("SELECT ID_DEPARTAMENTO_GT FROM DEPARTAMENTOS_GT WHERE CODIGO_INE='02'"),
    );
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
        catalogos: crearCatalogosService(db),
        ubicaciones: crearUbicacionesService(db),
        config,
      },
    );
    ({ agent: admin, csrf } = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD));
  });
  afterAll(async () => {
    await db?.cerrar();
  });

  it('migra sin perder texto ni confirmar coincidencias; ambiguas/desconocidas quedan sin propuesta', async () => {
    expect(
      await scalar(
        'SELECT COUNT(*) FROM CENTROS_TRABAJO WHERE LOCALIDAD=LOCALIDAD_ANTERIOR AND ID_MUNICIPIO_GT IS NULL AND ID_DEPARTAMENTO_GT IS NULL',
      ),
    ).toBe(4);
    expect(
      await scalar(
        "SELECT ID_MUNICIPIO_GT_PROPUESTO FROM CENTROS_TRABAJO WHERE NOMBRE='GUATEMALA_CIUDAD'",
      ),
    ).toBe(municipio);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM CENTROS_TRABAJO WHERE NOMBRE IN ('San José','Sede sin ubicación') AND ID_MUNICIPIO_GT_PROPUESTO IS NULL",
      ),
    ).toBe(2);
    expect(
      await scalar(
        "SELECT M.CODIGO_INE FROM CENTROS_TRABAJO C JOIN MUNICIPIOS_GT M ON M.ID_MUNICIPIO_GT=C.ID_MUNICIPIO_GT_PROPUESTO WHERE C.NOMBRE='San Cristóbal Acasaguastlán, El Progreso'",
      ),
    ).toBe('0204');
    expect(await scalar("SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'")).toBe(0);
  });
  it('carga 22/340 con relaciones íntegras, seeds repetibles e índices/UNIQUE/FK activos', async () => {
    expect(await scalar('SELECT COUNT(*) FROM DEPARTAMENTOS_GT')).toBe(22);
    expect(await scalar('SELECT COUNT(*) FROM MUNICIPIOS_GT')).toBe(340);
    expect(
      await scalar(
        'SELECT COUNT(*) FROM MUNICIPIOS_GT M JOIN DEPARTAMENTOS_GT D ON D.ID_DEPARTAMENTO_GT=M.ID_DEPARTAMENTO_GT AND SUBSTR(M.CODIGO_INE,1,2)=D.CODIGO_INE',
      ),
    ).toBe(340);
    const antes = await db.conConexion(async (c) =>
      JSON.stringify((await c.execute('SELECT * FROM MUNICIPIOS_GT ORDER BY CODIGO_INE')).rows),
    );
    await ejecutarSeeds(db, logger, seed);
    expect(
      await db.conConexion(async (c) =>
        JSON.stringify((await c.execute('SELECT * FROM MUNICIPIOS_GT ORDER BY CODIGO_INE')).rows),
      ),
    ).toBe(antes);
    await expect(
      sql(
        "INSERT INTO MUNICIPIOS_GT(CODIGO_INE,NOMBRE,ID_DEPARTAMENTO_GT) VALUES ('0101','Duplicado',:dep)",
        { dep: departamento },
      ),
    ).rejects.toMatchObject({ errorNum: 1 });
    await expect(
      sql(
        "INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD,ID_DEPARTAMENTO_GT,ID_MUNICIPIO_GT) VALUES ('Inválido','PRUEBA',:dep,:mun)",
        { dep: otroDepartamento, mun: municipio },
      ),
    ).rejects.toMatchObject({ errorNum: 2291 });
  });
  it('autentica, exige cambiar contraseña y permite solo consultas validadas', async () => {
    await request(app).get('/api/ubicaciones/departamentos').expect(401);
    await admin.get('/api/ubicaciones/departamentos').expect(403);
    csrf = (
      await admin
        .post('/api/auth/cambiar-contrasena')
        .set('X-CSRF-Token', csrf)
        .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'UbicacionesPrueba!2026' })
        .expect(200)
    ).body.data.csrfToken;
    expect((await admin.get('/api/ubicaciones/departamentos').expect(200)).body.data).toHaveLength(
      22,
    );
    const filtrados = await admin
      .get('/api/ubicaciones/municipios')
      .query({ idDepartamentoGt: departamento })
      .expect(200);
    expect(filtrados.body.data).toHaveLength(17);
    expect(
      filtrados.body.data.every(
        (m: { idDepartamentoGt: number }) => m.idDepartamentoGt === departamento,
      ),
    ).toBe(true);
    expect((await admin.get('/api/ubicaciones/municipios').expect(200)).body.data).toHaveLength(
      340,
    );
    expect(
      (await admin.get('/api/ubicaciones/departamentos?buscar=Sacatepequez').expect(200)).body
        .data[0].nombre,
    ).toBe('Sacatepéquez');
    for (const query of ['idDepartamentoGt=0', 'idDepartamentoGt=1%20OR%201=1', 'otro=x'])
      await admin.get(`/api/ubicaciones/municipios?${query}`).expect(400);
    await admin
      .post('/api/ubicaciones/departamentos')
      .set('X-CSRF-Token', csrf)
      .send({ nombre: 'Falso' })
      .expect(404);
  });
  it('valida localidad estructurada, guarda y filtra centros con auditoría; conserva referencia histórica', async () => {
    const datos = {
      nombre: 'Centro estructurado',
      descripcion: null,
      direccion: null,
      idDepartamentoGt: departamento,
      idMunicipioGt: municipio,
    };
    const crear = (body: object) =>
      admin.post('/api/catalogos/centros-trabajo').set('X-CSRF-Token', csrf).send(body);
    await crear({ nombre: 'Libre', localidad: 'Texto libre' }).expect(400);
    const invalido = await crear({ ...datos, idDepartamentoGt: otroDepartamento }).expect(409);
    expect(invalido.body.error.campos.idMunicipioGt).toBeTruthy();
    const nuevo = await crear(datos).expect(201);
    expect(nuevo.body.data).toMatchObject({
      idDepartamentoGt: departamento,
      idMunicipioGt: municipio,
      idMunicipioGtEtiqueta: 'Guatemala',
      localidad: 'GUATEMALA_CIUDAD',
    });
    const id = Number(
      await scalar("SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE NOMBRE='GUATEMALA_CIUDAD'"),
    );
    const anterior = await admin.get(`/api/catalogos/centros-trabajo/${id}`).expect(200);
    expect(anterior.body.data).toMatchObject({
      localidadAnterior: 'GUATEMALA_CIUDAD',
      idMunicipioGtPropuesto: municipio,
    });
    await admin
      .patch(`/api/catalogos/centros-trabajo/${id}`)
      .set('X-CSRF-Token', csrf)
      .send({ ...datos, nombre: 'Centro migrado' })
      .expect(200);
    expect(
      await scalar('SELECT LOCALIDAD_ANTERIOR FROM CENTROS_TRABAJO WHERE ID_CENTRO_TRABAJO=:id', {
        id,
      }),
    ).toBe('GUATEMALA_CIUDAD');
    expect(
      await scalar(
        "SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ENTIDAD='CENTROS_TRABAJO' AND ID_ENTIDAD=:id",
        { id },
      ),
    ).toBe(1);
    const lista = await admin
      .get('/api/catalogos/centros-trabajo')
      .query({ idDepartamentoGt: departamento, idMunicipioGt: municipio })
      .expect(200);
    expect(lista.body.data.total).toBe(2);
    await ejecutarSeeds(db, logger, seed);
    expect(
      await scalar('SELECT ID_MUNICIPIO_GT FROM CENTROS_TRABAJO WHERE ID_CENTRO_TRABAJO=:id', {
        id,
      }),
    ).toBe(municipio);
  });
  it.each(['RH', 'EMPLEADO'])('permite consulta del catálogo oficial al rol %s', async (rol) => {
    const usuario = `${rol.toLowerCase()}.ubicaciones`;
    await sql(
      `INSERT INTO USUARIOS(ID_ROL,USUARIO,CORREO,CONTRASENA_HASH,CAMBIO_OBLIGATORIO)
      SELECT R.ID_ROL,:usuario,:correo,U.CONTRASENA_HASH,0 FROM ROLES R CROSS JOIN USUARIOS U WHERE R.CODIGO=:rol AND U.USUARIO=:admin`,
      { usuario, correo: `${usuario}@example.test`, rol, admin: seed.ADMIN_USER },
    );
    const { agent } = await entrar(usuario, 'UbicacionesPrueba!2026');
    await agent.get('/api/ubicaciones/departamentos').expect(200);
    await agent.get('/api/ubicaciones/municipios').expect(200);
    if (rol === 'EMPLEADO') await agent.get('/api/catalogos/centros-trabajo').expect(403);
  });
});
