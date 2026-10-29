import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from 'oracledb';
import type { Autenticacion } from '../auth/auth.types.js';
import type { BaseDatos } from '../../shared/db/pool.js';
import { resolverAlcanceEquipo, crearEquipoService } from './equipo.service.js';
import { equipoQuerySchema, cambiosPermisosSchema } from './equipo.schemas.js';
import { permisosDeSesion } from './equipo.repository.js';
import * as repo from './equipo.repository.js';
import { equipo } from '../jefaturas/jefaturas.repository.js';
vi.mock('./equipo.repository.js', async (original) => ({
  ...(await original<typeof repo>()),
  empleadoSesion: vi.fn(),
  concesiones: vi.fn(),
  personas: vi.fn(),
}));
vi.mock('../jefaturas/jefaturas.repository.js', () => ({ equipo: vi.fn() }));
const c = { execute: vi.fn(), rollback: vi.fn() } as unknown as Connection;
const auth = { idUsuario: 5, rol: 'EMPLEADO', cambioObligatorio: false } as Autenticacion;
const db = {
  conConexion: async (fn: (c: Connection) => unknown) => fn(c),
  cerrar: vi.fn(),
} as BaseDatos;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.empleadoSesion).mockResolvedValue(8);
  vi.mocked(repo.concesiones).mockResolvedValue([
    { jefatura: 1, permiso: 'VER_EQUIPO' },
    { jefatura: 2, permiso: 'VER_VACACIONES_EQUIPO' },
  ]);
  vi.mocked(equipo).mockResolvedValue([10, 11]);
});
describe('R3-8: alcance desde sesión', () => {
  it('resuelve únicamente las raíces del permiso solicitado y usa la identidad de sesión', async () => {
    expect(await resolverAlcanceEquipo(c, auth, 'VER_EQUIPO')).toMatchObject({
      empleados: [10, 11],
    });
    expect(repo.empleadoSesion).toHaveBeenCalledWith(c, 5);
    expect(equipo).toHaveBeenLastCalledWith(c, 8, [1]);
    await resolverAlcanceEquipo(c, auth, 'VER_VACACIONES_EQUIPO');
    expect(equipo).toHaveBeenLastCalledWith(c, 8, [2]);
  });
  it('no confía en permisos enviados o guardados en el objeto de autenticación', async () => {
    vi.mocked(repo.concesiones).mockResolvedValue([]);
    await expect(
      resolverAlcanceEquipo(c, { ...auth, permisosEquipo: ['VER_EQUIPO'] }, 'VER_EQUIPO'),
    ).rejects.toMatchObject({ estado: 403 });
    expect(equipo).not.toHaveBeenCalled();
    vi.mocked(c.execute).mockResolvedValueOnce({ rows: [] } as never);
    expect(await permisosDeSesion(c, auth)).toEqual([]);
  });
  it('sin ficha activa, sin permiso o con contraseña temporal se deniega', async () => {
    await expect(resolverAlcanceEquipo(c, auth, 'VER_COMISIONES_EQUIPO')).rejects.toThrow();
    await expect(resolverAlcanceEquipo(c, { ...auth, cambioObligatorio: true })).rejects.toThrow();
    vi.mocked(repo.empleadoSesion).mockResolvedValue(undefined);
    await expect(resolverAlcanceEquipo(c, auth)).rejects.toThrow();
    expect(equipo).not.toHaveBeenCalled();
  });
  it('lista vacía no abre alcance general y los filtros solo se pasan junto a esa lista', async () => {
    vi.mocked(equipo).mockResolvedValue([]);
    vi.mocked(repo.personas).mockResolvedValue([]);
    const q = equipoQuerySchema.parse({ idDepartamento: '999' });
    expect(await crearEquipoService(db).listar(auth, q)).toMatchObject({ total: 0, registros: [] });
    expect(repo.personas).toHaveBeenCalledWith(c, [], q);
    expect(c.rollback).toHaveBeenCalledOnce();
  });
  it('proyecta el directorio con lista blanca aunque el repositorio agregue datos sensibles', async () => {
    vi.mocked(repo.personas).mockResolvedValue([
      {
        id: 10,
        codigo: 'EMP_VEN_0001',
        nombre: 'Ana Pérez',
        puesto: 'Vendedora',
        departamento: 'Ventas',
        centro: 'Central',
        idDepartamento: 1,
        idCentroTrabajo: 1,
        idJefatura: 1,
        jefatura: 'Comercial',
        salario: '9000',
        dpi: '123',
        nit: '456',
        banco: 'Privado',
        expediente: 'Privado',
        actas: [],
      } as repo.PersonaEquipo,
    ]);
    const r = await crearEquipoService(db).listar(auth, equipoQuerySchema.parse({}));
    expect(Object.keys(r.registros[0]!).sort()).toEqual(
      ['id', 'codigo', 'nombre', 'puesto', 'departamento', 'centro'].sort(),
    );
  });
  it('rechaza selectores de personas, alcance y orden arbitrarios y exige confirmación/motivo', () => {
    for (const q of [
      { idEmpleado: 99 },
      { empleados: [99] },
      { alcance: 'general' },
      { ordenarPor: 'salario' },
    ])
      expect(equipoQuerySchema.safeParse(q).success).toBe(false);
    for (const d of [
      { permisos: ['ADMIN'] },
      {
        permisos: ['VER_EQUIPO', 'VER_EQUIPO'],
        revision: 'a'.repeat(64),
        motivo: 'Prueba',
        confirmado: true,
      },
      { permisos: [], revision: 'a'.repeat(64), motivo: 'Prueba' },
    ])
      expect(cambiosPermisosSchema.safeParse(d).success).toBe(false);
  });
});
