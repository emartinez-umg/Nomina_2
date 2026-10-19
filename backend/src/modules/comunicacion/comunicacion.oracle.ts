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
import { crearComunicacionService } from './comunicacion.service.js';
import { crearTablerosService } from '../tableros/tableros.service.js';
import { quincena, sumarDias } from '../novedades/novedades.reglas.js';
import { hora } from './comunicacion.test.fixture.js';
import { aniversarioSql } from '../tableros/tableros.repository.js';
import type { ActorAuditoria } from '../auth/auth.types.js';
let db: BaseDatos, app: Express, admin: ActorAuditoria;
let rh: { agent: ReturnType<typeof request.agent>; csrf: string },
  propio: typeof rh,
  ajeno: typeof rh,
  administrador: typeof rh;
let dep: number,
  puesto: number,
  jefatura: number,
  empleado: number,
  segundo: number,
  anuncio: number;
const seed = validarEntornoSeeds(process.env),
  logger = crearLogger('silent');
const ejecutar = (sql: string, binds: BindParameters = {}) =>
  enTransaccion(db, (c) => c.execute(sql, binds));
const escalar = (sql: string, binds: BindParameters = {}) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(sql, binds)).rows?.[0]?.[0]);
async function entrar(usuario: string, contrasena: string) {
  const agent = request.agent(app),
    csrf = (await agent.get('/api/auth/csrf').expect(200)).body.data.csrfToken;
  const r = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf)
    .send({ usuario, contrasena })
    .expect(200);
  return { agent, csrf: r.body.data.csrfToken as string };
}
const post = (s: typeof rh, tipo: string, d: object, status = 201) =>
  s.agent.post(`/api/comunicacion/${tipo}`).set('X-CSRF-Token', s.csrf).send(d).expect(status);
const patch = (id: number, d: object, status = 200) =>
  rh.agent
    .patch(`/api/comunicacion/anuncios/${id}`)
    .set('X-CSRF-Token', rh.csrf)
    .send(d)
    .expect(status);
