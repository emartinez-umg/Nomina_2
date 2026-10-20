import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { verify } from 'argon2';
import { crearBaseDatos } from '../pool.js';
import type { BaseDatos } from '../pool.js';
import { enTransaccion } from '../transaccion.js';
import { validarEntorno } from '../../../config/env.schema.js';
import { cargarDataset } from './datos.js';
import { cargarDemo, opcionesDemo } from './service.js';
import { filas, propiedades, tablas, insertar, llave } from './repository.js';
import { generarContrasenaTemporal } from '../../security/credenciales.js';
import { listar } from '../../../modules/empleados/empleados.repository.js';
import { querySchema } from '../../../modules/empleados/empleados.schemas.js';
import { crearPagosService } from '../../../modules/nomina/pago.service.js';

let db: BaseDatos;
const raiz = fileURLToPath(new URL('../../../../../', import.meta.url));
const contrasena = generarContrasenaTemporal();
const d = await cargarDataset();
function cli(argumentos: string[]) {
  return execFileSync(process.execPath, ['scripts/seed-demo.js', ...argumentos], {
    cwd: raiz,
    env: { ...process.env, SEED_DEFAULT_PASSWORD: contrasena },
    encoding: 'utf8',
    timeout: 120000,
  });
}
const cargar = (argumentos: string[] = []) =>
  enTransaccion(db, (c) => cargarDemo(c, d, opcionesDemo(argumentos), contrasena));
