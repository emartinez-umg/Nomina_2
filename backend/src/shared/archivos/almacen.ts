import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ErrorNegocio, ErrorValidacion } from '../errors/errors.js';

export function verificarArchivo(
  bytes: Buffer,
  nombre: string,
  declarado: string,
  maxBytes: number,
) {
  if (!bytes.length)
    throw new ErrorValidacion({ archivo: ['Selecciona un archivo con contenido.'] });
  if (bytes.length > maxBytes)
    throw new ErrorNegocio(
      'El archivo supera el límite permitido. Selecciona uno más pequeño.',
      413,
      'ARCHIVO_GRANDE',
    );
  // Solo firmas y delimitadores de contenedor: nunca se ejecuta, decodifica ni extrae su contenido.
  let tipo: string | undefined;
  if (
    bytes
      .subarray(0, 8)
      .toString('ascii')
      .match(/^%PDF-[12]\.\d/) &&
    /%%EOF\s*$/.test(bytes.subarray(-1024).toString('ascii'))
  )
    tipo = 'application/pdf';
  if (
    bytes.length >= 45 &&
    bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.subarray(12, 16).toString('ascii') === 'IHDR' &&
    bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))
  )
    tipo = 'image/png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes[3]! >= 192 &&
    bytes[3] !== 255 &&
    bytes.subarray(-2).equals(Buffer.from([255, 217]))
  )
    tipo = 'image/jpeg';
  const extension = /\.([a-z]+)$/i.exec(nombre)?.[1]?.toLowerCase();
  const esperado =
    extension === 'pdf'
      ? 'application/pdf'
      : extension === 'png'
        ? 'image/png'
        : ['jpg', 'jpeg'].includes(extension ?? '')
          ? 'image/jpeg'
          : undefined;
  if (!tipo || tipo !== esperado || declarado !== tipo)
    throw new ErrorValidacion({
      archivo: [
        'El contenido no coincide con un PDF, JPG o PNG válido. Revisa el archivo y su extensión.',
      ],
    });
  return { tipo, hash: createHash('sha256').update(bytes).digest('hex') };
}
// Mensajes operativos sin revelar rutas privadas ni errores del sistema de archivos.
export function errorAlmacen(error: unknown): unknown {
  const codigo = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (codigo === 'ENOSPC')
    return new ErrorNegocio(
      'El almacenamiento del expediente está lleno. Contacta a sistemas y vuelve a intentar.',
      507,
      'ALMACEN_LLENO',
    );
  if (codigo === 'ENOENT')
    return new ErrorNegocio(
      'El archivo no está disponible en el almacén privado. Contacta a sistemas para restaurar el respaldo.',
      409,
      'ARCHIVO_NO_DISPONIBLE',
    );
  if (['EACCES', 'EPERM', 'EROFS'].includes(String(codigo)))
    return new ErrorNegocio(
      'No se pudo acceder al almacén privado. Contacta a sistemas y vuelve a intentar.',
      503,
      'ALMACEN_NO_DISPONIBLE',
    );
  return error;
}
export type AlmacenPrivado = ReturnType<typeof crearAlmacenPrivado>;
export function crearAlmacenPrivado(directorio: string) {
  if (!isAbsolute(directorio) || resolve(directorio) === '/')
    throw new Error('Configura un directorio privado absoluto.');
  const raiz = resolve(directorio);
  if (/\/(?:public|dist|assets|www|html)(?:\/|$)/i.test(raiz))
    throw new Error('El expediente debe estar fuera de las rutas públicas.');
  const ruta = (clave: string) => {
    if (!/^[a-f0-9]{64}\.bin$/.test(clave))
      throw new ErrorNegocio('La referencia del archivo es inválida.', 409, 'ARCHIVO_INVALIDO');
    return join(raiz, clave);
  };
  const preparar = async () => {
    await mkdir(raiz, { recursive: true, mode: 0o700 });
    const info = await lstat(raiz);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error('El almacén privado no admite enlaces simbólicos.');
    const canonica = await realpath(raiz);
    if (/\/(?:public|dist|assets|www|html)(?:\/|$)/i.test(canonica))
      throw new Error('El expediente debe estar fuera de las rutas públicas.');
    await chmod(raiz, 0o700);
  };
  return {
    async guardar(bytes: Buffer) {
      await preparar();
      const clave = randomBytes(32).toString('hex') + '.bin';
      const f = await open(
        ruta(clave),
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await f.writeFile(bytes);
        await f.sync();
      } catch (error) {
        await unlink(ruta(clave));
        throw error;
      } finally {
        await f.close();
      }
      return clave;
    },
    async leer(clave: string, hash: string, tamano: number) {
      await preparar();
      const f = await open(ruta(clave), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await f.stat();
        if (!info.isFile() || info.size !== tamano || info.size > 50 * 1024 * 1024)
          throw new ErrorNegocio(
            'El archivo no supera la comprobación de integridad. Comunícalo a sistemas.',
            409,
            'INTEGRIDAD_ARCHIVO',
          );
        const bytes = await f.readFile();
        const calculado = createHash('sha256').update(bytes).digest();
        const esperado = Buffer.from(hash, 'hex');
        if (esperado.length !== calculado.length || !timingSafeEqual(esperado, calculado))
          throw new ErrorNegocio(
            'El archivo no supera la comprobación de integridad. Comunícalo a sistemas.',
            409,
            'INTEGRIDAD_ARCHIVO',
          );
        return bytes;
      } finally {
        await f.close();
      }
    },
    async retirarNoConfirmado(clave: string) {
      await unlink(ruta(clave));
    },
  };
}