const base = (inicio = hora().slice(0, 10)) => ({
  titulo: 'Aviso de integración',
  contenido: 'Comunicación de prueba Oracle',
  inicio,
  fin: sumarDias(inicio, 5),
  lugar: '',
  paraTodos: true,
  destinatarios: [],
  version: 1,
});
describe('FASE 11: comunicaciones y tableros con Oracle real', () => {
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
        comunicacion: crearComunicacionService(db),
        tableros: crearTablerosService(db),
        config,
      },
    );
    administrador = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD);
    const cambio = await administrador.agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', administrador.csrf)
      .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'FaseOnce!2026' })
      .expect(200);
    administrador.csrf = cambio.body.data.csrfToken;
    admin = {
      idUsuario: Number(
        await escalar('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO=:u', { u: seed.ADMIN_USER }),
      ),
      idRol: Number(await escalar("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN'")),
      rol: 'ADMIN',
      ip: '127.0.0.1',
    };
    const cuentas = [];
    for (const [nombre, rol] of [
      ['Revisor', 'RH'],
      ['Primero', 'EMPLEADO'],
      ['Segundo', 'EMPLEADO'],
    ] as const) {
      const u = await enTransaccion(db, (c) =>
        crearUsuarioInterno(c, admin, {
          nombre,
          apellido: 'Comunicacion',
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
    await ejecutar(
      "INSERT INTO DEPARTAMENTOS (CODIGO,NOMBRE) VALUES ('F11','Equipo de comunicación')",
    );
    dep = Number(
      await escalar(
        "SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NVL(CODIGO_ANTERIOR,CODIGO)='F11'",
      ),
    );
    await ejecutar("INSERT INTO DEPARTAMENTOS (CODIGO,NOMBRE) VALUES ('OTRO','Otro equipo')");
    await ejecutar(
      "INSERT INTO PUESTOS (CODIGO,NOMBRE,ID_DEPARTAMENTO) VALUES ('F11','Analista',:dep)",
      { dep },
    );
    puesto = Number(
      await escalar("SELECT ID_PUESTO FROM PUESTOS WHERE NVL(CODIGO_ANTERIOR,CODIGO)='F11'"),
    );
    await ejecutar(
      "INSERT INTO JEFATURAS (CODIGO,NOMBRE,ID_DEPARTAMENTO) VALUES ('F11','Jefatura de prueba',:dep)",
      { dep },
    );
    jefatura = Number(
      await escalar("SELECT ID_JEFATURA FROM JEFATURAS WHERE NVL(CODIGO_ANTERIOR,CODIGO)='F11'"),
    );
    const otro = Number(
      await escalar(
        "SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NVL(CODIGO_ANTERIOR,CODIGO)='OTRO'",
      ),
    );
    await ejecutar(
      "INSERT INTO PUESTOS (CODIGO,NOMBRE,ID_DEPARTAMENTO) VALUES ('OTRO','Segundo puesto',:dep)",
      { dep: otro },
    );
    await ejecutar(
      "INSERT INTO CENTROS_TRABAJO (CODIGO,NOMBRE,LOCALIDAD) VALUES ('F11','Oficina','PRUEBA')",
    );
    const centro = Number(
        await escalar(
          "SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE NVL(CODIGO_ANTERIOR,CODIGO)='F11'",
        ),
      ),
      contrato = Number(await escalar('SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO')),
      hoy = hora().slice(0, 10);
    for (const i of [1, 2]) {
      await ejecutar(
        "INSERT INTO EMPLEADOS (CODIGO,ID_USUARIO,NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_JEFATURA,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO,FECHA_FIN_CONTRATO) VALUES (:codigo,:usuario,:nombre,'Comunicación',:dpi,:nit,TO_DATE(:nace,'YYYY-MM-DD'),'F','SOLTERO','Dirección','55551234',:correo,:puesto,:dep,:jefe,:contrato,:centro,TO_DATE(:ingreso,'YYYY-MM-DD'),TO_DATE(:fin,'YYYY-MM-DD'))",
        {
          codigo: `F11_${i}`,
          usuario: cuentas[i]!.idUsuario,
          nombre: i === 1 ? 'Primero' : 'Segundo',
          dpi: `987654321012${i}`,
          nit: i === 1 ? '1234567-9' : '123456-0',
          nace: `1995-${hoy.slice(5)}`,
          correo: `empleado${i}@example.test`,
          puesto:
            i === 1
              ? puesto
              : Number(
                  await escalar(
                    "SELECT ID_PUESTO FROM PUESTOS WHERE NVL(CODIGO_ANTERIOR,CODIGO)='OTRO'",
                  ),
                ),
          dep: i === 1 ? dep : otro,
          jefe: i === 1 ? jefatura : null,
          contrato,
          centro,
          ingreso: `${Number(hoy.slice(0, 4)) - 1}-${hoy.slice(5)}`,
          fin: sumarDias(hoy, 10),
        },
      );
      const id = Number(
        await escalar('SELECT ID_EMPLEADO FROM EMPLEADOS WHERE NVL(CODIGO_ANTERIOR,CODIGO)=:c', {
          c: `F11_${i}`,
        }),
      );
      if (i === 1) empleado = id;
      else segundo = id;
      await ejecutar(
        "INSERT INTO HISTORIAL_SALARIAL (ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES (:id,5000,TO_DATE(:hoy,'YYYY-MM-DD'),'Salario de prueba')",
        { id, hoy: `${Number(hoy.slice(0, 4)) - 1}-${hoy.slice(5)}` },
      );
      await ejecutar(
        "INSERT INTO VACACIONES_MOVIMIENTOS (ID_EMPLEADO,TIPO,FECHA,DIAS,CLAVE_ORIGEN,MOTIVO) VALUES (:id,'SALDO_INICIAL',TO_DATE(:hoy,'YYYY-MM-DD'),12.5,'INICIAL','Saldo certificado de prueba')",
        { id, hoy },
      );
    }
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('exige CSRF, restringe escritura a RH/ADMIN y bloquea tableros ajenos', async () => {
    await rh.agent.post('/api/comunicacion/anuncios').send(base()).expect(403);
    await post(propio, 'anuncios', base(), 403);
    await propio.agent.get('/api/tableros/rh').expect(403);
    await rh.agent.get('/api/tableros/admin').expect(403);
    await rh.agent.get('/api/auditoria').expect(403);
    await administrador.agent.get('/api/tableros/empleado').expect(403);
    await propio.agent.get('/api/tableros/empleado').query({ idEmpleado: segundo }).expect(400);
  });
  it('une grupos OR y notifica una sola vez; ajeno no puede abrir ni listar', async () => {
    const r = await post(rh, 'anuncios', {
      ...base(),
      paraTodos: false,
      destinatarios: [
        { tipo: 'DEPARTAMENTO', id: dep },
        { tipo: 'PUESTO', id: puesto },
        { tipo: 'JEFATURA', id: jefatura },
      ],
    });
    anuncio = r.body.data.id;
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE ID_ANUNCIO=:id', { id: anuncio }),
      ),
    ).toBe(1);
    expect((await propio.agent.get('/api/comunicacion/anuncios').expect(200)).body.data.total).toBe(
      1,
    );
    expect((await ajeno.agent.get('/api/comunicacion/anuncios').expect(200)).body.data.total).toBe(
      0,
    );
    await ajeno.agent.get(`/api/comunicacion/anuncios/${anuncio}`).expect(404);
    expect(
      (await rh.agent.get(`/api/comunicacion/anuncios/${anuncio}`).expect(200)).body.data
        .destinatarios,
    ).toHaveLength(3);
  });
  it('audiencia por jefatura y por puesto funcionan independientemente', async () => {
    for (const [tipo, id] of [
      ['JEFATURA', jefatura],
      ['PUESTO', puesto],
    ] as const) {
      const r = await post(rh, 'anuncios', {
        ...base(),
        titulo: `Aviso para ${tipo}`,
        paraTodos: false,
        destinatarios: [{ tipo, id }],
      });
      await propio.agent.get(`/api/comunicacion/anuncios/${r.body.data.id}`).expect(200);
      await ajeno.agent.get(`/api/comunicacion/anuncios/${r.body.data.id}`).expect(404);
    }
  });
  it('vigencia programada y vencida se comprueban también en detalle', async () => {
    const futuro = await post(rh, 'anuncios', base(sumarDias(hora().slice(0, 10), 5)));
    await propio.agent.get(`/api/comunicacion/anuncios/${futuro.body.data.id}`).expect(404);
    await ejecutar(
      'UPDATE ANUNCIOS SET VIGENTE_DESDE=VIGENTE_DESDE-11,VIGENTE_HASTA=VIGENTE_HASTA-11 WHERE ID_ANUNCIO=:id',
      { id: futuro.body.data.id },
    );
    await propio.agent.get(`/api/comunicacion/anuncios/${futuro.body.data.id}`).expect(404);
  });
  it('edición concurrente tiene un solo ganador y reemite avisos por versión', async () => {
    const d = { ...base(), titulo: 'Aviso editado' };
    const r = await Promise.all(
      [1, 2].map(() =>
        rh.agent
          .patch(`/api/comunicacion/anuncios/${anuncio}`)
          .set('X-CSRF-Token', rh.csrf)
          .send(d),
      ),
    );
    expect(r.map((v) => v.status).sort()).toEqual([200, 409]);
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE ID_ANUNCIO=:id AND ACTIVO=1', {
          id: anuncio,
        }),
      ),
    ).toBe(2);
  });
  it('retira avisos y acceso al quitar audiencia; la versión anterior no sobrescribe', async () => {
    await patch(anuncio, {
      ...base(),
      paraTodos: false,
      destinatarios: [{ tipo: 'PUESTO', id: puesto }],
      version: 2,
    });
    await ajeno.agent.get(`/api/comunicacion/anuncios/${anuncio}`).expect(404);
    const n = await ajeno.agent.get('/api/notificaciones').expect(200);
    expect(
      n.body.data.registros.some((n: { clave: string }) =>
        n.clave.startsWith(`ANUNCIO:${anuncio}:`),
      ),
    ).toBe(false);
    await patch(anuncio, { ...base(), version: 1 }, 409);
  });
  it('valida fechas reales, hora futura, fin coherente y grupos activos', async () => {
    await post(
      rh,
      'eventos',
      { ...base(), inicio: '2026-02-30T12:00', fin: '2026-03-01T13:00', lugar: 'Sala' },
      422,
    );
    await post(
      rh,
      'eventos',
      {
        ...base(),
        inicio: `${hora().slice(0, 10)}T00:00`,
        fin: `${hora().slice(0, 10)}T01:00`,
        lugar: 'Sala',
      },
      422,
    );
    await post(
      rh,
      'anuncios',
      { ...base(), paraTodos: false, destinatarios: [{ tipo: 'PUESTO', id: 999999 }] },
      409,
    );
  });
  it('calendario incluye eventos multiday y solo audiencia propia', async () => {
    const inicio = sumarDias(hora().slice(0, 10), 2),
      fin = sumarDias(inicio, 3);
    const r = await post(rh, 'eventos', {
      ...base(),
      titulo: 'Actividad de equipo',
      inicio: `${inicio}T10:00`,
      fin: `${fin}T17:00`,
      lugar: 'Sala principal',
      paraTodos: false,
      destinatarios: [{ tipo: 'DEPARTAMENTO', id: dep }],
    });
    const lista = await propio.agent
      .get('/api/comunicacion/eventos')
      .query({ desde: sumarDias(inicio, 1), hasta: sumarDias(inicio, 1) })
      .expect(200);
    expect(lista.body.data.registros[0].id).toBe(r.body.data.id);
    expect((await ajeno.agent.get('/api/comunicacion/eventos').expect(200)).body.data.total).toBe(
      0,
    );
    await ajeno.agent.get(`/api/comunicacion/eventos/${r.body.data.id}`).expect(404);
  });
  it('rollback de publicación/audiencia/notificaciones si falla auditoría', async () => {
    const antes = Number(await escalar('SELECT COUNT(*) FROM ANUNCIOS'));
    await ejecutar(
      "CREATE OR REPLACE TRIGGER F11_FALLAR BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ENTIDAD='ANUNCIOS' THEN RAISE_APPLICATION_ERROR(-20099,'Fallo de prueba'); END IF; END;",
    );
    try {
      await post(rh, 'anuncios', base(), 500);
      await patch(anuncio, { ...base(), version: 3 }, 500);
    } finally {
      await ejecutar('DROP TRIGGER F11_FALLAR');
    }
    expect(Number(await escalar('SELECT COUNT(*) FROM ANUNCIOS'))).toBe(antes);
    expect(
      Number(await escalar('SELECT VERSION FROM ANUNCIOS WHERE ID_ANUNCIO=:id', { id: anuncio })),
    ).toBe(3);
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE ID_ANUNCIO=:id AND ACTIVO=1', {
          id: anuncio,
        }),
      ),
    ).toBe(1);
  });
  it('paginación, filtros de grupos y CSV consultan toda la selección', async () => {
    const r = await rh.agent
      .get('/api/comunicacion/anuncios')
      .query({
        grupo: 'PUESTO',
        idGrupo: puesto,
        limite: 1,
        direccion: 'asc',
        ordenarPor: 'titulo',
      })
      .expect(200);
    expect(r.body.data.registros).toHaveLength(1);
    expect(r.body.data.total).toBeGreaterThan(1);
    const csv = await rh.agent
      .get('/api/comunicacion/anuncios/exportar')
      .query({ grupo: 'PUESTO', idGrupo: puesto })
      .expect(200);
    expect(csv.body.data).toContain('Aviso de integración');
    expect(csv.body.data).toContain('Aviso para PUESTO');
  });
  it('tablero empleado usa saldo propio y solo comunicaciones dirigidas', async () => {
    const r = await propio.agent.get('/api/tableros/empleado').expect(200);
    expect(r.body.data.saldo.disponible).toBe('12.50');
    expect(r.body.data.eventos.total).toBe(1);
    expect(r.body.data.ultimaBoleta).toBeNull();
    const otro = await ajeno.agent.get('/api/tableros/empleado').expect(200);
    expect(otro.body.data.eventos.total).toBe(0);
  });
  it('RRHH agrega una sola versión de nómina y muestra contratos/cumpleaños', async () => {
    const h = hora().slice(0, 10),
      p = quincena(h);
    await ejecutar(
      "INSERT INTO PERIODOS_NOMINA (FECHA_INICIO,FECHA_FIN,QUINCENA,VERSION_CALCULO) VALUES (TO_DATE(:inicio,'YYYY-MM-DD'),TO_DATE(:fin,'YYYY-MM-DD'),:quincena,2)",
      { inicio: p.inicio, fin: p.fin, quincena: p.numero },
    );
    const id = Number(await escalar('SELECT MAX(ID_PERIODO_NOMINA) FROM PERIODOS_NOMINA')),
      salario = Number(
        await escalar(
          'SELECT ID_HISTORIAL_SALARIAL FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id',
          { id: empleado },
        ),
      );
    for (const version of [1, 2])
      await ejecutar(
        "INSERT INTO NOMINA_EMPLEADO (ID_PERIODO_NOMINA,ID_EMPLEADO,ID_HISTORIAL_SALARIAL,VERSION_CALCULO,DIAS_PAGADOS,SALARIO_BASE,TOTAL_INGRESOS,TOTAL_DESCUENTOS,NETO,COSTO_PATRONAL,DATOS_EMPLEADO) VALUES (:id,:empleado,:salario,:version,15,5000,:bruto,100,:neto,320,'{}')",
        {
          id,
          empleado,
          salario,
          version,
          bruto: version === 1 ? 2000 : 2500,
          neto: version === 1 ? 1900 : 2400,
        },
      );
    const r = await rh.agent.get('/api/tableros/rh').expect(200);
    expect(r.body.data.indicadores.activos).toBe(2);
    expect(r.body.data.periodo.bruto).toBe('2500');
    expect(r.body.data.periodo.neto).toBe('2400');
    expect(r.body.data.periodo.empleados).toBe(1);
    expect(r.body.data.evolucion).toHaveLength(1);
    expect(r.body.data.departamentos).toHaveLength(2);
    expect(r.body.data.celebraciones).toHaveLength(4);
    expect(r.body.data.alertas).toHaveLength(3);
    await ejecutar(
      "UPDATE PERIODOS_NOMINA SET ESTADO='CERRADO',APROBADO_EN=SYSDATE,APROBADO_POR=:actor,CERRADO_EN=SYSDATE,CERRADO_POR=:actor WHERE ID_PERIODO_NOMINA=:id",
      { id, actor: admin.idUsuario },
    );
    expect(
      (await propio.agent.get('/api/tableros/empleado').expect(200)).body.data.ultimaBoleta.neto,
    ).toBe('2400');
    expect(
      (await ajeno.agent.get('/api/tableros/empleado').expect(200)).body.data.ultimaBoleta,
    ).toBeNull();
  });
  it('admin refleja usuarios/sesiones/estado sin hashes y filtra auditoría', async () => {
    const r = await administrador.agent.get('/api/tableros/admin').expect(200);
    expect(r.body.data.usuarios.find((u: { rol: string }) => u.rol === 'EMPLEADO').activos).toBe(2);
    expect(r.body.data.sistema.version).toBe(32);
    expect(r.body.data.sistema.objetosInvalidos).toBe(0);
    expect(r.body.data.sistema.sesionesActivas).toBe(4);
    expect(JSON.stringify(r.body.data)).not.toMatch(/TOKEN_HASH|CSRF_HASH|argon2id/);
    const a = await administrador.agent
      .get('/api/auditoria')
      .query({ entidad: 'ANUNCIOS', rol: 'RH', idEntidad: anuncio, limite: 1 })
      .expect(200);
    expect(a.body.data.total).toBe(3);
    expect(a.body.data.registros).toHaveLength(1);
    await administrador.agent
      .get('/api/auditoria/exportar')
      .query({ entidad: 'ANUNCIOS', rol: 'RH' })
      .expect(200);
  });
  it('aniversarios de febrero conservan 28 y ajustan 29, también en año bisiesto', async () => {
    const anio = Number(hora().slice(0, 4));
    const salto = (4 - (anio % 4)) % 4;
    expect(
      await escalar(
        `SELECT TO_CHAR(${aniversarioSql("DATE '1995-02-28'", salto)},'MM-DD') FROM DUAL`,
      ),
    ).toBe('02-28');
    expect(
      await escalar(
        `SELECT TO_CHAR(${aniversarioSql("DATE '1996-02-29'", salto)},'MM-DD') FROM DUAL`,
      ),
    ).toBe('02-29');
    expect(
      await escalar(
        `SELECT TO_CHAR(${aniversarioSql("DATE '1996-02-29'", salto + 1)},'MM-DD') FROM DUAL`,
      ),
    ).toBe('02-28');
  });
  it('fallo de auditoría al eliminar conserva publicación y sus avisos', async () => {
    await ejecutar(
      "CREATE OR REPLACE TRIGGER F11_FALLAR BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ENTIDAD='ANUNCIOS' AND :NEW.ACCION='ELIMINAR' THEN RAISE_APPLICATION_ERROR(-20099,'Fallo de prueba'); END IF; END;",
    );
    try {
      await rh.agent
        .delete(`/api/comunicacion/anuncios/${anuncio}`)
        .set('X-CSRF-Token', rh.csrf)
        .send({ version: 3, motivo: 'Eliminación de prueba para rollback', confirmado: true })
        .expect(500);
    } finally {
      await ejecutar('DROP TRIGGER F11_FALLAR');
    }
    expect(
      Number(await escalar('SELECT ACTIVO FROM ANUNCIOS WHERE ID_ANUNCIO=:id', { id: anuncio })),
    ).toBe(1);
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE ID_ANUNCIO=:id AND ACTIVO=1', {
          id: anuncio,
        }),
      ),
    ).toBe(1);
  });
  it('eliminación motivada retira publicación y avisos; doble eliminación rechazada', async () => {
    const borrar = () =>
      rh.agent
        .delete(`/api/comunicacion/anuncios/${anuncio}`)
        .set('X-CSRF-Token', rh.csrf)
        .send({ version: 3, motivo: 'Publicación ya comunicada al equipo', confirmado: true });
    await borrar().expect(200);
    await borrar().expect(409);
    await propio.agent.get(`/api/comunicacion/anuncios/${anuncio}`).expect(404);
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE ID_ANUNCIO=:id AND ACTIVO=1', {
          id: anuncio,
        }),
      ),
    ).toBe(0);
  });
});