async function captura() {
  return db.conConexion(async (c) => {
    const conteos: Record<string, number> = {};
    for (const t of [
      ...Object.keys(tablas),
      'BITACORA_AUDITORIA',
      'REGISTRO_CODIGOS',
      'SECUENCIAS_CODIGOS',
    ])
      conteos[t] = (await c.execute<[number]>(`SELECT COUNT(*) FROM ${t}`)).rows![0]![0];
    const usuarios = await filas(
      c,
      'SELECT USUARIO,CONTRASENA_HASH,CAMBIO_OBLIGATORIO FROM USUARIOS ORDER BY ID_USUARIO',
    );
    const contadores = await filas(
      c,
      'SELECT ENTIDAD,AMBITO,ULTIMO_NUMERO FROM SECUENCIAS_CODIGOS ORDER BY ENTIDAD,AMBITO',
    );
    return {
      conteos,
      huella: createHash('sha256').update(JSON.stringify({ usuarios, contadores })).digest('hex'),
    };
  });
}
describe('Seed demo con Oracle en un esquema desechable', () => {
  beforeAll(async () => {
    if (!/^N2SEC_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
      throw new Error('Solo se permiten esquemas desechables N2SEC.');
    db = await crearBaseDatos(validarEntorno(process.env));
    cli(['--apply-schema']);
  });
  afterAll(async () => {
    await db?.cerrar();
  });
  it('instala un esquema vacío y carga 32 expedientes completos con usuarios autenticables', async () => {
    const snapshot = await captura();
    expect(snapshot.conteos.EMPLEADOS).toBe(32);
    expect(snapshot.conteos.BANCOS).toBe(5);
    expect(snapshot.conteos.PUESTOS).toBe(30);
    await db.conConexion(async (c) => {
      const usuarios = await filas<{ CONTRASENA_HASH: string; CAMBIO_OBLIGATORIO: number }>(
        c,
        "SELECT CONTRASENA_HASH,CAMBIO_OBLIGATORIO FROM USUARIOS WHERE CORREO LIKE '%@demo-nomina.test'",
      );
      expect(usuarios).toHaveLength(32);
      expect(usuarios.every((u) => u.CAMBIO_OBLIGATORIO === 1)).toBe(true);
      expect(await verify(usuarios[0]!.CONTRASENA_HASH, contrasena)).toBe(true);
      expect(
        (await listar(c, querySchema.parse({ idDepartamento: undefined, limite: 100 }))).total,
      ).toBe(32);
      const filtros = await filas<{ ID_DEPARTAMENTO: number }>(
        c,
        'SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NOMBRE=:nombre',
        { nombre: 'Recursos Humanos' },
      );
      expect(
        (await listar(c, querySchema.parse({ idDepartamento: filtros[0]!.ID_DEPARTAMENTO }))).total,
      ).toBe(6);
    });
    const simulacion = await crearPagosService(db).simular({
      mes: '2026-10',
      tipoPago: 'ANTICIPO',
      objetivo: 'TODOS',
    });
    expect(simulacion.registros).toHaveLength(32);
  });
  it('dry-run y segunda carga conservan conteos, credenciales y contadores', async () => {
    const antes = await captura();
    cli(['--dry-run']);
    expect(await captura()).toEqual(antes);
    const plan = JSON.parse(cli(['--dry-run', '--with-extras']));
    expect(plan.tablas.HISTORIAL_SALARIAL.previstos).toBe(6);
    expect(await captura()).toEqual(antes);
    cli([]);
    expect(await captura()).toEqual(antes);
  });
  it('el reset elimina solo lo creado y un fallo a mitad de carga revierte filas y reservas', async () => {
    cli(['--reset-demo']);
    expect((await captura()).conteos.EMPLEADOS).toBe(0);
    await enTransaccion(db, (c) =>
      c.execute("INSERT INTO BANCOS(NOMBRE) VALUES('Banco testigo ajeno al demo')"),
    );
    await db.conConexion((c) =>
      c.execute(
        "CREATE OR REPLACE TRIGGER TR_DEMO_FALLO BEFORE INSERT ON EMPLEADOS FOR EACH ROW BEGIN IF :NEW.CORREO='maria.castaneda@demo-nomina.test' THEN RAISE_APPLICATION_ERROR(-20999,'Fallo deliberado de regresión'); END IF; END;",
      ),
    );
    const antes = await captura();
    expect(() => cli([])).toThrow();
    expect(await captura()).toEqual(antes);
    await db.conConexion((c) => c.execute('DROP TRIGGER TR_DEMO_FALLO'));
    cli([]);
    expect((await captura()).conteos.BANCOS).toBe(6);
  });
  it('amplía el conjunto con extras y mantiene la idempotencia sin duplicar novedades', async () => {
    await cargar(['--with-extras']);
    const antes = await captura();
    expect(antes.conteos.PARQUEO_SUSCRIPCIONES).toBe(3);
    expect(antes.conteos.PRESTAMOS).toBe(2);
    expect(antes.conteos.AUSENCIAS).toBe(2);
    expect(antes.conteos.HISTORIAL_SALARIAL).toBe(38);
    await cargar(['--with-extras']);
    expect(await captura()).toEqual(antes);
  });
  it('no adopta notificaciones ajenas de una solicitud demo al repetir extras', async () => {
    const id = await enTransaccion(db, async (c) => {
      const s = (
        await filas<{ ID_SOLICITUD: number }>(
          c,
          'SELECT ID_SOLICITUD FROM SOLICITUDES FETCH FIRST 1 ROW ONLY',
        )
      )[0]!;
      const u = (
        await filas<{ ID_USUARIO: number }>(
          c,
          'SELECT ID_USUARIO FROM USUARIOS ORDER BY ID_USUARIO FETCH FIRST 1 ROW ONLY',
        )
      )[0]!;
      return insertar(c, 'NOTIFICACIONES', {
        ID_SOLICITUD: s.ID_SOLICITUD,
        ID_USUARIO: u.ID_USUARIO,
        TIPO: 'CAMBIO_ESTADO',
        TITULO: 'Aviso testigo ajeno',
        MENSAJE: 'Registro de prueba que no pertenece al seed.',
        CLAVE_EVENTO: 'TESTIGO_EXTERNO',
      });
    });
    await cargar(['--with-extras']);
    expect(
      await db.conConexion(async (c) =>
        (await propiedades(c, d.configuracion.conjunto)).has(llave('NOTIFICACIONES', id)),
      ),
    ).toBe(false);
    await expect(cargar(['--reset-demo'])).rejects.toThrow('referencia ajena');
    await enTransaccion(db, (c) =>
      c.execute('DELETE FROM NOTIFICACIONES WHERE ID_NOTIFICACION=:id', { id }),
    );
  });
  it('bloquea el reset ante referencias externas y permite inspeccionar/eliminar extras intactos', async () => {
    await enTransaccion(db, (c) =>
      c.execute(
        "INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) SELECT 'Puesto testigo ajeno',ID_DEPARTAMENTO FROM DEPARTAMENTOS FETCH FIRST 1 ROW ONLY",
      ),
    );
    const antes = await captura();
    await expect(cargar(['--reset-demo'])).rejects.toThrow('referencia ajena');
    expect(await captura()).toEqual(antes);
    await enTransaccion(db, (c) =>
      c.execute("DELETE FROM PUESTOS WHERE NOMBRE='Puesto testigo ajeno'"),
    );
    const intacto = await captura();
    cli(['--reset-demo', '--dry-run']);
    expect(await captura()).toEqual(intacto);
    cli(['--reset-demo']);
    expect((await captura()).conteos.EMPLEADOS).toBe(0);
    expect((await captura()).conteos.BANCOS).toBe(1);
  });
  it('no adopta registros por dominio de correo y no elimina expedientes editados por el usuario', async () => {
    cli([]);
    const p = await db.conConexion((c) => propiedades(c, d.configuracion.conjunto));
    expect(p.size).toBeGreaterThan(100);
    await enTransaccion(db, (c) =>
      c.execute("UPDATE EMPLEADOS SET TELEFONO='55112233' WHERE CORREO=:correo", {
        correo: d.empleados[0]!.correo,
      }),
    );
    const antes = await captura();
    await expect(cargar(['--reset-demo'])).rejects.toThrow('modificado');
    expect(await captura()).toEqual(antes);
  });
});
