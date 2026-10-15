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
import { crearPrestacionesService } from './prestaciones.service.js';
import { crearNominaService } from '../nomina/nomina.service.js';
import { entradaPrueba } from '../nomina/nomina.fixture.js';
import { calcularNomina } from '../nomina/nomina.calculo.js';
import { guardarResultado } from '../nomina/nomina.repository.js';
import { fuenteUtilizada } from './prestaciones.repository.js';
import type { ActorAuditoria } from '../auth/auth.types.js';
let db: BaseDatos,
  app: Express,
  admin: ActorAuditoria,
  empleado: number,
  dep: number,
  cuenta: { idUsuario: number; usuario: string; contrasenaTemporal: string };
let agent: ReturnType<typeof request.agent>, csrf: string, prestacion: number, huella: string;
const seed = validarEntornoSeeds(process.env),
  logger = crearLogger('silent'),
  seleccion = () => ({ tipo: 'BONO_14', anio: 2026, idEmpleado: empleado });
const motivo = 'Verificación real de prestaciones fase nueve';
async function ejecutar(sql: string, binds: BindParameters = {}) {
  return enTransaccion(db, (c) => c.execute(sql, binds));
}
async function escalar(sql: string, binds: BindParameters = {}) {
  return db.conConexion(async (c) => (await c.execute<unknown[]>(sql, binds)).rows?.[0]?.[0]);
}
async function entrar(usuario: string, contrasena: string) {
  const a = request.agent(app),
    inicio = await a.get('/api/auth/csrf').expect(200);
  const login = await a
    .post('/api/auth/login')
    .set('X-CSRF-Token', inicio.body.data.csrfToken)
    .send({ usuario, contrasena })
    .expect(200);
  return { agent: a, csrf: login.body.data.csrfToken as string };
}
const post = (ruta: string, body: object, status = 200) =>
  agent.post(`/api/prestaciones${ruta}`).set('X-CSRF-Token', csrf).send(body).expect(status);
