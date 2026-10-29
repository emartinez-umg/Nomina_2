import { unzipSync, strFromU8 } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { manejarErrores } from '../../shared/middleware/error-handler.js';
import { crearLogger } from '../../config/logger.js';
import { crearComisionesRouter } from './comisiones.routes.js';
import { crearComisionesService } from './comisiones.service.js';
import {
  construirEstadisticasComisiones,
  periodoComisiones,
  variacionComisiones,
} from './comisiones.reglas.js';
import {
  comisionesQuerySchema,
  comisionesListaSchema,
  comisionesHistorialSchema,
} from './comisiones.schemas.js';
import { resolverAlcanceEquipo } from '../equipo/equipo.service.js';
import * as repo from './comisiones.repository.js';
vi.mock('../equipo/equipo.service.js', () => ({ resolverAlcanceEquipo: vi.fn() }));
vi.mock('./comisiones.repository.js', async (original) => ({
  ...(await original<typeof repo>()),
  mesesVendedores: vi.fn(),
  validarFiltros: vi.fn(),
  vendedor: vi.fn(),
  detalleComisiones: vi.fn(),
}));
const auth = { idUsuario: 1, rol: 'RH', cambioObligatorio: false } as Autenticacion;
const c = { execute: vi.fn(), rollback: vi.fn() } as unknown as Connection;
const db = {
  conConexion: async <T>(fn: (c: Connection) => Promise<T>) => fn(c),
  cerrar: vi.fn(),
} as BaseDatos;
const persona = {
  idEmpleado: 3,
  codigo: 'EMP_VEN_0001',
  nombre: 'Ana López',
  puesto: 'Analista',
  idDepartamento: 1,
  departamento: 'Ventas',
  centro: null,
};
const fila = (mes: string, total: string, idEmpleado = 3): repo.MesVendedor => ({
  ...persona,
  idEmpleado,
  mes,
  total,
  cantidad: 1,
});
const query = (q = {}) => comisionesQuerySchema.parse({ desde: '2026-01', hasta: '2026-03', ...q });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.validarFiltros).mockResolvedValue(true);
  vi.mocked(repo.mesesVendedores).mockResolvedValue([
    fila('2026-01', '100.10'),
    fila('2026-03', '199.90'),
    fila('2025-10', '100'),
  ]);
  vi.mocked(resolverAlcanceEquipo).mockResolvedValue({
    permisos: ['VER_COMISIONES_EQUIPO'],
    empleados: [3],
  });
  vi.mocked(repo.vendedor).mockResolvedValue(persona);
  vi.mocked(repo.detalleComisiones).mockResolvedValue({
    registros: [],
    total: 0,
    pagina: 1,
    limite: 20,
  });
});
describe('R3-9: estadísticas de comisiones', () => {
  it('valida rangos inclusivos de 1 a 60 meses, IDs, listas y booleanos estrictos', () => {
    expect(
      query({ desde: '2021-04', hasta: '2026-03', vendedores: '3,4', comparar: 'false' }).comparar,
    ).toBe(false);
    expect(query({ vendedores: ['3', '4'] }).vendedores).toEqual([3, 4]);
    for (const q of [
      { desde: '2026-04' },
      { desde: '2021-03' },
      { desde: '2026-13' },
      { desde: '2026-1' },
      { desde: undefined },
      { vendedores: '' },
      { vendedores: '3,3' },
      { vendedores: '1 OR 1=1' },
      { vendedores: '0' },
      { vendedores: '9007199254740992' },
      { comparar: '1' },
      { estado: 'RECHAZADA' },
      { propietario: 1 },
      { alcance: 'general' },
    ])
      expect(() => query(q)).toThrow();
    expect(
      comisionesListaSchema.safeParse({ desde: '2026-01', hasta: '2026-03', ordenarPor: 'salario' })
        .success,
    ).toBe(false);
  });
  it('compara con los meses inmediatamente anteriores, incluso al cruzar años', () => {
    expect(periodoComisiones(query()).anterior).toEqual({ desde: '2025-10', hasta: '2025-12' });
    expect(periodoComisiones(query({ desde: '2026-01', hasta: '2026-01' })).anterior).toEqual({
      desde: '2025-12',
      hasta: '2025-12',
    });
  });
  it('calcula con Decimal, incluye meses vacíos y cuenta personas sin depender del puesto', () => {
    const m = construirEstadisticasComisiones(query({ comparar: 'true' }), [
      fila('2026-01', '100.10'),
      fila('2026-03', '199.90'),
      fila('2025-10', '100'),
    ]);
    expect(m.resumen).toMatchObject({
      total: '300.00',
      promedioMensual: '100.00',
      vendedoresConComision: 1,
      mejorMes: { mes: '2026-03', total: '199.90' },
      totalAnterior: '100.00',
      variacionPorcentual: '200.00',
    });
    expect(m.resumen.serie[1]).toEqual({
      mes: '2026-02',
      total: '0.00',
      mesAnterior: '2025-11',
      totalAnterior: '0.00',
    });
    expect(m.registros[0]).toMatchObject({
      puesto: 'Analista',
      peorMes: { mes: '2026-02', total: '0.00' },
      participacionPorcentual: '100.00',
    });
  });
  it('define cero/ausencia de base y excluye del ranking a quien solo tuvo comisión anterior', () => {
    expect(variacionComisiones('100', '0')).toBeNull();
    expect(variacionComisiones('0', '0')).toBe('0.00');
    expect(variacionComisiones('0', '10')).toBe('-100.00');
    const m = construirEstadisticasComisiones(query({ comparar: 'true' }), [
      fila('2025-10', '100', 9),
    ]);
    expect(m.registros).toEqual([]);
    expect(m.resumen).toMatchObject({
      total: '0.00',
      mejorMes: null,
      vendedoresConComision: 0,
      variacionPorcentual: '-100.00',
    });
  });
  it('resuelve empates por el primer mes y conserva importes fuera de la precisión float', () => {
    const m = construirEstadisticasComisiones(query(), [
      fila('2026-01', '99999999999999.99'),
      fila('2026-03', '99999999999999.99'),
    ]);
    expect(m.resumen.total).toBe('199999999999999.98');
    expect(m.resumen.mejorMes?.mes).toBe('2026-01');
  });
  it('limita la consulta en Oracle con binds y jamás transforma equipo vacío en general', () => {
    const q = query({ idDepartamento: '1', vendedores: '3,4', estado: 'aplicadas' });
    const { sql, binds } = repo.consultaComisiones(q, []);
    expect(sql).toContain('M.MES>=TO_DATE(:desde');
    expect(sql).toContain('JSON_TABLE(:alcance');
    expect(sql).not.toContain('FROM COMISIONES');
    expect(binds).toMatchObject({
      desde: '2026-01',
      hasta: '2026-03',
      departamento: 1,
      estado: 'APLICADA',
      alcance: { val: '[]' },
      vendedores: { val: '[3,4]' },
    });
    const individual = repo.consultaComisiones(query({ vendedores: '3' }));
    expect(individual.sql).toContain('M.ID_EMPLEADO=:vendedor');
    expect(individual.binds).toMatchObject({ vendedor: 3 });
  });
  it('los totales de tabla y ranking se calculan antes de paginar; DTO sin datos sensibles', async () => {
    vi.mocked(repo.mesesVendedores).mockResolvedValue([
      { ...fila('2026-01', '100'), salario: '9000', dpi: '123' } as repo.MesVendedor,
      fila('2026-01', '200', 4),
    ]);
    const s = crearComisionesService(db, async () => '2026-10-29T00:00:00');
    const q = comisionesListaSchema.parse({ desde: '2026-01', hasta: '2026-03', limite: '1' });
    const r = await s.tabla(auth, q);
    expect(r).toMatchObject({
      total: 2,
      totalComisiones: '300.00',
      registros: [{ idEmpleado: 4, total: '200.00' }],
    });
    expect(JSON.stringify(r)).not.toMatch(/salario|dpi/);
    expect(c.rollback).toHaveBeenCalledOnce();
  });
  it('revalida el permiso en servidor y rechaza IDs ajenos antes de agregar', async () => {
    const s = crearComisionesService(db, async () => '2026-10-29');
    const jefe = { ...auth, rol: 'EMPLEADO' as const };
    for (const q of [query({ vendedores: '3,4' }), query({ vendedores: '4' })])
      await expect(s.resumen(jefe, q)).rejects.toMatchObject({ estado: 403 });
    await expect(
      s.historial(jefe, 4, comisionesHistorialSchema.parse({ desde: '2026-01', hasta: '2026-03' })),
    ).rejects.toMatchObject({ estado: 403 });
    expect(repo.mesesVendedores).not.toHaveBeenCalled();
    expect(resolverAlcanceEquipo).toHaveBeenCalledWith(c, jefe, 'VER_COMISIONES_EQUIPO');
    expect(c.rollback).toHaveBeenCalledTimes(3);
  });
  it('deniega departamento ajeno y revocación aunque la sesión conserve el permiso', async () => {
    const s = crearComisionesService(db, async () => '2026-10-29');
    vi.mocked(repo.validarFiltros).mockResolvedValue(false);
    await expect(
      s.resumen({ ...auth, rol: 'EMPLEADO' }, query({ idDepartamento: '2' })),
    ).rejects.toMatchObject({ estado: 403 });
    await expect(s.resumen(auth, query({ idDepartamento: '999' }))).rejects.toMatchObject({
      estado: 404,
    });
    vi.mocked(resolverAlcanceEquipo).mockRejectedValue(new Error('Permiso revocado'));
    await expect(
      s.resumen({ ...auth, rol: 'EMPLEADO', permisosEquipo: ['VER_COMISIONES_EQUIPO'] }, query()),
    ).rejects.toThrow('Permiso revocado');
    expect(repo.mesesVendedores).not.toHaveBeenCalled();
  });
  it('bloquea meses futuros usando el reloj de Guatemala y libera el snapshot al fallar', async () => {
    const s = crearComisionesService(db, async () => '2026-01-31T23:59:59');
    await expect(s.resumen(auth, query())).rejects.toMatchObject({
      estado: 400,
      campos: { hasta: expect.any(Array) },
    });
    expect(repo.mesesVendedores).not.toHaveBeenCalled();
    expect(c.rollback).toHaveBeenCalledOnce();
  });
  it('historial compara con el promedio de vendedores del alcance, incluidos sus meses sin datos', async () => {
    vi.mocked(repo.mesesVendedores).mockResolvedValue([
      fila('2026-01', '300'),
      fila('2026-03', '600', 4),
    ]);
    const r = await crearComisionesService(db, async () => '2026-10-29').historial(
      auth,
      3,
      comisionesHistorialSchema.parse({ desde: '2026-01', hasta: '2026-03' }),
    );
    expect(r.promedioMensualEquipo).toBe('150.00');
    expect(r.evolucion).toEqual([
      { mes: '2026-01', total: '300.00', promedioEquipo: '150.00' },
      { mes: '2026-02', total: '0.00', promedioEquipo: '0.00' },
      { mes: '2026-03', total: '0.00', promedioEquipo: '300.00' },
    ]);
  });
  it('el contrato HTTP rechaza filtros desconocidos y entrega datos sin caché', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.autenticacion = auth;
      next();
    });
    app.use(
      '/comisiones',
      crearComisionesRouter(crearComisionesService(db, async () => '2026-10-29')),
    );
    app.use(manejarErrores(crearLogger('silent')));
    const r = await request(app).get('/comisiones/resumen?desde=2026-01&hasta=2026-03').expect(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.body).toMatchObject({ ok: true, data: { indicadores: { total: '300.00' } } });
    for (const ruta of [
      'resumen',
      'tendencia',
      'ranking',
      'tabla',
      'opciones',
      'exportar/csv',
      'exportar/excel',
      'vendedores/3/historial',
    ])
      await request(app)
        .get(`/comisiones/${ruta}?desde=2026-01&hasta=2026-03&alcance=general`)
        .expect(400);
  });
});

