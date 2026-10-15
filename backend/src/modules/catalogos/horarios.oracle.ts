import { crearNovedadesService } from '../novedades/novedades.service.js';
import { jornadasEmpleado } from '../../shared/horarios/horarios.repository.js';
import { horasDiariasEnFecha } from '../../shared/horarios/horas.js';
import { crearUsuariosService } from '../usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { distribucionHorarioSql } from '../../shared/horarios/horarios.repository.js';
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
import { bloquesHorario } from './catalogos.repository.js';
import { horarios } from '../vacaciones/vacaciones.repository.js';
import { diasLaboralesRango } from '../../shared/horarios/calendario.js';
let db: BaseDatos,
  app: ReturnType<typeof crearApp>,
  agent: ReturnType<typeof request.agent>,
  csrf: string;
const logger = crearLogger('silent'),
  seed = validarEntornoSeeds(process.env);
const bloque = {
  dias: [1, 2, 3, 4, 5],
  entrada: '08:00',
  salida: '17:00',
  cruzaMedianoche: false,
  minutosDescanso: 60,
};
const cuerpo = (nombre: string) => ({ nombre, descripcion: null, bloques: [bloque] });
const sql = (query: string) => enTransaccion(db, (c) => c.execute(query));
const scalar = (query: string) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(query)).rows![0]![0]);
const crear = (body: object) =>
  agent.post('/api/catalogos/horarios').set('X-CSRF-Token', csrf).send(body);
