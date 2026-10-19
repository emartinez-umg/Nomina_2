import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearLogger } from '../../config/logger.js';
import { aplicarMigraciones } from './migraciones.js';
import { cargarMigraciones, dividirSql } from './migraciones.archivos.js';
import type { Migracion } from './migraciones.archivos.js';
import type { MigracionesRepository, VersionAplicada } from './migraciones.repository.js';

const migracion: Migracion = {
  version: 0,
  archivo: 'V000__prueba.sql',
  checksum: 'a'.repeat(64),
  sentencias: ['CREATE TABLE PRUEBA (ID NUMBER)', 'INSERT INTO PRUEBA VALUES (1)'],
};
const logger = crearLogger('silent');
const temporales: string[] = [];

function repository(historial: VersionAplicada[] = []) {
  return {
    preparar: vi.fn().mockResolvedValue(undefined),
    listar: vi.fn().mockResolvedValue(historial),
    iniciar: vi.fn().mockResolvedValue(undefined),
    ejecutar: vi.fn().mockResolvedValue(undefined),
    completar: vi.fn().mockResolvedValue(undefined),
    fallar: vi.fn().mockResolvedValue(undefined),
  } satisfies MigracionesRepository;
}

afterEach(async () => {
  await Promise.all(temporales.splice(0).map((directorio) => rm(directorio, { recursive: true })));
});

describe('archivos SQL', () => {
  it('conserva punto y coma dentro de literales y bloques PL/SQL', () => {
    expect(
      dividirSql("-- comentario\nINSERT INTO T VALUES ('a;b');\n/\nBEGIN\n NULL;\nEND;\n/\n"),
    ).toEqual(["INSERT INTO T VALUES ('a;b')", 'BEGIN\n NULL;\nEND;']);
  });

  it('rechaza archivos vacíos o sin delimitador explícito', () => {
    expect(() => dividirSql('-- vacío\n')).toThrow('vacía');
    expect(() => dividirSql('SELECT 1 FROM DUAL;')).toThrow('línea independiente');
  });

  it('ordena versiones numéricamente y detecta versiones duplicadas', async () => {
    const directorio = await mkdtemp(join(tmpdir(), 'nomina2-migraciones-'));
    temporales.push(directorio);
    await writeFile(join(directorio, 'V010__segunda.sql'), 'SELECT 1 FROM DUAL;\n/\n');
    await writeFile(join(directorio, 'V000__primera.sql'), 'SELECT 1 FROM DUAL;\n/\n');
    const archivos = await cargarMigraciones(directorio);
    expect(archivos.map((archivo) => archivo.version)).toEqual([0, 10]);
    expect(archivos[0]?.checksum).toHaveLength(64);
    await writeFile(join(directorio, 'V000__repetida.sql'), 'SELECT 1 FROM DUAL;\n/\n');
    await expect(cargarMigraciones(directorio)).rejects.toThrow('duplicadas');
  });

  it('rechaza nombres SQL inválidos y directorios sin migraciones', async () => {
    const directorio = await mkdtemp(join(tmpdir(), 'nomina2-migraciones-'));
    temporales.push(directorio);
    await expect(cargarMigraciones(directorio)).rejects.toThrow('No se encontraron');
    await writeFile(join(directorio, 'script.sql'), 'SELECT 1 FROM DUAL;\n/\n');
    await expect(cargarMigraciones(directorio)).rejects.toThrow('Nombre de migración inválido');
  });
});

