import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Express } from 'express';
import request from 'supertest';
import { Decimal } from 'decimal.js';
import { crearApp } from '../../../app.js';
import { crearBaseDatos, type BaseDatos } from '../pool.js';
import { validarEntorno } from '../../../config/env.schema.js';
import { crearLogger } from '../../../config/logger.js';
import { generarContrasenaTemporal } from '../../security/credenciales.js';
import { crearAuthService, type ConfigSeguridad } from '../../../modules/auth/auth.service.js';
import { crearUsuariosService } from '../../../modules/usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../../../modules/auditoria/auditoria.service.js';
import { crearEmpleadosService } from '../../../modules/empleados/empleados.service.js';
import { crearNominaService } from '../../../modules/nomina/nomina.service.js';
import { crearTablerosService } from '../../../modules/tableros/tableros.service.js';
import { crearVacacionesService } from '../../../modules/vacaciones/vacaciones.service.js';
import { cargarDataset } from './datos.js';
import { filas } from './repository.js';
import { capturaVerificacion } from './verificar.repository.js';
import type { InformeVerificacion } from './verificar.service.js';

const raiz = fileURLToPath(new URL('../../../../../', import.meta.url));
const d = await cargarDataset();
const contrasena = generarContrasenaTemporal();
let db: BaseDatos;
let app: Express;
const config: ConfigSeguridad = {
  NODE_ENV: 'test',
  SESSION_IDLE_MINUTES: 30,
  LOGIN_RATE_LIMIT: 100,
  LOGIN_RATE_WINDOW_MINUTES: 15,
  TRUST_PROXY_CIDRS: '',
};
function cli(script: string, args: string[] = [], env: Record<string, string | undefined> = {}) {
  return execFileSync(process.execPath, [`scripts/${script}`, ...args], {
    cwd: raiz,
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, SEED_DEFAULT_PASSWORD: contrasena, ...env },
  });
}
function verificar(
  args: string[] = [],
  env: Record<string, string | undefined> = {},
): InformeVerificacion {
  return JSON.parse(cli('verify-seed.js', args, env));
}
function informeFallido(args: string[] = []): InformeVerificacion {
  try {
    verificar(args);
    throw new Error('Se esperaba un rechazo de integridad.');
  } catch (e) {
    if (e && typeof e === 'object' && 'stdout' in e) return JSON.parse(String(e.stdout));
    throw e;
  }
}
const captura = () => db.conConexion((c) => capturaVerificacion(c, d.configuracion.conjunto));
async function entrar(correo: string) {
  const u = await db.conConexion(
    async (c) =>
      (
        await filas<{ USUARIO: string; ID: number }>(
          c,
          'SELECT USUARIO,ID_USUARIO ID FROM USUARIOS WHERE CORREO=:correo',
          { correo },
        )
      )[0]!,
  );
  const agent = request.agent(app),
    inicio = await agent.get('/api/auth/csrf').expect(200);
  const login = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', inicio.body.data.csrfToken)
    .send({ usuario: u.USUARIO, contrasena })
    .expect(200);
  expect(login.body.data.usuario.cambioObligatorio).toBe(true);
  const bloqueo = await agent.get('/api/tableros/empleado').expect(403);
  expect(bloqueo.body.error.codigo).toBe('CAMBIO_CONTRASENA_OBLIGATORIO');
  const cambio = await agent
    .post('/api/auth/cambiar-contrasena')
    .set('X-CSRF-Token', login.body.data.csrfToken)
    .send({ contrasenaActual: contrasena, contrasenaNueva: generarContrasenaTemporal() })
    .expect(200);
  return { agent, csrf: cambio.body.data.csrfToken as string, usuario: u.ID };
}
describe('Aceptación del verificador y del dataset demo mediante API real', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo se permiten esquemas desechables N2SEC.');
    db = await crearBaseDatos(validarEntorno(process.env));
    cli('seed-demo.js', ['--apply-schema']);
    await db.conConexion(async (c) => {
      await c.execute("INSERT INTO BANCOS(NOMBRE) VALUES('Banco previo de verificación')");
      await c.commit();
    });
    const auth = await crearAuthService(db, config);
    app = crearApp(
      {
        consultar: async () => ({
          estado: 'OK',
          baseDatos: 'CONECTADA',
          modo: 'thin',
          fecha: new Date().toISOString(),
        }),
      },
      crearLogger('silent'),
      {
        auth,
        config,
        usuarios: crearUsuariosService(db),
        auditoria: crearAuditoriaService(db),
        empleados: crearEmpleadosService(db),
        nomina: crearNominaService(db),
        tableros: crearTablerosService(db),
        vacaciones: crearVacacionesService(db),
      },
    );
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('revisa solo lectura, separa conteos previos y no expone identificaciones o credenciales', async () => {
    const antes = await captura(),
      r = verificar();
    expect(r.ok).toBe(true);
    expect(r.conteos.EMPLEADOS?.encontrados).toBe(32);
    expect(r.conteos.BANCOS).toEqual({ esperados: 5, encontrados: 5, total: 6 });
    expect(r.comprobaciones.find((c) => c.codigo === 'CICLOS_JERARQUIA')?.estado).toBe('NO_APLICA');
    expect(r.comprobaciones.find((c) => c.codigo === 'IDEMPOTENCIA')?.estado).toBe('NO_EJECUTADA');
    expect(await captura()).toEqual(antes);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain(contrasena);
    expect(texto).not.toContain('$argon2');
    for (const e of d.empleados)
      for (const v of [e.dpi, e.nit, e.cuentaBancaria, e.correo])
        expect(texto.includes(v)).toBe(false);
    const anticipo = await crearNominaService(db).simular({
      mes: d.configuracion.fechaReferencia.slice(0, 7),
      tipoPago: 'ANTICIPO',
      objetivo: 'TODOS',
    });
    expect(anticipo.registros).toHaveLength(32);
    expect(
      anticipo.registros.every((r) => r.resultado && new Decimal(r.resultado.neto).gte(0)),
    ).toBe(true);
  });
  it('invoca dos veces el seed sin DML y exige todas las variables de un destino remoto', async () => {
    const antes = await captura(),
      r = verificar(['--remote', '--check-idempotency'], {
        DEST_DB_USER: process.env.DB_USER,
        DEST_DB_PASSWORD: process.env.DB_PASSWORD,
        DEST_DB_CONNECT_STRING: process.env.DB_CONNECT_STRING,
        DB_USER: 'LOCAL_PROHIBIDO',
        DB_PASSWORD: 'no-utilizar',
        DB_CONNECT_STRING: 'inexistente:1/X',
      });
    expect(r.ok).toBe(true);
    expect(r.comprobaciones.find((c) => c.codigo === 'IDEMPOTENCIA')?.estado).toBe('OK');
    expect(await captura()).toEqual(antes);
    expect(() => verificar(['--remote'], { DEST_DB_USER: '' })).toThrow();
  });
  it('detecta fechas, salarios y horarios inválidos sin repararlos ni ejecutar el seed', async () => {
    const e = d.empleados[0]!;
    await db.conConexion(async (c) => {
      await c.execute(
        "UPDATE EMPLEADOS SET FECHA_NACIMIENTO=DATE '2010-01-01' WHERE CORREO=:correo",
        { correo: e.correo },
      );
      await c.execute(
        'UPDATE HISTORIAL_SALARIAL SET SALARIO_BASE=100 WHERE ID_EMPLEADO=(SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CORREO=:correo)',
        { correo: e.correo },
      );
      await c.execute(
        'UPDATE EMPLEADO_HORARIO SET ACTIVO=0 WHERE ID_EMPLEADO=(SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CORREO=:correo)',
        { correo: e.correo },
      );
      await c.commit();
    });
    try {
      const antes = await captura(),
        r = informeFallido(['--check-idempotency']);
      const codigos = r.comprobaciones.filter((c) => c.estado === 'ERROR').map((c) => c.codigo);
      expect(codigos).toEqual(
        expect.arrayContaining(['FECHAS', 'SALARIOS', 'ASIGNACION_HORARIO', 'IDEMPOTENCIA']),
      );
      expect(await captura()).toEqual(antes);
    } finally {
      await db.conConexion(async (c) => {
        await c.execute(
          "UPDATE EMPLEADOS SET FECHA_NACIMIENTO=TO_DATE(:fecha,'YYYY-MM-DD') WHERE CORREO=:correo",
          { fecha: e.fechaNacimiento, correo: e.correo },
        );
        await c.execute(
          "UPDATE HISTORIAL_SALARIAL SET SALARIO_BASE=TO_NUMBER(:salario,'9999999999D99','NLS_NUMERIC_CHARACTERS=''.,''') WHERE ID_EMPLEADO=(SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CORREO=:correo)",
          { salario: e.salarioBase, correo: e.correo },
        );
        await c.execute(
          'UPDATE EMPLEADO_HORARIO SET ACTIVO=1 WHERE ID_EMPLEADO=(SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CORREO=:correo)',
          { correo: e.correo },
        );
        await c.commit();
      });
    }
  });
  it('distingue los extras ausentes y verifica su carga sin modificarla al repetir', async () => {
    const antes = await captura(),
      r = informeFallido(['--with-extras', '--check-idempotency']);
    expect(r.comprobaciones.some((c) => c.codigo === 'EXTRAS' && c.estado === 'ERROR')).toBe(true);
    expect(await captura()).toEqual(antes);
    const correo = d.empleados.find((e) => e.extras?.aperturaFiscal)!.correo;
    await db.conConexion(async (c) => {
      await c.execute(
        "INSERT INTO ISR_APERTURAS(ID_EMPLEADO,ANIO,FECHA_CORTE,RENTA,IGSS,ISR,MOTIVO) SELECT ID_EMPLEADO,2026,DATE '2026-09-30',1,0,0,'Apertura ajena testigo' FROM EMPLEADOS WHERE CORREO=:correo",
        { correo },
      );
      await c.commit();
    });
    try {
      const ajena = await captura();
      expect(() => cli('seed-demo.js', ['--with-extras'])).toThrow();
      expect(await captura()).toEqual(ajena);
    } finally {
      await db.conConexion(async (c) => {
        await c.execute("DELETE FROM ISR_APERTURAS WHERE MOTIVO='Apertura ajena testigo'");
        await c.commit();
      });
    }
    cli('seed-demo.js', ['--with-extras']);
    const completa = await captura(),
      resultado = verificar(['--with-extras', '--check-idempotency']);
    expect(resultado.ok).toBe(true);
    expect(await captura()).toEqual(completa);
  });
  it('RH inicia sesión, cambia la clave y consulta empleados, filtros, dashboard, vacaciones y nómina', async () => {
    const e = d.empleados.find((e) => e.rol === 'RH')!,
      { agent, csrf } = await entrar(e.correo);
    const lista = await agent.get('/api/empleados?limite=100').expect(200);
    expect(lista.body.data.total).toBe(32);
    expect(
      lista.body.data.registros.every((e: { perfilIncompleto: boolean }) => !e.perfilIncompleto),
    ).toBe(true);
    const fila = lista.body.data.registros[0] as { id: number };
    const detalle = await agent.get(`/api/empleados/${fila.id}`).expect(200);
    const filtro = await agent
      .get(`/api/empleados?idDepartamento=${detalle.body.data.idDepartamento}&limite=100`)
      .expect(200);
    expect(filtro.body.data.total).toBeGreaterThanOrEqual(6);
    const tablero = await agent.get('/api/tableros/rh').expect(200);
    expect(tablero.body.data.indicadores.activos).toBe(32);
    const celebraciones = await agent.get('/api/tableros/rh/celebraciones').expect(200);
    expect(celebraciones.body.data.cumpleanos.length).toBeGreaterThanOrEqual(3);
    expect(celebraciones.body.data.aniversarios.length).toBeGreaterThanOrEqual(2);
    await agent.get(`/api/vacaciones/empleados/${fila.id}/saldo`).expect(200);
    const antes = await db.conConexion(
      async (c) => (await c.execute<[number]>('SELECT COUNT(*) FROM PAGOS_NOMINA')).rows![0]![0],
    );
    const simulacion = await agent
      .post('/api/nomina/simular')
      .set('X-CSRF-Token', csrf)
      .send({
        mes: d.configuracion.fechaReferencia.slice(0, 7),
        tipoPago: 'PAGO',
        objetivo: 'TODOS',
      })
      .expect(200);
    expect(simulacion.body.data.registros).toHaveLength(32);
    expect(
      simulacion.body.data.registros.every(
        (r: { resultado: { neto: string } | null }) =>
          r.resultado !== null && new Decimal(r.resultado.neto).gte(0),
      ),
    ).toBe(true);
    expect(
      await db.conConexion(
        async (c) => (await c.execute<[number]>('SELECT COUNT(*) FROM PAGOS_NOMINA')).rows![0]![0],
      ),
    ).toBe(antes);
    await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf).send({}).expect(200);
  });
  it('el empleado accede a sus datos y vacaciones; las claves ya cambiadas se conservan al verificar', async () => {
    const e = d.empleados.find((e) => e.rol === 'EMPLEADO')!,
      { agent, csrf } = await entrar(e.correo);
    const tablero = await agent.get('/api/tableros/empleado').expect(200);
    expect(tablero.body.data.rol).toBe('EMPLEADO');
    expect(tablero.body.data.saldo.mensaje).toBeNull();
    const saldo = await agent.get('/api/vacaciones/mi-saldo').expect(200);
    expect(saldo.body.ok).toBe(true);
    await agent.get('/api/empleados').expect(403);
    await agent.get('/api/tableros/rh/remuneraciones').expect(403);
    const antes = await captura();
    const r = verificar(['--check-idempotency']);
    expect(r.ok).toBe(true);
    expect(await captura()).toEqual(antes);
    expect(r.comprobaciones.find((c) => c.codigo === 'CAMBIO_CONTRASENA')?.mensaje).toContain(
      'contraseña ya cambiada: 2',
    );
    await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf).send({}).expect(200);
  });
});