it('R3-10: CSV/Excel exportan todo el conjunto exacto, neutralizan fórmulas y revalidan equipo', async () => {
  vi.mocked(repo.mesesVendedores).mockResolvedValue(
    Array.from({ length: 25 }, (_, i) => ({
      ...fila('2026-01', '100.10', i + 3),
      nombre: i === 0 ? '=SUM(1,2)' : `Vendedor ${i}`,
      codigo: `EMP_${i}`,
    })),
  );
  const s = crearComisionesService(db, async () => '2026-10-29');
  const csv = Buffer.from(
    (await s.exportar(auth, query({ comparar: 'true' }), 'csv')).base64,
    'base64',
  ).toString();
  expect(csv.match(/EMP_/g)).toHaveLength(25);
  expect(csv).toContain("'=SUM(1,2)");
  expect(csv).toContain('2502.50');
  expect(csv).toContain('Sin base de comparación');
  const x = unzipSync(Buffer.from((await s.exportar(auth, query(), 'excel')).base64, 'base64'));
  expect(strFromU8(x['xl/worksheets/sheet1.xml']!)).toContain('EMP_24');
  expect(strFromU8(x['xl/worksheets/sheet1.xml']!)).not.toContain('<f>');
  await s.exportar({ ...auth, rol: 'EMPLEADO' }, query(), 'csv');
  expect(repo.mesesVendedores).toHaveBeenLastCalledWith(c, expect.anything(), [3]);
  await expect(
    s.exportar({ ...auth, rol: 'EMPLEADO' }, query({ vendedores: '4' }), 'excel'),
  ).rejects.toMatchObject({ estado: 403 });
  expect(csv).not.toMatch(/DPI|CUENTA_BANCARIA|SALARIO_BASE/);
});
