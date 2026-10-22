import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { contentDisposition, nombreArchivo, responderArchivo } from './archivo.js';
describe('Descarga de archivos', () => {
  it('sanea rutas, controles, comillas y conserva tildes con filename* UTF-8', () => {
    expect(nombreArchivo('Nómina/abril\\2026:"?*\r\n.pdf')).not.toMatch(/[/\\:"?*\r\n]/);
    const header = contentDisposition('Planilla - José López.pdf');
    expect(header).toContain('filename="Planilla - Jose Lopez.pdf"');
    expect(header).toContain("filename*=UTF-8''Planilla%20-%20Jos%C3%A9%20L%C3%B3pez.pdf");
  });
  it('ofrece los mismos bytes en binario y JSON con nombre UTF-8 y sin caché', async () => {
    const app = express(),
      archivo = {
        nombre: 'Nómina.pdf',
        tipo: 'application/pdf',
        base64: Buffer.from('%PDF-prueba').toString('base64'),
      };
    app.get('/pdf', (r, s) => responderArchivo(r, s, archivo));
    const binario = await request(app).get('/pdf').set('Accept', 'application/pdf').expect(200);
    expect(binario.headers['content-type']).toContain('application/pdf');
    expect(binario.headers['content-disposition']).toBe(contentDisposition(archivo.nombre));
    expect(binario.headers['cache-control']).toContain('no-store');
    const json = await request(app).get('/pdf').set('Accept', 'application/json').expect(200);
    expect(Buffer.from(json.body.data.base64, 'base64')).toEqual(binario.body);
  });
});
