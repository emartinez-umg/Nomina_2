import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import type { Rol } from '../../features/auth/api/auth';
import { AppLayout } from './AppLayout';
import { NavigationMenu } from './NavigationMenu';
import { navigation } from './navigation.config';

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
function mostrar(rol: Rol = 'RH') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: url.endsWith('/sesion')
          ? {
              idUsuario: 7,
              idRol: 2,
              usuario: 'ana.perez',
              correo: 'ana@example.test',
              rol,
              activo: true,
              cambioObligatorio: false,
            }
          : { pendientes: 0, registros: [] },
      }),
    })),
  );
  const router = createMemoryRouter(
    [{ element: <AppLayout />, children: [{ path: '*', element: <h1>Contenido de prueba</h1> }] }],
    { initialEntries: [rol === 'ADMIN' ? '/admin' : rol === 'RH' ? '/rh' : '/mis-gestiones'] },
  );
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return router;
}
describe('Barra y paleta del layout', () => {
  it.each(['{Control>}k{/Control}', '{Meta>}k{/Meta}'])(
    'abre por atajo %s, busca con error de escritura y navega con teclado',
    async (atajo) => {
      const router = mostrar();
      const user = userEvent.setup();
      await screen.findByRole('button', { name: 'Buscar sección o acción' });
      await user.keyboard(atajo);
      const dialogo = await screen.findByRole('dialog', { name: 'Buscar en el sistema' });
      const entrada = within(dialogo).getByRole('combobox');
      await user.type(entrada, 'boltea');
      await waitFor(() => expect(within(dialogo).getAllByRole('option')).toHaveLength(1));
      expect(within(dialogo).getByRole('option')).toHaveTextContent('Planilla y boletas');
      expect(within(dialogo).getByRole('option')).toHaveTextContent('Nómina');
      await user.keyboard('{ArrowDown}{Enter}');
      await waitFor(() => expect(router.state.location.pathname).toBe('/planilla'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Buscar sección o acción' }));
      expect(within(screen.getByRole('dialog')).getByText('Recientes')).toBeInTheDocument();
      fireEvent(
        screen.getByRole('dialog'),
        new Event('cancel', { cancelable: true, bubbles: true }),
      );
      expect(screen.getByRole('button', { name: 'Buscar sección o acción' })).toHaveFocus();
    },
  );
  it.each(['ADMIN', 'RH', 'EMPLEADO'] as const)(
    'filtra opciones y acciones de %s, permite clic y muestra vacío',
    async (rol) => {
      const router = mostrar(rol);
      const user = userEvent.setup();
      const boton = await screen.findByRole('button', { name: 'Buscar sección o acción' });
      await user.click(boton);
      const dialogo = screen.getByRole('dialog');
      expect(within(dialogo).getByText('Acciones rápidas')).toBeInTheDocument();
      expect(within(dialogo).queryByRole('option', { name: /Usuarios/ }) !== null).toBe(
        rol === 'ADMIN',
      );
      expect(within(dialogo).queryByRole('option', { name: /Nuevo empleado/ }) !== null).toBe(
        rol !== 'EMPLEADO',
      );
      await user.type(within(dialogo).getByRole('combobox'), 'zxqsinresultados');
      expect(await within(dialogo).findByText(/No encontramos opciones/)).toBeInTheDocument();
      await user.clear(within(dialogo).getByRole('combobox'));
      const titulo = rol === 'EMPLEADO' ? 'Actualizar mi contacto' : 'Cargar comisión';
      await user.click(within(dialogo).getByRole('option', { name: new RegExp(titulo) }));
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(
          rol === 'EMPLEADO' ? '/mis-gestiones/datos' : '/novedades/comisiones/nuevo',
        ),
      );
    },
  );
  it('no abre la paleta sobre otra ventana ni al mantener pulsado el atajo', async () => {
    mostrar();
    await screen.findByRole('button', { name: 'Buscar sección o acción' });
    const dialogo = document.createElement('dialog');
    dialogo.open = true;
    document.body.append(dialogo);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('dialog', { name: 'Buscar en el sistema' })).not.toBeInTheDocument();
    dialogo.remove();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true, repeat: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
describe('Menú por categorías y acordeones', () => {
  function menu() {
    const onElegir = vi.fn();
    const router = createMemoryRouter(
      [{ path: '*', element: <NavigationMenu rol="RH" onElegir={onElegir} /> }],
      { initialEntries: ['/catalogos/puestos'] },
    );
    render(<RouterProvider router={router} />);
    return { onElegir, router };
  }
  it('abre con Enter/Espacio y flechas, recorre enlaces, restaura foco y navega', async () => {
    const { onElegir, router } = menu();
    const user = userEvent.setup();
    const inicio = screen.getByRole('button', { name: 'Inicio' });
    inicio.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Personal' })).toHaveFocus();
    await user.keyboard('{ArrowRight}{Enter}');
    const organizacion = screen.getByRole('button', { name: 'Organización' });
    expect(organizacion).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /^Puestos/ })).toHaveAttribute('aria-current', 'page');
    await user.keyboard(' ');
    expect(organizacion).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /^Todos los catálogos/ })).toHaveFocus(),
    );
    await user.keyboard('{End}');
    expect(screen.getByRole('link', { name: /^Bancos/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: /^Todos los catálogos/ })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(organizacion).toHaveFocus();
    expect(organizacion).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(screen.getByRole('link', { name: /^Bancos/ })).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/catalogos/bancos');
    expect(onElegir).toHaveBeenCalledWith('bancos');
  });
  it('cierra al hacer clic fuera o salir con Tab y permite acordeones móviles', async () => {
    menu();
    const user = userEvent.setup();
    const abrir = screen.getByRole('button', { name: 'Abrir menú de navegación' });
    await user.click(abrir);
    expect(abrir).toHaveAttribute('aria-expanded', 'true');
    const vacaciones = screen.getByRole('button', { name: 'Vacaciones' });
    await user.click(vacaciones);
    expect(vacaciones).toHaveAttribute('aria-expanded', 'true');
    await user.click(document.body);
    expect(vacaciones).toHaveAttribute('aria-expanded', 'false');
    expect(abrir).toHaveAttribute('aria-expanded', 'false');
    await user.click(abrir);
    await user.keyboard('{Escape}');
    expect(abrir).toHaveFocus();
    expect(abrir).toHaveAttribute('aria-expanded', 'false');
    const ultimo = screen.getByRole('button', { name: navigation.RH.at(-1)!.titulo });
    ultimo.focus();
    await user.keyboard('{Tab}');
    expect(ultimo).toHaveAttribute('aria-expanded', 'false');
  });
});
