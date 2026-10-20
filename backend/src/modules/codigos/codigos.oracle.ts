import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import oracledb from 'oracledb';
import request from 'supertest';
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
import { generarCodigoGenerico } from './codigos.generador.js';
import { crearApp } from '../../app.js';
import { crearAuthService } from '../auth/auth.service.js';
import { crearUsuariosService } from '../usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { crearCodigosService } from './codigos.service.js';
import { crearCatalogosService } from '../catalogos/catalogos.service.js';
let db: BaseDatos;
const logger = crearLogger('silent');
const seed = validarEntornoSeeds(process.env);
const scalar = (sql: string, binds: oracledb.BindParameters = {}) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(sql, binds)).rows![0]![0]);
const sql = (query: string, binds: oracledb.BindParameters = {}) =>
  enTransaccion(db, (c) => c.execute(query, binds));
async function asignar(
  entidad: string,
  palabra: string | null = null,
  departamento: number | null = null,
  fecha: string | null = null,
) {
  return enTransaccion(db, async (c) => {
    const r = await c.execute<{ codigo: string }>(
      "BEGIN :codigo:=N2_CODIGOS.ASIGNAR(:entidad,:palabra,:departamento,TO_DATE(:fecha,'YYYY-MM-DD')); END;",
      {
        codigo: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 80 },
        entidad,
        palabra,
        departamento,
        fecha,
      },
    );
    return r.outBinds!.codigo;
  });
}
describe('FASE V1-3: códigos con Oracle real', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version < 21),
        crearMigracionesRepository(c),
        logger,
      ),
    );
    await sql("INSERT INTO DEPARTAMENTOS(CODIGO,NOMBRE) VALUES ('VIEJO_ING','Ingeniería')");
    await sql("INSERT INTO DEPARTAMENTOS(CODIGO,NOMBRE) VALUES ('VIEJO_VEN','Ventas')");
    await sql(
      "INSERT INTO PUESTOS(CODIGO,NOMBRE,ID_DEPARTAMENTO) SELECT 'VIEJO_PUE','Ingeniero',ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE CODIGO='VIEJO_ING'",
    );
    await sql(
      "INSERT INTO CENTROS_TRABAJO(CODIGO,NOMBRE,LOCALIDAD) VALUES ('VIEJO_SEDE','Sede central','GUATEMALA')",
    );
    await sql(
      "INSERT INTO TIPOS_CONTRATO(CODIGO,NOMBRE) VALUES ('INDEFINIDO','Por tiempo indefinido')",
    );
    for (const [codigo, ingreso, dpi, correo] of [
      ['DOS', '2025-01-01', '1111111111111', 'a@example.test'],
      ['UNO', '2024-01-01', '2222222222222', 'b@example.test'],
      ['TRES', '2024-01-01', '3333333333333', 'c@example.test'],
    ]) {
      await sql(
        `INSERT INTO EMPLEADOS(CODIGO,NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) SELECT '${codigo}','Persona','Migrada','${dpi}','${dpi}-K',DATE '1990-01-01','F','SOLTERO','Dirección','55551234','${correo}',P.ID_PUESTO,P.ID_DEPARTAMENTO,T.ID_TIPO_CONTRATO,C.ID_CENTRO_TRABAJO,DATE '${ingreso}' FROM PUESTOS P CROSS JOIN TIPOS_CONTRATO T CROSS JOIN CENTROS_TRABAJO C`,
      );
    }
    await sql(
      "INSERT INTO TIPOS_SOLICITUD(CODIGO,NOMBRE,GENERA_PDF,ES_DIRECTA) VALUES ('GAFETE','Gafete',0,0)",
    );
    await sql(
      "INSERT INTO SOLICITUDES(ID_EMPLEADO,ID_TIPO_SOLICITUD,FECHA_CREACION) SELECT ID_EMPLEADO,(SELECT ID_TIPO_SOLICITUD FROM TIPOS_SOLICITUD),DATE '2025-12-01' FROM EMPLEADOS FETCH FIRST 1 ROW ONLY",
    );
    await sql(
      "INSERT INTO ANUNCIOS(TITULO,CONTENIDO,VIGENTE_DESDE,VIGENTE_HASTA,PARA_TODOS) VALUES ('Aviso migrado','Contenido',DATE '2026-01-01',DATE '2026-12-31',1)",
    );
    await sql(
      "INSERT INTO JEFATURAS(CODIGO,NOMBRE,ID_DEPARTAMENTO) SELECT 'VIEJO_JEF','Coordinación',ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE CODIGO='VIEJO_ING'",
    );
    await sql("INSERT INTO HORARIOS(CODIGO,NOMBRE,JORNADA) VALUES ('VIEJO_HOR','Diurno','DIURNA')");
    await sql("INSERT INTO BANCOS(CODIGO,NOMBRE) VALUES ('VIEJO_BAN','Banco')");
    await sql(
      "INSERT INTO TIPOS_AUSENCIA(CODIGO,NOMBRE,EFECTO) VALUES ('VIEJO_AUS','Permiso','CON_GOCE')",
    );
    await sql("INSERT INTO TIPOS_DESCUENTO(CODIGO,NOMBRE) VALUES ('PRESTAMO','Préstamo')");
    await sql(
      "INSERT INTO FERIADOS(CODIGO,NOMBRE,FECHA,FECHA_CONMEMORACION,AMBITO,LOCALIDAD,MINUTO_INICIO,MINUTO_FIN,FUNDAMENTO) VALUES ('VIEJO_FER','Feriado prueba',DATE '2035-02-01',DATE '2035-02-01','NACIONAL','*',0,1440,'Prueba')",
    );
    await sql(
      "INSERT INTO PARAMETROS_LEGALES(CODIGO,NOMBRE,VALOR,UNIDAD,VIGENTE_DESDE,FUNDAMENTO,MOTIVO) VALUES ('VIEJO_PARAM','Parámetro previo',1,'CANTIDAD',DATE '2026-01-01','Prueba','Migración')",
    );
    await sql(
      "INSERT INTO DESCUENTOS_EMPLEADO(ID_EMPLEADO,ID_TIPO_DESCUENTO,MODALIDAD,MONTO_QUINCENA,MONTO_TOTAL,SALDO,NUMERO_CUOTAS,FECHA_INICIO,MOTIVO) SELECT ID_EMPLEADO,(SELECT ID_TIPO_DESCUENTO FROM TIPOS_DESCUENTO),'CUOTAS',50,100 TOTAL,100 SALDO,2,DATE '2026-01-01','Migración' FROM EMPLEADOS FETCH FIRST 1 ROW ONLY",
    );
    await sql(
      "INSERT INTO PRESTAMOS(ID_DESCUENTO_EMPLEADO,ID_EMPLEADO,CAPITAL,FECHA_DESEMBOLSO,REFERENCIA) SELECT ID_DESCUENTO_EMPLEADO,ID_EMPLEADO,100,DATE '2026-01-01','MIGRACION' FROM DESCUENTOS_EMPLEADO",
    );
    await sql(
      "INSERT INTO EVENTOS(TITULO,FECHA_INICIO,FECHA_FIN,LUGAR) VALUES ('Evento migrado',DATE '2030-01-01',DATE '2030-01-02','Oficina')",
    );
    expect(await ejecutarMigraciones(db, logger)).toBe(
      migraciones.filter((m) => m.version >= 21).length,
    );
    await ejecutarSeeds(db, logger, seed);
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('migra claves existentes y ordena empleados por ingreso e id sin perder referencias', async () => {
    expect(await scalar("SELECT CODIGO FROM DEPARTAMENTOS WHERE CODIGO_ANTERIOR='VIEJO_ING'")).toBe(
      'ING',
    );
    expect(await scalar("SELECT CODIGO FROM EMPLEADOS WHERE CODIGO_ANTERIOR='UNO'")).toBe(
      'EMP_ING_0001',
    );
    expect(await scalar("SELECT CODIGO FROM EMPLEADOS WHERE CODIGO_ANTERIOR='DOS'")).toBe(
      'EMP_ING_0003',
    );
    expect(await scalar('SELECT CODIGO FROM SOLICITUDES')).toBe('SOL_2025_0001');
    expect(
      await scalar('SELECT COUNT(*) FROM EMPLEADOS E JOIN PUESTOS P ON P.ID_PUESTO=E.ID_PUESTO'),
    ).toBe(3);
    expect(await scalar("SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'")).toBe(0);
  });
  it('renumera todos los catálogos y las cinco entidades transaccionales preservando filas', async () => {
    for (const tabla of [
      'DEPARTAMENTOS',
      'PUESTOS',
      'JEFATURAS',
      'HORARIOS',
      'CENTROS_TRABAJO',
      'TIPOS_CONTRATO',
      'TIPOS_DESCUENTO',
      'TIPOS_AUSENCIA',
      'TIPOS_SOLICITUD',
      'BANCOS',
      'FERIADOS',
      'PARAMETROS_LEGALES',
      'EMPLEADOS',
    ]) {
      expect(
        await scalar(
          // Las migraciones posteriores crean parámetros y el tipo B7 sin código previo.
          `SELECT COUNT(*) FROM ${tabla} WHERE CODIGO IS NULL OR (CODIGO_ANTERIOR IS NULL${tabla === 'PARAMETROS_LEGALES' ? " AND CLAVE_INTERNA='VIEJO_PARAM'" : tabla === 'TIPOS_AUSENCIA' ? " AND NOMBRE_NORMALIZADO<>N2_NOMBRE_NORMALIZADO('Inasistencia sin justificación')" : ''})`,
        ),
      ).toBe(0);
      expect(await scalar(`SELECT COUNT(*) FROM ${tabla} WHERE CODIGO=CODIGO_ANTERIOR`)).toBe(0);
    }
    for (const [tabla, prefijo] of [
      ['SOLICITUDES', 'SOL'],
      ['PRESTAMOS', 'PRE'],
      ['DESCUENTOS_EMPLEADO', 'DES'],
      ['EVENTOS', 'EVT'],
      ['ANUNCIOS', 'ANU'],
    ]) {
      expect(await scalar(`SELECT COUNT(*) FROM ${tabla}`)).toBe(1);
      expect(await scalar(`SELECT CODIGO FROM ${tabla}`)).toMatch(
        new RegExp(`^${prefijo}_[0-9]{4}_0001$`),
      );
      expect(await scalar(`SELECT CODIGO_ANTERIOR FROM ${tabla}`)).toBeNull();
    }
    expect(await scalar("SELECT CODIGO FROM EMPLEADOS WHERE CODIGO_ANTERIOR='TRES'")).toBe(
      'EMP_ING_0002',
    );
  });
  it('mantiene paridad entre TypeScript y PL/SQL', async () => {
    for (const palabra of [
      'Ingeniería',
      'Recursos Humanos',
      'Ñandú Ünico',
      'Dirección de Tecnología y de la Información',
      'de Ingeniería',
      ' ¡Niñez! @2026# ',
      'de la y',
    ]) {
      const r = await scalar('SELECT N2_CODIGOS.GENERICO(:p,4) FROM DUAL', { p: palabra });
      expect(r ?? '').toBe(generarCodigoGenerico(palabra, 4));
    }
  });
  it('resuelve opción B y sufijo y no reutiliza reservas', async () => {
    expect(await asignar('bancos', 'Ventas')).toBe('VEN');
    expect(await asignar('bancos', 'Ventas')).toBe('VNT');
    expect(await asignar('bancos', 'Ventas')).toBe('VEN2');
  });
  it('serializa 25 asignaciones paralelas, incluida la creación concurrente del contador', async () => {
    const codes = await Promise.all(
      Array.from({ length: 25 }, () => asignar('eventos', null, null, '2035-01-01')),
    );
    expect(new Set(codes).size).toBe(25);
    expect(codes.sort()).toEqual(
      Array.from({ length: 25 }, (_, i) => `EVT_2035_${String(i + 1).padStart(4, '0')}`),
    );
    const genericos = await Promise.all(
      Array.from({ length: 15 }, () => asignar('jefaturas', 'Gerencia')),
    );
    expect(new Set(genericos).size).toBe(15);
  });
  it('usa contadores por departamento/año y permite más de cuatro dígitos', async () => {
    const ing = Number(
      await scalar("SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE CODIGO='ING'"),
    );
    const ven = Number(
      await scalar("SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE CODIGO='VEN'"),
    );
    expect(await asignar('empleados', null, ing)).toBe('EMP_ING_0004');
    expect(await asignar('empleados', null, ven)).toBe('EMP_VEN_0001');
    expect(await asignar('eventos', null, null, '2036-01-01')).toBe('EVT_2036_0001');
    await sql(
      "UPDATE SECUENCIAS_CODIGOS SET ULTIMO_NUMERO=9999 WHERE ENTIDAD='eventos' AND AMBITO='2036'",
    );
    expect(await asignar('eventos', null, null, '2036-01-01')).toBe('EVT_2036_10000');
  });
  it('revierte contador/reserva con la operación fallida y conserva códigos al trasladar', async () => {
    const previo = await scalar("SELECT N2_CODIGOS.VISTA_PREVIA('prestamos') FROM DUAL");
    await expect(
      enTransaccion(db, async (c) => {
        await c.execute(
          "BEGIN DECLARE V VARCHAR2(80); BEGIN V:=N2_CODIGOS.ASIGNAR('prestamos'); END; END;",
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await scalar("SELECT N2_CODIGOS.VISTA_PREVIA('prestamos') FROM DUAL")).toBe(previo);
    await sql(
      "INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) SELECT 'Vendedor',ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE CODIGO='VEN'",
    );
    await sql(
      "UPDATE EMPLEADOS SET ID_DEPARTAMENTO=(SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE CODIGO='VEN'),ID_PUESTO=(SELECT ID_PUESTO FROM PUESTOS WHERE NOMBRE='Vendedor') WHERE CODIGO_ANTERIOR='UNO'",
    );
    expect(await scalar("SELECT CODIGO FROM EMPLEADOS WHERE CODIGO_ANTERIOR='UNO'")).toBe(
      'EMP_ING_0001',
    );
    await expect(
      sql("UPDATE EMPLEADOS SET CODIGO='MANUAL' WHERE CODIGO_ANTERIOR='UNO'"),
    ).rejects.toMatchObject({ errorNum: 20042 });
  });
  it('seeds repetibles y vigencias conservan claves semánticas y código', async () => {
    const antes = await scalar('SELECT COUNT(*) FROM REGISTRO_CODIGOS');
    await ejecutarSeeds(db, logger, seed);
    expect(await scalar('SELECT COUNT(*) FROM REGISTRO_CODIGOS')).toBe(antes);
    const codigo = await scalar(
      "SELECT CODIGO FROM PARAMETROS_LEGALES WHERE CODIGO_ANTERIOR='IGSS_LABORAL_PORCENTAJE'",
    );
    await sql(
      "INSERT INTO PARAMETROS_LEGALES(CODIGO,NOMBRE,VALOR,UNIDAD,VIGENTE_DESDE,FUNDAMENTO,MOTIVO) SELECT CODIGO,'Nombre cambiado',VALOR,UNIDAD,DATE '2035-01-01',FUNDAMENTO,MOTIVO FROM PARAMETROS_LEGALES WHERE CODIGO_ANTERIOR='IGSS_LABORAL_PORCENTAJE'",
    );
    expect(
      await scalar(
        "SELECT COUNT(*) FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA='IGSS_LABORAL_PORCENTAJE' AND CODIGO=:codigo",
        { codigo: String(codigo) },
      ),
    ).toBe(2);
  });
  it('API protegida, previsualización sin reserva y código del cliente ignorado', async () => {
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
        codigos: crearCodigosService(db),
        catalogos: crearCatalogosService(db),
        config,
      },
    );
    await request(app)
      .get('/api/codigos/vista-previa?entidad=departamentos&palabra=Compras')
      .expect(401);
    const agent = request.agent(app);
    let csrf = (await agent.get('/api/auth/csrf')).body.data.csrfToken as string;
    csrf = (
      await agent
        .post('/api/auth/login')
        .set('X-CSRF-Token', csrf)
        .send({ usuario: seed.ADMIN_USER, contrasena: seed.ADMIN_PASSWORD })
        .expect(200)
    ).body.data.csrfToken;
    await agent.get('/api/codigos/vista-previa?entidad=departamentos&palabra=Compras').expect(403);
    csrf = (
      await agent
        .post('/api/auth/cambiar-contrasena')
        .set('X-CSRF-Token', csrf)
        .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'CodigosPrueba!2026' })
        .expect(200)
    ).body.data.csrfToken;
    const antes = await scalar('SELECT COUNT(*) FROM REGISTRO_CODIGOS');
    const vista = await agent
      .get('/api/codigos/vista-previa?entidad=departamentos&palabra=Compras')
      .expect(200);
    expect(vista.body.data).toEqual({ codigo: 'COM', definitivo: false });
    expect(await scalar('SELECT COUNT(*) FROM REGISTRO_CODIGOS')).toBe(antes);
    await agent.get('/api/codigos/vista-previa?entidad=tabla_inyectada').expect(400);
    const creado = await agent
      .post('/api/catalogos/departamentos')
      .set('X-CSRF-Token', csrf)
      .send({ nombre: 'Compras', descripcion: null, codigo: 'MANUAL' })
      .expect(201);
    expect(creado.body.data.codigo).toBe('COM');
    const editado = await agent
      .patch(`/api/catalogos/departamentos/${creado.body.data.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ nombre: 'Nombre distinto', descripcion: null, codigo: 'CAMBIADO' })
      .expect(200);
    expect(editado.body.data.codigo).toBe('COM');
    const body = {
      nombre: 'Salario mínimo mensual',
      valor: '5000',
      unidad: 'QUETZALES',
      vigenteDesde: '2027-01-01',
      vigenteHasta: null,
      fundamento: 'Prueba aislada',
      motivo: 'Configuración de prueba',
      confirmado: true,
    };
    const parametro = await agent
      .post('/api/catalogos/parametros-legales')
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(201);
    expect(parametro.body.data.codigo).toBe('SMM');
    expect(parametro.body.data.claveInterna).toBe('SALARIO_MINIMO_MENSUAL');
    expect(parametro.body.data.codigoAnterior).toBeNull();
    await agent
      .post('/api/catalogos/parametros-legales')
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(409);
    const version = await agent
      .patch(`/api/catalogos/parametros-legales/${parametro.body.data.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ ...body, nombre: 'Mínimo renombrado', vigenteDesde: '2027-02-01' })
      .expect(200);
    expect(version.body.data.codigo).toBe('SMM');
    expect(version.body.data.claveInterna).toBe('SALARIO_MINIMO_MENSUAL');
  });
});
