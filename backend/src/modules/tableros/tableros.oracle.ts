import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import type { BindParameters } from 'oracledb';
import { crearApp } from '../../app.js';
import { crearBaseDatos } from '../../shared/db/pool.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { cargarMigraciones } from '../../shared/db/migraciones.archivos.js';
import { crearMigracionesRepository } from '../../shared/db/migraciones.repository.js';
import { aplicarMigraciones, ejecutarMigraciones } from '../../shared/db/migraciones.js';
import { ejecutarSeeds } from '../../shared/db/seeds.js';
import { validarEntornoSeeds } from '../../shared/db/seeds.env.js';
import { validarEntorno } from '../../config/env.schema.js';
import { crearLogger } from '../../config/logger.js';
import { crearAuthService } from '../auth/auth.service.js';
import { crearUsuariosService, crearUsuarioInterno } from '../usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { crearCatalogosService } from '../catalogos/catalogos.service.js';
import { crearTablerosService } from './tableros.service.js';
import { crearEstadisticasService } from './estadisticas.service.js';
import {
  remuneracionesSql,
  inasistenciasSql,
  vacacionesConteoSql,
  celebracionesSql,
} from './estadisticas.repository.js';
import type { ActorAuditoria } from '../auth/auth.types.js';
let db: BaseDatos, app: Express, actor: ActorAuditoria;
let hoy = '2026-12-31';
const seed = validarEntornoSeeds(process.env),
  logger = crearLogger('silent');
const sql = (query: string, binds: BindParameters = {}) =>
  enTransaccion(db, (c) => c.execute(query, binds));
const scalar = (query: string, binds: BindParameters = {}) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(query, binds)).rows![0]![0]);
let administrador: Awaited<ReturnType<typeof entrar>>,
  rh: typeof administrador,
  empleado: typeof administrador,
  temporal: typeof administrador;
const empleados: number[] = [],
  departamentos: number[] = [],
  salarios: number[] = [];
