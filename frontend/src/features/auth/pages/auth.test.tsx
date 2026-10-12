import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { Providers } from '../../../app/providers';
import { rutas } from '../../../app/router';
import type { Rol } from '../api/auth';
import { cambioSchema } from '../api/schemas';
const usuario = (rol: Rol = 'ADMIN', cambioObligatorio = false) => ({
  idUsuario: 1,
  idRol: 1,
  usuario: 'ana.perez',
  correo: 'ana@empresa.test',
  rol,
  activo: true,
  cambioObligatorio,
});
const respuesta = (status: number, data: unknown) => ({
  status,
  ok: status < 400,
  json: async () => (status < 400 ? { ok: true, data } : { ok: false, error: data }),
});
function mostrar(ruta = '/login') {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return router;
}
beforeEach(() => localStorage.clear());
describe('autenticación y guards', () => {
  it.each([
    ['ADMIN', '/admin', 'Administración'],
    ['RH', '/rh', 'Recursos Humanos'],
    ['EMPLEADO', '/mis-gestiones', 'Mis gestiones'],
  ] as const)('login redirige %s', async (rol, ruta, titulo) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/sesion'))
          return respuesta(401, { codigo: 'SESION_INVALIDA', mensaje: 'Inicia sesión.' });
        if (url.endsWith('/csrf')) return respuesta(200, { csrfToken: 'csrf' });
        return respuesta(200, { usuario: usuario(rol), csrfToken: 'nuevo' });
      }),
    );
    const router = mostrar();
    await screen.findByRole('heading', { name: 'Iniciar Sesión' });
    await userEvent.type(screen.getByLabelText(/^Usuario/), 'ana.perez');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), 'Temporal!123');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(ruta));
    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument();
    if (rol === 'EMPLEADO')
      expect(screen.queryByRole('button', { name: 'Usuarios' })).not.toBeInTheDocument();
  });
  it('bloquea rutas de negocio hasta cambiar contraseña y envía solo los campos del contrato', async () => {
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/sesion')) return respuesta(200, usuario('ADMIN', true));
      if (url.endsWith('/csrf')) return respuesta(200, { csrfToken: 'csrf' });
      return respuesta(200, { usuario: usuario(), csrfToken: 'rotado' });
    });
    vi.stubGlobal('fetch', fetch);
    const router = mostrar('/admin');
    await screen.findByRole('heading', { name: 'Cambia tu contraseña' });
    expect(router.state.location.pathname).toBe('/cambiar-contrasena');
    await userEvent.type(screen.getByLabelText(/^Contraseña actual/), 'Temporal!123');
    await userEvent.type(screen.getByLabelText(/^Nueva contraseña/), 'Segura!45678');
    await userEvent.type(screen.getByLabelText(/^Confirmar nueva/), 'Segura!45678');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/cambiar-contrasena',
      expect.objectContaining({
        body: JSON.stringify({ contrasenaActual: 'Temporal!123', contrasenaNueva: 'Segura!45678' }),
      }),
    );
  });
  it('redirige un empleado que escribe la ruta administrativa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, usuario('EMPLEADO'))));
    const router = mostrar('/admin');
    await waitFor(() => expect(router.state.location.pathname).toBe('/mis-gestiones'));
    expect(screen.queryByRole('heading', { name: 'Administración' })).not.toBeInTheDocument();
  });
  it('sesión expirada limpia la pantalla y explica cómo continuar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, usuario())));
    const router = mostrar('/admin');
    await screen.findByRole('heading', { name: 'Administración' });
    act(() => window.dispatchEvent(new Event('nomina2:sesion-expirada')));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(screen.getByRole('alert')).toHaveTextContent('sesión expiró');
  });
  it('muestra errores de credenciales sin navegar ni repetir el envío', async () => {
    const fetch = vi.fn().mockImplementation(async (url: string) =>
      url.endsWith('/csrf')
        ? respuesta(200, { csrfToken: 'csrf' })
        : respuesta(401, {
            codigo: url.endsWith('/login') ? 'CREDENCIALES_INVALIDAS' : 'SESION_INVALIDA',
            mensaje: 'Usuario o contraseña incorrectos.',
          }),
    );
    vi.stubGlobal('fetch', fetch);
    const router = mostrar();
    await screen.findByRole('heading', { name: 'Iniciar Sesión' });
    await userEvent.type(screen.getByLabelText(/^Usuario/), 'ana.perez');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), 'Temporal!123');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.');
    expect(router.state.location.pathname).toBe('/login');
    expect(fetch.mock.calls.filter((c) => c[0].endsWith('/login'))).toHaveLength(1);
  });
  it('valida confirmación, política y no reutilización', () => {
    expect(
      cambioSchema.safeParse({
        contrasenaActual: 'Igual!123456',
        contrasenaNueva: 'Igual!123456',
        confirmacion: 'Distinta!123',
      }).success,
    ).toBe(false);
    expect(
      cambioSchema.safeParse({
        contrasenaActual: 'Vieja!123456',
        contrasenaNueva: 'corta',
        confirmacion: 'corta',
      }).success,
    ).toBe(false);
  });
});
