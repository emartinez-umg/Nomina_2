import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verify } from 'argon2';
import { crearBaseDatos, type BaseDatos } from '../pool.js';
import { validarEntorno } from '../../../config/env.schema.js';
import { generarContrasenaTemporal } from '../../security/credenciales.js';
import { generarSqlDemo } from './exportar.js';
import { cargarDataset } from './datos.js';
import { filas, tablas, huella, propiedades } from './repository.js';

let db: BaseDatos;
const raiz = fileURLToPath(new URL('../../../../../', import.meta.url));
const contrasena = generarContrasenaTemporal();
const d = await cargarDataset();
let sql: string;
let sqlCompleto: string;
let dominioInicial: string;
function remoto(args: string[], entorno: Record<string, string | undefined> = {}) {
  return execFileSync(process.execPath, ['scripts/seed-remote.js', ...args], {
    cwd: raiz,
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DB_USER: 'LOCAL_PROHIBIDO',
      DB_PASSWORD: 'no-utilizar',
      DB_CONNECT_STRING: 'inexistente:1/X',
      DEST_DB_USER: process.env.DB_USER,
      DEST_DB_PASSWORD: process.env.DB_PASSWORD,
      DEST_DB_CONNECT_STRING: process.env.DB_CONNECT_STRING,
      SEED_DEFAULT_PASSWORD: contrasena,
      ...entorno,
    },
  });
}
function ejecutarSql(contenido: string, falla = false) {
  const r = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'nomina2-db', 'sqlplus', '-s', '/nolog'],
    {
      cwd: raiz,
      encoding: 'utf8',
      timeout: 120000,
      input: `SET LINESIZE 32767\nWHENEVER SQLERROR EXIT FAILURE ROLLBACK\nCONNECT ${process.env.DB_USER}/"${process.env.DB_PASSWORD}"@localhost:1521/XEPDB1\nALTER SESSION SET NLS_NUMERIC_CHARACTERS=',.';\n${contenido}\nEXIT;\n`,
    },
  );
  // Nunca adjuntar el SQL ni los hashes al reporte de un fallo.
  if (!falla && (r.error || r.status !== 0))
    throw new Error((r.stdout.match(/(?:ORA|PLS)-[^\n]+/g) ?? ['Falló SQLPlus']).join('\n'));
  if (falla) expect(r.status).not.toBe(0);
}
async function captura() {
  return db.conConexion(async (c) => {
    const conteos: Record<string, number> = {};
    for (const t of [
      ...Object.keys(tablas),
      'REGISTRO_CODIGOS',
      'SECUENCIAS_CODIGOS',
      'BITACORA_AUDITORIA',
    ])
      conteos[t] = (await c.execute<[number]>(`SELECT COUNT(*) FROM ${t}`)).rows![0]![0];
    const credenciales = await filas(
      c,
      'SELECT USUARIO,CONTRASENA_HASH,CAMBIO_OBLIGATORIO FROM USUARIOS ORDER BY ID_USUARIO',
    );
    const codigos = await filas(
      c,
      'SELECT ENTIDAD,AMBITO,ULTIMO_NUMERO FROM SECUENCIAS_CODIGOS ORDER BY ENTIDAD,AMBITO',
    );
    return {
      conteos,
      huella: createHash('sha256').update(JSON.stringify({ credenciales, codigos })).digest('hex'),
    };
  });
}
async function dominio() {
  return db.conConexion(async (c) => {
    const empleados = await filas<Record<string, unknown>>(
      c,
      `SELECT E.*,D.NOMBRE DEPARTAMENTO,P.NOMBRE PUESTO,C.NOMBRE CENTRO,B.NOMBRE BANCO,T.NOMBRE CONTRATO,U.USUARIO,R.CODIGO ROL,M.CODIGO_INE MUNICIPIO,GT.CODIGO_INE DEPARTAMENTO_GT
      FROM EMPLEADOS E JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO JOIN PUESTOS P ON P.ID_PUESTO=E.ID_PUESTO JOIN CENTROS_TRABAJO C ON C.ID_CENTRO_TRABAJO=E.ID_CENTRO_TRABAJO
      JOIN BANCOS B ON B.ID_BANCO=E.ID_BANCO JOIN TIPOS_CONTRATO T ON T.ID_TIPO_CONTRATO=E.ID_TIPO_CONTRATO JOIN USUARIOS U ON U.ID_USUARIO=E.ID_USUARIO JOIN ROLES R ON R.ID_ROL=U.ID_ROL
      JOIN MUNICIPIOS_GT M ON M.ID_MUNICIPIO_GT=E.ID_MUNICIPIO_GT JOIN DEPARTAMENTOS_GT GT ON GT.ID_DEPARTAMENTO_GT=M.ID_DEPARTAMENTO_GT ORDER BY E.CORREO`,
    );
    const descartar = new Set([
      'CODIGO',
      'CODIGO_ANTERIOR',
      'CREADO_POR',
      'MODIFICADO_POR',
      'FECHA_CREACION',
      'FECHA_MODIFICACION',
    ]);
    const base = empleados.map((e) =>
      Object.fromEntries(
        Object.entries(e).filter(([k]) => !k.startsWith('ID_') && !descartar.has(k)),
      ),
    );
    const hijos = [];
    for (const [tabla, campos, orden] of [
      ['HISTORIAL_SALARIAL', 'H.SALARIO_BASE,H.VIGENTE_DESDE,H.VIGENTE_HASTA', 'H.VIGENTE_DESDE'],
      [
        'EMPLEADO_HORARIO',
        '(SELECT NOMBRE FROM HORARIOS X WHERE X.ID_HORARIO=H.ID_HORARIO) HORARIO,H.VIGENTE_DESDE,H.VIGENTE_HASTA',
        'H.VIGENTE_DESDE',
      ],
      [
        'EMPLEADO_CONTACTOS_EMERGENCIA',
        'H.NOMBRE,H.PARENTESCO,H.TELEFONO,H.PRIORIDAD',
        'H.PRIORIDAD',
      ],
      [
        'NOVEDADES_MENSUALES',
        'H.TIPO,H.MES,H.CANTIDAD,H.MONTO,H.VALOR_UNITARIO,H.RECARGO,H.REFERENCIA,H.DESCRIPCION,H.AUTORIZACION',
        'H.TIPO,H.MES,H.REFERENCIA',
      ],
      ['PRESTAMOS', 'H.CAPITAL,H.FECHA_DESEMBOLSO,H.REFERENCIA', 'H.REFERENCIA'],
      [
        'DESCUENTOS_CUOTAS',
        'H.NUMERO_CUOTA,H.FECHA_VENCIMIENTO,H.MONTO,H.ESTADO',
        'H.NUMERO_CUOTA',
      ],
      ['PARQUEO_SUSCRIPCIONES', 'H.VEHICULO,H.PLACA,H.MES_INICIO,H.ESTADO', 'H.MES_INICIO'],
    ])
      hijos.push(
        await filas(
          c,
          `SELECT E.CORREO,${campos} FROM ${tabla} H JOIN EMPLEADOS E ON E.ID_EMPLEADO=H.ID_EMPLEADO ORDER BY E.CORREO,${orden}`,
        ),
      );
    return createHash('sha256').update(JSON.stringify({ base, hijos })).digest('hex');
  });
}
describe('Exportación SQL autónoma y carga remota en Oracle desechable', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo se permiten esquemas desechables N2SEC.');
    db = await crearBaseDatos(validarEntorno(process.env));
    remoto(['--apply-schema']);
    dominioInicial = await dominio();
    remoto(['--reset-demo']);
    // Cambiar las identidades y reservar códigos demuestra que no se copian IDs del origen.
    await db.conConexion(async (c) => {
      await c.execute("INSERT INTO BANCOS(NOMBRE) VALUES('Banco ajeno de prueba')");
      await c.commit();
    });
    sql = await generarSqlDemo(d, contrasena);
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('rechaza destinos incompletos sin usar la conexión local', () => {
    expect(() => remoto(['--dry-run'], { DEST_DB_USER: '' })).toThrow();
    expect(() => remoto(['--dry-run'], { DEST_DB_CONNECT_STRING: '' })).toThrow();
  });
  it('SQLPlus carga las FK naturales, genera códigos y conserva el banco ajeno', async () => {
    ejecutarSql(sql);
    const r = await captura();
    expect(r.conteos.EMPLEADOS).toBe(32);
    expect(r.conteos.BANCOS).toBe(6);
    expect(await dominio()).toBe(dominioInicial);
    await db.conConexion(async (c) => {
      const usuarios = await filas<{ CONTRASENA_HASH: string; CAMBIO_OBLIGATORIO: number }>(
        c,
        "SELECT CONTRASENA_HASH,CAMBIO_OBLIGATORIO FROM USUARIOS WHERE CORREO LIKE '%@demo-nomina.test'",
      );
      expect(usuarios).toHaveLength(32);
      expect(await verify(usuarios[0]!.CONTRASENA_HASH, contrasena)).toBe(true);
      expect(usuarios.every((u) => u.CAMBIO_OBLIGATORIO === 1)).toBe(true);
      const propias = await propiedades(c, d.configuracion.conjunto);
      for (const p of propias.values()) expect(await huella(c, p.tabla, p.id)).toBe(p.huella);
      const codigos = await filas<{ CODIGO: string }>(c, 'SELECT CODIGO FROM EMPLEADOS');
      expect(codigos.every((e) => /^EMP_[A-Z0-9]+_\d{4,}$/.test(e.CODIGO))).toBe(true);
    });
    remoto(['--reset-demo', '--dry-run']);
  });
  it('repetir SQL y seed remoto conserva filas, claves y contadores', async () => {
    const antes = await captura();
    ejecutarSql(sql);
    expect(await captura()).toEqual(antes);
    remoto(['--dry-run']);
    remoto([]);
    expect(await captura()).toEqual(antes);
  });
  it('SQL amplía extras y ambas entradas los reutilizan sin duplicarlos', async () => {
    sqlCompleto = await generarSqlDemo(d, contrasena, true);
    ejecutarSql(sqlCompleto);
    const antes = await captura();
    expect(antes.conteos.HISTORIAL_SALARIAL).toBe(38);
    expect(antes.conteos.PRESTAMOS).toBe(2);
    expect(antes.conteos.AUSENCIAS).toBe(2);
    expect(antes.conteos.PARQUEO_SUSCRIPCIONES).toBe(3);
    ejecutarSql(sqlCompleto);
    expect(await captura()).toEqual(antes);
    remoto(['--with-extras']);
    expect(await captura()).toEqual(antes);
  });
  it('reset remoto reconoce las huellas SQL y un fallo SQL revierte toda la carga', async () => {
    remoto(['--reset-demo']);
    expect((await captura()).conteos.EMPLEADOS).toBe(0);
    expect((await captura()).conteos.BANCOS).toBe(1);
    await db.conConexion((c) =>
      c.execute(
        "CREATE OR REPLACE TRIGGER TR_DEMO_FALLO BEFORE INSERT ON EMPLEADOS FOR EACH ROW BEGIN IF :NEW.CORREO='maria.castaneda@demo-nomina.test' THEN RAISE_APPLICATION_ERROR(-20999,'Fallo deliberado'); END IF; END;",
      ),
    );
    const antes = await captura();
    ejecutarSql(sql, true);
    expect(await captura()).toEqual(antes);
    await db.conConexion((c) => c.execute('DROP TRIGGER TR_DEMO_FALLO'));
  });
  it('SQL reconoce un conjunto creado por Node con los mismos valores de dominio y extras', async () => {
    remoto(['--with-extras']);
    const antes = await captura(),
      esperado = await dominio();
    ejecutarSql(sqlCompleto);
    expect(await captura()).toEqual(antes);
    expect(await dominio()).toBe(esperado);
    remoto(['--reset-demo']);
    ejecutarSql(sqlCompleto);
    expect(await dominio()).toBe(esperado);
  }, 60000);
});
