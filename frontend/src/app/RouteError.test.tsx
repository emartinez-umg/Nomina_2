import { lazyPagina } from './lazyPagina';
import { Suspense } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RouteError } from './RouteError';
import { HelpProvider } from '../components/help/HelpProvider';

describe('error de ruta', () => {
  it('muestra una explicación amigable y Reintentar vuelve a importar la página', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const importar = vi
      .fn()
      .mockRejectedValueOnce(new Error('detalle técnico privado'))
      .mockResolvedValue({ default: () => <h1>Página recuperada</h1> });
    const Pagina = lazyPagina(importar);
    render(
      <HelpProvider>
        <RouterProvider
          router={createMemoryRouter([
            {
              path: '/',
              element: (
                <Suspense>
                  <Pagina />
                </Suspense>
              ),
              errorElement: <RouteError />,
            },
          ])}
        />
      </HelpProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument();
    expect(screen.queryByText('detalle técnico privado')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Página recuperada' })).toBeInTheDocument();
    expect(importar).toHaveBeenCalledTimes(2);
  });
});
