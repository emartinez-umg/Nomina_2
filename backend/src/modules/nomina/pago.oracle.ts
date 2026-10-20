import { alertas } from '../tableros/tableros.repository.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { BindParameters } from 'oracledb';
import { unzipSync } from 'fflate';
import { crearApp } from '../../app.js';
import { crearBaseDatos } from '../../shared/db/pool.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { cargarMigraciones } from '../../shared/db/migraciones.archivos.js';
import { aplicarMigraciones, ejecutarMigraciones } from '../../shared/db/migraciones.js';
import { crearMigracionesRepository } from '../../shared/db/migraciones.repository.js';
import { ejecutarSeeds } from '../../shared/db/seeds.js';
import { validarEntornoSeeds } from '../../shared/db/seeds.env.js';
import { validarEntorno } from '../../config/env.schema.js';
import { crearLogger } from '../../config/logger.js';
import { crearAuthService } from '../auth/auth.service.js';
import type { ActorAuditoria } from '../auth/auth.types.js';
import { crearUsuarioInterno, crearUsuariosService } from '../usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../auditoria/auditoria.service.js';
import { prepararFirmantePrueba } from '../../shared/pdf/empresa.fixture.js';
import { crearNominaService } from './nomina.service.js';
import type { ObjetivoPago } from './pago.schemas.js';
import { crearNovedadesService } from '../novedades/novedades.service.js';
let db: BaseDatos,
  app: Express,
  actor: ActorAuditoria,
  dep: number,
  empleado: number,
  otro: number,
  descuento: number;
let admin: Awaited<ReturnType<typeof entrar>>,
  rh: typeof admin,
  propio: typeof admin,
  ajeno: typeof admin;
let anticipoId: number, pagoId: number, periodoAnticipo: number, periodoPago: number;
const seed = validarEntornoSeeds(process.env),
  logger = crearLogger('silent');
const ejecutar = (sql: string, binds: BindParameters = {}) =>
  enTransaccion(db, (c) => c.execute(sql, binds));
const escalar = (sql: string, binds: BindParameters = {}) =>
  db.conConexion(async (c) => (await c.execute<unknown[]>(sql, binds)).rows?.[0]?.[0]);
async function entrar(usuario: string, contrasena: string) {
  const agent = request.agent(app),
    inicio = await agent.get('/api/auth/csrf').expect(200);
  const r = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', inicio.body.data.csrfToken)
    .send({ usuario, contrasena })
    .expect(200);
  return { agent, csrf: r.body.data.csrfToken as string };
}
const post = (s: typeof admin, ruta: string, body: object, status = 200) =>
  s.agent.post(`/api/nomina${ruta}`).set('X-CSRF-Token', s.csrf).send(body).expect(status);
const objetivo = (tipoPago: 'ANTICIPO' | 'PAGO', id = empleado): ObjetivoPago => ({
  mes: '2026-01',
  tipoPago,
  objetivo: 'EMPLEADO',
  idEmpleado: id,
});
const simular = async (d: ObjetivoPago) => (await post(rh, '/simular', d)).body.data;
const pagar = async (d: ObjetivoPago, hash: string, status = 201) =>
  post(rh, '/pagar', { ...d, hash, confirmado: true, novedadesCompletas: true }, status);
