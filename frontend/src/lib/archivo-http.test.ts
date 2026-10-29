import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { enviarArchivo, ErrorApi, guardarCsrf } from './http';
function transporte() {
  const xhr = {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    withCredentials: false,
    timeout: 0,
    status: 201,
    responseText: '{"ok":true,"data":{"id":1}}',
    upload: {
      onprogress: null as
        ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null,
    },
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    ontimeout: null as (() => void) | null,
  };
  vi.stubGlobal(
    'XMLHttpRequest',
    vi.fn(function () {
      return xhr;
    }),
  );
  return xhr;
}
beforeEach(() => guardarCsrf('csrf-actual'));
describe('Carga binaria autenticada con progreso', () => {
  it('envía el File original sin JSON/base64 con CSRF, nombre codificado y MIME', async () => {
    const xhr = transporte(),
      progreso = vi.fn(),
      file = new File(['documento'], 'cédula.png', { type: 'image/png' });
    const p = enviarArchivo(
      '/expedientes/empleados/7?tipo=1',
      file,
      z.object({ id: z.number() }),
      progreso,
    );
    expect(xhr.open).toHaveBeenCalledWith('POST', '/api/expedientes/empleados/7?tipo=1');
    expect(xhr.send).toHaveBeenCalledWith(file);
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('X-CSRF-Token', 'csrf-actual');
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('X-Nombre-Archivo', 'c%C3%A9dula.png');
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
    expect(progreso).toHaveBeenCalledWith(50);
    xhr.onload?.();
    await expect(p).resolves.toEqual({ id: 1 });
  });
  it('conserva campos de error, notifica sesión vencida y rechaza respuestas inválidas', async () => {
    const xhr = transporte(),
      caducada = vi.fn();
    window.addEventListener('nomina2:sesion-expirada', caducada, { once: true });
    const file = new File(['x'], 'x.pdf', { type: 'application/pdf' });
    const p = enviarArchivo(
      '/expedientes/empleados/7',
      file,
      z.object({ id: z.number() }),
      () => {},
    );
    xhr.status = 401;
    xhr.responseText = JSON.stringify({
      error: {
        codigo: 'NO_AUTORIZADO',
        mensaje: 'Inicia sesión para continuar.',
        campos: { archivo: ['No disponible'] },
      },
    });
    xhr.onload?.();
    await expect(p).rejects.toMatchObject({ estado: 401, campos: { archivo: ['No disponible'] } });
    expect(caducada).toHaveBeenCalledTimes(1);
    guardarCsrf('otro');
    const q = enviarArchivo(
      '/expedientes/empleados/7',
      file,
      z.object({ id: z.number() }),
      () => {},
    );
    xhr.status = 200;
    xhr.responseText = '<html>Error de proxy</html>';
    xhr.onload?.();
    await expect(q).rejects.toBeInstanceOf(ErrorApi);
  });
});
