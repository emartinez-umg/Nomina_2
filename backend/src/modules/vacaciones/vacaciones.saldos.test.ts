import { beforeEach, describe, it, expect, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { BaseDatos } from '../../shared/db/pool.js';
import type { Connection } from 'oracledb';
import type { Autenticacion } from '../auth/auth.types.js';
import {
  crearSaldosVacacionesService,
  consultarSaldosVacaciones,
  tieneAlerta,
} from './vacaciones.saldos.service.js';
import { saldosQuerySchema } from './vacaciones.saldos.schemas.js';
import * as repo from './vacaciones.saldos.repository.js';
import * as saldo from './vacaciones.repository.js';
vi.mock('./vacaciones.saldos.repository.js', () => ({
  empleados: vi.fn(),
  movimientosLote: vi.fn(),
  umbral: vi.fn(),
}));
vi.mock('./vacaciones.repository.js', () => ({ parametros: vi.fn() }));
vi.mock('../novedades/novedades.repository.js', () => ({ hoy: async () => '2026-10-29' }));
const c = { execute: vi.fn(), rollback: vi.fn() } as unknown as Connection;
const db: BaseDatos = {
  conConexion: vi.fn(async (fn: (c: Connection) => Promise<unknown>) =>
    fn(c),
  ) as BaseDatos['conConexion'],
  cerrar: vi.fn(),
};
const auth = { rol: 'RH', idUsuario: 1 } as Autenticacion;
const empleados = [1, 2, 3].map((id) => ({
  id,
  codigo: `EMP_ING_${id}`,
  nombre: `Persona ${id}`,
  departamento: 'Ingeniería',
  centro: 'Central',
  jefatura: null,
  ingreso: '2025-10-29',
  egreso: null,
  activo: true,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.umbral).mockResolvedValue([{ id: 9, valor: '15' }]);
  vi.mocked(repo.empleados).mockResolvedValue(empleados);
  vi.mocked(repo.movimientosLote).mockResolvedValue([
    { idEmpleado: 2, tipo: 'REVERSO', fecha: '2026-10-29', dias: '0.25', clave: 'AJUSTE:2' },
    { idEmpleado: 3, tipo: 'DISFRUTE', fecha: '2026-10-29', dias: '-6', clave: 'SOL:3' },
  ]);
  vi.mocked(saldo.parametros).mockResolvedValue([
    { desde: '1900-01-01', hasta: null, valor: '1.25' },
  ]);
});
describe('R3-7: saldos por lote', () => {
  it('compara estrictamente y conserva la precisión del umbral', async () => {
    expect(tieneAlerta('15.00', '15')).toBe(false);
    expect(tieneAlerta('15.25', '15')).toBe(true);
    vi.mocked(repo.umbral).mockResolvedValue([{ id: 9, valor: '15.249999' }]);
    const r = await consultarSaldosVacaciones(c, saldosQuerySchema.parse({}));
    expect(r.umbral).toBe('15.249999');
    expect(r.registros[0]?.alerta).toBe(true);
  });
  it('reutiliza saldo: consumos y devoluciones, alerta antes de paginar e indicadores globales', async () => {
    const s = crearSaldosVacacionesService(db);
    const r = await s.listar(auth, saldosQuerySchema.parse({ limite: '1' }));
    expect(r.registros[0]).toMatchObject({
      id: 2,
      mesesCompletos: 12,
      disponible: '15.25',
      solicitables: 15,
      alerta: true,
    });
    expect(r.indicadores).toEqual({
      empleadosAlerta: 1,
      promedioDisponible: '13.08',
      totalAcumulado: '45.00',
    });
    expect(
      await s.listar(
        auth,
        saldosQuerySchema.parse({ soloAlerta: 'true', pagina: '2', limite: '1' }),
      ),
    ).toMatchObject({ total: 1, registros: [], indicadores: { empleadosAlerta: 1 } });
    expect(c.rollback).toHaveBeenCalledTimes(2);
  });
  it('ordena numéricamente en servidor, conserva aperturas y limita la acumulación al egreso', async () => {
    vi.mocked(repo.empleados).mockResolvedValue([
      { ...empleados[0]!, egreso: '2026-08-29', activo: false },
    ]);
    vi.mocked(repo.movimientosLote).mockResolvedValue([
      { idEmpleado: 1, tipo: 'SALDO_INICIAL', fecha: '2026-07-29', dias: '3.5', clave: 'APERTURA' },
    ]);
    const r = await consultarSaldosVacaciones(c, saldosQuerySchema.parse({ activos: 'todos' }));
    expect(r.registros[0]).toMatchObject({
      corte: '2026-08-29',
      mesesCompletos: 10,
      acumulado: '12.50',
      disponible: '4.75',
      solicitables: 4,
    });
  });
  it('no permite ampliar alcance desde query y deniega EMPLEADO antes de consultar', async () => {
    const s = crearSaldosVacacionesService(db);
    expect(() => s.listar({ ...auth, rol: 'EMPLEADO' }, saldosQuerySchema.parse({}))).toThrow();
    expect(() =>
      s.exportar({ ...auth, rol: 'EMPLEADO' }, saldosQuerySchema.parse({}), 'excel'),
    ).toThrow();
    expect(db.conConexion).not.toHaveBeenCalled();
    for (const q of [
      { empleados: [1, 2] },
      { alcance: 'todos' },
      { ordenarPor: 'SALARIO' },
      { soloAlerta: '1' },
      { limite: '501' },
      { activos: '1' },
    ])
      expect(saldosQuerySchema.safeParse(q).success).toBe(false);
    await expect(s.listar(auth, saldosQuerySchema.parse({ alcance: 'equipo' }))).rejects.toThrow();
    expect(repo.empleados).not.toHaveBeenCalled();
  });
  it('acepta solo una lista resuelta por el servidor, incluida la lista vacía', async () => {
    const resolver = vi.fn(async () => [] as number[]);
    const q = saldosQuerySchema.parse({
      alcance: 'equipo',
      idDepartamento: '4',
      idCentroTrabajo: '7',
      idJefatura: '9',
      buscar: 'Persona',
    });
    await crearSaldosVacacionesService(db, resolver).listar(auth, q);
    expect(resolver).toHaveBeenCalledWith(c, auth);
    expect(repo.empleados).toHaveBeenCalledWith(c, q, []);
  });
  it('un resolvedor incompleto nunca convierte equipo en acceso general', async () => {
    const resolver = async () => undefined as unknown as number[];
    await expect(
      crearSaldosVacacionesService(db, resolver).listar(
        auth,
        saldosQuerySchema.parse({ alcance: 'equipo' }),
      ),
    ).rejects.toThrow();
    expect(repo.empleados).not.toHaveBeenCalled();
    expect(c.rollback).toHaveBeenCalledOnce();
  });
  it('exporta todas las páginas con marca, corte y umbral a CSV y XLSX seguros', async () => {
    vi.mocked(repo.empleados).mockResolvedValue(
      empleados.map((e) => ({ ...e, nombre: '=SUM(1,2)' })),
    );
    const s = crearSaldosVacacionesService(db),
      q = saldosQuerySchema.parse({ limite: '1' });
    const csv = Buffer.from((await s.exportar(auth, q, 'csv')).base64, 'base64').toString();
    expect(csv).toContain('Más de 15 días');
    expect(csv).toContain('Sin alerta');
    expect(csv).toContain("'=SUM(1,2)");
    expect(csv.match(/EMP_ING_/g)).toHaveLength(3);
    const x = await s.exportar(auth, q, 'excel'),
      zip = unzipSync(Buffer.from(x.base64, 'base64'));
    const xml = strFromU8(zip['xl/worksheets/sheet1.xml']!);
    expect(strFromU8(zip['xl/workbook.xml']!)).toContain('Saldos de vacaciones');
    expect(xml).toContain('Más de 15 días');
    expect(xml).toContain('15.25');
    expect(xml).not.toContain('<f>');
    expect(xml.match(/EMP_ING_/g)).toHaveLength(3);
  });
  it('601 empleados requieren lecturas constantes de parámetros y movimientos, sin N+1', async () => {
    vi.mocked(repo.empleados).mockResolvedValue(
      Array.from({ length: 601 }, (_, i) => ({ ...empleados[0]!, id: i + 1 })),
    );
    const inicio = performance.now();
    const r = await crearSaldosVacacionesService(db).listar(
      auth,
      saldosQuerySchema.parse({ pagina: '7', limite: '100' }),
    );
    expect(r.total).toBe(601);
    expect(r.registros).toHaveLength(1);
    expect(repo.movimientosLote).toHaveBeenCalledTimes(1);
    expect(saldo.parametros).toHaveBeenCalledTimes(1);
    expect(repo.umbral).toHaveBeenCalledTimes(1);
    expect(performance.now() - inicio).toBeLessThan(2000);
  });
  it('no inventa un umbral ante configuración ausente o duplicada', async () => {
    vi.mocked(repo.umbral).mockResolvedValue([]);
    await expect(consultarSaldosVacaciones(c, saldosQuerySchema.parse({}))).rejects.toThrow(
      /umbral/,
    );
  });
});
