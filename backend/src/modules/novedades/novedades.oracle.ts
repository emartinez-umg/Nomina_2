import { fileURLToPath } from 'node:url';
import { cargarMigraciones } from '../../shared/db/migraciones.archivos.js';
import { aplicarMigraciones } from '../../shared/db/migraciones.js';
import { crearMigracionesRepository } from '../../shared/db/migraciones.repository.js';
import { aplicarNovedades, materializarParqueo } from './consumo.service.js';
import { pendientes } from './pendientes.repository.js';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
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
import { crearSolicitudesService } from '../solicitudes/solicitudes.service.js';
import { crearNovedadesService } from '../novedades/novedades.service.js';
import { crearVacacionesService } from '../vacaciones/vacaciones.service.js';
import type { ActorAuditoria } from '../auth/auth.types.js';
let db: BaseDatos, app: Express, empleado: number, segundo: number, admin: ActorAuditoria;
let rh: { agent: ReturnType<typeof request.agent>; csrf: string },
  propio: typeof rh,
  ajeno: typeof rh;
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
  return (
    await post(
      propio,
      '',
      {
        tipo,
        ...(datos ? { datos } : {}),
        ...(tipo === 'PARQUEO' ? { vehiculo: 'CARRO', placa: 'P123ABC' } : {}),
        confirmado: true,
      },
      201,
    )
  ).body.data.id as number;
}
async function hoy() {
  return String(
    await escalar(
      "SELECT TO_CHAR(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),'YYYY-MM-DD') FROM DUAL",
    ),
  );
}
describe('FASE V1-9: migración, novedades mensuales y parqueo con Oracle real', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version < 27),
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

    await ejecutar(
      "INSERT INTO HORARIOS(CODIGO,NOMBRE,JORNADA) VALUES('V19','Horario V19','DIURNA')",
    );
    await ejecutar(
      "INSERT INTO HORARIO_BLOQUES(ID_HORARIO,MINUTO_ENTRADA,MINUTO_SALIDA,MINUTOS_DESCANSO,CRUZA_MEDIANOCHE) SELECT ID_HORARIO,480,1020,60,0 FROM HORARIOS WHERE CODIGO_ANTERIOR='V19'",
    );
    await ejecutar(
      "INSERT INTO HORARIO_BLOQUE_DIAS(ID_HORARIO_BLOQUE,DIA_SEMANA) SELECT B.ID_HORARIO_BLOQUE,X.DIA FROM HORARIO_BLOQUES B JOIN HORARIOS H ON H.ID_HORARIO=B.ID_HORARIO CROSS JOIN(SELECT LEVEL DIA FROM DUAL CONNECT BY LEVEL<=5) X WHERE H.CODIGO_ANTERIOR='V19'",
    );
    for (const id of [empleado, segundo])
      await ejecutar(
        "INSERT INTO EMPLEADO_HORARIO(ID_EMPLEADO,ID_HORARIO,VIGENTE_DESDE,MOTIVO) SELECT :id,ID_HORARIO,DATE '2026-01-01','Asignación V19' FROM HORARIOS WHERE CODIGO_ANTERIOR='V19'",
        { id },
      );
    await ejecutar(
      "INSERT INTO PERIODOS_NOMINA(FECHA_INICIO,FECHA_FIN,QUINCENA) VALUES(DATE '2026-02-01',DATE '2026-02-15',1)",
    );
    for (const dia of ['2026-02-02', '2026-02-03'])
      await ejecutar(
        "INSERT INTO HORAS_EXTRA(ID_EMPLEADO,ID_PERIODO_NOMINA,FECHA,HORAS,ESTADO,APROBADO_POR,MOTIVO) SELECT :id,ID_PERIODO_NOMINA,TO_DATE(:dia,'YYYY-MM-DD'),1.5,'APROBADA',:actor,'Histórico V19' FROM PERIODOS_NOMINA WHERE FECHA_INICIO=DATE '2026-02-01'",
        { id: empleado, dia, actor: admin.idUsuario },
      );
    await ejecutar(
      "INSERT INTO DESCUENTOS_EMPLEADO(ID_EMPLEADO,ID_TIPO_DESCUENTO,MODALIDAD,MONTO_QUINCENA,FECHA_INICIO,MOTIVO) SELECT :id,ID_TIPO_DESCUENTO,'FIJO',75,DATE '2026-02-01','Parqueo anterior' FROM TIPOS_DESCUENTO WHERE NVL(CODIGO_ANTERIOR,CODIGO)='PARQUEO'",
      { id: segundo },
    );
    // Snapshots v0 reales para comprobar que migrar no vuelve a cobrar ni pierde referencias.
    await ejecutar(
      "INSERT INTO PERIODOS_NOMINA(FECHA_INICIO,FECHA_FIN,QUINCENA) VALUES(DATE '2026-02-16',DATE '2026-02-28',2)",
    );
    for (const id of [empleado, segundo])
      await ejecutar(
        "INSERT INTO NOMINA_EMPLEADO(ID_PERIODO_NOMINA,ID_EMPLEADO,ID_HISTORIAL_SALARIAL,VERSION_CALCULO,DIAS_PAGADOS,SALARIO_BASE,TOTAL_INGRESOS,TOTAL_DESCUENTOS,NETO,COSTO_PATRONAL,DATOS_EMPLEADO) SELECT P.ID_PERIODO_NOMINA,:id,H.ID_HISTORIAL_SALARIAL,1,15,5000,2500,0,2500,0,'{}' FROM PERIODOS_NOMINA P CROSS JOIN HISTORIAL_SALARIAL H WHERE P.FECHA_INICIO BETWEEN DATE '2026-02-01' AND DATE '2026-02-28' AND H.ID_EMPLEADO=:id",
        { id },
      );
    await ejecutar(
      "INSERT INTO HORAS_EXTRA(ID_EMPLEADO,ID_PERIODO_NOMINA,FECHA,HORAS,ESTADO,APROBADO_POR,MOTIVO) SELECT :id,ID_PERIODO_NOMINA,DATE '2026-02-04',2,'APROBADA',:actor,'Horas pagadas v0' FROM PERIODOS_NOMINA WHERE FECHA_INICIO=DATE '2026-02-01'",
      { id: empleado, actor: admin.idUsuario },
    );
    await ejecutar(
      "INSERT INTO COMISIONES(ID_EMPLEADO,ID_PERIODO_NOMINA,MONTO,DESCRIPCION,REFERENCIA) SELECT :id,ID_PERIODO_NOMINA,50,'Comisión pagada v0','MIGRADA_PAGADA' FROM PERIODOS_NOMINA WHERE FECHA_INICIO=DATE '2026-02-01'",
      { id: empleado },
    );
    await ejecutar(
      "INSERT INTO AUSENCIAS(ID_EMPLEADO,ID_TIPO_AUSENCIA,FECHA_INICIO,FECHA_FIN,DIAS,ESTADO,APROBADO_POR,MOTIVO) SELECT :id,ID_TIPO_AUSENCIA,DATE '2026-02-05',DATE '2026-02-06',2,'APROBADA',:actor,'Ausencia pagada v0' FROM TIPOS_AUSENCIA WHERE NVL(CODIGO_ANTERIOR,CODIGO)='PERMISO_SIN_GOCE'",
      { id: empleado, actor: admin.idUsuario },
    );
    for (const [origen, pk, concepto, cantidad, monto, orden] of [
      ['HORAS_EXTRA', 'ID_HORA_EXTRA', 'HORAS_EXTRA', 2, 62.5, 1],
      ['COMISIONES', 'ID_COMISION', 'COMISION', 1, 50, 2],
      ['AUSENCIAS', 'ID_AUSENCIA', 'AUSENCIA_SIN_GOCE', 2, 333.33, 3],
    ] as const) {
      const fk =
        origen === 'HORAS_EXTRA'
          ? 'ID_HORA_EXTRA'
          : origen === 'COMISIONES'
            ? 'ID_COMISION'
            : 'ID_AUSENCIA';
      await ejecutar(
        `INSERT INTO NOMINA_DETALLE(ID_NOMINA_EMPLEADO,ID_EMPLEADO,ID_PERIODO_NOMINA,ID_CONCEPTO_NOMINA,ORDEN,DESCRIPCION,NATURALEZA,BASE_CALCULO,CANTIDAD,MONTO,AFECTA_IGSS,AFECTA_ISR,AFECTA_PRESTACIONES,${fk}) SELECT N.ID_NOMINA_EMPLEADO,N.ID_EMPLEADO,N.ID_PERIODO_NOMINA,C.ID_CONCEPTO_NOMINA,:orden,'Snapshot v0',C.NATURALEZA,5000,:cantidad,:monto,0,0,0,(SELECT MAX(${pk}) FROM ${origen} WHERE ID_EMPLEADO=:id) FROM NOMINA_EMPLEADO N JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA CROSS JOIN CONCEPTOS_NOMINA C WHERE N.ID_EMPLEADO=:id AND P.FECHA_INICIO=DATE '2026-02-01' AND C.CODIGO=:concepto`,
        { id: empleado, concepto, cantidad, monto, orden },
      );
    }
    await ejecutar(
      'INSERT INTO DESCUENTOS_APLICACIONES(ID_NOMINA_EMPLEADO,ID_EMPLEADO,ID_PERIODO_NOMINA,ID_DESCUENTO_EMPLEADO,MONTO) SELECT N.ID_NOMINA_EMPLEADO,N.ID_EMPLEADO,N.ID_PERIODO_NOMINA,D.ID_DESCUENTO_EMPLEADO,75 FROM NOMINA_EMPLEADO N JOIN DESCUENTOS_EMPLEADO D ON D.ID_EMPLEADO=N.ID_EMPLEADO WHERE N.ID_EMPLEADO=:id',
      { id: segundo },
    );
    await ejecutar(
      "INSERT INTO DESCUENTOS_EMPLEADO(ID_EMPLEADO,ID_TIPO_DESCUENTO,MODALIDAD,MONTO_QUINCENA,FECHA_INICIO,MOTIVO,ESTADO,ACTIVO) SELECT :id,ID_TIPO_DESCUENTO,'FIJO',75,DATE '2090-04-01','Parqueo anulado antes de comenzar','CANCELADO',0 FROM TIPOS_DESCUENTO WHERE NVL(CODIGO_ANTERIOR,CODIGO)='PARQUEO'",
      { id: segundo },
    );
    // v0 permite la misma referencia en otra quincena o para otro empleado.
    for (const [id, fecha] of [
      [empleado, '2026-02-16'],
      [segundo, '2026-02-01'],
    ] as const)
      await ejecutar(
        "INSERT INTO COMISIONES(ID_EMPLEADO,ID_PERIODO_NOMINA,MONTO,DESCRIPCION,REFERENCIA) SELECT :id,ID_PERIODO_NOMINA,60,'Comisión con referencia repetida válida v0','MIGRADA_PAGADA' FROM PERIODOS_NOMINA WHERE FECHA_INICIO=TO_DATE(:fecha,'YYYY-MM-DD')",
        { id, fecha },
      );
    expect(await ejecutarMigraciones(db, logger)).toBe(2);
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  const cargar = (tipo: string, body: object, status = 201) =>
    rh.agent.post(`/api/novedades/${tipo}`).set('X-CSRF-Token', rh.csrf).send(body).expect(status);
  const cambiar = (s: typeof rh, id: number, accion: string, extra: object = {}, status = 200) =>
    s.agent
      .post(`/api/novedades/parqueo/${id}/cambiar`)
      .set('X-CSRF-Token', s.csrf)
      .send({ accion, motivo: 'Gestión real de prueba', confirmado: true, ...extra })
      .expect(status);
  const mes = () => hoy().then((h) => h.slice(0, 7));
  it('agrupa días v0 por mes sin perder horas/orígenes ni inventar vehículo/tarifa', async () => {
    expect(
      await escalar('SELECT COUNT(*) FROM HORAS_EXTRA WHERE ID_EMPLEADO=:id', { id: empleado }),
    ).toBe(3);
    expect(
      await escalar(
        "SELECT CANTIDAD FROM NOVEDADES_MENSUALES WHERE TIPO='HORAS_EXTRA' AND ESTADO='PENDIENTE' AND ID_EMPLEADO=:id",
        { id: empleado },
      ),
    ).toBe(3);
    expect(await escalar("SELECT COUNT(*) FROM NOVEDADES_ORIGEN WHERE ENTIDAD='HORAS_EXTRA'")).toBe(
      3,
    );
    expect(
      await escalar('SELECT VEHICULO FROM PARQUEO_SUSCRIPCIONES WHERE ID_EMPLEADO=:id', {
        id: segundo,
      }),
    ).toBeNull();
    expect(await escalar('SELECT COUNT(*) FROM PARQUEO_TARIFAS')).toBe(0);
    expect(await ejecutarMigraciones(db, logger)).toBe(0);
  });
  it('conserva snapshots aplicados y dos pagos de parqueo de un mes sin recobrarlos', async () => {
    expect(
      await escalar(
        "SELECT MONTO FROM NOVEDADES_MENSUALES WHERE REFERENCIA='MIGRADA_PAGADA' AND ESTADO='APLICADA'",
      ),
    ).toBe(50);
    expect(
      await escalar(
        "SELECT ESTADO FROM NOVEDADES_MENSUALES WHERE REFERENCIA='MIGRADA_PAGADA' AND ESTADO='APLICADA'",
      ),
    ).toBe('APLICADA');
    expect(
      await escalar(
        "SELECT COUNT(*) FROM NOVEDADES_MENSUALES WHERE TIPO='AUSENCIA' AND ESTADO='APLICADA'",
      ),
    ).toBe(1);
    expect(await escalar("SELECT MONTO FROM NOVEDADES_MENSUALES WHERE TIPO='PARQUEO'")).toBe(150);
    expect(
      await escalar(
        "SELECT COUNT(*) FROM NOVEDADES_ORIGEN WHERE ENTIDAD='DESCUENTOS_APLICACIONES'",
      ),
    ).toBe(2);
    const items = await db.conConexion((c) => pendientes(c, '2026-02', segundo));
    expect(items.filter((n) => n.tipo === 'PARQUEO')).toHaveLength(0);
  });
  it('conserva referencias repetidas válidas v0 sin alterar originales ni duplicar orígenes al reparar', async () => {
    expect(await escalar("SELECT COUNT(*) FROM COMISIONES WHERE REFERENCIA='MIGRADA_PAGADA'")).toBe(
      3,
    );
    expect(
      await escalar("SELECT COUNT(*) FROM NOVEDADES_MENSUALES WHERE REFERENCIA='MIGRADA_PAGADA'"),
    ).toBe(3);
    expect(await escalar("SELECT COUNT(*) FROM NOVEDADES_ORIGEN WHERE ENTIDAD='COMISIONES'")).toBe(
      3,
    );
    expect(await escalar("SELECT COUNT(*) FROM NOVEDADES_ORIGEN WHERE ENTIDAD='HORAS_EXTRA'")).toBe(
      3,
    );
    expect(
      await escalar(
        "SELECT COUNT(*) FROM VERSION_ESQUEMA WHERE VERSION IN (27,28) AND ESTADO='APLICADA'",
      ),
    ).toBe(2);
    await cargar(
      'comisiones',
      {
        idEmpleado: empleado,
        mes: '2026-02',
        monto: '10',
        referencia: 'MIGRADA_PAGADA',
        motivo: 'Duplicado histórico',
        confirmado: true,
      },
      409,
    );
    expect(await ejecutarMigraciones(db, logger)).toBe(0);
  });
  it('migra un parqueo anulado antes de su fecha futura sin activarlo ni cobrarlo', async () => {
    expect(
      await escalar("SELECT TO_CHAR(MES_FIN,'YYYY-MM') FROM PARQUEO_SUSCRIPCIONES WHERE ACTIVO=0"),
    ).toBe('2090-04');
    expect(await escalar('SELECT ESTADO FROM PARQUEO_SUSCRIPCIONES WHERE ACTIVO=0')).toBe('BAJA');
  });
  it('protege RBAC, CSRF y propiedad de parqueo', async () => {
    await propio.agent.get(`/api/novedades/horas-extra`).expect(403);
    await rh.agent.post('/api/novedades/comisiones').send({}).expect(403);
    await propio.agent
      .post('/api/novedades/parqueo/tarifas')
      .set('X-CSRF-Token', propio.csrf)
      .send({})
      .expect(403);
    const listado = await propio.agent
      .get('/api/novedades/parqueo')
      .query({ mes: await mes() })
      .expect(200);
    expect(listado.body.data.total).toBe(0);
  });
  it('valora medias horas mensuales con jornada de 8 horas y muestra tope sin bloquear confirmado', async () => {
    const body = {
      idEmpleado: empleado,
      mes: await mes(),
      horas: '2.5',
      motivo: 'Horas del mes',
      confirmado: true,
    };
    const p = await cargar('horas-extra/previsualizar', body, 200);
    expect(p.body.data.calculo.monto).toBe('78.13');
    const alta = await cargar('horas-extra', body);
    expect(alta.body.data).toMatchObject({ estado: 'PENDIENTE', monto: '78.13', horas: '2.5' });
    await cargar('horas-extra', body, 409);
    const warning = await cargar('horas-extra/previsualizar', { ...body, horas: '40.5' }, 200);
    expect(warning.body.data.advertencia).toContain('tope');
    await cargar(
      'horas-extra',
      { ...body, idEmpleado: segundo, horas: '40.5', confirmado: false },
      409,
    );
    await cargar('horas-extra', { ...body, idEmpleado: segundo, horas: '40.5' });
    await cargar('horas-extra', { ...body, mes: '2199-12' }, 422);
    await cargar('horas-extra', { ...body, horas: '2.25' }, 400);
  });
  it('comisiones y tienda manuales: filtros, referencias, paginación y CSV', async () => {
    for (const tipo of ['comisiones', 'consumo-tienda']) {
      const body = {
        idEmpleado: empleado,
        mes: await mes(),
        monto: '123.45',
        referencia: `V19_${tipo}`,
        motivo: 'Origen manual real',
        confirmado: true,
      };
      const alta = await cargar(tipo, body);
      expect((await cargar(tipo, body, 409)).body.error.campos.referencia).toBeTruthy();
      await cargar(tipo, { ...body, idEmpleado: segundo });
      await cargar(tipo, { ...body, mes: '2026-03' });
      const q = {
        mes: body.mes,
        idEmpleado: empleado,
        buscar: 'Origen manual',
        montoMin: '120',
        montoMax: '130',
        limite: 1,
      };
      const r = await rh.agent.get(`/api/novedades/${tipo}`).query(q).expect(200);
      expect(r.body.data.total).toBe(1);
      expect(r.body.data.registros[0].id).toBe(alta.body.data.id);
      const csv = await rh.agent.get(`/api/novedades/${tipo}/exportar`).query(q).expect(200);
      expect(csv.body.data).toContain(body.referencia);
    }
  });
  it('ausencias sin goce muestran descuento, conservan con goce y bloquean traslapes', async () => {
    const idTipo = Number(
      await escalar(
        "SELECT ID_TIPO_AUSENCIA FROM TIPOS_AUSENCIA WHERE NVL(CODIGO_ANTERIOR,CODIGO)='PERMISO_SIN_GOCE'",
      ),
    );
    const body = {
      idEmpleado: empleado,
      idTipo,
      fechaInicio: '2026-08-30',
      fechaFin: '2026-09-02',
      estado: 'APROBADA',
      motivo: 'Ausencia sin goce',
      confirmado: true,
    };
    const r = await cargar('ausencias', body);
    expect(r.body.data.descuento).toBe('666.66');
    expect(r.body.data.aplicaciones).toHaveLength(2);
    await cargar('ausencias', { ...body, fechaInicio: '2026-09-02', fechaFin: '2026-09-03' }, 422);
    const goce = Number(
      await escalar("SELECT MIN(ID_TIPO_AUSENCIA) FROM TIPOS_AUSENCIA WHERE EFECTO='CON_GOCE'"),
    );
    const g = await cargar('ausencias', {
      ...body,
      idTipo: goce,
      fechaInicio: '2026-09-03',
      fechaFin: '2026-09-04',
    });
    expect(g.body.data.descuento).toBe('0.00');
  });
  it('tarifas auditadas y vigencias sin traslape; aprobar crea suscripción mensual sin descuento v0', async () => {
    const actual = await mes();
    for (const vehiculo of ['CARRO', 'MOTO'])
      await cargar('parqueo/tarifas', {
        vehiculo,
        mes: '2026-01',
        monto: vehiculo === 'CARRO' ? '150' : '75',
        motivo: 'Tarifa mensual real',
        confirmado: true,
      });
    const id = await solicitar('PARQUEO');
    await post(rh, `/${id}/resolver`, { estado: 'APROBADA', confirmado: true });
    await post(rh, `/${id}/resolver`, { estado: 'APROBADA', confirmado: true }, 409);
    const r = await propio.agent.get('/api/novedades/parqueo').query({ mes: actual }).expect(200);
    expect(r.body.data.registros[0]).toMatchObject({
      inicio: actual,
      vehiculo: 'CARRO',
      tarifa: '150',
      estado: 'ACTIVA',
    });
    expect(
      await escalar('SELECT COUNT(*) FROM DESCUENTOS_EMPLEADO WHERE ID_EMPLEADO=:id', {
        id: empleado,
      }),
    ).toBe(0);
    expect(
      await escalar("SELECT COUNT(*) FROM BITACORA_AUDITORIA WHERE ACCION='TARIFA_PARQUEO'"),
    ).toBe(2);
  });
  it('versiona la tarifa futura conservando la actual y rechaza sobrescribir su vigencia', async () => {
    const actual = await mes(),
      siguiente = new Date(`${actual}-01T12:00:00Z`);
    siguiente.setUTCMonth(siguiente.getUTCMonth() + 1);
    const futuro = siguiente.toISOString().slice(0, 7),
      body = {
        vehiculo: 'CARRO',
        mes: futuro,
        monto: '200',
        motivo: 'Nueva tarifa mensual futura',
        confirmado: true,
      };
    await cargar('parqueo/tarifas', body);
    await cargar('parqueo/tarifas', body, 409);
    const lista = (await rh.agent.get('/api/novedades/parqueo/tarifas').expect(200)).body.data as {
      vehiculo: string;
      monto: string;
      desde: string;
      hasta: string | null;
    }[];
    const autos = lista.filter((t) => t.vehiculo === 'CARRO');
    expect(autos).toHaveLength(2);
    const anterior = autos.find((t) => t.desde === '2026-01-01')!,
      nueva = autos.find((t) => t.desde === `${futuro}-01`)!;
    const finActual = new Date(siguiente);
    finActual.setUTCDate(0);
    expect(anterior).toMatchObject({ monto: '150', hasta: finActual.toISOString().slice(0, 10) });
    expect(nueva).toMatchObject({ monto: '200', hasta: null });
    const suscripcion = (
      await propio.agent.get('/api/novedades/parqueo').query({ mes: actual }).expect(200)
    ).body.data.registros[0];
    expect(suscripcion.tarifa).toBe('150');
  });
  it('solicitud de baja propia, aviso, baja al cierre y suspensión sin cargo posterior', async () => {
    const actual = await mes(),
      id = Number(
        await escalar(
          'SELECT ID_PARQUEO_SUSCRIPCION FROM PARQUEO_SUSCRIPCIONES WHERE ID_EMPLEADO=:id AND ACTIVO=1',
          { id: empleado },
        ),
      );
    await cambiar(ajeno, id, 'SOLICITAR_BAJA', {}, 404);
    await cambiar(propio, id, 'BAJA', {}, 403);
    await cambiar(propio, id, 'SOLICITAR_BAJA');
    await cambiar(propio, id, 'SOLICITAR_BAJA', {}, 409);
    expect(
      await escalar("SELECT COUNT(*) FROM NOTIFICACIONES WHERE CLAVE_EVENTO LIKE 'PARQUEO:%'"),
    ).toBeGreaterThan(0);
    const baja = await cambiar(rh, id, 'BAJA');
    expect(baja.body.data.fin).toBe(actual);
    const actuales = await db.conConexion((c) => pendientes(c, actual, empleado));
    expect(
      actuales.some((n) => n.tipo === 'PARQUEO' && n.mes === actual && n.monto === '150'),
    ).toBe(true);
    const futuro = actual.slice(0, 4) + '-12';
    const posteriores = await db.conConexion((c) => pendientes(c, futuro, empleado));
    expect(posteriores.filter((n) => n.tipo === 'PARQUEO').every((n) => n.mes <= actual)).toBe(
      true,
    );
    const legacy = Number(
      await escalar(
        'SELECT ID_PARQUEO_SUSCRIPCION FROM PARQUEO_SUSCRIPCIONES WHERE ID_EMPLEADO=:id AND ACTIVO=1',
        { id: segundo },
      ),
    );
    await cambiar(rh, legacy, 'COMPLETAR', { vehiculo: 'MOTO' });
    const suspendida = await cambiar(rh, legacy, 'SUSPENDER');
    expect(suspendida.body.data).toMatchObject({ estado: 'SUSPENDIDA', fin: actual, tarifa: '75' });
    await cambiar(rh, legacy, 'BAJA', {}, 409);
  });
  it('aplicar es atómico, guarda referencia al pago, impide repetición y bloquea edición/anulación', async () => {
    const actual = await mes();
    await ejecutar(
      "INSERT INTO PERIODOS_NOMINA(FECHA_INICIO,FECHA_FIN,QUINCENA) VALUES(TO_DATE(:mes||'-16','YYYY-MM-DD'),LAST_DAY(TO_DATE(:mes||'-01','YYYY-MM-DD')),2)",
      { mes: actual },
    );
    await ejecutar(
      "INSERT INTO NOMINA_EMPLEADO(ID_PERIODO_NOMINA,ID_EMPLEADO,ID_HISTORIAL_SALARIAL,VERSION_CALCULO,DIAS_PAGADOS,SALARIO_BASE,TOTAL_INGRESOS,TOTAL_DESCUENTOS,NETO,COSTO_PATRONAL,DATOS_EMPLEADO) SELECT P.ID_PERIODO_NOMINA,:id,H.ID_HISTORIAL_SALARIAL,1,30,5000,5000,0,5000,0,'{}' FROM PERIODOS_NOMINA P CROSS JOIN HISTORIAL_SALARIAL H WHERE P.FECHA_INICIO=TO_DATE(:mes||'-16','YYYY-MM-DD') AND H.ID_EMPLEADO=:id",
      { id: empleado, mes: actual },
    );
    const pago = Number(
      await escalar('SELECT MAX(ID_NOMINA_EMPLEADO) FROM NOMINA_EMPLEADO WHERE ID_EMPLEADO=:id', {
        id: empleado,
      }),
    );
    const id = Number(
      await escalar(
        "SELECT ID_NOVEDAD_MENSUAL FROM NOVEDADES_MENSUALES WHERE ID_EMPLEADO=:id AND TIPO='COMISION' AND REFERENCIA='V19_comisiones'",
        { id: empleado },
      ),
    );
    const otro = Number(
      await escalar(
        "SELECT ID_NOVEDAD_MENSUAL FROM NOVEDADES_MENSUALES WHERE ID_EMPLEADO=:id AND TIPO='HORAS_EXTRA'",
        { id: segundo },
      ),
    );
    await expect(
      enTransaccion(db, (c) => aplicarNovedades(c, admin, pago, [id, otro])),
    ).rejects.toThrow();
    expect(
      await escalar('SELECT ESTADO FROM NOVEDADES_MENSUALES WHERE ID_NOVEDAD_MENSUAL=:id', { id }),
    ).toBe('PENDIENTE');
    await enTransaccion(db, async (c) => {
      await materializarParqueo(c, admin, actual, empleado);
      await aplicarNovedades(c, admin, pago, [id]);
    });
    await expect(
      enTransaccion(db, (c) => aplicarNovedades(c, admin, pago, [id])),
    ).rejects.toThrow();
    const detalle = await rh.agent.get(`/api/novedades/comisiones/${id}`).expect(200);
    expect(detalle.body.data).toMatchObject({ estado: 'APLICADA', idPago: pago, bloqueada: 1 });
    await rh.agent
      .patch(`/api/novedades/comisiones/${id}`)
      .set('X-CSRF-Token', rh.csrf)
      .send({
        idEmpleado: empleado,
        mes: actual,
        monto: '1',
        referencia: 'EDIT',
        motivo: 'Edición bloqueada',
      })
      .expect(409);
    await rh.agent
      .post(`/api/novedades/comisiones/${id}/anular`)
      .set('X-CSRF-Token', rh.csrf)
      .send({ motivo: 'Anulación bloqueada', confirmado: true })
      .expect(409);
  });
  it('resumen cuenta pendientes por empleado/departamento e identifica retroactivas', async () => {
    const r = await rh.agent
      .get('/api/novedades/pendientes')
      .query({ mes: await mes(), limite: 1 })
      .expect(200);
    expect(r.body.data.registros).toHaveLength(1);
    expect(r.body.data.total).toBe(2);
    expect(r.body.data.departamentos[0].pendientes).toBeGreaterThan(0);
    expect(r.body.data.registros[0].retroactivas).toBeGreaterThan(0);
  });
  it('un cierre parcial bloquea todo el mes en captura, edición, anulación y tarifas', async () => {
    await ejecutar(
      "INSERT INTO PERIODOS_NOMINA(FECHA_INICIO,FECHA_FIN,QUINCENA,ESTADO,APROBADO_EN,CERRADO_EN,APROBADO_POR,CERRADO_POR) VALUES(DATE '2026-04-01',DATE '2026-04-15',1,'CERRADO',SYSDATE,SYSDATE,:a,:a)",
      { a: admin.idUsuario },
    );
    const b = { idEmpleado: empleado, mes: '2026-04', horas: '1', motivo: 'Mes cerrado' };
    await cargar('horas-extra', b, 422);
    await cargar(
      'parqueo/tarifas',
      {
        vehiculo: 'CARRO',
        mes: '2026-03',
        monto: '200',
        motivo: 'Vigencia bloqueada',
        confirmado: true,
      },
      409,
    );
    await ejecutar(
      "UPDATE PERIODOS_NOMINA SET ESTADO='CERRADO',APROBADO_EN=SYSDATE,CERRADO_EN=SYSDATE,APROBADO_POR=:a,CERRADO_POR=:a WHERE TO_CHAR(FECHA_INICIO,'YYYY-MM')=:mes",
      { a: admin.idUsuario, mes: await mes() },
    );
    const parqueos = await rh.agent
      .get('/api/novedades/parqueo')
      .query({ mes: await mes() })
      .expect(200);
    expect(parqueos.body.data.registros.length).toBeGreaterThan(0);
    expect(
      parqueos.body.data.registros.every(
        (s: { gestionBloqueada: number }) => s.gestionBloqueada === 1,
      ),
    ).toBe(true);
  });
});
