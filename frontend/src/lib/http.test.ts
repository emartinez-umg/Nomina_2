import { beforeEach, describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ErrorApi, guardarCsrf, solicitar, mapearErrores } from './http';
import { iniciarSesion } from '../features/auth/api/auth';
const response = (status: number, cuerpo: unknown) => ({
  status,
  ok: status < 400,
  json: async () => cuerpo,
});
beforeEach(() => guardarCsrf());
describe('cliente HTTP', () => {
  it('descarga binaria conserva bytes y toma el nombre UTF-8 de Content-Disposition', async () => {
    const bytes = Uint8Array.from([37, 80, 68, 70, 45, 0, 255]);
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          "attachment; filename=nomina.pdf; filename*=UTF-8''Anticipo%20-%20Jos%C3%A9.pdf",
      }),
      arrayBuffer: async () => bytes.buffer,
    });
    vi.stubGlobal('fetch', fetch);
    const r = await solicitar(
      '/nomina/boletas/1/pdf',
      z.object({ nombre: z.string(), tipo: z.string(), base64: z.string() }),
      { archivo: true },
    );
    expect(r.nombre).toBe('Anticipo - José.pdf');
    expect(r.tipo).toBe('application/pdf');
    expect(Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))).toEqual(bytes);
    expect(fetch.mock.calls[0]?.[1].headers.Accept).toContain('application/pdf');
  });
  it('una descarga rechazada sigue notificando la expiración y conserva el error en español', async () => {
    const evento = vi.fn();
    window.addEventListener('nomina2:sesion-expirada', evento);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(401, {
          error: { codigo: 'NO_AUTORIZADO', mensaje: 'Inicia sesión para continuar.' },
        }),
      ),
    );
    try {
      await expect(
        solicitar('/nomina/boletas/1/pdf', z.object({}), { archivo: true }),
      ).rejects.toMatchObject({ estado: 401, message: 'Inicia sesión para continuar.' });
      expect(evento).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('nomina2:sesion-expirada', evento);
    }
  });
  it('un 401 tardío de otra generación no invalida la sesión nueva', async () => {
    const evento = vi.fn();
    window.addEventListener('nomina2:sesion-expirada', evento);
    let resolver!: (respuesta: unknown) => void;
    const cuerpo = new Promise((resolve) => {
      resolver = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => cuerpo }),
    );
    guardarCsrf('anterior');
    const solicitud = solicitar('/privado', z.object({}));
    guardarCsrf('sesion-nueva');
    resolver({ error: { codigo: 'NO_AUTORIZADO', mensaje: 'Inicia sesión para continuar.' } });
    try {
      await expect(solicitud).rejects.toBeInstanceOf(ErrorApi);
      expect(evento).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('nomina2:sesion-expirada', evento);
    }
  });
  it('renueva el CSRF prelogin tras una cookie vencida y envía el login una sola vez sin anunciar expiración', async () => {
    const evento = vi.fn();
    window.addEventListener('nomina2:sesion-expirada', evento);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response(401, {
          error: { codigo: 'NO_AUTORIZADO', mensaje: 'Inicia sesión para continuar.' },
        }),
      )
      .mockResolvedValueOnce(response(200, { ok: true, data: { csrfToken: 'prelogin' } }))
      .mockResolvedValueOnce(
        response(200, {
          ok: true,
          data: {
            csrfToken: 'sesion',
            usuario: {
              idUsuario: 1,
              usuario: 'ana.perez',
              correo: 'ana@example.test',
              idRol: 1,
              rol: 'RH',
              activo: true,
              cambioObligatorio: false,
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    try {
      await expect(
        iniciarSesion({ usuario: 'ana.perez', contrasena: 'Valida!123456' }),
      ).resolves.toMatchObject({ rol: 'RH' });
      expect(evento).not.toHaveBeenCalled();
      expect(fetch.mock.calls.filter(([ruta]) => ruta === '/api/auth/login')).toHaveLength(1);
    } finally {
      window.removeEventListener('nomina2:sesion-expirada', evento);
    }
  });
  it('recupera CSRF y envía cookies en una escritura sin persistir secretos', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(200, { ok: true, data: { csrfToken: 'prueba-csrf' } }))
      .mockResolvedValueOnce(response(200, { ok: true, data: { valor: 'ok' } }));
    vi.stubGlobal('fetch', fetch);
    await solicitar('/ejemplo', z.object({ valor: z.string() }), {
      method: 'POST',
      body: { valor: 'entrada' },
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/ejemplo',
      expect.objectContaining({
        credentials: 'same-origin',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'prueba-csrf' }),
      }),
    );
  });
  it('recupera una sola vez el CSRF para escrituras concurrentes', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) =>
        response(200, { ok: true, data: url.endsWith('/csrf') ? { csrfToken: 'token' } : {} }),
      );
    vi.stubGlobal('fetch', fetch);
    await Promise.all([
      solicitar('/a', z.object({}), { method: 'POST' }),
      solicitar('/b', z.object({}), { method: 'POST' }),
    ]);
    expect(fetch.mock.calls.filter((c) => c[0] === '/api/auth/csrf')).toHaveLength(1);
  });
  it('no repite una escritura cuando el CSRF es inválido', async () => {
    guardarCsrf('anterior');
    const fetch = vi.fn().mockResolvedValue(
      response(403, {
        ok: false,
        error: { codigo: 'CSRF_INVALIDO', mensaje: 'Recarga la sesión.' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(solicitar('/a', z.object({}), { method: 'POST' })).rejects.toMatchObject({
      codigo: 'CSRF_INVALIDO',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('señala expiración pero conserva el mensaje de credenciales inválidas en login', async () => {
    const evento = vi.fn();
    window.addEventListener('nomina2:sesion-expirada', evento);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(401, { error: { codigo: 'SESION_INVALIDA', mensaje: 'Sesión vencida.' } }),
        ),
    );
    await expect(solicitar('/privado', z.object({}))).rejects.toBeInstanceOf(ErrorApi);
    expect(evento).toHaveBeenCalledTimes(1);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(401, {
          error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Revisa los datos.' },
        }),
      ),
    );
    await expect(
      solicitar('/auth/login', z.object({}), { notificarSesion: false }),
    ).rejects.toThrow('Revisa los datos.');
    expect(evento).toHaveBeenCalledTimes(1);
    window.removeEventListener('nomina2:sesion-expirada', evento);
  });
  it('mapea errores de campo únicamente en una lista permitida', () => {
    const setError = vi.fn();
    mapearErrores(
      new ErrorApi(422, 'VALIDACION', 'Revisa', {
        usuario: ['Usuario inválido'],
        rol: ['No permitido'],
      }),
      setError,
      ['usuario'],
    );
    expect(setError).toHaveBeenCalledExactlyOnceWith('usuario', {
      type: 'server',
      message: 'Usuario inválido',
    });
  });
  it('explica errores de red y rechaza un contrato alterado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    await expect(solicitar('/a', z.string())).rejects.toThrow('Revisa tu conexión');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(200, { ok: true, data: { desconocido: 1 } })),
    );
    await expect(solicitar('/a', z.string())).rejects.toThrow('respuesta no válida');
  });
});