let tipos: { id: number; categoria: string }[] = [];
async function entrar(usuario: string, contrasena: string) {
  const agent = request.agent(app),
    token = (await agent.get('/api/auth/csrf').expect(200)).body.data.csrfToken;
  const r = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', token)
    .send({ usuario, contrasena })
    .expect(200);
  return { agent, csrf: r.body.data.csrfToken as string };
}
const get = (ruta: string) => rh.agent.get(`/api/tableros/rh/${ruta}`);
async function vacaciones(
  id: number,
  inicio: string,
  fin: string,
  dias: number,
  estado = 'APROBADA',
) {
  await sql(
    "INSERT INTO SOLICITUDES(ID_EMPLEADO,ID_TIPO_SOLICITUD) SELECT :id,ID_TIPO_SOLICITUD FROM TIPOS_SOLICITUD WHERE NVL(CODIGO_ANTERIOR,CODIGO)='VACACIONES'",
    { id },
  );
  const solicitud = Number(await scalar('SELECT MAX(ID_SOLICITUD) FROM SOLICITUDES'));
  await sql(
    `INSERT INTO VACACIONES_SOLICITUDES(ID_SOLICITUD,ID_EMPLEADO,FECHA_INICIO,FECHA_FIN,DIAS_SOLICITADOS,SALDO_AL_SOLICITAR,SALDO_AL_RESOLVER,ESTADO,RESUELTO_POR,RESUELTO_EN)
  VALUES(:solicitud,:id,TO_DATE(:inicio,'YYYY-MM-DD'),TO_DATE(:fin,'YYYY-MM-DD'),:dias,30,30,:estado,:actor,SYSDATE)`,
    { solicitud, id, inicio, fin, dias, estado, actor: actor.idUsuario },
  );
}
async function resultado(
  id: number,
  periodo: number,
  base: number,
  com: number,
  he: number,
  aus: number,
  version = 1,
  tipo = 'PAGO',
  motor = 'V1',
) {
  const indice = empleados.indexOf(id),
    dep = indice < 4 ? 0 : 1;
  const snapshot = JSON.stringify({
    entrada: {
      empleado: {
        id,
        idDepartamento: departamentos[dep],
        departamento: dep === 0 ? 'Ingeniería' : 'Ventas',
        nombres: `Persona${indice + 1} María`,
        apellidos: 'Prueba López',
      },
    },
  });
  await sql(
    `INSERT INTO NOMINA_EMPLEADO(ID_PERIODO_NOMINA,ID_EMPLEADO,ID_HISTORIAL_SALARIAL,VERSION_CALCULO,DIAS_PAGADOS,SALARIO_BASE,TOTAL_INGRESOS,TOTAL_DESCUENTOS,NETO,COSTO_PATRONAL,DATOS_EMPLEADO)
  VALUES(:periodo,:id,:salario,:version,30,:base,:bruto,:aus,:neto,0,:snapshot)`,
    {
      periodo,
      id,
      salario: salarios[indice]!,
      version,
      base,
      bruto: base + com + he + 250,
      aus,
      neto: base + com + he + 250 - aus,
      snapshot,
    },
  );
  const n = Number(await scalar('SELECT MAX(ID_NOMINA_EMPLEADO) FROM NOMINA_EMPLEADO'));
  for (const [orden, codigo, monto] of [
    [1, 'SALARIO_BASE', base],
    [2, 'COMISION', com],
    [3, 'HORAS_EXTRA', he],
    [4, 'AUSENCIA_SIN_GOCE', aus],
  ] as const)
    await sql(
      `INSERT INTO NOMINA_DETALLE(ID_NOMINA_EMPLEADO,ID_EMPLEADO,ID_PERIODO_NOMINA,ID_CONCEPTO_NOMINA,ORDEN,DESCRIPCION,NATURALEZA,BASE_CALCULO,CANTIDAD,MONTO,AFECTA_IGSS,AFECTA_ISR,AFECTA_PRESTACIONES)
    SELECT :n,:id,:periodo,ID_CONCEPTO_NOMINA,:orden,NOMBRE,NATURALEZA,:monto,1,:monto,AFECTA_IGSS,AFECTA_ISR,AFECTA_PRESTACIONES FROM CONCEPTOS_NOMINA WHERE CODIGO=:codigo`,
      { n, id, periodo, orden, monto, codigo },
    );
  if (motor === 'V1')
    await sql(
      "INSERT INTO PAGOS_NOMINA(ID_EMPLEADO,MES,TIPO_PAGO,ID_NOMINA_EMPLEADO) VALUES(:id,DATE '2026-12-01',:tipo,:n)",
      { id, tipo, n },
    );
  return n;
}
describe('R2-8: agregaciones protegidas con Oracle/Supertest', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version < 35),
        crearMigracionesRepository(c),
        logger,
      ),
    );
    await ejecutarSeeds(db, logger, seed);
    // Datos previos: comprobación de conservación y mapeo en actualización real.
    await sql(
      "INSERT INTO TIPOS_AUSENCIA(NOMBRE,EFECTO,ACTIVO) VALUES('Tipo histórico','SIN_GOCE',0)",
    );
    await ejecutarMigraciones(db, logger);
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
        tableros: {
          ...crearTablerosService(db),
          estadisticas: crearEstadisticasService(db, async () => `${hoy}T12:00:00-06:00`),
        },
        config,
      },
    );
    administrador = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD);
    const cambio = await administrador.agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', administrador.csrf)
      .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'Dashboard!2026' })
      .expect(200);
    administrador.csrf = cambio.body.data.csrfToken;
    actor = {
      idUsuario: Number(
        await scalar('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO=:u', { u: seed.ADMIN_USER }),
      ),
      idRol: Number(await scalar("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN'")),
      rol: 'ADMIN',
      ip: '127.0.0.1',
    };
    const cuentas = [];
    for (const [i, rol] of ['RH', 'EMPLEADO', 'RH'].entries()) {
      const u = await enTransaccion(db, (c) =>
        crearUsuarioInterno(c, actor, {
          nombre: ['Revisor', 'Colaborador', 'Temporal'][i]!,
          apellido: 'Dashboard',
          correo: `cuenta${i}@example.test`,
          rol: rol as 'RH' | 'EMPLEADO',
        }),
      );
      if (i < 2)
        await sql('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', {
          id: u.idUsuario,
        });
      cuentas.push(await entrar(u.usuario, u.contrasenaTemporal));
    }
    [rh, empleado, temporal] = cuentas as [typeof rh, typeof empleado, typeof temporal];
    await sql(
      "INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES('Centro dashboard','DASHBOARD')",
    );
    const centro = Number(
      await scalar("SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE NOMBRE='Centro dashboard'"),
    );
    const contrato = Number(await scalar('SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO'));
    await sql("INSERT INTO HORARIOS(NOMBRE,JORNADA) VALUES('Horario dashboard','DIURNA')");
    await sql(
      'INSERT INTO HORARIO_BLOQUES(ID_HORARIO,MINUTO_ENTRADA,MINUTO_SALIDA,MINUTOS_DESCANSO,CRUZA_MEDIANOCHE) SELECT MIN(ID_HORARIO),480,1020,60,0 FROM HORARIOS',
    );
    await sql(
      'INSERT INTO HORARIO_BLOQUE_DIAS(ID_HORARIO_BLOQUE,DIA_SEMANA) SELECT B.ID_HORARIO_BLOQUE,X.DIA FROM HORARIO_BLOQUES B CROSS JOIN(SELECT LEVEL DIA FROM DUAL CONNECT BY LEVEL<=5) X',
    );
    const horario = Number(await scalar('SELECT MIN(ID_HORARIO) FROM HORARIOS'));
    for (const nombre of ['Ingeniería', 'Ventas']) {
      await sql('INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES(:nombre)', { nombre });
      departamentos.push(
        Number(
          await scalar('SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NOMBRE=:nombre', {
            nombre,
          }),
        ),
      );
    }
    for (const [i, dep] of departamentos.entries())
      await sql('INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) VALUES(:nombre,:dep)', {
        nombre: `Puesto ${i}`,
        dep,
      });
    for (let i = 0; i < 7; i++) {
      const dep = departamentos[i < 4 ? 0 : 1]!;
      const nace = [
        '1990-12-31',
        '1991-01-01',
        '1992-02-29',
        '1993-02-28',
        '1994-03-01',
        '1995-01-30',
        '1996-01-31',
      ][i]!;
      const ingreso = i === 2 ? '2020-02-29' : i === 1 ? '2020-01-01' : '2020-12-31';
      await sql(
        `INSERT INTO EMPLEADOS(NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO)
      VALUES(:nombre,'Prueba López',:dpi,:nit,TO_DATE(:nace,'YYYY-MM-DD'),'F','SOLTERO','Dirección','55551234',:correo,(SELECT ID_PUESTO FROM PUESTOS WHERE ID_DEPARTAMENTO=:dep),:dep,:contrato,:centro,TO_DATE(:ingreso,'YYYY-MM-DD'))`,
        {
          nombre: `Persona${i + 1} María`,
          dpi: `900000000000${i}`,
          nit: `90000${i}-0`,
          nace,
          correo: `persona${i}@example.test`,
          dep,
          contrato,
          centro,
          ingreso,
        },
      );
      const id = Number(await scalar('SELECT MAX(ID_EMPLEADO) FROM EMPLEADOS'));
      empleados.push(id);
      await sql(
        "INSERT INTO HISTORIAL_SALARIAL(ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES(:id,10000,DATE '2020-01-01','Fixture dashboard')",
        { id },
      );
      salarios.push(
        Number(await scalar('SELECT MAX(ID_HISTORIAL_SALARIAL) FROM HISTORIAL_SALARIAL')),
      );
      await sql(
        "INSERT INTO EMPLEADO_HORARIO(ID_EMPLEADO,ID_HORARIO,VIGENTE_DESDE,MOTIVO) VALUES(:id,:horario,DATE '2020-01-01','Fixture dashboard')",
        { id, horario },
      );
    }
    tipos = await db.conConexion(
      async (c) =>
        (
          await c.execute<{ id: number; categoria: string }>(
            'SELECT ID_TIPO_AUSENCIA "id",CATEGORIA_INASISTENCIA "categoria" FROM TIPOS_AUSENCIA ORDER BY ID_TIPO_AUSENCIA',
            {},
            { outFormat: 4002 },
          )
        ).rows!,
    );
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('migra categorías, conserva históricos y permite editar la clasificación sin alterar la nómina', async () => {
    expect(
      await scalar(
        "SELECT CATEGORIA_INASISTENCIA FROM TIPOS_AUSENCIA WHERE NOMBRE='Tipo histórico'",
      ),
    ).toBe('JUSTIFICADA_SIN_GOCE');
    expect(await scalar("SELECT ACTIVO FROM TIPOS_AUSENCIA WHERE NOMBRE='Tipo histórico'")).toBe(0);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM TIPOS_AUSENCIA WHERE CATEGORIA_INASISTENCIA<>CASE WHEN CODIGO_ANTERIOR='INJUSTIFICADA' OR NOMBRE='Inasistencia sin justificación' THEN 'SIN_JUSTIFICAR' WHEN EFECTO='SUBSIDIO_IGSS' THEN 'IGSS_JUSTIFICADA' WHEN EFECTO='CON_GOCE' THEN 'JUSTIFICADA_CON_GOCE' ELSE 'JUSTIFICADA_SIN_GOCE' END",
      ),
    ).toBe(0);
    expect(
      await scalar(
        "SELECT EFECTO FROM TIPOS_AUSENCIA WHERE NOMBRE='Inasistencia sin justificación'",
      ),
    ).toBe('SIN_GOCE');
    expect(await ejecutarMigraciones(db, logger)).toBe(0);
    await ejecutarSeeds(db, logger, seed);
    await sql(
      "INSERT INTO TIPOS_AUSENCIA(NOMBRE,EFECTO) VALUES('Alta anterior sin categoría','CON_GOCE')",
    );
    const id = Number(
      await scalar(
        "SELECT ID_TIPO_AUSENCIA FROM TIPOS_AUSENCIA WHERE NOMBRE='Alta anterior sin categoría'",
      ),
    );
    const body = {
      nombre: 'Alta anterior sin categoría',
      efecto: 'CON_GOCE',
      descripcion: null,
      categoriaInasistencia: 'SIN_JUSTIFICAR',
    };
    const r = await rh.agent
      .patch(`/api/catalogos/tipos-ausencia/${id}`)
      .set('X-CSRF-Token', rh.csrf)
      .send(body)
      .expect(200);
    expect(r.body.data.categoriaInasistencia).toBe('SIN_JUSTIFICAR');
    expect(r.body.data.efecto).toBe('CON_GOCE');
    expect(r.body.data.colorInasistencia).toBe('rojo');
    await rh.agent
      .patch(`/api/catalogos/tipos-ausencia/${id}`)
      .set('X-CSRF-Token', rh.csrf)
      .send({ ...body, categoriaInasistencia: 'INVALIDA' })
      .expect(400);
    await rh.agent
      .patch(`/api/catalogos/tipos-ausencia/${id}`)
      .set('X-CSRF-Token', rh.csrf)
      .send({ nombre: body.nombre, efecto: body.efecto, descripcion: null })
      .expect(200);
    expect(
      await scalar('SELECT CATEGORIA_INASISTENCIA FROM TIPOS_AUSENCIA WHERE ID_TIPO_AUSENCIA=:id', {
        id,
      }),
    ).toBe('SIN_JUSTIFICAR');
    await expect(
      sql(
        "UPDATE TIPOS_AUSENCIA SET CATEGORIA_INASISTENCIA='INVALIDA' WHERE ID_TIPO_AUSENCIA=:id",
        { id },
      ),
    ).rejects.toThrow(/ORA-02290/);
  });
  it('protege los cuatro conjuntos: 401 anónimo, 403 empleado/temporal, 200 RH/ADMIN y no-store', async () => {
    for (const ruta of ['remuneraciones', 'inasistencias', 'vacaciones', 'celebraciones']) {
      const url = `/api/tableros/rh/${ruta}`;
      await request(app).get(url).expect(401);
      const prohibido = await empleado.agent.get(url).expect(403);
      expect(prohibido.body.data).toBeNull();
      await temporal.agent.get(url).expect(403);
      for (const cuenta of [rh, administrador]) {
        const r = await cuenta.agent.get(url).expect(200);
        expect(r.body.ok).toBe(true);
        expect(r.headers['cache-control']).toBe('private, no-store');
      }
    }
  });
  it('rechaza filtros desconocidos, fechas inexistentes y horizontes sin permitir inyección', async () => {
    for (const ruta of [
      'remuneraciones?mes=2026-13',
      'remuneraciones?agrupar=salario',
      'remuneraciones?metrica=NETO',
      'inasistencias?fecha=2026-02-30',
      'inasistencias?periodo=semana',
      'vacaciones?dias=31',
      'vacaciones?limite=101',
      'celebraciones?fecha=2026-01-01',
      'remuneraciones?sql=1',
    ])
      await get(ruta).expect(400);
  });
  it('top 5 por cada métrica/departamento: sin anticipo, prestación, reversión ni versiones antiguas', async () => {
    for (const dia of [1, 16])
      await sql(
        `INSERT INTO PERIODOS_NOMINA(FECHA_INICIO,FECHA_FIN,QUINCENA,MOTOR) VALUES(TO_DATE(:inicio,'YYYY-MM-DD'),TO_DATE(:fin,'YYYY-MM-DD'),:q,'V1')`,
        {
          inicio: `2026-12-${dia === 1 ? '01' : '16'}`,
          fin: `2026-12-${dia === 1 ? '15' : '31'}`,
          q: dia === 1 ? 1 : 2,
        },
      );
    const periodo = Number(
      await scalar(
        "SELECT ID_PERIODO_NOMINA FROM PERIODOS_NOMINA WHERE FECHA_INICIO=DATE '2026-12-16'",
      ),
    );
    const anticipo = Number(
      await scalar(
        "SELECT ID_PERIODO_NOMINA FROM PERIODOS_NOMINA WHERE FECHA_INICIO=DATE '2026-12-01'",
      ),
    );
    for (let i = 0; i < 7; i++)
      await resultado(
        empleados[i]!,
        periodo,
        (i + 1) * 1000,
        (7 - i) * 100,
        i * 10,
        i === 6 ? 200 : 0,
      );
    await resultado(empleados[6]!, anticipo, 90000, 90000, 90000, 0, 1, 'ANTICIPO');
    await resultado(empleados[6]!, anticipo, 80000, 0, 0, 0, 2, 'AGUINALDO');
    await resultado(empleados[6]!, periodo, 70000, 0, 0, 0, 2, 'PAGO', 'SIN_PAGO');
    const q = '?mes=2026-12';
    const base = (await get(`remuneraciones${q}&metrica=salarioBase`).expect(200)).body.data;
    expect(base.registros.map((r: { id: number }) => r.id)).toEqual(
      [6, 5, 4, 3, 2].map((i) => empleados[i]),
    );
    expect(base.registros[0].valor).toBe('7000.00');
    expect(
      (await get(`remuneraciones${q}&metrica=comisiones`).expect(200)).body.data.registros.map(
        (r: { valor: string }) => r.valor,
      ),
    ).toEqual(['700.00', '600.00', '500.00', '400.00', '300.00']);
    expect(
      (await get(`remuneraciones${q}&metrica=horasExtra`).expect(200)).body.data.registros[0].valor,
    ).toBe('60.00');
    const total = (await get(`remuneraciones${q}`).expect(200)).body.data;
    expect(total.registros[0].totalDevengado).toBe('7210.00');
    const dep = (await get(`remuneraciones${q}&agrupar=departamento`).expect(200)).body.data
      .registros;
    expect(dep.map((r: { totalDevengado: string }) => r.totalDevengado)).toEqual([
      '19300.00',
      '13260.00',
    ]);
    expect((await get('remuneraciones?mes=2026-11').expect(200)).body.data.registros).toEqual([]);
    await sql(
      "UPDATE PAGOS_NOMINA SET ESTADO='REVERTIDO',MOTIVO_REVERSION='Ensayo de reversión',REVERTIDO_POR=:actor,REVERTIDO_EN=SYSDATE WHERE ID_EMPLEADO=:id AND TIPO_PAGO='PAGO'",
      { actor: actor.idUsuario, id: empleados[6]! },
    );
    expect(
      (await get(`remuneraciones${q}&metrica=salarioBase`).expect(200)).body.data.registros[0]
        .valor,
    ).toBe('6000.00');
  });
  it('nómina v0: suma quincenas cerradas actuales, sin duplicar salario nominal ni cálculos descartados', async () => {
    for (const [q, inicio, fin] of [
      [1, '01', '15'],
      [2, '16', '30'],
    ] as const) {
      await sql(
        `INSERT INTO PERIODOS_NOMINA(FECHA_INICIO,FECHA_FIN,QUINCENA,MOTOR,ESTADO,VERSION_CALCULO,APROBADO_POR,APROBADO_EN,CERRADO_POR,CERRADO_EN) VALUES(TO_DATE(:inicio,'YYYY-MM-DD'),TO_DATE(:fin,'YYYY-MM-DD'),:q,'V0','CERRADO',2,:actor,SYSDATE,:actor,SYSDATE)`,
        { inicio: `2026-11-${inicio}`, fin: `2026-11-${fin}`, q, actor: actor.idUsuario },
      );
      const id = Number(await scalar('SELECT MAX(ID_PERIODO_NOMINA) FROM PERIODOS_NOMINA'));
      await resultado(empleados[0]!, id, 9000, 0, 0, 0, 1, 'PAGO', 'V0');
      await resultado(empleados[0]!, id, 1000, 100, 10, 0, 2, 'PAGO', 'V0');
    }
    const r = (await get('remuneraciones?mes=2026-11').expect(200)).body.data.registros;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      salarioBase: '2000.00',
      comisiones: '200.00',
      horasExtra: '20.00',
      totalDevengado: '2720.00',
    });
  });
  it('suma las cuatro categorías, recorta rangos y conserva leyenda global además del top', async () => {
    for (const [categoria, inicio, fin] of [
      ['IGSS_JUSTIFICADA', '2026-11-29', '2026-12-02'],
      ['JUSTIFICADA_CON_GOCE', '2026-12-04', '2026-12-06'],
      ['JUSTIFICADA_SIN_GOCE', '2026-12-10', '2026-12-13'],
      ['SIN_JUSTIFICAR', '2026-12-30', '2027-01-03'],
    ] as const) {
      const tipo = tipos.find((t) => t.categoria === categoria)!.id;
      const dias = (Date.parse(fin) - Date.parse(inicio)) / 86400000 + 1;
      await sql(
        `INSERT INTO AUSENCIAS(ID_EMPLEADO,ID_TIPO_AUSENCIA,FECHA_INICIO,FECHA_FIN,DIAS,ESTADO,MOTIVO,APROBADO_POR) VALUES(:id,:tipo,TO_DATE(:inicio,'YYYY-MM-DD'),TO_DATE(:fin,'YYYY-MM-DD'),:dias,'APROBADA','Ensayo dashboard',:actor)`,
        { id: empleados[0]!, tipo, inicio, fin, dias, actor: actor.idUsuario },
      );
    }
    for (let i = 1; i < 7; i++)
      await sql(
        `INSERT INTO AUSENCIAS(ID_EMPLEADO,ID_TIPO_AUSENCIA,FECHA_INICIO,FECHA_FIN,DIAS,ESTADO,MOTIVO,APROBADO_POR) VALUES(:id,:tipo,DATE '2026-12-01',DATE '2026-12-01',1,'APROBADA','Ensayo',:actor)`,
        {
          id: empleados[i]!,
          tipo: tipos.find((t) => t.categoria === 'SIN_JUSTIFICAR')!.id,
          actor: actor.idUsuario,
        },
      );
    await sql(
      `INSERT INTO AUSENCIAS(ID_EMPLEADO,ID_TIPO_AUSENCIA,FECHA_INICIO,FECHA_FIN,DIAS,ESTADO,MOTIVO) VALUES(:id,:tipo,DATE '2026-12-01',DATE '2026-12-31',31,'PENDIENTE','No contar pendiente')`,
      { id: empleados[6]!, tipo: tipos[0]!.id },
    );
    const r = (await get('inasistencias?fecha=2026-12-15').expect(200)).body.data;
    expect(r.registros).toHaveLength(5);
    expect(r.registros.slice(1).map((f: { id: number }) => f.id)).toEqual(empleados.slice(1, 5));
    expect(r.registros[0].totalDias).toBe('11.00');
    expect(r.registros[0].categorias.map((c: { dias: string }) => c.dias)).toEqual([
      '2.00',
      '3.00',
      '4.00',
      '2.00',
    ]);
    expect(r.categorias.map((c: { dias: string }) => c.dias)).toEqual([
      '2.00',
      '3.00',
      '4.00',
      '8.00',
    ]);
    expect(r.totalDias).toBe('17.00');
    expect(r.categorias.map((c: { color: string }) => c.color)).toEqual([
      'verde',
      'amarillo',
      'naranja',
      'rojo',
    ]);
    const dep = (await get('inasistencias?fecha=2026-12-01&agrupar=departamento').expect(200)).body
      .data;
    expect(dep.registros.map((d: { totalDias: string }) => d.totalDias)).toEqual(['14.00', '3.00']);
    expect(
      (await get('inasistencias?fecha=2026-12-31&periodo=trimestre').expect(200)).body.data
        .totalDias,
    ).toBe('19.00');
    expect(
      (await get('inasistencias?fecha=2027-01-01&periodo=anio').expect(200)).body.data.totalDias,
    ).toBe('3.00');
  });
  it('conserva fracciones históricas de ausencias entre meses', async () => {
    await sql(
      `INSERT INTO AUSENCIAS(ID_EMPLEADO,ID_TIPO_AUSENCIA,FECHA_INICIO,FECHA_FIN,DIAS,ESTADO,MOTIVO,APROBADO_POR) VALUES(:id,:tipo,DATE '2026-01-31',DATE '2026-02-01',1,'APROBADA','Dos medias jornadas históricas',:actor)`,
      {
        id: empleados[0]!,
        tipo: tipos.find((t) => t.categoria === 'SIN_JUSTIFICAR')!.id,
        actor: actor.idUsuario,
      },
    );
    for (const mes of ['01', '02'])
      expect(
        (await get(`inasistencias?fecha=2026-${mes}-01`).expect(200)).body.data.totalDias,
      ).toBe('0.50');
    expect(
      (await get('inasistencias?fecha=2026-01-01&periodo=trimestre').expect(200)).body.data
        .totalDias,
    ).toBe('1.00');
  });
  it('vacaciones que cruzan mes/año: días aprobados completos, límites 30/60/90 y contador laboral independiente de paginación', async () => {
    hoy = '2026-12-30';
    await vacaciones(empleados[0]!, '2026-12-28', '2027-01-05', 6);
    await vacaciones(empleados[1]!, '2026-12-30', '2027-01-04', 3);
    await vacaciones(empleados[2]!, '2027-01-29', '2027-02-03', 4);
    await vacaciones(empleados[3]!, '2027-02-28', '2027-03-02', 2);
    await vacaciones(empleados[4]!, '2027-03-30', '2027-04-02', 4);
    await vacaciones(empleados[5]!, '2027-01-01', '2027-01-04', 2, 'CANCELADA');
    const r = (await get('vacaciones?dias=30&limite=1').expect(200)).body.data;
    expect(r.totalEnCurso).toBe(2);
    expect(r.totalProximas).toBe(1);
    expect(r.ausentesHoy).toBe(2);
    expect(r.enCurso).toHaveLength(1);
    expect(r.enCurso[0]).toMatchObject({
      inicio: '2026-12-28',
      fin: '2027-01-05',
      diasLaborales: '6.00',
    });
    expect(
      (await get('vacaciones?dias=30&pagina=2&limite=1').expect(200)).body.data.enCurso[0]
        .idEmpleado,
    ).toBe(empleados[1]);
    expect((await get('vacaciones?dias=60').expect(200)).body.data.totalProximas).toBe(2);
    expect((await get('vacaciones?dias=90').expect(200)).body.data.totalProximas).toBe(3);
    hoy = '2027-01-02';
    expect((await get('vacaciones').expect(200)).body.data.ausentesHoy).toBe(0);
    hoy = '2026-12-30';
    await sql(
      "INSERT INTO FERIADOS(NOMBRE,FECHA,FECHA_CONMEMORACION,AMBITO,LOCALIDAD,MINUTO_INICIO,MINUTO_FIN,FUNDAMENTO) VALUES('Feriado ensayo',DATE '2026-12-30',DATE '2026-12-30','LOCAL','DASHBOARD',0,1440,'Fixture dashboard')",
    );
    expect((await get('vacaciones').expect(200)).body.data.ausentesHoy).toBe(0);
    hoy = '2026-12-31';
  });
  it('celebraciones: cruza diciembre/enero, incluye hoy/día 30 y excluye día 31, sin edad ni nacimiento', async () => {
    hoy = '2026-12-31';
    const r = (await get('celebraciones').expect(200)).body.data;
    expect(r.cumpleanos.map((c: { fecha: string }) => c.fecha)).toEqual([
      '2026-12-31',
      '2027-01-01',
      '2027-01-30',
    ]);
    expect(r.cumpleanos[0].esHoy).toBe(true);
    expect(r.cumpleanos[1].esHoy).toBe(false);
    expect(
      r.aniversarios.find((c: { idEmpleado: number }) => c.idEmpleado === empleados[1]),
    ).toMatchObject({ fecha: '2027-01-01', anios: 7, esHoy: false });
    for (const cumple of r.cumpleanos) {
      expect(cumple).not.toHaveProperty('anios');
      expect(cumple).not.toHaveProperty('edad');
      expect(cumple).not.toHaveProperty('nacimiento');
    }
  });
  it('29 de febrero: usa 28 en año común, 29 en bisiesto y nunca desplaza un 28 a 29', async () => {
    hoy = '2027-02-28';
    let r = (await get('celebraciones').expect(200)).body.data;
    expect(
      r.cumpleanos.find((c: { idEmpleado: number }) => c.idEmpleado === empleados[2]),
    ).toMatchObject({ fecha: '2027-02-28', esHoy: true });
    expect(
      r.aniversarios.find((c: { idEmpleado: number }) => c.idEmpleado === empleados[2]),
    ).toMatchObject({ fecha: '2027-02-28', anios: 7 });
    hoy = '2028-02-28';
    r = (await get('celebraciones').expect(200)).body.data;
    expect(
      r.cumpleanos.find((c: { idEmpleado: number }) => c.idEmpleado === empleados[2]),
    ).toMatchObject({ fecha: '2028-02-29', esHoy: false });
    expect(
      r.cumpleanos.find((c: { idEmpleado: number }) => c.idEmpleado === empleados[3]),
    ).toMatchObject({ fecha: '2028-02-28', esHoy: true });
    hoy = '2028-02-29';
    r = (await get('celebraciones').expect(200)).body.data;
    expect(r.cumpleanos.filter((c: { esHoy: boolean }) => c.esHoy)).toHaveLength(1);
    hoy = '2026-12-31';
  });
  it('revisa planes y tiempos de las consultas pesadas sin escribir datos operativos', async () => {
    await sql(
      `INSERT INTO AUSENCIAS(ID_EMPLEADO,ID_TIPO_AUSENCIA,FECHA_INICIO,FECHA_FIN,DIAS,ESTADO,MOTIVO,APROBADO_POR)
      SELECT :id,:tipo,DATE '1980-01-01'+LEVEL,DATE '1980-01-01'+LEVEL,1,'APROBADA','Volumen exclusivo de prueba',:actor FROM DUAL CONNECT BY LEVEL<=12000`,
      { id: empleados[0]!, tipo: tipos[0]!.id, actor: actor.idUsuario },
    );
    await sql(
      `INSERT INTO SOLICITUDES(ID_EMPLEADO,ID_TIPO_SOLICITUD,OBSERVACIONES)
      SELECT :id,T.ID_TIPO_SOLICITUD,'VOLUMEN_DASHBOARD' FROM TIPOS_SOLICITUD T CROSS JOIN(SELECT LEVEL N FROM DUAL CONNECT BY LEVEL<=1200)
      WHERE NVL(T.CODIGO_ANTERIOR,T.CODIGO)='VACACIONES'`,
      { id: empleados[0]! },
    );
    await sql(
      `INSERT INTO VACACIONES_SOLICITUDES(ID_SOLICITUD,ID_EMPLEADO,FECHA_INICIO,FECHA_FIN,DIAS_SOLICITADOS,SALDO_AL_SOLICITAR,SALDO_AL_RESOLVER,ESTADO,RESUELTO_POR,RESUELTO_EN)
      SELECT ID_SOLICITUD,ID_EMPLEADO,DATE '1980-01-01'+ROW_NUMBER() OVER(ORDER BY ID_SOLICITUD),DATE '1980-01-01'+ROW_NUMBER() OVER(ORDER BY ID_SOLICITUD),1,30,30,'TOMADA',:actor,SYSDATE FROM SOLICITUDES WHERE OBSERVACIONES='VOLUMEN_DASHBOARD'`,
      { actor: actor.idUsuario },
    );
    for (const tabla of [
      'AUSENCIAS',
      'VACACIONES_SOLICITUDES',
      'PAGOS_NOMINA',
      'EMPLEADOS',
      'NOMINA_EMPLEADO',
    ])
      await sql(
        'BEGIN DBMS_STATS.GATHER_TABLE_STATS(OWNNAME=>USER,TABNAME=>:tabla,CASCADE=>TRUE); END;',
        { tabla },
      );
    const planes: Record<string, unknown> = {};
    // EXPLAIN usa tipos explícitos en el calendario para no inferir DATE como número con binds.
    await db.conConexion(async (c) => {
      for (const [nombre, query, binds] of [
        [
          'REMUNERACIONES',
          remuneracionesSql({ agrupar: 'departamento', metrica: 'totalDevengado' }),
          { inicio: '2026-12-01' },
        ],
        [
          'INASISTENCIAS',
          inasistenciasSql('departamento'),
          { inicio: '2026-01-01', fin: '2026-12-31' },
        ],
        ['VACACIONES', vacacionesConteoSql, { hoy: '2026-12-31', dias: 90 }],
        ['CELEBRACIONES', celebracionesSql, { hoy: '2026-12-31' }],
      ] as const) {
        await c.execute(`EXPLAIN PLAN SET STATEMENT_ID='${nombre}' FOR ${query}`, binds);
        const plan = (
          await c.execute<string[]>(
            "SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE',:nombre,'BASIC +PREDICATE +COST'))",
            { nombre },
          )
        )
          .rows!.flat()
          .join('\n');
        expect(plan).toMatch(/SELECT STATEMENT/);
        expect(plan).toMatch(/Predicate Information/);
        if (nombre === 'REMUNERACIONES') expect(plan).toContain('IX_PAGO_TABLERO');
        if (nombre === 'INASISTENCIAS') expect(plan).toContain('IX_AUS_TABLERO');
        if (nombre === 'VACACIONES') expect(plan).toContain('IX_VAC_TABLERO');
        const inicio = performance.now();
        await c.execute(query, binds);
        const ms = performance.now() - inicio;
        expect(ms).toBeLessThan(2000);
        planes[nombre] = { plan, ms: Math.round(ms * 100) / 100 };
      }
      await c.rollback();
    });
    const ruta = fileURLToPath(
      new URL('../../../../tmp/dashboard-rh-planes.json', import.meta.url),
    );
    await mkdir(fileURLToPath(new URL('../../../../tmp/', import.meta.url)), { recursive: true });
    await writeFile(ruta, JSON.stringify(planes, null, 2));
    expect(await scalar("SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'")).toBe(0);
  });
});
