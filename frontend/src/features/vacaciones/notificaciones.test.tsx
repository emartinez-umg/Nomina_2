import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { Notificaciones } from './pages/Notificaciones';
import { guardarCsrf } from '../../lib/http';

beforeEach(() => {
  localStorage.clear();
  guardarCsrf('csrf-prueba');
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
function mostrar() {
  let registros = [
    {
      id: 1,
      titulo: 'Documento disponible',
      mensaje: 'Tu constancia está lista.',
      clave: 'SOLICITUD:1:ENTREGADA',
      leida: 0,
    },
    {
      id: 2,
      titulo: 'Vacaciones aprobadas',
      mensaje: 'Revisa tus fechas.',
      clave: 'VACACIONES:1:APROBADA',
      leida: 0,
    },
  ];
  let fallo = false;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE' && fallo)
      return {
        ok: false,
        status: 500,
        json: async () => ({
          ok: false,
          error: { codigo: 'INTERNO', mensaje: 'No se pudo borrar.' },
        }),
      };
    const id = Number(url.split('/').at(-1));
    const data = url.endsWith('/sesion')
      ? {
          idUsuario: 7,
          idRol: 3,
          usuario: 'ana.perez',
          correo: 'ana@example.test',
          rol: 'EMPLEADO',
          activo: true,
          cambioObligatorio: false,
        }
      : url.endsWith('/csrf')
        ? { csrfToken: 'csrf-prueba' }
        : init?.method === 'DELETE'
          ? (() => {
              const n = registros.length;
              registros = url.endsWith('/notificaciones')
                ? []
                : registros.filter((r) => r.id !== id);
              return { borradas: n - registros.length };
            })()
          : init?.method === 'POST'
            ? (() => {
                registros = registros.map((r) =>
                  r.id === Number(url.split('/').at(-2)) ? { ...r, leida: 1 } : r,
                );
                return { leida: true };
              })()
            : { registros, pendientes: registros.filter((r) => !r.leida).length };
    return { ok: true, status: 200, json: async () => ({ ok: true, data }) };
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <MemoryRouter>
      <Providers>
        <Notificaciones abierto onClick={vi.fn()} />
      </Providers>
    </MemoryRouter>,
  );
  return {
    fetch,
    fallar: (v: boolean) => {
      fallo = v;
    },
  };
}
describe('Notificaciones propias', () => {
  it('conserva marcar leída y actualiza la campana al borrar una', async () => {
    const { fetch } = mostrar();
    await screen.findByRole('button', { name: 'Notificaciones: 2 sin leer' });
    const aviso = screen.getByText('Documento disponible').closest('article')!;
    await userEvent.click(within(aviso).getByRole('button', { name: 'Marcar como leída' }));
    await screen.findByRole('button', { name: 'Notificaciones: 1 sin leer' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Borrar notificación: Vacaciones aprobadas' }),
    );
    await waitFor(() => expect(screen.queryByText('Vacaciones aprobadas')).not.toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: 'Notificaciones', expanded: true }),
    ).toBeInTheDocument();
    expect(screen.getByText('Documento disponible')).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(
        ([url, init]) => url.endsWith('/notificaciones/2') && init?.method === 'DELETE',
      ),
    ).toBe(true);
  });
  it('borrar todas exige confirmación, permite cancelar y vacía lista/contador tras éxito', async () => {
    const { fetch } = mostrar();
    await screen.findByText('Documento disponible');
    await userEvent.click(screen.getByRole('button', { name: 'Borrar todas' }));
    let dialogo = screen.getByRole('dialog', { name: 'Borrar todas las notificaciones' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Borrar todas' }));
    dialogo = screen.getByRole('dialog', { name: 'Borrar todas las notificaciones' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('Sin notificaciones');
    expect(
      screen.getByRole('button', { name: 'Notificaciones', expanded: true }),
    ).toBeInTheDocument();
    const llamada = fetch.mock.calls.find(([, init]) => init?.method === 'DELETE')!;
    expect(JSON.parse(String(llamada[1]?.body))).toEqual({ confirmado: true });
  });
  it('un error conserva el aviso y permite reintentar', async () => {
    const { fallar } = mostrar();
    await screen.findByText('Documento disponible');
    fallar(true);
    await userEvent.click(
      screen.getByRole('button', { name: 'Borrar notificación: Documento disponible' }),
    );
    await screen.findByText('No se pudo borrar.');
    expect(screen.getByText('Documento disponible')).toBeInTheDocument();
    fallar(false);
    await userEvent.click(
      screen.getByRole('button', { name: 'Borrar notificación: Documento disponible' }),
    );
    await waitFor(() => expect(screen.queryByText('Documento disponible')).not.toBeInTheDocument());
  });
});
