import sharp from 'sharp';
import { SaxesParser } from 'saxes';
import { ErrorNegocio } from '../../shared/errors/errors.js';
const invalido = (): never => {
  throw new ErrorNegocio(
    'El logo debe ser una imagen PNG, JPG o SVG válida de hasta 2 MB, sin contenido activo ni referencias externas.',
    422,
    'VALIDACION',
    {
      logo: [
        'Selecciona una imagen válida de hasta 2 MB. Para SVG utiliza formas y texto sin scripts, estilos externos ni enlaces.',
      ],
    },
  );
};
export async function normalizarLogo(mime: string, base64: string): Promise<Buffer> {
  const b = Buffer.from(base64, 'base64');
  if (!b.length || b.length > 2 * 1024 * 1024) invalido();
  try {
    if (mime === 'image/svg+xml') {
      const permitidos = new Set([
        'svg',
        'g',
        'path',
        'rect',
        'circle',
        'ellipse',
        'line',
        'polyline',
        'polygon',
        'text',
        'tspan',
        'defs',
        'linearGradient',
        'radialGradient',
        'stop',
        'clipPath',
        'mask',
        'title',
        'desc',
      ]);
      let raiz = false;
      const parser = new SaxesParser({ xmlns: true });
      parser.on('doctype', invalido);
      parser.on('processinginstruction', invalido);
      parser.on('opentag', (tag) => {
        if (!raiz && tag.local !== 'svg') invalido();
        raiz = true;
        if (!permitidos.has(tag.local) || (tag.uri && tag.uri !== 'http://www.w3.org/2000/svg'))
          invalido();
        for (const a of Object.values(tag.attributes)) {
          if (
            /^(on|href|src|style)/i.test(a.local) ||
            a.value.includes('\\') ||
            (/(?:url\s*\(\s*[^#]|@import|javascript:|data:|https?:|file:)/i.test(a.value) &&
              a.name !== 'xmlns')
          )
            invalido();
        }
      });
      parser.write(b.toString('utf8')).close();
      if (!raiz) invalido();
    } else if (mime === 'image/png') {
      if (!b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) invalido();
    } else if (mime !== 'image/jpeg' || b[0] !== 255 || b[1] !== 216 || b[2] !== 255) invalido();
    const imagen = sharp(b, { limitInputPixels: 16000000, failOn: 'warning' });
    const meta = await imagen.metadata();
    if (
      meta.format !==
      (
        { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/svg+xml': 'svg' } as Record<
          string,
          string
        >
      )[mime]
    )
      invalido();
    return await imagen
      .rotate()
      .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
      .png()
      .timeout({ seconds: 5 })
      .toBuffer();
  } catch {
    return invalido();
  }
}
