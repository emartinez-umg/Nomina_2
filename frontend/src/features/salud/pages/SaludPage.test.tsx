import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SaludPage } from './SaludPage';

const exito = {
  ok: true,
  data: { estado: 'OK', baseDatos: 'CONECTADA', modo: 'thin', fecha: '2026-10-12T16:00:00.000Z' },
};

function mostrar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <SaludPage />
    </QueryClientProvider>,
  );
}

describe('página de salud', () => {
  it('muestra carga mientras espera la API', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    mostrar();
    expect(screen.getByText('Comprobando conexión…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comprobando…' })).toBeDisabled();
    expect(screen.queryByText('Oracle conectada')).not.toBeInTheDocument();
  });

  it('consulta la API real mediante su URL y presenta el resultado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => exito });
    vi.stubGlobal('fetch', fetchMock);
    mostrar();
    expect(await screen.findByText('Sistema disponible')).toBeInTheDocument();
    expect(screen.getByText('Oracle conectada')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/salud',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('muestra el mensaje de Oracle y permite reintentar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          ok: false,
          error: {
            codigo: 'BD_NO_DISPONIBLE',
            mensaje: 'No se pudo conectar con la base de datos.',
          },
        }),
      })
      .mockResolvedValue({ ok: true, json: async () => exito });
    vi.stubGlobal('fetch', fetchMock);
    mostrar();
    expect(await screen.findByText('Servicio no disponible')).toBeInTheDocument();
    expect(screen.getByText('No se pudo conectar con la base de datos.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar de nuevo' }));
    expect(await screen.findByText('Sistema disponible')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no presenta éxito ante un contrato de respuesta inválido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: {} }) }),
    );
    mostrar();
    expect(
      await screen.findByText('El servicio devolvió una respuesta no válida.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Oracle conectada')).not.toBeInTheDocument();
  });

  it('explica un fallo de red en español', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    mostrar();
    expect(
      await screen.findByText(
        'No se pudo contactar al servicio. Revisa la conexión y vuelve a intentar.',
      ),
    ).toBeInTheDocument();
  });

  it('no expone errores de parseo cuando nginx entrega una respuesta no JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );
    mostrar();
    expect(
      await screen.findByText('El servicio devolvió una respuesta no válida.'),
    ).toBeInTheDocument();
  });
});