async function nov(tipo: string, monto: string, cantidad = '1', mes = '2026-01', id = empleado) {
  await ejecutar(
    "INSERT INTO NOVEDADES_MENSUALES(ID_EMPLEADO,TIPO,MES,CANTIDAD,MONTO,DESCRIPCION) VALUES(:id,:tipo,TO_DATE(:mes||'-01','YYYY-MM-DD'),TO_NUMBER(:cantidad),TO_NUMBER(:monto),'Respaldo de prueba')",
    { id, tipo, mes, cantidad, monto },
  );
}
describe('V1-10: pagos reales, integridad, reversión y publicación', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo esquema desechable.');
    db = await crearBaseDatos(validarEntorno(process.env));
    const migraciones = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations', import.meta.url)),
    );
    await db.conConexion((c) =>
      aplicarMigraciones(
        migraciones.filter((m) => m.version < 29),
        crearMigracionesRepository(c),
        logger,
      ),
    );
    await ejecutarSeeds(db, logger, seed);
    actor = {
      idUsuario: Number(
        await escalar('SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO=:u', { u: seed.ADMIN_USER }),
      ),
      idRol: Number(await escalar("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN'")),
      rol: 'ADMIN',
      ip: '127.0.0.1',
    };
    await ejecutar('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', {
      id: actor.idUsuario,
    });
    await ejecutar("INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES('Ingeniería de pruebas')");
    dep = Number(
      await escalar(
        "SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NOMBRE='Ingeniería de pruebas'",
      ),
    );
    await ejecutar(
      "INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) VALUES('Analista de pruebas',:dep)",
      { dep },
    );
    await ejecutar(
      "INSERT INTO CENTROS_TRABAJO(NOMBRE,LOCALIDAD) VALUES('Oficina prueba','PRUEBA')",
    );
    const puesto = Number(await escalar('SELECT MIN(ID_PUESTO) FROM PUESTOS')),
      centro = Number(await escalar('SELECT MIN(ID_CENTRO_TRABAJO) FROM CENTROS_TRABAJO')),
      contrato = Number(await escalar('SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO'));
    const cuentas = [];
    for (const [i, rol] of ['RH', 'EMPLEADO', 'EMPLEADO'].entries()) {
      const u = await enTransaccion(db, (c) =>
        crearUsuarioInterno(c, actor, {
          nombre: ['Revisor', 'Primera', 'Segunda'][i]!,
          apellido: 'Prueba',
          correo: `cuenta${i}@example.test`,
          rol: rol as 'RH' | 'EMPLEADO',
        }),
      );
      cuentas.push(u);
      await ejecutar('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', {
        id: u.idUsuario,
      });
      if (i > 0) {
        await ejecutar(
          "INSERT INTO EMPLEADOS(ID_USUARIO,NOMBRES,APELLIDOS,DPI,NIT,AFILIACION_IGSS,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) VALUES(:usuario,:nombre,'Prueba',:dpi,:nit,:igss,DATE '1990-01-01','F','SOLTERO','Guatemala','55551234',:correo,:puesto,:dep,:contrato,:centro,DATE '2026-01-01')",
          {
            usuario: u.idUsuario,
            nombre: ['Revisor', 'Primera', 'Segunda'][i]!,
            dpi: `123456789012${i}`,
            nit: i === 1 ? '1234567-9' : '123456-0',
            igss: `10000${i}`,
            correo: `persona${i}@example.test`,
            puesto,
            dep,
            contrato,
            centro,
          },
        );
        const id = Number(
          await escalar('SELECT ID_EMPLEADO FROM EMPLEADOS WHERE ID_USUARIO=:u', {
            u: u.idUsuario,
          }),
        );
        if (i === 1) empleado = id;
        else otro = id;
        await ejecutar(
          "INSERT INTO HISTORIAL_SALARIAL(ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES(:id,10000,DATE '2026-01-01','Salario prueba')",
          { id },
        );
      }
    }
    await ejecutar("INSERT INTO HORARIOS(NOMBRE,JORNADA) VALUES('Horario prueba','DIURNA')");
    await ejecutar(
      'INSERT INTO HORARIO_BLOQUES(ID_HORARIO,MINUTO_ENTRADA,MINUTO_SALIDA,MINUTOS_DESCANSO,CRUZA_MEDIANOCHE) SELECT MIN(ID_HORARIO),480,1020,60,0 FROM HORARIOS',
    );
    await ejecutar(
      'INSERT INTO HORARIO_BLOQUE_DIAS(ID_HORARIO_BLOQUE,DIA_SEMANA) SELECT B.ID_HORARIO_BLOQUE,X.DIA FROM HORARIO_BLOQUES B CROSS JOIN(SELECT LEVEL DIA FROM DUAL CONNECT BY LEVEL<=5) X',
    );
    for (const id of [empleado, otro])
      await ejecutar(
        "INSERT INTO EMPLEADO_HORARIO(ID_EMPLEADO,ID_HORARIO,VIGENTE_DESDE,MOTIVO) SELECT :id,MIN(ID_HORARIO),DATE '2026-01-01','Horario prueba' FROM HORARIOS",
        { id },
      );
    // Cuotas v0: importe total 100.01; dos cuotas conservadas con nuevos vencimientos mensuales.
    await ejecutar(
      "INSERT INTO DESCUENTOS_EMPLEADO(ID_EMPLEADO,ID_TIPO_DESCUENTO,MODALIDAD,MONTO_QUINCENA,MONTO_TOTAL,SALDO,NUMERO_CUOTAS,FECHA_INICIO,FECHA_FIN,MOTIVO) SELECT :id,ID_TIPO_DESCUENTO,'CUOTAS',50,100.01,100.01,2,DATE '2026-01-01',DATE '2026-01-31','Préstamo prueba' FROM TIPOS_DESCUENTO WHERE CODIGO_ANTERIOR='PRESTAMO'",
      { id: empleado },
    );
    descuento = Number(await escalar('SELECT MIN(ID_DESCUENTO_EMPLEADO) FROM DESCUENTOS_EMPLEADO'));
    for (const [n, fecha, monto] of [
      [1, '2026-01-15', '50'],
      [2, '2026-01-31', '50.01'],
    ] as const)
      await ejecutar(
        "INSERT INTO DESCUENTOS_CUOTAS(ID_DESCUENTO_EMPLEADO,ID_EMPLEADO,NUMERO_CUOTA,FECHA_VENCIMIENTO,MONTO) VALUES(:d,:id,:n,TO_DATE(:fecha,'YYYY-MM-DD'),TO_NUMBER(:monto))",
        { d: descuento, id: empleado, n, fecha, monto },
      );
    await ejecutarMigraciones(db, logger);
    await prepararFirmantePrueba(db, actor.idUsuario);
    await prepararFirmantePrueba(db, cuentas[0]!.idUsuario);
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
        nomina: crearNominaService(db),
        novedades: crearNovedadesService(db),
        config,
      },
    );
    admin = await entrar(seed.ADMIN_USER, seed.ADMIN_PASSWORD);
    rh = await entrar(cuentas[0]!.usuario, cuentas[0]!.contrasenaTemporal);
    propio = await entrar(cuentas[1]!.usuario, cuentas[1]!.contrasenaTemporal);
    ajeno = await entrar(cuentas[2]!.usuario, cuentas[2]!.contrasenaTemporal);
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('R2-6: sin salario queda excluido con alerta sin bloquear los cálculos de los demás', async () => {
    await ejecutar(
      "INSERT INTO EMPLEADOS(NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) SELECT 'Perfil','Incompleto','9876543210999','9876543-2',DATE '1990-01-01','F','SOLTERO','Peña #12-A','55551234','incompleto@example.test',ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,DATE '2026-01-01' FROM EMPLEADOS WHERE ID_EMPLEADO=:id",
      { id: empleado },
    );
    const id = Number(
      await escalar("SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CORREO='incompleto@example.test'"),
    );
    try {
      await nov('HORAS_EXTRA', '0', '1', '2026-01', id);
      const sim = await simular({
        mes: '2026-01',
        tipoPago: 'ANTICIPO',
        objetivo: 'DEPARTAMENTO',
        idDepartamento: dep,
      });
      const excluido = sim.registros.find((f: { idEmpleado: number }) => f.idEmpleado === id);
      expect(excluido.resultado).toBeNull();
      expect(excluido.alertas.join(' ')).toContain('Perfil incompleto: falta salario');
      expect(sim.registros.filter((f: { resultado: unknown }) => f.resultado)).toHaveLength(2);
      expect(sim.totales.neto).toBe('10500.00');
      expect((await db.conConexion(alertas)).some((a) => a.tipo === 'PERFIL' && a.id === id)).toBe(
        true,
      );
    } finally {
      await ejecutar('UPDATE EMPLEADOS SET ACTIVO=0 WHERE ID_EMPLEADO=:id', { id });
    }
  });
  it('migra calendario sin alterar importes, cantidades ni saldo; reejecución idempotente', async () => {
    expect(
      await escalar(
        "SELECT LISTAGG(TO_CHAR(FECHA_VENCIMIENTO,'YYYY-MM-DD'),',') WITHIN GROUP(ORDER BY NUMERO_CUOTA) FROM DESCUENTOS_CUOTAS",
      ),
    ).toBe('2026-01-31,2026-02-28');
    expect(
      await escalar(
        "SELECT LISTAGG(TO_CHAR(FECHA_VENCIMIENTO_ANTERIOR,'YYYY-MM-DD'),',') WITHIN GROUP(ORDER BY NUMERO_CUOTA) FROM DESCUENTOS_CUOTAS",
      ),
    ).toBe('2026-01-15,2026-01-31');
    expect(
      Number(
        await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO WHERE ID_DESCUENTO_EMPLEADO=:id', {
          id: descuento,
        }),
      ),
    ).toBe(100.01);
    expect(await ejecutarMigraciones(db, logger)).toBe(0);
  });
  it('simulación sin escrituras, RBAC/CSRF y confirmación obligatoria', async () => {
    await post(propio, '/simular', objetivo('ANTICIPO'), 403);
    await rh.agent.post('/api/nomina/simular').send(objetivo('ANTICIPO')).expect(403);
    const directo = await crearNominaService(db).simular(objetivo('ANTICIPO'));
    expect(directo.registros[0]?.resultado?.neto).toBe('5250.00');
    const r = await simular(objetivo('ANTICIPO'));
    expect(r.registros[0].resultado.neto).toBe('5250.00');
    expect(Number(await escalar('SELECT COUNT(*) FROM NOMINA_EMPLEADO'))).toBe(0);
    expect(Number(await escalar('SELECT COUNT(*) FROM PERIODOS_NOMINA'))).toBe(0);
    await post(rh, '/pagar', { ...objetivo('ANTICIPO'), hash: r.hash, confirmado: true }, 400);
    const preview = await post(rh, `/simular/${empleado}/pdf`, objetivo('ANTICIPO'));
    expect(Buffer.from(preview.body.data.base64, 'base64').subarray(0, 4).toString()).toBe('%PDF');
  });
  it('invalida la simulación si cambia una novedad', async () => {
    const r = await simular(objetivo('ANTICIPO'));
    await nov('COMISION', '1000');
    await nov('HORAS_EXTRA', '500', '8');
    await pagar(objetivo('ANTICIPO'), r.hash, 409);
    expect(Number(await escalar('SELECT COUNT(*) FROM NOMINA_EMPLEADO'))).toBe(0);
  });
  it('anticipo transaccional, extras aplicadas y doble pago concurrente bloqueado', async () => {
    const d = objetivo('ANTICIPO'),
      r = await simular(d);
    expect(r.registros[0].resultado.neto).toBe('6750.00');
    const pagos = await Promise.all([pagar(d, r.hash), pagar(d, r.hash, 409)]);
    anticipoId = pagos[0]!.body.data.pagados[0];
    periodoAnticipo = pagos[0]!.body.data.idPeriodo;
    expect(
      Number(await escalar("SELECT COUNT(*) FROM NOVEDADES_MENSUALES WHERE ESTADO='APLICADA'")),
    ).toBe(2);
    expect(Number(await escalar('SELECT COUNT(*) FROM BOLETAS_PAGO'))).toBe(1);
    expect(Number(await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO'))).toBe(100.01);
    await propio.agent.get(`/api/nomina/boletas/${anticipoId}/pdf`).expect(200);
    await ajeno.agent.get(`/api/nomina/boletas/${anticipoId}/pdf`).expect(403);
    const historial = await propio.agent.get('/api/nomina/boletas').expect(200);
    expect(historial.body.data.registros[0].id).toBe(anticipoId);
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM NOTIFICACIONES WHERE CLAVE_EVENTO=:clave', {
          clave: `NOMINA:${anticipoId}:PAGO`,
        }),
      ),
    ).toBe(1);
  });
  it('departamento paga a los habilitados; neto negativo bloquea solo al afectado', async () => {
    await nov('COMISION', '200');
    await nov('HORAS_EXTRA', '125', '2');
    await nov('PARQUEO', '150');
    await nov('CONSUMO_TIENDA', '82.25');
    await nov('CONSUMO_TIENDA', '20000', '1', '2026-01', otro);
    const d: ObjetivoPago = {
        mes: '2026-01',
        tipoPago: 'PAGO',
        objetivo: 'DEPARTAMENTO',
        idDepartamento: dep,
      },
      r = await simular(d);
    expect(
      r.registros.find((f: { idEmpleado: number }) => f.idEmpleado === empleado).resultado.neto,
    ).toBe('4176.01');
    expect(
      r.registros.find((f: { idEmpleado: number }) => f.idEmpleado === otro).alertas.join(' '),
    ).toMatch(/negativo/);
    const result = await pagar(d, r.hash);
    pagoId = result.body.data.pagados[0];
    periodoPago = result.body.data.idPeriodo;
    expect(result.body.data.pagados).toHaveLength(1);
    expect(result.body.data.bloqueados).toHaveLength(1);
    expect(Number(await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO'))).toBe(50.01);
    expect(
      Number(
        await escalar(
          "SELECT COUNT(*) FROM NOVEDADES_MENSUALES WHERE ID_EMPLEADO=:id AND ESTADO='PENDIENTE'",
          { id: otro },
        ),
      ),
    ).toBe(1);
  });
  it('ZIP privado, PDF archivado inmutable y detalle A11', async () => {
    const z = await rh.agent
      .get('/api/nomina/pagos/zip')
      .query({ mes: '2026-01', idDepartamento: dep })
      .expect(200);
    expect(Object.keys(unzipSync(Buffer.from(z.body.data.base64, 'base64')))).toHaveLength(2);
    await propio.agent.get('/api/nomina/pagos/zip').query({ mes: '2026-01' }).expect(403);
    const pdf = await propio.agent.get(`/api/nomina/boletas/${pagoId}/pdf`).expect(200);
    await ejecutar("UPDATE CONFIGURACION_EMPRESA SET RAZON_SOCIAL='Empresa con nuevo nombre'");
    const otra = await propio.agent.get(`/api/nomina/boletas/${pagoId}/pdf`).expect(200);
    expect(otra.body.data.base64).toBe(pdf.body.data.base64);
    const detalle = await rh.agent.get(`/api/nomina/boletas/${pagoId}`).expect(200);
    expect(detalle.body.data.resultado.baseIgss).toBe('11825.00');
    expect(
      detalle.body.data.resultado.lineas.map(
        (l: { concepto: { codigo: string } }) => l.concepto.codigo,
      ),
    ).toEqual(
      expect.arrayContaining([
        'SALARIO_BASE',
        'AUSENCIA_SIN_GOCE',
        'HORAS_EXTRA',
        'COMISION',
        'BONIFICACION_INCENTIVO',
        'ANTICIPO_PAGADO',
        'IGSS_LABORAL',
        'ISR',
        'PARQUEO',
        'CONSUMO_TIENDA',
        'PRESTAMO',
        'OTRO_DESCUENTO',
      ]),
    );
  });
  it('reversión ADMIN con motivo, dependencias y restitución exacta; versión histórica conservada', async () => {
    await post(
      rh,
      `/pagos/${pagoId}/revertir`,
      { motivo: 'Corregir novedades del mes', confirmado: true },
      403,
    );
    await post(admin, `/pagos/${pagoId}/revertir`, { motivo: 'corto', confirmado: true }, 400);
    await post(
      admin,
      `/pagos/${anticipoId}/revertir`,
      { motivo: 'Corregir novedades del mes', confirmado: true },
      409,
    );
    await post(admin, `/pagos/${pagoId}/revertir`, {
      motivo: 'Corregir novedades del mes',
      confirmado: true,
    });
    expect(Number(await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO'))).toBe(100.01);
    expect(Number(await escalar('SELECT COUNT(*) FROM BOLETAS_PAGO'))).toBe(2);
    await propio.agent.get(`/api/nomina/boletas/${pagoId}/pdf`).expect(403);
    await post(
      admin,
      `/pagos/${pagoId}/revertir`,
      { motivo: 'Repetir reversión del pago', confirmado: true },
      409,
    );
    const r = await simular(objetivo('PAGO'));
    expect(r.registros[0].resultado.neto).toBe('4176.01');
    const p = await pagar(objetivo('PAGO'), r.hash);
    expect(p.body.data.pagados[0]).not.toBe(pagoId);
    pagoId = p.body.data.pagados[0];
    expect(Number(await escalar('SELECT COUNT(*) FROM NOMINA_EMPLEADO'))).toBe(3);
  });
  it('fallo real de auditoría revierte cálculo, PDF, cobro y notificación', async () => {
    await ejecutar(
      "UPDATE NOVEDADES_MENSUALES SET ACTIVO=0 WHERE ID_EMPLEADO=:id AND TIPO='CONSUMO_TIENDA'",
      { id: otro },
    );
    const d = objetivo('PAGO', otro),
      r = await simular(d);
    await ejecutar(
      "CREATE OR REPLACE TRIGGER FALLO_PAGO BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='PAGAR_NOMINA' THEN RAISE_APPLICATION_ERROR(-20001,'Fallo de prueba'); END IF; END;",
    );
    try {
      await pagar(d, r.hash, 500);
      expect(
        Number(
          await escalar('SELECT COUNT(*) FROM PAGOS_NOMINA WHERE ID_EMPLEADO=:id', { id: otro }),
        ),
      ).toBe(0);
    } finally {
      await ejecutar('DROP TRIGGER FALLO_PAGO');
    }
    await pagar(d, r.hash);
  });
  it('cierre mantiene revisión/aprobación, no cobra dos veces; reversión cerrada bloqueada', async () => {
    // Completar el anticipo del segundo empleado para poder cerrar todo el periodo.
    // Ya tiene pago: no se inventa un anticipo. Se conserva como pago sin anticipo.
    // El cierre del anticipo no exige a quienes ya tienen pago mensual sin anticipo.
    await ejecutar('UPDATE EMPLEADOS SET ACTIVO=0 WHERE ID_EMPLEADO=:id', { id: otro });
    for (const periodo of [periodoAnticipo, periodoPago])
      for (const accion of ['revisar', 'aprobar', 'cerrar'])
        await post(rh, `/periodos/${periodo}/${accion}`, {
          version: 1,
          confirmado: true,
          motivo: '',
        });
    expect(Number(await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO'))).toBe(50.01);
    await post(
      admin,
      `/pagos/${pagoId}/revertir`,
      { motivo: 'Intentar corregir periodo cerrado', confirmado: true },
      409,
    );
  });
  it('IGSS mensual usa devengado completo sin duplicar anticipo y conserva los 19 campos', async () => {
    const centro = Number(await escalar('SELECT MIN(ID_CENTRO_TRABAJO) FROM CENTROS_TRABAJO'));
    const formato = {
      version: '2.2.0',
      patrono: '12345',
      pruebas: '1',
      nombre: 'Empresa prueba',
      nit: '1234567-9',
      direccion: 'Guatemala',
      correo: 'igss@example.test',
      centros: [
        {
          id: centro,
          codigo: '1',
          nombre: 'Centro',
          direccion: 'Guatemala',
          zona: '1',
          telefono: '',
          fax: '',
          contacto: '',
          correo: '',
          departamento: '1',
          municipio: '1',
          actividad: '451001',
        },
      ],
      tipos: [
        {
          codigo: '1',
          nombre: 'Mensual',
          afiliado: 'C',
          periodo: 'M',
          departamento: '1',
          actividad: '451001',
          clase: 'N',
          tiempo: 'TC',
        },
      ],
      empleados: [empleado, otro].map((id) => ({
        id,
        tipo: '1',
        ocupacion: '4190',
        condicion: 'P',
        salario: '1',
        primerNombre: 'Persona',
        otrosNombres: '',
        primerApellido: 'Prueba',
        segundoApellido: '',
        apellidoCasada: '',
      })),
    };
    await post(rh, '/igss/formato', {
      formato,
      motivo: 'Formato certificado de pruebas',
      confirmado: true,
    });
    const r = await rh.agent
        .get('/api/nomina/igss/exportar')
        .query({ anio: 2026, mes: 1 })
        .expect(200),
      texto = Buffer.from(r.body.data.base64, 'base64').toString();
    const filas = texto
      .split('[Empleados]\r\n')[1]!
      .split('[Suspendidos]')[0]!
      .trim()
      .split('\r\n');
    expect(filas).toHaveLength(2);
    expect(filas[0]!.split('|')).toHaveLength(19);
    expect(filas[0]!.split('|')[7]).toBe('11825.00');
    expect(filas[0]!.split('|')[18]).toBe('30');
  });
  it('mes siguiente: historia fiscal mensual y última cuota; reversión restituye exactamente el saldo', async () => {
    const d: ObjetivoPago = {
      mes: '2026-02',
      tipoPago: 'PAGO',
      objetivo: 'EMPLEADO',
      idEmpleado: empleado,
    };
    const r = await simular(d);
    expect(r.fechaPago).toBe('2026-02-28');
    expect(r.registros[0].resultado.neto).toBe('9421.40');
    expect(r.registros[0].resultado.isr.retenido).toBe('295.59');
    const p = await pagar(d, r.hash),
      id = p.body.data.pagados[0];
    expect(Number(await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO'))).toBe(0);
    expect(await escalar('SELECT ESTADO FROM DESCUENTOS_EMPLEADO')).toBe('LIQUIDADO');
    await post(admin, `/pagos/${id}/revertir`, {
      motivo: 'Corregir última cuota mensual',
      confirmado: true,
    });
    expect(Number(await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO'))).toBe(50.01);
    const otra = await simular(d);
    expect(otra.registros[0].resultado.neto).toBe('9421.40');
    await pagar(d, otra.hash);
    expect(Number(await escalar('SELECT SALDO FROM DESCUENTOS_EMPLEADO'))).toBe(0);
  });
  it('pendientes históricos se aplican como retroactivos sin modificar cálculos cerrados', async () => {
    await nov('COMISION', '100', '1', '2026-01');
    const d: ObjetivoPago = {
        mes: '2026-03',
        tipoPago: 'PAGO',
        objetivo: 'EMPLEADO',
        idEmpleado: empleado,
      },
      r = await simular(d);
    expect(r.verificacion.retroactivas).toBe(1);
    expect(
      r.registros[0].resultado.lineas.some((l: { descripcion: string }) =>
        l.descripcion.includes('Retroactiva 2026-01'),
      ),
    ).toBe(true);
    await pagar(d, r.hash);
    expect(
      await escalar(
        "SELECT ESTADO FROM NOVEDADES_MENSUALES WHERE ID_EMPLEADO=:id AND MES=DATE '2026-01-01' AND MONTO=100",
        { id: empleado },
      ),
    ).toBe('APLICADA');
  });
  let anualEmpleado: number, anualBoleta: number, anualSesion: typeof admin;
  const anualObjetivo = (): ObjetivoPago => ({
    mes: '2026-07',
    tipoPago: 'BONO_14',
    objetivo: 'EMPLEADO',
    idEmpleado: anualEmpleado,
  });
  it('A12: migración conserva pagos anteriores; precalcula desde contratación con aumento, comisión y HE', async () => {
    const u = await enTransaccion(db, (c) =>
      crearUsuarioInterno(c, actor, {
        nombre: 'Anual',
        apellido: 'Prueba',
        correo: 'anual@example.test',
        rol: 'EMPLEADO',
      }),
    );
    await ejecutar('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id', {
      id: u.idUsuario,
    });
    await ejecutar(
      "INSERT INTO EMPLEADOS(ID_USUARIO,NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) SELECT :u,'Anual','Prueba','9876543210124','6-K',DATE '1990-01-01','F','SOLTERO','Guatemala','55551234','anual.persona@example.test',ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,DATE '2026-01-01' FROM EMPLEADOS WHERE ID_EMPLEADO=:e",
      { u: u.idUsuario, e: empleado },
    );
    anualEmpleado = Number(
      await escalar('SELECT ID_EMPLEADO FROM EMPLEADOS WHERE ID_USUARIO=:u', { u: u.idUsuario }),
    );
    await ejecutar(
      "INSERT INTO HISTORIAL_SALARIAL(ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,VIGENTE_HASTA,MOTIVO) VALUES(:id,3000,DATE '2026-01-01',DATE '2026-03-31','Historia certificada')",
      { id: anualEmpleado },
    );
    await ejecutar(
      "INSERT INTO HISTORIAL_SALARIAL(ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES(:id,5000,DATE '2026-04-01','Aumento certificado')",
      { id: anualEmpleado },
    );
    await ejecutar(
      "INSERT INTO EMPLEADO_HORARIO(ID_EMPLEADO,ID_HORARIO,VIGENTE_DESDE,MOTIVO) SELECT :id,MIN(ID_HORARIO),DATE '2026-01-01','Horario certificado' FROM HORARIOS",
      { id: anualEmpleado },
    );
    await nov('COMISION', '600', '1', '2026-06', anualEmpleado);
    await nov('HORAS_EXTRA', '250', '8', '2026-06', anualEmpleado);
    anualSesion = await entrar(u.usuario, u.contrasenaTemporal);
    const antes = await escalar('SELECT COUNT(*) FROM NOMINA_EMPLEADO');
    const r = await simular(anualObjetivo());
    // (3 × 3000 + 3 × 5000 + 600 + 8 × 5000 / 30 / 8 × 1.5) / 6 × 181 / 365.
    expect(r.registros[0].alertas).toEqual([]);
    expect(r.registros[0].resultado.componentes[0]).toMatchObject({
      dias: 181,
      promedio: '4141.67',
      monto: '2053.81',
      exento: '2053.81',
      gravado: '0.00',
    });
    expect(await escalar('SELECT COUNT(*) FROM NOMINA_EMPLEADO')).toBe(antes);
    await post(rh, '/simular', { ...anualObjetivo(), mes: '2026-06' }, 409);
    const pdf = await post(rh, `/simular/${anualEmpleado}/pdf`, anualObjetivo());
    await mkdir('../tmp/pdfs', { recursive: true });
    await writeFile(
      '../tmp/pdfs/bono14-v1-11-simulacion.pdf',
      Buffer.from(pdf.body.data.base64, 'base64'),
    );
  });
  it('A12: fuentes cambiantes, confirmación e idempotencia concurrente con boletas propias y ZIP', async () => {
    const previo = await simular(anualObjetivo());
    await ejecutar(
      "UPDATE NOVEDADES_MENSUALES SET MONTO=720 WHERE ID_EMPLEADO=:id AND TIPO='COMISION'",
      { id: anualEmpleado },
    );
    await pagar(anualObjetivo(), previo.hash, 409);
    const actual = await simular(anualObjetivo());
    expect(actual.verificacion).toMatchObject({ horasExtra: 1, comisiones: 1 });
    for (const objetivo of ['DEPARTAMENTO', 'TODOS'] as const) {
      const lote = await simular({
        mes: '2026-07',
        tipoPago: 'BONO_14',
        objetivo,
        ...(objetivo === 'DEPARTAMENTO' ? { idDepartamento: dep } : {}),
      });
      expect(
        lote.registros.some((f: { idEmpleado: number }) => f.idEmpleado === anualEmpleado),
      ).toBe(true);
    }
    await ejecutar(
      "CREATE OR REPLACE TRIGGER F11_FALLAR BEFORE INSERT ON BITACORA_AUDITORIA FOR EACH ROW BEGIN IF :NEW.ACCION='PAGAR_PRESTACION' THEN RAISE_APPLICATION_ERROR(-20099,'Fallo de prueba A12'); END IF; END;",
    );
    try {
      await pagar(anualObjetivo(), actual.hash, 500);
    } finally {
      await ejecutar('DROP TRIGGER F11_FALLAR');
    }
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM PRESTACIONES WHERE ID_EMPLEADO=:id', {
          id: anualEmpleado,
        }),
      ),
    ).toBe(0);
    expect(
      Number(
        await escalar('SELECT COUNT(*) FROM NOMINA_EMPLEADO WHERE ID_EMPLEADO=:id', {
          id: anualEmpleado,
        }),
      ),
    ).toBe(0);
    const rs = await Promise.all(
      [1, 2].map(() =>
        rh.agent
          .post('/api/nomina/pagar')
          .set('X-CSRF-Token', rh.csrf)
          .send({
            ...anualObjetivo(),
            hash: actual.hash,
            confirmado: true,
            novedadesCompletas: true,
          }),
      ),
    );
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    anualBoleta = rs.find((r) => r.status === 201)!.body.data.pagados[0];
    expect(
      await escalar('SELECT ESTADO FROM PRESTACIONES WHERE ID_NOMINA_EMPLEADO=:id', {
        id: anualBoleta,
      }),
    ).toBe('PAGADA');
    expect(
      Number(
        await escalar(
          "SELECT COUNT(*) FROM NOVEDADES_MENSUALES WHERE ID_EMPLEADO=:id AND ESTADO='PENDIENTE'",
          { id: anualEmpleado },
        ),
      ),
    ).toBe(2);
    const listado = await anualSesion.agent.get('/api/nomina/boletas').expect(200);
    expect(listado.body.data.registros.some((r: { id: number }) => r.id === anualBoleta)).toBe(
      true,
    );
    await propio.agent.get(`/api/nomina/boletas/${anualBoleta}/pdf`).expect(403);
    const pdf = await anualSesion.agent.get(`/api/nomina/boletas/${anualBoleta}/pdf`).expect(200);
    await writeFile(
      '../tmp/pdfs/bono14-v1-11-pagado.pdf',
      Buffer.from(pdf.body.data.base64, 'base64'),
    );
    const zip = await rh.agent
      .get('/api/nomina/pagos/zip')
      .query({ mes: '2026-07', idEmpleado: anualEmpleado })
      .expect(200);
    expect(Object.keys(unzipSync(Buffer.from(zip.body.data.base64, 'base64')))).toHaveLength(1);
    await ejecutar("UPDATE CONFIGURACION_EMPRESA SET RAZON_SOCIAL='Nombre posterior al pago'");
    const otra = await anualSesion.agent.get(`/api/nomina/boletas/${anualBoleta}/pdf`).expect(200);
    expect(otra.body.data.base64).toBe(pdf.body.data.base64);
  });
  it('A12: reversión ADMIN conserva comprobante histórico y permite nueva versión sin doble prestación', async () => {
    await post(
      rh,
      `/pagos/${anualBoleta}/revertir`,
      { motivo: 'Corrección de prestación anual', confirmado: true },
      403,
    );
    await post(admin, `/pagos/${anualBoleta}/revertir`, {
      motivo: 'Corrección de prestación anual',
      confirmado: true,
    });
    expect(
      await escalar('SELECT ESTADO FROM PRESTACIONES WHERE ID_NOMINA_EMPLEADO=:id', {
        id: anualBoleta,
      }),
    ).toBe('ANULADA');
    const r = await simular(anualObjetivo());
    expect(r.registros[0].resultado).not.toBeNull();
    const p = await pagar(anualObjetivo(), r.hash);
    expect(p.body.data.pagados[0]).not.toBe(anualBoleta);
    await post(rh, `/periodos/${p.body.data.idPeriodo}/revisar`, {
      version: 1,
      confirmado: true,
      motivo: 'Revisión de prestación sin anticipo salarial',
    });
    expect(
      Number(
        await escalar(
          "SELECT COUNT(*) FROM PRESTACIONES WHERE ID_EMPLEADO=:id AND ESTADO='PAGADA'",
          { id: anualEmpleado },
        ),
      ),
    ).toBe(1);
  });
});
