import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { BindParameters } from 'oracledb';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { crearApp } from '../../app.js';
import { crearBaseDatos } from '../../shared/db/pool.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { aplicarMigraciones, ejecutarMigraciones } from '../../shared/db/migraciones.js';
import { cargarMigraciones } from '../../shared/db/migraciones.archivos.js';
import { crearMigracionesRepository } from '../../shared/db/migraciones.repository.js';
import { ejecutarSeeds } from '../../shared/db/seeds.js';
import { validarEntornoSeeds } from '../../shared/db/seeds.env.js';
import { validarEntorno } from '../../config/env.schema.js';
import { crearLogger } from '../../config/logger.js';
import { crearAuthService } from '../auth/auth.service.js';
import type { ActorAuditoria, Rol } from '../auth/auth.types.js';
import { crearUsuariosService, crearUsuarioInterno } from '../usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { crearTablerosService } from './tableros.service.js';
import { crearComisionesService } from './comisiones.service.js';
import { consultaComisiones } from './comisiones.repository.js';
import { comisionesQuerySchema } from './comisiones.schemas.js';

let db: BaseDatos, app: Express, actor: ActorAuditoria;
const logger = crearLogger('silent'),
  seed = validarEntornoSeeds(process.env);
const sql = (query: string, binds: BindParameters = {}) =>
  enTransaccion(db, (c) => c.execute(query, binds));
const scalar = (query: string, binds: BindParameters = {}) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(query, binds)).rows![0]![0]);
async function entrar(usuario: string, contrasena: string) {
  const agent = request.agent(app);
  const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const r = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', token)
    .send({ usuario, contrasena })
    .expect(200);
  return { agent, csrf: r.body.data.csrfToken as string };
}
let admin: Awaited<ReturnType<typeof entrar>>,
  rh: typeof admin,
  jefe: typeof admin,
  empleado: typeof admin,
  temporal: typeof admin;
const ids: number[] = [],
  deps: number[] = [],
  jefaturas: number[] = [];
const base = '/api/tableros/comisiones/';
const rango = { desde: '2026-01', hasta: '2026-03' };
const get = (ruta: string, q = {}, sesion = rh) =>
  sesion.agent.get(base + ruta).query({ ...rango, ...q });
