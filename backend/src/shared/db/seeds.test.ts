import { describe, expect, it, vi } from 'vitest';
import { aplicarSeeds, cargarSeeds } from './seeds.js';
import { validarEntornoSeeds } from './seeds.env.js';

const admin = {
  ADMIN_USER: 'admin.inicial',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'ClavePruebas!2026',
};

function repository(existente?: [number, string]) {
  return {
    ejecutar: vi.fn().mockResolvedValue(undefined),
    buscarAdmin: vi.fn().mockResolvedValue(existente),
    crearAdmin: vi.fn().mockResolvedValue(undefined),
    confirmar: vi.fn().mockResolvedValue(undefined),
    revertir: vi.fn().mockResolvedValue(undefined),
  };
}

describe('seeds de instalación', () => {
  it.each(['corta', 'sinmayuscula!123', 'SINMINUSCULA!123', 'SinNumero!xx', 'SinSimbolo123'])(
    'rechaza contraseña inválida sin incluirla en el diagnóstico: %s',
    (clave) => {
      expect(() => validarEntornoSeeds({ ...admin, ADMIN_PASSWORD: clave })).toThrow(
        'ADMIN_PASSWORD',
      );
      expect(() => validarEntornoSeeds({ ...admin, ADMIN_PASSWORD: clave })).not.toThrow(clave);
    },
  );

  it('exige credenciales de entorno y normaliza el correo', () => {
    expect(() => validarEntornoSeeds({})).toThrow('ADMIN_USER');
    expect(validarEntornoSeeds({ ...admin, ADMIN_EMAIL: 'Admin@example.test' }).ADMIN_EMAIL).toBe(
      'admin@example.test',
    );
  });

  it('carga todos los seeds usando el delimitador PL/SQL compartido', async () => {
    const sql = await cargarSeeds();
    expect(sql.length).toBeGreaterThan(90);
    expect(sql.every((sentencia) => sentencia.startsWith('MERGE INTO'))).toBe(true);
  });

  it('conserva credenciales y estado de un ADMIN existente', async () => {
    const repo = repository([1, 'ADMIN']);
    await aplicarSeeds(['MERGE'], repo, admin);
    expect(repo.crearAdmin).not.toHaveBeenCalled();
    expect(repo.confirmar).toHaveBeenCalledOnce();
  });

  it('revierte el lote completo si el usuario ya existe con un rol distinto', async () => {
    const repo = repository([1, 'RH']);
    await expect(aplicarSeeds(['MERGE'], repo, admin)).rejects.toThrow('otro rol');
    expect(repo.crearAdmin).not.toHaveBeenCalled();
    expect(repo.revertir).toHaveBeenCalledOnce();
    expect(repo.confirmar).not.toHaveBeenCalled();
  });

  it('revierte el lote si un seed falla antes de crear el ADMIN', async () => {
    const repo = repository();
    repo.ejecutar.mockRejectedValueOnce(new Error('Fallo SQL'));
    await expect(aplicarSeeds(['MERGE'], repo, admin)).rejects.toThrow('Fallo SQL');
    expect(repo.buscarAdmin).not.toHaveBeenCalled();
    expect(repo.revertir).toHaveBeenCalledOnce();
  });
});
