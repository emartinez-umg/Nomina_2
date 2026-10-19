import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from './providers';
import { useSession } from './session';

describe('verificación de sesión previa al login', () => {
  it('un 401 de una consulta cancelada no vence el login que acaba de completarse', async () => {
    let resolver!: (cuerpo: unknown) => void;
    const cuerpo = new Promise((resolve) => {
      resolver = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => cuerpo }),
    );
    function Estado() {
      const sesion = useSession();
      return (
        <>
          <span>
            {sesion.usuario ? 'Autenticada' : 'Anónima'} / {sesion.expirada ? 'Vencida' : 'Vigente'}
          </span>
          <button
            onClick={() =>
              sesion.establecer({
                idUsuario: 1,
                idRol: 1,
                usuario: 'ana.perez',
                correo: 'ana@example.test',
                rol: 'RH',
                activo: true,
                cambioObligatorio: false,
              })
            }
          >
            Completar login
          </button>
        </>
      );
    }
    render(
      <Providers>
        <Estado />
      </Providers>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () => screen.getByRole('button').click());
    await act(async () =>
      resolver({
        ok: false,
        error: { codigo: 'NO_AUTORIZADO', mensaje: 'Inicia sesión para continuar.' },
      }),
    );
    expect(await screen.findByText('Autenticada / Vigente')).toBeInTheDocument();
  });
  it('un aviso global de 401 sin sesión establecida no anuncia una expiración', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { codigo: 'NO_AUTORIZADO', mensaje: 'Inicia sesión para continuar.' },
        }),
      }),
    );
    function Estado() {
      return <span>{useSession().expirada ? 'Expirada' : 'Sin aviso'}</span>;
    }
    render(
      <Providers>
        <Estado />
      </Providers>,
    );
    await act(async () => window.dispatchEvent(new Event('nomina2:sesion-expirada')));
    expect(screen.getByText('Sin aviso')).toBeInTheDocument();
  });
});