async function preview() {
  return (await post('/previsualizar', seleccion())).body.data;
}
describe('Fase 9: Oracle real, permisos, snapshots y liquidación atómica', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo se permiten esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    await ejecutarMigraciones(db, logger);
    await ejecutarSeeds(db, logger, seed);
    const auth = await crearAuthService(db, {
      NODE_ENV: 'test',
      SESSION_IDLE_MINUTES: 30,
      LOGIN_RATE_LIMIT: 1000,
      LOGIN_RATE_WINDOW_MINUTES: 15,
      TRUST_PROXY_CIDRS: '',
    });
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
        auth,
        usuarios: crearUsuariosService(db),
        auditoria: crearAuditoriaService(db),
        prestaciones: crearPrestacionesService(db),
        nomina: crearNominaService(db),
        config: {
          NODE_ENV: 'test',
          SESSION_IDLE_MINUTES: 30,
          LOGIN_RATE_LIMIT: 1000,
          LOGIN_RATE_WINDOW_MINUTES: 15,
          TRUST_PROXY_CIDRS: '',
        },
      },
    );
    const sesion = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD);
    agent = sesion.agent;
    const cambio = await agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', sesion.csrf)
      .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'FaseNueve!2026' })
      .expect(200);
    csrf = cambio.body.data.csrfToken;
    admin = {
      idUsuario: Number(
        await escalar('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO=:u', { u: seed.ADMIN_USER }),
      ),
      idRol: Number(await escalar("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN'")),
      rol: 'ADMIN',
      ip: '127.0.0.1',
    };
    cuenta = await enTransaccion(db, (c) =>
      crearUsuarioInterno(c, admin, {
        nombre: 'Persona',
        apellido: 'Prestaciones',
        correo: 'f9@example.test',
        rol: 'EMPLEADO',
      }),
    );
    await ejecutar('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', {
      id: cuenta.idUsuario,
    });
    await ejecutar("INSERT INTO DEPARTAMENTOS (CODIGO,NOMBRE) VALUES ('F9','Departamento F9')");
    dep = Number(
      await escalar(
        "SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NVL(CODIGO_ANTERIOR,CODIGO)='F9'",
      ),
    );
    await ejecutar(
      "INSERT INTO PUESTOS (CODIGO,NOMBRE,ID_DEPARTAMENTO) VALUES ('F9','Puesto F9',:dep)",
      { dep },
    );
    await ejecutar(
      "INSERT INTO CENTROS_TRABAJO (CODIGO,NOMBRE,LOCALIDAD) VALUES ('F9','Centro F9','PRUEBA')",
    );
    await ejecutar(
      "INSERT INTO CONFIGURACION_EMPRESA (RAZON_SOCIAL,NIT,DIRECCION,CORREO) VALUES ('Empresa de pruebas F9','1234567-9','Dirección de pruebas','empresa@example.test')",
    );
    const puesto = await escalar(
        "SELECT ID_PUESTO FROM PUESTOS WHERE NVL(CODIGO_ANTERIOR,CODIGO)='F9'",
      ),
      centro = await escalar(
        "SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE NVL(CODIGO_ANTERIOR,CODIGO)='F9'",
      ),
      contrato = await escalar('SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO');
    await ejecutar(
      "INSERT INTO EMPLEADOS (CODIGO,ID_USUARIO,NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) VALUES ('F9',:usuario,'Persona','Prestaciones','9876543210123','1234567-9',DATE '1995-01-01','F','SOLTERO','Dirección','55551234','empleado@example.test',:puesto,:dep,:contrato,:centro,DATE '2026-01-01')",
      {
        usuario: cuenta.idUsuario,
        puesto: Number(puesto),
        dep,
        contrato: Number(contrato),
        centro: Number(centro),
      },
    );
    empleado = Number(
      await escalar("SELECT ID_EMPLEADO FROM EMPLEADOS WHERE NVL(CODIGO_ANTERIOR,CODIGO)='F9'"),
    );
    await ejecutar(
      "INSERT INTO HISTORIAL_SALARIAL (ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,VIGENTE_HASTA,MOTIVO) VALUES (:id,3000,DATE '2026-01-01',DATE '2026-03-31','Historia real de prueba')",
      { id: empleado },
    );
    await ejecutar(
      "INSERT INTO HISTORIAL_SALARIAL (ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES (:id,5000,DATE '2026-04-01','Aumento de prueba')",
      { id: empleado },
    );
    await ejecutar(
      "INSERT INTO PERIODOS_NOMINA (FECHA_INICIO,FECHA_FIN,QUINCENA) VALUES (DATE '2026-03-16',DATE '2026-03-31',2)",
    );
    const periodo = Number(
      await escalar(
        "SELECT ID_PERIODO_NOMINA FROM PERIODOS_NOMINA WHERE FECHA_INICIO=DATE '2026-03-16'",
      ),
    );
    await ejecutar(
      "INSERT INTO COMISIONES (ID_EMPLEADO,ID_PERIODO_NOMINA,MONTO,REFERENCIA,DESCRIPCION) VALUES (:e,:p,1200,'F9_COMISION','Comisión variable real de prueba')",
      { e: empleado, p: periodo },
    );
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  beforeAll(async () => {
    await prepararFirmantePrueba(db, admin.idUsuario);
  });
  it('RBAC, CSRF y validación estricta', async () => {
    const e = await entrar(cuenta.usuario, cuenta.contrasenaTemporal);
    await e.agent.get('/api/prestaciones').expect(403);
    await e.agent
      .get('/api/prestaciones/constancia')
      .query({ idEmpleado: empleado, inicio: '2026-01-01', fin: '2026-06-30' })
      .expect(403);
    await agent.post('/api/prestaciones/previsualizar').send(seleccion()).expect(403);
    await post('/simular', { idEmpleado: empleado, corte: '2026-02-30', causa: 'RENUNCIA' }, 400);
  });
  it('bloquea finiquito cuando falta registrar una prestación de un ciclo anterior', async () => {
    const corte = String(
      await escalar(
        "SELECT TO_CHAR(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),'YYYY-MM-DD') FROM DUAL",
      ),
    );
    const r = await post('/simular', { idEmpleado: empleado, corte, causa: 'RENUNCIA' }, 409);
    expect(r.body.error.mensaje).toContain('Falta registrar el pago de BONO_14');
  });
  it('vista masiva con aumento, comisión variable y proporcionalidad', async () => {
    const p = await preview();
    expect(p.filas).toHaveLength(1);
    expect(p.filas[0].error).toBeUndefined();
    expect(p.filas[0].componentes[0]).toMatchObject({
      promedio: '4200.00',
      monto: '2100.00',
      exento: '2100.00',
      gravado: '0.00',
    });
    huella = p.hash;
  });
  it('revalida fuentes y registra lote sin pagar', async () => {
    await ejecutar("UPDATE COMISIONES SET MONTO=1800 WHERE REFERENCIA='F9_COMISION'");
    await post(
      '/calcular',
      { seleccion: seleccion(), hash: huella, motivo, confirmado: true },
      409,
    );
    const p = await preview();
    const r = await post(
      '/calcular',
      { seleccion: seleccion(), hash: p.hash, motivo, confirmado: true },
      201,
    );
    prestacion = r.body.data.ids[0];
    const d = await agent.get(`/api/prestaciones/${prestacion}`).expect(200);
    huella = d.body.data.hash;
    expect(d.body.data).toMatchObject({ estado: 'CALCULADA', total: '2150' });
    await post(
      `/${prestacion}/pagar`,
      { hash: huella, motivo, confirmado: true, fechaPago: '2026-10-12', referencia: 'F9_PAGO' },
      409,
    );
  });
  it('aprobación concurrente única, pago idempotente y PDF', async () => {
    const respuestas = await Promise.all(
      [1, 2].map(() =>
        agent
          .post(`/api/prestaciones/${prestacion}/aprobar`)
          .set('X-CSRF-Token', csrf)
          .send({ hash: huella, motivo, confirmado: true }),
      ),
    );
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    const hoy = String(
      await escalar(
        "SELECT TO_CHAR(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),'YYYY-MM-DD') FROM DUAL",
      ),
    );
    await post(`/${prestacion}/pagar`, {
      hash: huella,
      motivo,
      confirmado: true,
      fechaPago: hoy,
      referencia: 'F9_PAGO',
    });
    await post(
      `/${prestacion}/pagar`,
      { hash: huella, motivo, confirmado: true, fechaPago: hoy, referencia: 'F9_PAGO' },
      409,
    );
    const pdf = await agent.get(`/api/prestaciones/${prestacion}/pdf`).expect(200);
    expect(Buffer.from(pdf.body.data.base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    await mkdir('../tmp/pdfs', { recursive: true });
    await writeFile(
      '../tmp/pdfs/prestacion-oracle.pdf',
      Buffer.from(pdf.body.data.base64, 'base64'),
    );
  });
  it('filtros, orden, CSV y constancia con pagos reales', async () => {
    const r = await agent
      .get('/api/prestaciones')
      .query({
        idDepartamento: dep,
        estado: 'PAGADA',
        buscar: 'Prestaciones',
        ordenarPor: 'total',
        direccion: 'asc',
      })
      .expect(200);
    expect(r.body.data.total).toBe(1);
    const csv = await agent
      .get('/api/prestaciones/exportar')
      .query({ idEmpleado: empleado })
      .expect(200);
    expect(Buffer.from(csv.body.data.base64, 'base64').toString()).toContain('2150');
    const pdf = await agent
      .get('/api/prestaciones/constancia')
      .query({ idEmpleado: empleado, inicio: '2026-01-01', fin: '2026-12-31' })
      .expect(409);
    expect(pdf.body.error.mensaje).toContain('hoy');
    const hoy = String(
      await escalar(
        "SELECT TO_CHAR(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),'YYYY-MM-DD') FROM DUAL",
      ),
    );
    const documento = await agent
      .get('/api/prestaciones/constancia')
      .query({ idEmpleado: empleado, inicio: '2026-01-01', fin: hoy })
      .expect(200);
    await writeFile(
      '../tmp/pdfs/constancia-oracle.pdf',
      Buffer.from(documento.body.data.base64, 'base64'),
    );
  });
  it('snapshot pagado entra al ISR con exención congelada', async () => {
    const e = entradaPrueba();
    e.prestaciones = [{ id: prestacion, tipo: 'BONO_14', monto: '2150', exento: '2150' }];
    expect(calcularNomina(e).isr.renta).toBe(calcularNomina({ ...e, prestaciones: [] }).isr.renta);
    expect(
      Number(
        await escalar(
          "SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ENTIDAD='PRESTACIONES' AND ID_ENTIDAD=:id",
          { id: prestacion },
        ),
      ),
    ).toBeGreaterThan(2);
  });
  it('finiquito al cierre del ciclo descuenta el Bono 14 ya pagado', async () => {
    const r = await post('/simular', {
      idEmpleado: empleado,
      corte: '2026-06-30',
      causa: 'RENUNCIA',
    });
    expect(
      r.body.data.componentes.find((c: { concepto: string }) => c.concepto === 'BONO_14'),
    ).toMatchObject({ monto: '0.00', exento: '0.00', gravado: '0.00' });
  });
  it('finiquito: rollback real de baja, vacaciones y prestación ante fallo de auditoría', async () => {
    const corte = String(
      await escalar(
        "SELECT TO_CHAR(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),'YYYY-MM-DD') FROM DUAL",
      ),
    );
    const seleccion = { idEmpleado: empleado, corte, causa: 'DESPIDO_INJUSTIFICADO' };
    const p = await post('/simular', seleccion);
    expect(p.body.data.componentes).toHaveLength(4);
    expect(
      p.body.data.componentes.find(
        (c: { concepto: string }) => c.concepto === 'VACACIONES_PENDIENTES',
      ).tiempo,
    ).toBe('11.25');
    await ejecutar(
      "CREATE OR REPLACE TRIGGER F9_FALLAR BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='LIQUIDAR_Y_DAR_BAJA' THEN RAISE_APPLICATION_ERROR(-20099,'Fallo de prueba'); END IF; END;",
    );
    try {
      await post('/liquidar', { seleccion, hash: p.body.data.hash, motivo, confirmado: true }, 500);
    } finally {
      await ejecutar('DROP TRIGGER F9_FALLAR');
    }
    expect(
      await escalar('SELECT ESTADO FROM EMPLEADOS WHERE ID_EMPLEADO=:id', { id: empleado }),
    ).toBe('ACTIVO');
    expect(
      Number(await escalar("SELECT COUNT(*) FROM PRESTACIONES WHERE TIPO='INDEMNIZACION'")),
    ).toBe(0);
    expect(
      Number(
        await escalar(
          "SELECT COUNT(*) FROM VACACIONES_MOVIMIENTOS WHERE CLAVE_ORIGEN LIKE 'FINIQUITO:%'",
        ),
      ),
    ).toBe(0);
    const actual = await post('/simular', seleccion);
    const r = await post(
      '/liquidar',
      { seleccion, hash: actual.body.data.hash, motivo, confirmado: true },
      201,
    );
    expect(
      await escalar('SELECT ESTADO FROM EMPLEADOS WHERE ID_EMPLEADO=:id', { id: empleado }),
    ).toBe('EGRESADO');
    expect(
      Number(
        await escalar('SELECT ACTIVO FROM USUARIOS WHERE ID_USUARIO=:id', { id: cuenta.idUsuario }),
      ),
    ).toBe(0);
    await post(
      '/liquidar',
      { seleccion, hash: actual.body.data.hash, motivo, confirmado: true },
      409,
    );
    const d = await agent.get(`/api/prestaciones/${r.body.data.id}`).expect(200);
    expect(d.body.data.estado).toBe('APROBADA');
    const pdf = await agent.get(`/api/prestaciones/${r.body.data.id}/pdf`).expect(200);
    await writeFile(
      '../tmp/pdfs/finiquito-oracle.pdf',
      Buffer.from(pdf.body.data.base64, 'base64'),
    );
  });
  it('cierre referenciado queda protegido y permite constancia de nómina cerrada', async () => {
    const entrada = entradaPrueba();
    entrada.empleado.id = empleado;
    entrada.empleado.egreso = '2026-10-12';
    entrada.inicio = '2026-01-01';
    entrada.fin = '2026-01-15';
    entrada.salarios[0]!.id = Number(
      await escalar(
        'SELECT MIN(ID_HISTORIAL_SALARIAL) FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id',
        { id: empleado },
      ),
    );
    await ejecutar(
      "INSERT INTO PERIODOS_NOMINA (FECHA_INICIO,FECHA_FIN,QUINCENA,ESTADO,VERSION_CALCULO,APROBADO_EN,APROBADO_POR,CERRADO_EN,CERRADO_POR) VALUES (DATE '2026-01-01',DATE '2026-01-15',1,'CERRADO',1,SYSDATE,:a,SYSDATE,:a)",
      { a: admin.idUsuario },
    );
    const periodo = Number(
      await escalar(
        "SELECT ID_PERIODO_NOMINA FROM PERIODOS_NOMINA WHERE FECHA_INICIO=DATE '2026-01-01'",
      ),
    );
    const id = await enTransaccion(db, async (c) => {
      const n = await guardarResultado(
        c,
        {
          id: periodo,
          inicio: entrada.inicio,
          fin: entrada.fin,
          estado: 'CERRADO',
          version: 1,
          hash: null,
          alertas: '[]',
          empleados: 1,
          ingresos: '0',
          descuentos: '0',
          neto: '0',
          patronal: '0',
        },
        entrada,
        calcularNomina(entrada),
        admin.idUsuario,
        null,
      );
      await c.execute(
        "UPDATE NOMINA_EMPLEADO SET FECHA_PAGO=DATE '2026-01-15' WHERE ID_NOMINA_EMPLEADO=:id",
        { id: n },
      );
      return n;
    });
    await ejecutar(
      'UPDATE PRESTACIONES SET SNAPSHOT=JSON_MERGEPATCH(SNAPSHOT,:j RETURNING CLOB) WHERE ID_PRESTACION=:id',
      { id: prestacion, j: JSON.stringify({ nominas: [id] }) },
    );
    expect(await db.conConexion((c) => fuenteUtilizada(c, id))).toBe(true);
    const r = await agent
      .post(`/api/nomina/periodos/${periodo}/reabrir`)
      .set('X-CSRF-Token', csrf)
      .send({ version: 1, motivo, confirmado: true })
      .expect(409);
    expect(r.body.error.mensaje).toContain('prestaciones');
    await agent
      .get('/api/prestaciones/constancia')
      .query({ idEmpleado: empleado, inicio: '2026-01-01', fin: '2026-01-31' })
      .expect(200);
  });
});
