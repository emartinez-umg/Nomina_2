import sharp from 'sharp';
import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { generarPdf, bloqueFirma, validarFirmante } from './documento.js';
import { empresaPrueba, firmaPrueba } from './documento.fixture.js';
import { credencialesTemporalesPdf } from './credenciales.js';
import { normalizarLogo } from '../../modules/empresa/empresa.logo.js';
import { empresaSchema } from '../../modules/empresa/empresa.schemas.js';
// Extrae cadenas PDFKit para comprobar el texto visible, sin confundir metadatos con contenido.
export function textoPdf(b: Buffer) {
  const fuente = b.toString('latin1');
  return [...fuente.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .flatMap((m) => {
      try {
        return [
          ...inflateSync(Buffer.from(m[1]!, 'latin1'))
            .toString('latin1')
            .matchAll(/<([a-f\d]+)>/gi),
        ].map((x) => Buffer.from(x[1]!, 'hex').toString('latin1'));
      } catch {
        return [];
      }
    })
    .join('');
}
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#213F60"/></svg>';
describe('Membrete y firmas compartidos', () => {
  it.each(['png', 'jpeg'] as const)('normaliza un logo %s real a PNG', async (formato) => {
    const original = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#213F60' },
    })
      .toFormat(formato)
      .toBuffer();
    const png = await normalizarLogo(`image/${formato}`, original.toString('base64'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });
  it.each([false, true])(
    'genera PDF completo con logo=%s en todas las páginas',
    async (conLogo) => {
      const logo = conLogo
        ? await normalizarLogo('image/svg+xml', Buffer.from(svg).toString('base64'))
        : null;
      const b = await generarPdf('Documento', { ...empresaPrueba, logo }, (doc) => {
        doc.text('Primera página');
        doc.addPage();
        doc.text('Segunda página');
        bloqueFirma(doc, firmaPrueba);
      });
      expect(b.subarray(0, 5).toString()).toBe('%PDF-');
      expect(b.toString('latin1')).toContain('/Count 2');
      const texto = textoPdf(b);
      expect(texto.match(/1234567-9/g)).toHaveLength(2);
      expect(texto.match(/rh@example.test/g)).toHaveLength(2);
      expect(texto).toContain('María López Pérez');
      expect(texto).toContain('Jefa de Recursos Humanos');
      expect(texto).toContain('14/10/2026');
      expect(b.toString('latin1').includes('/Subtype /Image')).toBe(conLogo);
    },
  );
  it('impide emitir sin empresa o con datos incompletos', async () => {
    await expect(generarPdf('Documento', null, () => {})).rejects.toThrow('Configura');
    await expect(
      generarPdf('Documento', { ...empresaPrueba, correo: null }, () => {}),
    ).rejects.toThrow('Configura');
  });
  it.each([null, { nombre: '', cargo: 'RH' }, { nombre: 'Ana Pérez', cargo: ' ' }])(
    'bloquea aprobación sin nombre/cargo: %s',
    (perfil) => expect(() => validarFirmante(perfil)).toThrow('ficha de empleado'),
  );
  it('crea credenciales en memoria con membrete e instrucciones', async () => {
    const b = await credencialesTemporalesPdf(empresaPrueba, [
      { nombre: 'Ana Pérez', usuario: 'ana.perez', contrasenaTemporal: 'Temporal!2026' },
    ]);
    const texto = textoPdf(b);
    expect(texto).toContain('ana.perez');
    expect(texto).toContain('Temporal!2026');
    expect(texto).toContain('primer inicio');
    expect(texto).toContain('1234567-9');
  });
  it('valida identidad, NIT, contacto, protocolo y versión', () => {
    const datos = {
      ...empresaPrueba,
      version: 0,
      logo: undefined,
      nombreComercial: 'Empresa',
      sitioWeb: 'https://example.test',
    };
    expect(empresaSchema.safeParse(datos).success).toBe(true);
    for (const cambio of [
      { nit: '1234567-0' },
      { telefono: 'abcdef12' },
      { correo: 'sin-correo' },
      { sitioWeb: 'javascript:alert(1)' },
      { razonSocial: '' },
      { version: -1 },
    ])
      expect(empresaSchema.safeParse({ ...datos, ...cambio }).success).toBe(false);
  });
  it.each(['image/png', 'image/jpeg', 'image/svg+xml'])(
    'rechaza contenido falso para %s',
    async (mime) => {
      await expect(
        normalizarLogo(mime, Buffer.from('No es imagen').toString('base64')),
      ).rejects.toThrow('logo');
    },
  );
  it.each([
    '<script>alert(1)</script>',
    '<image href="https://example.test/logo.png"/>',
    '<rect onclick="alert(1)"/>',
    '<foreignObject/>',
    '<style>@import "https://example.test";</style>',
    '<rect fill="url(https://example.test)"/>',
  ])('rechaza SVG activo o externo: %s', async (contenido) => {
    await expect(
      normalizarLogo(
        'image/svg+xml',
        Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${contenido}</svg>`).toString(
          'base64',
        ),
      ),
    ).rejects.toThrow('logo');
  });
  it('rechaza SVG con DTD y logos mayores de 2 MB', async () => {
    await expect(
      normalizarLogo(
        'image/svg+xml',
        Buffer.from('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + svg).toString(
          'base64',
        ),
      ),
    ).rejects.toThrow();
    await expect(
      normalizarLogo('image/png', Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')),
    ).rejects.toThrow();
  });
});
