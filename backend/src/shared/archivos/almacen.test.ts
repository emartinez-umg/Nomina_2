import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { crearAlmacenPrivado, verificarArchivo, errorAlmacen } from './almacen.js';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=',
  'base64',
);
const carpetas: string[] = [];
afterEach(async () => {
  for (const c of carpetas.splice(0)) await rm(c, { recursive: true, force: true });
});
describe('Almacén privado: límites, contenido e integridad', () => {
  it('rechaza contenido falso, MIME engañoso, extensión falsa, archivos truncados y exceso de bytes', () => {
    expect(() =>
      verificarArchivo(
        Buffer.from('<html>Documento falso</html>'),
        'dpi.pdf',
        'application/pdf',
        1000,
      ),
    ).toThrow();
    expect(() => verificarArchivo(png, 'dpi.pdf', 'application/pdf', 1000)).toThrow();
    expect(() => verificarArchivo(png, 'dpi.png', 'text/html', 1000)).toThrow();
    expect(() => verificarArchivo(png.subarray(0, -2), 'dpi.png', 'image/png', 1000)).toThrow();
    expect(() =>
      verificarArchivo(Buffer.from('%PDF-1.7\n<fake>'), 'dpi.pdf', 'application/pdf', 1000),
    ).toThrow();
    expect(() => verificarArchivo(png, 'dpi.png', 'image/png', png.length - 1)).toThrow(/límite/);
    expect(() => verificarArchivo(Buffer.alloc(0), 'dpi.png', 'image/png', 1000)).toThrow();
    expect(verificarArchivo(png, 'dpi.PNG', 'image/png', png.length)).toEqual({
      tipo: 'image/png',
      hash: createHash('sha256').update(png).digest('hex'),
    });
  });
  it('usa claves aleatorias, permisos privados y detecta corrupción y traversal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'n2archivos-'));
    carpetas.push(dir);
    const almacen = crearAlmacenPrivado(dir);
    const clave = await almacen.guardar(png),
      otra = await almacen.guardar(png);
    expect(clave).toMatch(/^[a-f0-9]{64}\.bin$/);
    expect(otra).not.toBe(clave);
    const hash = createHash('sha256').update(png).digest('hex');
    expect(await almacen.leer(clave, hash, png.length)).toEqual(png);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, clave))).mode & 0o777).toBe(0o600);
    await expect(almacen.leer('../secreto', hash, 4)).rejects.toThrow();
    await expect(almacen.leer('/etc/passwd', hash, 4)).rejects.toThrow();
    const cambio = Buffer.from(png);
    cambio[30] = 0;
    await writeFile(join(dir, clave), cambio);
    await expect(almacen.leer(clave, hash, png.length)).rejects.toThrow(/integridad/);
    await almacen.retirarNoConfirmado(otra);
    expect(await readdir(dir)).toEqual([clave]);
    expect(await readFile(join(dir, clave))).toEqual(cambio);
  });
  it('no sigue enlaces simbólicos de archivo ni directorio', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'n2enlaces-'));
    carpetas.push(dir);
    await writeFile(join(dir, 'privado'), png);
    const clave = 'a'.repeat(64) + '.bin';
    await symlink(join(dir, 'privado'), join(dir, clave));
    await expect(
      crearAlmacenPrivado(dir).leer(
        clave,
        createHash('sha256').update(png).digest('hex'),
        png.length,
      ),
    ).rejects.toThrow();
    await symlink(dir, join(dir, 'enlace'));
    await expect(crearAlmacenPrivado(join(dir, 'enlace')).guardar(png)).rejects.toThrow(
      /simbólicos/,
    );
  });
});

it('explica falta de espacio o respaldo sin exponer la ruta privada', () => {
  for (const [code, estado] of [
    ['ENOSPC', 507],
    ['ENOENT', 409],
    ['EACCES', 503],
  ] as const) {
    const e = errorAlmacen(Object.assign(new Error('/almacen/muy/privado'), { code }));
    expect(e).toMatchObject({ estado });
    expect((e as Error).message).not.toContain('/almacen');
  }
});