async function comision(
  i: number,
  mes: string,
  monto: string,
  extra: { pago?: number; activo?: number; autorizacion?: string; tipo?: string } = {},
) {
  await sql(
    `INSERT INTO NOVEDADES_MENSUALES(ID_EMPLEADO,TIPO,MES,MONTO,DESCRIPCION,ESTADO,ID_NOMINA_EMPLEADO,ACTIVO,AUTORIZACION)
    VALUES(:id,:tipo,TO_DATE(:mes||'-01','YYYY-MM-DD'),TO_NUMBER(:monto,'999999999999D99','NLS_NUMERIC_CHARACTERS=''.,'''),'Comisión de prueba',:estado,:pago,:activo,:autorizacion)`,
    {
      id: ids[i]!,
      mes,
      monto,
      tipo: extra.tipo ?? 'COMISION',
      estado: extra.pago ? 'APLICADA' : 'PENDIENTE',
      pago: extra.pago ?? null,
      activo: extra.activo ?? 1,
      autorizacion: extra.autorizacion ?? 'APROBADA',
    },
  );
}
async function cuenta(rol: Rol, nombre: string, ficha?: number, cambioObligatorio = false) {
  const u = await enTransaccion(db, (c) =>
    crearUsuarioInterno(c, actor, {
      nombre,
      apellido: 'Comisiones',
      correo: `${nombre.toLowerCase()}@example.test`,
      rol,
    }),
  );
  if (!cambioObligatorio)
    await sql('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', { id: u.idUsuario });
  if (ficha !== undefined)
    await sql('UPDATE EMPLEADOS SET ID_USUARIO=:usuario WHERE ID_EMPLEADO=:id', {
      usuario: u.idUsuario,
      id: ficha,
    });
  return entrar(u.usuario, u.contrasenaTemporal);
}
describe('R3-9: datos de ventas protegidos con Oracle/Supertest', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquemas desechables.');
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations/', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version <= 40),
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
        tableros: {
          ...crearTablerosService(db),
          comisiones: crearComisionesService(db, async () => '2026-10-29T10:00:00'),
        },
        config,
      },
    );
    admin = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD);
    await admin.agent
      .post('/api/auth/cambiar-contrasena')
      .set('X-CSRF-Token', admin.csrf)
      .send({ contrasenaActual: seed.ADMIN_PASSWORD, contrasenaNueva: 'VentasPrueba!2026' })
      .expect(200);
    actor = {
      idUsuario: Number(
        await scalar('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO=:u', { u: seed.ADMIN_USER }),
      ),
      idRol: Number(await scalar("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN'")),
      rol: 'ADMIN',
      ip: '127.0.0.1',
    };
    rh = await cuenta('RH', 'Gestora');
    temporal = await cuenta('EMPLEADO', 'Temporal', undefined, true);
    for (const nombre of ['Comercial', 'Industrial']) {
      await sql('INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES(:nombre)', { nombre });
      deps.push(Number(await scalar('SELECT MAX(ID_DEPARTAMENTO) FROM DEPARTAMENTOS')));
    }
    await sql("INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES('Sede','GUATEMALA_CIUDAD')");
    const centro = Number(await scalar('SELECT MAX(ID_CENTRO_TRABAJO) FROM CENTROS_TRABAJO'));
    for (let i = 0; i < 6; i++) {
      const dep = deps[i === 3 ? 1 : 0]!;
      await sql('INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) VALUES(:nombre,:dep)', {
        nombre: `Analista ${i}`,
        dep,
      });
      await sql(
        `INSERT INTO EMPLEADOS(CODIGO,NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO)
        SELECT :codigo,:nombre,'López Pérez',:dpi,:nit,DATE '1990-01-01','F','SOLTERO','Calle 1','55551234',:correo,ID_PUESTO,:dep,(SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO),:centro,DATE '2020-01-01' FROM PUESTOS WHERE NOMBRE=:puesto`,
        {
          codigo: `EMP_C_${i}`,
          nombre: ['Jefa', 'Ana María', 'Bea', 'Fuera', 'Sincomision', 'Retirada'][i]!,
          dpi: `123456789012${i}`,
          nit: `123456${i}-1`,
          correo: `ventas${i}@example.test`,
          dep,
          centro,
          puesto: `Analista ${i}`,
        },
      );
      ids.push(Number(await scalar('SELECT MAX(ID_EMPLEADO) FROM EMPLEADOS')));
    }
    jefe = await cuenta('EMPLEADO', 'Jefa', ids[0]);
    empleado = await cuenta('EMPLEADO', 'Normal', ids[3]);
    for (let i = 0; i < 2; i++) {
      await sql(
        'INSERT INTO JEFATURAS(NOMBRE,ID_DEPARTAMENTO,ID_EMPLEADO_RESPONSABLE,ID_JEFATURA_SUPERIOR) VALUES(:nombre,:dep,:jefe,:superior)',
        { nombre: `Rama ${i}`, dep: deps[0]!, jefe: ids[i]!, superior: jefaturas[0] ?? null },
      );
      jefaturas.push(Number(await scalar('SELECT MAX(ID_JEFATURA) FROM JEFATURAS')));
    }
    await sql(
      "INSERT INTO PERMISOS_JEFATURA(ID_JEFATURA,CODIGO_PERMISO) VALUES(:id,'VER_COMISIONES_EQUIPO')",
      { id: jefaturas[0]! },
    );
    for (const i of [0, 1, 2, 4, 5])
      await sql('UPDATE EMPLEADOS SET ID_JEFATURA=:j WHERE ID_EMPLEADO=:id', {
        j: jefaturas[i === 2 ? 1 : 0]!,
        id: ids[i]!,
      });
    await sql('UPDATE EMPLEADOS SET ACTIVO=0 WHERE ID_EMPLEADO=:id', { id: ids[5]! });
    await sql(
      "INSERT INTO PERIODOS_NOMINA(FECHA_INICIO,FECHA_FIN,QUINCENA) VALUES(DATE '2026-03-16',DATE '2026-03-31',2)",
    );
    const periodo = Number(await scalar('SELECT MAX(ID_PERIODO_NOMINA) FROM PERIODOS_NOMINA'));
    const pagos: number[] = [];
    for (const i of [1, 2]) {
      await sql(
        "INSERT INTO HISTORIAL_SALARIAL(ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES(:id,1000,DATE '2020-01-01','Fixture de pago')",
        { id: ids[i]! },
      );
      await sql(
        `INSERT INTO NOMINA_EMPLEADO(ID_PERIODO_NOMINA,ID_EMPLEADO,ID_HISTORIAL_SALARIAL,VERSION_CALCULO,DIAS_PAGADOS,SALARIO_BASE,TOTAL_INGRESOS,TOTAL_DESCUENTOS,NETO,COSTO_PATRONAL,DATOS_EMPLEADO)
        SELECT :periodo,:id,ID_HISTORIAL_SALARIAL,1,30,1000,1000,0,1000,0,'{}' FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id`,
        { id: ids[i]!, periodo },
      );
      pagos.push(Number(await scalar('SELECT MAX(ID_NOMINA_EMPLEADO) FROM NOMINA_EMPLEADO')));
    }
    await comision(1, '2026-01', '100.10');
    await comision(1, '2026-01', '49.90');
    await comision(1, '2026-03', '300.00', { pago: pagos[0]! });
    await comision(2, '2026-01', '150.00', { pago: pagos[1]! });
    await comision(1, '2025-10', '100.00');
    await comision(2, '2025-12', '100.00');
    await comision(0, '2026-01', '5000.00');
    await comision(3, '2026-01', '900.00');
    await comision(5, '2026-01', '50.00');
    await comision(5, '2025-10', '40.00');
    for (const extra of [
      { activo: 0 },
      { autorizacion: 'RECHAZADA' },
      { autorizacion: 'PENDIENTE' },
      { tipo: 'HORAS_EXTRA' },
      { tipo: 'CONSUMO_TIENDA' },
    ])
      await comision(1, '2026-02', '10000.00', extra);
    await comision(1, '2024-01', '10.00');
    await comision(3, '2010-01', '10.00');
    await comision(1, '2011-01', '10.00', { activo: 0 });
    await comision(1, '2012-01', '10.00', { autorizacion: 'RECHAZADA' });
    // Respaldo v0 enlazado: la lectura del libro mensual debe contarlo solo una vez.
    await sql(
      "INSERT INTO COMISIONES(ID_EMPLEADO,ID_PERIODO_NOMINA,MONTO,REFERENCIA,DESCRIPCION) VALUES(:id,:periodo,300,'ORIGEN_V0','Comisión migrada')",
      { id: ids[1]!, periodo },
    );
    await sql(
      "INSERT INTO NOVEDADES_ORIGEN(ID_NOVEDAD_MENSUAL,ENTIDAD,ID_ORIGEN) SELECT M.ID_NOVEDAD_MENSUAL,'COMISIONES',C.ID_COMISION FROM NOVEDADES_MENSUALES M JOIN COMISIONES C ON C.ID_EMPLEADO=M.ID_EMPLEADO WHERE M.ESTADO='APLICADA' AND M.ID_EMPLEADO=:id",
      { id: ids[1]! },
    );
    const firma = "SELECT COUNT(*)||':'||TO_CHAR(SUM(MONTO),'TM9') FROM NOVEDADES_MENSUALES";
    const antes = await scalar(firma);
    expect(await ejecutarMigraciones(db, logger)).toBe(1);
    expect(await scalar(firma)).toBe(antes);
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('indicadores exactos, comparación equivalente y mismos resultados para RH/ADMIN', async () => {
    const filtro = { vendedores: `${ids[1]},${ids[2]}`, comparar: 'true' };
    const r = await get('resumen', filtro).expect(200);
    expect(r.body.data.indicadores).toEqual({
      total: '600.00',
      promedioMensual: '200.00',
      mejorMes: {
        mes: '2026-01',
        total: '300.00',
        mesAnterior: '2025-10',
        totalAnterior: '100.00',
      },
      totalAnterior: '200.00',
      variacionPorcentual: '200.00',
      sinBaseComparacion: false,
      vendedoresConComision: 2,
    });
    expect(r.body.data.periodoAnterior).toEqual({ desde: '2025-10', hasta: '2025-12' });
    const a = await get('resumen', filtro, admin).expect(200);
    expect(a.body.data.indicadores).toEqual(r.body.data.indicadores);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect((await get('resumen').expect(200)).body.data.indicadores.total).toBe('6550.00');
  });
  it('series continuas con ceros y periodos anteriores alineados', async () => {
    const r = await get('tendencia', {
      vendedores: `${ids[1]},${ids[2]}`,
      comparar: 'true',
    }).expect(200);
    expect(r.body.data.registros).toEqual([
      { mes: '2026-01', total: '300.00', mesAnterior: '2025-10', totalAnterior: '100.00' },
      { mes: '2026-02', total: '0.00', mesAnterior: '2025-11', totalAnterior: '0.00' },
      { mes: '2026-03', total: '300.00', mesAnterior: '2025-12', totalAnterior: '100.00' },
    ]);
  });
  it('ranking/reparto y matriz paginados con totales completos, sin restringir por puesto', async () => {
    const q = { vendedores: `${ids[1]},${ids[2]}`, limite: 1, pagina: 2 };
    const r = await get('ranking', q).expect(200);
    expect(r.body.data).toMatchObject({
      total: 2,
      totalComisiones: '600.00',
      registros: [
        {
          idEmpleado: ids[2],
          posicion: 2,
          total: '150.00',
          participacionPorcentual: '25.00',
          puesto: 'Analista 2',
        },
      ],
    });
    const t = await get('tabla', { ...q, pagina: 1 }).expect(200);
    expect(t.body.data).toMatchObject({
      total: 2,
      totalComisiones: '600.00',
      meses: ['2026-01', '2026-02', '2026-03'],
      registros: [
        {
          idEmpleado: ids[1],
          serie: [
            { mes: '2026-01', total: '150.00' },
            { mes: '2026-02', total: '0.00' },
            { mes: '2026-03', total: '300.00' },
          ],
        },
      ],
    });
    expect(t.body.data.totalesMensuales.map((f: { total: string }) => f.total)).toEqual([
      '300.00',
      '0.00',
      '300.00',
    ]);
    expect(
      (await get('ranking', { ...q, ordenarPor: 'total', direccion: 'asc' }).expect(200)).body.data
        .registros[0].idEmpleado,
    ).toBe(ids[1]);
  });
  it('estados, anulación y autorización; comparación anterior sin base y cero contra cero', async () => {
    const filtro = { vendedores: `${ids[1]},${ids[2]}`, comparar: 'true' };
    expect(
      (await get('resumen', { ...filtro, estado: 'pendientes' }).expect(200)).body.data.indicadores,
    ).toMatchObject({
      total: '150.00',
      vendedoresConComision: 1,
      totalAnterior: '200.00',
      variacionPorcentual: '-25.00',
    });
    expect(
      (await get('resumen', { ...filtro, estado: 'aplicadas' }).expect(200)).body.data.indicadores,
    ).toMatchObject({
      total: '450.00',
      totalAnterior: '0.00',
      variacionPorcentual: null,
      sinBaseComparacion: true,
    });
    expect(
      (await get('resumen', { ...filtro, desde: '2026-04', hasta: '2026-04' }).expect(200)).body
        .data.indicadores,
    ).toMatchObject({ total: '0.00', totalAnterior: '300.00', variacionPorcentual: '-100.00' });
    expect(
      (await get('resumen', { ...filtro, desde: '2026-06', hasta: '2026-06' }).expect(200)).body
        .data.indicadores,
    ).toMatchObject({
      total: '0.00',
      totalAnterior: '0.00',
      variacionPorcentual: '0.00',
      mejorMes: null,
    });
    expect(
      (await get('resumen', { idDepartamento: deps[1] }).expect(200)).body.data.indicadores.total,
    ).toBe('900.00');
  });
  it('historial paginado, mejor/peor mes, promedio mensual y promedio real del equipo', async () => {
    const r = await get(
      `vendedores/${ids[1]}/historial`,
      { limite: 1, comparar: 'true' },
      jefe,
    ).expect(200);
    expect(r.body.data).toMatchObject({
      total: 3,
      pagina: 1,
      promedioMensualEquipo: '100.00',
      vendedoresEquipo: 2,
      indicadores: {
        total: '450.00',
        promedioMensual: '150.00',
        variacionPorcentual: '350.00',
        peorMes: { mes: '2026-02', total: '0.00' },
      },
      registros: [{ mes: '2026-03', monto: '300.00', estado: 'APLICADA' }],
    });
    expect(r.body.data.evolucion.map((f: { promedioEquipo: string }) => f.promedioEquipo)).toEqual([
      '150.00',
      '0.00',
      '150.00',
    ]);
    expect(
      (await get(`vendedores/${ids[4]}/historial`, {}, jefe).expect(200)).body.data.indicadores
        .total,
    ).toBe('0.00');
    await get(`vendedores/${ids[1]}/historial`, { idDepartamento: deps[1] }).expect(404);
    await get('vendedores/999999/historial').expect(404);
  });
  it('equipo descendiente excluye jefe, inactivos y ramas ajenas en todos los endpoints', async () => {
    for (const ruta of ['resumen', 'tendencia', 'ranking', 'tabla', 'opciones']) {
      const r = await get(ruta, {}, jefe).expect(200);
      expect(r.body.data.alcance).toEqual({ tipo: 'EQUIPO', personas: 3 });
      expect(JSON.stringify(r.body.data)).not.toMatch(
        /salario|banco|dpi|nit|correo|cuenta|expediente|actas|csrf/i,
      );
    }
    const r = await get('resumen', {}, jefe).expect(200);
    expect(r.body.data.indicadores.total).toBe('600.00');
    const o = (await get('opciones', {}, jefe).expect(200)).body.data;
    expect(o.vendedores.map((f: { idEmpleado: number }) => f.idEmpleado).sort()).toEqual(
      [ids[1], ids[2]].sort(),
    );
    expect(o.departamentos).toEqual([{ id: deps[0], nombre: 'Comercial' }]);
    for (const ruta of ['resumen', 'tendencia', 'ranking', 'tabla', 'opciones']) {
      await get(ruta, { vendedores: `${ids[1]},${ids[3]}` }, jefe).expect(403);
      await get(ruta, { idDepartamento: deps[1] }, jefe).expect(403);
    }
    for (const i of [0, 3, 5]) await get(`vendedores/${ids[i]}/historial`, {}, jefe).expect(403);
    await get('resumen', { vendedores: 999999 }).expect(404);
    await get('resumen', { idDepartamento: 999999 }).expect(404);
  });
  it('años con datos respeta alcance y ambas rutas R3-4/C6 comparten contrato', async () => {
    const r = await jefe.agent.get(base + 'anios').expect(200);
    expect(r.body.data.anios).toEqual([2024, 2025, 2026]);
    expect(
      (await jefe.agent.get('/api/tableros/anios?fuente=comisiones').expect(200)).body.data,
    ).toEqual(r.body.data);
    const global = (await rh.agent.get(base + 'anios').expect(200)).body.data.anios;
    expect(global).toEqual([2010, 2024, 2025, 2026]);
    await jefe.agent.get('/api/tableros/anios?fuente=ausencias').expect(403);
    await jefe.agent.get(base + 'anios?idEmpleado=1').expect(400);
  });
  it('rangos inválidos, máximo inclusivo, futuro y manipulación de query', async () => {
    for (const q of [
      { desde: '2026-04' },
      { desde: '2021-03' },
      { desde: '2026-13' },
      { hasta: '2026-11' },
      { hasta: '2027-01' },
      { estado: 'PENDIENTE' },
      { comparar: '1' },
      { alcance: 'general' },
      { idUsuario: 1 },
      { vendedores: `${ids[1]},${ids[1]}` },
      { vendedores: '1 OR 1=1' },
      { ordenarPor: 'salario' },
    ])
      await get('resumen', q).expect(400);
    await get('resumen', { desde: '2021-04' }).expect(200);
    await rh.agent.get(base + 'resumen').expect(400);
    await get('resumen', { desde: ['2026-01', '2026-02'] }).expect(400);
    await get('ranking', { limite: 101 }).expect(400);
    await get('vendedores/0/historial').expect(400);
  });
  it('RBAC, contraseña temporal y revocación en la misma sesión', async () => {
    for (const ruta of [
      'resumen',
      'tendencia',
      'ranking',
      'tabla',
      'opciones',
      `vendedores/${ids[1]}/historial`,
    ]) {
      await request(app)
        .get(base + ruta)
        .query(rango)
        .expect(401);
      await get(ruta, {}, empleado).expect(403);
      await get(ruta, {}, temporal).expect(403);
    }
    await empleado.agent.get(base + 'anios').expect(403);
    await sql('UPDATE PERMISOS_JEFATURA SET ACTIVO=0 WHERE ID_JEFATURA=:id', { id: jefaturas[0]! });
    await get('resumen', {}, jefe).expect(403);
    await jefe.agent.get('/api/tableros/anios?fuente=comisiones').expect(403);
    await sql('UPDATE PERMISOS_JEFATURA SET ACTIVO=1 WHERE ID_JEFATURA=:id', { id: jefaturas[0]! });
    await get('resumen', {}, jefe).expect(200);
  });
  it('equipo vacío conserva ceros y años actuales sin abrir el alcance general', async () => {
    await sql('UPDATE EMPLEADOS SET ID_JEFATURA=NULL WHERE ID_EMPLEADO<>:jefe', { jefe: ids[0]! });
    try {
      expect((await get('resumen', {}, jefe).expect(200)).body.data).toMatchObject({
        alcance: { tipo: 'EQUIPO', personas: 0 },
        indicadores: { total: '0.00', vendedoresConComision: 0 },
      });
      expect((await get('tabla', {}, jefe).expect(200)).body.data.registros).toEqual([]);
      expect((await jefe.agent.get(base + 'anios').expect(200)).body.data.anios).toEqual([2026]);
      await get(`vendedores/${ids[1]}/historial`, {}, jefe).expect(403);
    } finally {
      for (const i of [1, 2, 4, 5])
        await sql('UPDATE EMPLEADOS SET ID_JEFATURA=:j WHERE ID_EMPLEADO=:id', {
          j: jefaturas[i === 2 ? 1 : 0]!,
          id: ids[i]!,
        });
    }
  });
  it('V041 aditiva, repetible y planes de rango/empleado con volumen histórico', async () => {
    await sql(
      `INSERT INTO NOVEDADES_MENSUALES(ID_EMPLEADO,TIPO,MES,MONTO,DESCRIPCION)
      SELECT :id,'COMISION',ADD_MONTHS(DATE '1980-01-01',MOD(LEVEL,480)),1,'Volumen exclusivo de prueba' FROM DUAL CONNECT BY LEVEL<=24000`,
      { id: ids[3]! },
    );
    const antes = Number(await scalar('SELECT COUNT(*) FROM NOVEDADES_MENSUALES'));
    await ejecutarMigraciones(db, logger);
    expect(await scalar('SELECT COUNT(*) FROM NOVEDADES_MENSUALES')).toBe(antes);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM USER_INDEXES WHERE INDEX_NAME IN ('IX_NOV_COM_MES','IX_NOV_COM_EMP_MES') AND STATUS='VALID'",
      ),
    ).toBe(2);
    for (const tabla of [
      'NOVEDADES_MENSUALES',
      'EMPLEADOS',
      'PUESTOS',
      'DEPARTAMENTOS',
      'CENTROS_TRABAJO',
    ])
      await sql(
        'BEGIN DBMS_STATS.GATHER_TABLE_STATS(OWNNAME=>USER,TABNAME=>:tabla,CASCADE=>TRUE); END;',
        { tabla },
      );
    const planes: Record<string, unknown> = {};
    await db.conConexion(async (c) => {
      for (const [nombre, q, alcance] of [
        ['COMISION_MES', comisionesQuerySchema.parse({ ...rango }), undefined],
        [
          'COMISION_EMPLEADO',
          comisionesQuerySchema.parse({ ...rango, vendedores: `${ids[1]}` }),
          undefined,
        ],
        ['COMISION_EQUIPO', comisionesQuerySchema.parse({ ...rango }), [ids[1]!, ids[2]!]],
      ] as const) {
        const { sql: consulta, binds } = consultaComisiones(q, alcance);
        await c.execute(`EXPLAIN PLAN SET STATEMENT_ID='${nombre}' FOR ${consulta}`, binds);
        const plan = (
          await c.execute<string[]>(
            "SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE',:nombre,'BASIC +PREDICATE +COST'))",
            { nombre },
          )
        )
          .rows!.flat()
          .join('\n');
        expect(plan).toContain('SELECT STATEMENT');
        // Oracle puede preferir el índice mensual previo si el rango es muy selectivo.
        expect(plan).toMatch(/IX_NOV_COM_(MES|EMP_MES)|IX_NOVEDADES_MENSUALES_5/);
        expect(plan).not.toMatch(/TABLE ACCESS FULL\s+\|\s+NOVEDADES_MENSUALES/);
        const inicio = performance.now();
        await c.execute(consulta, binds);
        const ms = performance.now() - inicio;
        expect(ms).toBeLessThan(2000);
        planes[nombre] = { plan, ms: Math.round(ms * 100) / 100 };
      }
      await c.rollback();
    });
    const carpeta = fileURLToPath(new URL('../../../../tmp/', import.meta.url));
    await mkdir(carpeta, { recursive: true });
    await writeFile(`${carpeta}/comisiones-planes.json`, JSON.stringify(planes, null, 2));
    expect(await scalar("SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'")).toBe(0);
  });
});