describe('historial de migraciones', () => {
  it('registra y ejecuta una migración pendiente en orden', async () => {
    const repo = repository();
    expect(await aplicarMigraciones([migracion], repo, logger)).toBe(1);
    expect(repo.iniciar).toHaveBeenCalledWith(migracion);
    expect(repo.ejecutar.mock.calls).toEqual(migracion.sentencias.map((sql) => [sql]));
    expect(repo.completar).toHaveBeenCalledWith(0);
  });

  it('no repite una migración ya aplicada', async () => {
    const repo = repository([[0, migracion.archivo, migracion.checksum, 'APLICADA']]);
    expect(await aplicarMigraciones([migracion], repo, logger)).toBe(0);
    expect(repo.ejecutar).not.toHaveBeenCalled();
  });

  it('rechaza cambios de checksum antes de ejecutar SQL', async () => {
    const repo = repository([[0, migracion.archivo, 'b'.repeat(64), 'APLICADA']]);
    await expect(aplicarMigraciones([migracion], repo, logger)).rejects.toThrow('cambió');
    expect(repo.iniciar).not.toHaveBeenCalled();
  });

  it.each(['APLICANDO', 'FALLIDA'])('bloquea una migración en estado %s', async (estado) => {
    const repo = repository([[0, migracion.archivo, migracion.checksum, estado]]);
    await expect(aplicarMigraciones([migracion], repo, logger)).rejects.toThrow('revisión manual');
    expect(repo.ejecutar).not.toHaveBeenCalled();
  });

  it('registra fallos y detiene las sentencias restantes', async () => {
    const repo = repository();
    repo.ejecutar.mockRejectedValueOnce(new Error('ORA-prueba'));
    await expect(aplicarMigraciones([migracion], repo, logger)).rejects.toThrow('ORA-prueba');
    expect(repo.fallar).toHaveBeenCalledWith(0);
    expect(repo.completar).not.toHaveBeenCalled();
    expect(repo.ejecutar).toHaveBeenCalledOnce();
  });

  it('rechaza migraciones retroactivas', async () => {
    const posterior = { ...migracion, version: 2, archivo: 'V002__posterior.sql' };
    const repo = repository([[2, posterior.archivo, posterior.checksum, 'APLICADA']]);
    await expect(aplicarMigraciones([migracion, posterior], repo, logger)).rejects.toThrow(
      'anteriores',
    );
    expect(repo.iniciar).not.toHaveBeenCalled();
  });

  async function referenciasV027() {
    const todas = await cargarMigraciones(
      fileURLToPath(new URL('../../../../db/migrations/', import.meta.url)),
    );
    const pendientes = todas.filter((m) => m.version >= 27 && m.version <= 28);
    const bloque = pendientes[0]!.sentencias.find((sql) =>
      sql.includes('FOR G IN (SELECT C.*,TRUNC(P.FECHA_INICIO'),
    )!;
    return { pendientes, bloque };
  }
  const duplicadaV027 = () =>
    Object.assign(
      new Error('ORA-00001: unique constraint (PRUEBA.UQ_NOV_MES_REFERENCIA) violated'),
      { errorNum: 1 },
    );

  it('aplica V028 y repite intacto el bloque V027 solo ante referencias v0 repetidas', async () => {
    const { pendientes, bloque } = await referenciasV027();
    const repo = repository();
    let fallo = false;
    repo.ejecutar.mockImplementation(async (sql: string) => {
      if (sql === bloque && !fallo) {
        fallo = true;
        throw duplicadaV027();
      }
    });
    expect(await aplicarMigraciones(pendientes, repo, logger)).toBe(2);
    expect(repo.ejecutar.mock.calls.filter(([sql]) => sql === bloque)).toHaveLength(2);
    for (const sql of pendientes[1]!.sentencias)
      expect(repo.ejecutar.mock.calls.filter(([s]) => s === sql)).toHaveLength(1);
    expect(repo.completar.mock.calls).toEqual([[27], [28]]);
    expect(repo.fallar).not.toHaveBeenCalled();
  });

  it('detiene otros errores de integridad en V027 y no anticipa V028', async () => {
    const { pendientes, bloque } = await referenciasV027();
    const repo = repository();
    repo.ejecutar.mockImplementation(async (sql: string) => {
      if (sql === bloque) throw Object.assign(new Error('ORA-00001: UQ_OTRA'), { errorNum: 1 });
    });
    await expect(aplicarMigraciones(pendientes, repo, logger)).rejects.toThrow('UQ_OTRA');
    expect(repo.iniciar.mock.calls).toEqual([[pendientes[0]]]);
    expect(repo.fallar.mock.calls).toEqual([[27]]);
    expect(repo.completar).not.toHaveBeenCalled();
  });

  it('no recupera V027 sin su reparación disponible y marca fallos de V028', async () => {
    const { pendientes, bloque } = await referenciasV027();
    const repo = repository();
    repo.ejecutar.mockImplementation(async (sql: string) => {
      if (sql === bloque) throw duplicadaV027();
    });
    await expect(aplicarMigraciones([pendientes[0]!], repo, logger)).rejects.toThrow(
      'UQ_NOV_MES_REFERENCIA',
    );
    expect(repo.fallar.mock.calls).toEqual([[27]]);
    const fallida = repository();
    fallida.ejecutar.mockImplementation(async (sql: string) => {
      if (sql === bloque) throw duplicadaV027();
      if (sql === pendientes[1]!.sentencias[0]) throw new Error('Reparación interrumpida');
    });
    await expect(aplicarMigraciones(pendientes, fallida, logger)).rejects.toThrow('interrumpida');
    expect(fallida.fallar.mock.calls).toEqual([[27], [28]]);
    expect(fallida.completar).not.toHaveBeenCalled();
  });
});

describe('R2-4: preparación de nombres sin modificar V031', () => {
  const cargar = async () =>
    (
      await cargarMigraciones(fileURLToPath(new URL('../../../../db/migrations/', import.meta.url)))
    ).filter((m) => m.version === 31 || m.version === 32);
  it('ejecuta V032 antes del DDL de V031 y completa ambas al terminar', async () => {
    const pendientes = await cargar(),
      repo = repository();
    expect(await aplicarMigraciones(pendientes, repo, logger)).toBe(2);
    expect(repo.ejecutar.mock.calls.map(([sql]) => sql)).toEqual([
      ...pendientes[1]!.sentencias,
      ...pendientes[0]!.sentencias,
    ]);
    expect(repo.completar.mock.calls).toEqual([[31], [32]]);
  });
  it('aplica solo V032 si V031 ya está registrada, conservando su checksum', async () => {
    const pendientes = await cargar(),
      primera = pendientes[0]!;
    const repo = repository([[31, primera.archivo, primera.checksum, 'APLICADA']]);
    expect(await aplicarMigraciones(pendientes, repo, logger)).toBe(1);
    expect(repo.iniciar.mock.calls).toEqual([[pendientes[1]]]);
    expect(repo.ejecutar.mock.calls.map(([sql]) => sql)).toEqual(pendientes[1]!.sentencias);
  });
  it('no anticipa la preparación para un checksum desconocido', async () => {
    const pendientes = await cargar(),
      repo = repository();
    pendientes[0] = { ...pendientes[0]!, checksum: 'f'.repeat(64) };
    await aplicarMigraciones(pendientes, repo, logger);
    expect(repo.ejecutar.mock.calls[0]).toEqual([pendientes[0]!.sentencias[0]]);
  });
  it('marca ambas como fallidas si se interrumpe la preparación', async () => {
    const pendientes = await cargar(),
      repo = repository();
    repo.ejecutar.mockRejectedValueOnce(new Error('Preparación interrumpida'));
    await expect(aplicarMigraciones(pendientes, repo, logger)).rejects.toThrow('interrumpida');
    expect(repo.fallar.mock.calls).toEqual([[31], [32]]);
    expect(repo.completar).not.toHaveBeenCalled();
  });
});
