import type { Request, Response } from 'express';

export function nombreArchivo(nombre: string) {
  return [...nombre.normalize('NFC')]
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? '-' : c))
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
}

export function contentDisposition(nombre: string) {
  const limpio = nombreArchivo(nombre);
  const ascii = limpio
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, '_');
  const utf8 = encodeURIComponent(limpio).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// Conserva el contrato JSON y ofrece los mismos bytes como descarga HTTP nativa.
export function responderArchivo(
  req: Request,
  res: Response,
  archivo: { nombre: string; tipo: string; base64: string },
) {
  res.setHeader('Content-Disposition', contentDisposition(archivo.nombre));
  res.setHeader('Cache-Control', 'private, no-store');
  res.vary('Accept');
  if (req.accepts(['application/json', archivo.tipo]) === archivo.tipo)
    return res.type(archivo.tipo).send(Buffer.from(archivo.base64, 'base64'));
  return res.json({ ok: true, data: archivo });
}
