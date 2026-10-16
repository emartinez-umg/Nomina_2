import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampoCodigo } from './CampoCodigo';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function montar(props: Parameters<typeof CampoCodigo>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const vista = (p: typeof props) => (
    <QueryClientProvider client={client}>
      <CampoCodigo {...p} />
    </QueryClientProvider>
  );
  const r = render(vista(props));
  return { ...r, cambiar: (p: typeof props) => r.rerender(vista(p)) };
}
describe('CampoCodigo', () => {
  it('consulta la API al cambiar nombre y el usuario no puede escribir ni pegar un código', async () => {
    const fetch = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify({
            ok: true,
            data: { codigo: url.includes('Ventas') ? 'VEN' : 'ING', definitivo: false },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const r = montar({ entidad: 'departamentos', palabra: 'Ingeniería' });
    const campo = screen.getByLabelText('Código', { exact: true });
    await waitFor(() => expect(campo).toHaveValue('ING'));
    expect(campo).toHaveAttribute('readonly');
    const user = userEvent.setup();
    await user.type(campo, 'MANUAL');
    await user.click(campo);
    await user.paste('PEGADO');
    expect(campo).toHaveValue('ING');
    r.cambiar({ entidad: 'departamentos', palabra: 'Ventas' });
    expect(campo).toHaveValue('');
    await waitFor(() => expect(campo).toHaveValue('VEN'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('espera el departamento y pide una vista previa nueva al cambiarlo', async () => {
    const fetch = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              codigo: url.includes('idDepartamento=2') ? 'EMP_VEN_0001' : 'EMP_ING_0003',
              definitivo: false,
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const r = montar({ entidad: 'empleados' });
    expect(fetch).not.toHaveBeenCalled();
    r.cambiar({ entidad: 'empleados', idDepartamento: '1' });
    await waitFor(() =>
      expect(screen.getByLabelText('Código', { exact: true })).toHaveValue('EMP_ING_0003'),
    );
    r.cambiar({ entidad: 'empleados', idDepartamento: '2' });
    await waitFor(() =>
      expect(screen.getByLabelText('Código', { exact: true })).toHaveValue('EMP_VEN_0001'),
    );
  });
  it('conserva el código existente al renombrar o trasladar y no consulta el contador', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const r = montar({ entidad: 'empleados', codigo: 'EMP_ING_0001', idDepartamento: '1' });
    r.cambiar({ entidad: 'empleados', codigo: 'EMP_ING_0001', idDepartamento: '2' });
    expect(screen.getByLabelText('Código', { exact: true })).toHaveValue('EMP_ING_0001');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('explica el fallo de la API sin inventar un código', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              data: null,
              error: { codigo: 'VALIDACION', mensaje: 'Revisa el nombre.' },
            }),
            { status: 400 },
          ),
      ),
    );
    montar({ entidad: 'departamentos', palabra: '!!!' });
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Código', { exact: true })).toHaveValue('');
  });
});