describe('FASE V1-6: migración y horarios en Oracle', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version < 24),
        crearMigracionesRepository(c),
        logger,
      ),
    );
    await ejecutarSeeds(db, logger, seed);
    await sql(
      "INSERT INTO HORARIOS(CODIGO,NOMBRE,JORNADA) VALUES ('HISTORICO','Patrón histórico','DIURNA')",
    );
    await sql(
      "INSERT INTO HORARIO_DIAS(ID_HORARIO,DIA_SEMANA,LABORABLE,MINUTO_ENTRADA,MINUTO_SALIDA,CRUZA_MEDIANOCHE,MINUTOS_DESCANSO) SELECT ID_HORARIO,LEVEL,1,495,1005,0,45 FROM HORARIOS WHERE CODIGO_ANTERIOR='HISTORICO' CONNECT BY LEVEL<=5",
    );
    await sql(
      "INSERT INTO HORARIO_DIAS(ID_HORARIO,DIA_SEMANA,LABORABLE,MINUTO_ENTRADA,MINUTO_SALIDA,CRUZA_MEDIANOCHE,MINUTOS_DESCANSO) SELECT ID_HORARIO,6,1,1320,270,1,15 FROM HORARIOS WHERE CODIGO_ANTERIOR='HISTORICO'",
    );
    expect(await ejecutarMigraciones(db, logger)).toBe(2);
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
        catalogos: crearCatalogosService(db),
        novedades: crearNovedadesService(db),
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
        .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'HorariosPrueba!2026' })
        .expect(200)
    ).body.data.csrfToken;
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('agrupa sin redondear tiempos, conserva nocturnos y descansos y es idempotente', async () => {
    const id = Number(
      await scalar("SELECT ID_HORARIO FROM HORARIOS WHERE CODIGO_ANTERIOR='HISTORICO'"),
    );
    const bloques = await db.conConexion((c) => bloquesHorario(c, id));
    expect(bloques).toHaveLength(2);
    expect(bloques.find((b) => b.dias.length === 5)).toEqual({
      dias: [1, 2, 3, 4, 5],
      entrada: '08:15',
      salida: '16:45',
      cruzaMedianoche: false,
      minutosDescanso: 45,
    });
    expect(bloques.find((b) => b.dias.length === 1)).toEqual({
      dias: [6],
      entrada: '22:00',
      salida: '04:30',
      cruzaMedianoche: true,
      minutosDescanso: 15,
    });
    expect(
      await scalar(
        `SELECT COUNT(*) FROM (SELECT ID_HORARIO,DIA_SEMANA,MINUTO_ENTRADA,MINUTO_SALIDA,MINUTOS_DESCANSO,CRUZA_MEDIANOCHE FROM HORARIO_DIAS WHERE LABORABLE=1 AND ACTIVO=1 MINUS SELECT ID_HORARIO,DIA_SEMANA,MINUTO_ENTRADA,MINUTO_SALIDA,MINUTOS_DESCANSO,CRUZA_MEDIANOCHE FROM (${distribucionHorarioSql}) WHERE LABORABLE=1)`,
      ),
    ).toBe(0);
    expect(await ejecutarMigraciones(db, logger)).toBe(0);
    await agent
      .patch(`/api/catalogos/horarios/${id}`)
      .set('X-CSRF-Token', csrf)
      .send({ nombre: 'Histórico conservado', descripcion: 'Solo metadatos', bloques })
      .expect(200);
  });
  it('protege acceso/CSRF y calcula jornada y código sin confiar en el cliente', async () => {
    await request(app).get('/api/catalogos/horarios').expect(401);
    await agent.post('/api/catalogos/horarios').send(cuerpo('Sin CSRF')).expect(403);
    const r = await crear({
      ...cuerpo('Turno nuevo'),
      jornada: 'NOCTURNA',
      codigo: 'MANUAL',
    }).expect(201);
    expect(r.body.data.jornada).toBe('DIURNA');
    expect(r.body.data.codigo).not.toBe('MANUAL');
    expect(r.body.data.bloques).toEqual([bloque]);
    const reglas = await agent.get('/api/catalogos/restricciones').expect(200);
    expect(reglas.body.data.limitesHorario.DIURNA).toEqual({ diarias: 8, semanales: 44 });
  });
  it('valida horas, descanso, límites diarios/semanales y solape de domingo a lunes', async () => {
    await crear({
      ...cuerpo('Fuera del límite'),
      bloques: [{ ...bloque, salida: '18:00' }],
    }).expect(409);
    await crear({
      ...cuerpo('Semana excesiva'),
      bloques: [{ ...bloque, dias: [1, 2, 3, 4, 5, 6] }],
    }).expect(409);
    await crear({ ...cuerpo('Minutos libres'), bloques: [{ ...bloque, entrada: '08:15' }] }).expect(
      409,
    );
    await crear({ ...cuerpo('Sin descanso'), bloques: [{ ...bloque, minutosDescanso: 0 }] }).expect(
      409,
    );
    await crear({
      ...cuerpo('Cruce inválido'),
      bloques: [{ ...bloque, entrada: '22:00', salida: '05:00' }],
    }).expect(400);
    await crear({
      ...cuerpo('Solape semanal'),
      bloques: [
        { ...bloque, dias: [7], entrada: '22:00', salida: '05:00', cruzaMedianoche: true },
        { ...bloque, dias: [1], entrada: '04:30', salida: '10:00' },
      ],
    }).expect(400);
    await crear({
      ...cuerpo('Nocturno correcto'),
      bloques: [{ ...bloque, entrada: '22:00', salida: '05:00', cruzaMedianoche: true }],
    }).expect(201);
  });
  it('usa parámetros vigentes y los revisa de nuevo al guardar', async () => {
    await sql(
      "UPDATE PARAMETROS_LEGALES SET VALOR=35 WHERE CLAVE_INTERNA='JORNADA_DIURNA_HORAS_SEMANA'",
    );
    try {
      await crear(cuerpo('Límite vigente')).expect(409);
    } finally {
      await sql(
        "UPDATE PARAMETROS_LEGALES SET VALOR=44 WHERE CLAVE_INTERNA='JORNADA_DIURNA_HORAS_SEMANA'",
      );
    }
  });
  it('admite varios bloques y días con sábado, filtra descansos y conserva vacaciones', async () => {
    const r = await crear({
      ...cuerpo('Con sábado'),
      bloques: [bloque, { ...bloque, dias: [6], salida: '12:30', minutosDescanso: 30 }],
    }).expect(201);
    const id = r.body.data.id;
    expect(
      (
        await agent
          .get('/api/catalogos/horarios')
          .query({ codigo: r.body.data.codigo, diaSemana: 6, horasMax: '4' })
          .expect(200)
      ).body.data.total,
    ).toBe(1);
    expect(
      (
        await agent
          .get('/api/catalogos/horarios')
          .query({ codigo: r.body.data.codigo, diaSemana: 7, laborable: 0 })
          .expect(200)
      ).body.data.total,
    ).toBe(1);
    await sql("INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES ('Área horarios')");
    await sql(
      "INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) SELECT 'Puesto horarios',ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NOMBRE='Área horarios'",
    );
    await sql(
      "INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES('Centro horarios','GUATEMALA_CIUDAD')",
    );
    await sql(
      "INSERT INTO EMPLEADOS(NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) SELECT 'Persona','Horarios','1234567890123','1234567-9',DATE '1990-01-01','M','SOLTERO','Dirección','55551234','horarios@example.test',P.ID_PUESTO,P.ID_DEPARTAMENTO,(SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO),(SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE NOMBRE='Centro horarios'),DATE '2026-01-01' FROM PUESTOS P WHERE P.NOMBRE='Puesto horarios'",
    );
    const empleado = Number(
      await scalar("SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CORREO='horarios@example.test'"),
    );
    await sql(
      `INSERT INTO EMPLEADO_HORARIO(ID_EMPLEADO,ID_HORARIO,VIGENTE_DESDE,MOTIVO) VALUES(${empleado},${id},DATE '2026-01-01','Asignación de prueba')`,
    );
    await sql(
      `INSERT INTO HISTORIAL_SALARIAL(ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES(${empleado},3000,DATE '2026-01-01','Salario para prueba de horas')`,
    );
    const jornadas = await db.conConexion((c) => jornadasEmpleado(c, empleado));
    expect(horasDiariasEnFecha(jornadas, '2026-10-10').toString()).toBe('4');
    const preview = await agent
      .post('/api/novedades/horas-extra/previsualizar')
      .set('X-CSRF-Token', csrf)
      .send({
        idEmpleado: empleado,
        fecha: '2026-10-10',
        horas: '2',
        jornada: 'NOCTURNA',
        estado: 'PENDIENTE',
        motivo: 'Horas de prueba',
      })
      .expect(200);
    expect(preview.body.data.calculo.monto).toBe('75.00');
    const asignaciones = await db.conConexion((c) => horarios(c, empleado));
    expect(asignaciones[0]!.dias).toEqual([1, 2, 3, 4, 5, 6]);
    expect(
      diasLaboralesRango('2026-11-01', '2026-11-15', asignaciones, ['2026-11-07']).filter(
        (d) => d.laborable,
      ),
    ).toHaveLength(11);
    await agent
      .patch(`/api/catalogos/horarios/${id}`)
      .set('X-CSRF-Token', csrf)
      .send({ ...cuerpo('Cambio asignado'), bloques: [bloque] })
      .expect(409);
    const copia = await crear({
      ...r.body.data,
      nombre: 'Duplicado',
      id: undefined,
      activo: undefined,
      enUso: undefined,
      codigoAnterior: undefined,
    }).expect(201);
    expect(copia.body.data.codigo).not.toBe(r.body.data.codigo);
  });
  it('revierte bloques, días, código y entidad si falla auditoría', async () => {
    const antes = await scalar('SELECT COUNT(*) FROM HORARIO_BLOQUES');
    await sql(
      "CREATE OR REPLACE TRIGGER TR_FALLO_HORARIOS BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ENTIDAD='HORARIOS' THEN RAISE_APPLICATION_ERROR(-20990,'Fallo de prueba'); END IF; END;",
    );
    try {
      await crear(cuerpo('Rollback horario')).expect(500);
    } finally {
      await sql('DROP TRIGGER TR_FALLO_HORARIOS');
    }
    expect(await scalar('SELECT COUNT(*) FROM HORARIO_BLOQUES')).toBe(antes);
    expect(await scalar("SELECT COUNT(*) FROM HORARIOS WHERE NOMBRE='Rollback horario'")).toBe(0);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM REGISTRO_CODIGOS WHERE ENTIDAD='horarios' AND CODIGO='RH'",
      ),
    ).toBe(0);
  });
});
