import { beforeEach, describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ErrorApi, guardarCsrf, solicitar, mapearErrores } from './http';
const response = (status: number, cuerpo: unknown) => ({
  status,
  ok: status < 400,
  json: async () => cuerpo,
});
beforeEach(() => guardarCsrf());
describe('cliente HTTP', () => {
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
