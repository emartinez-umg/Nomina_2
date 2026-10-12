import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { NotificationBell } from './NotificationBell';
import { Table } from './Table';
import { Tabs } from './Tabs';
import { useState } from 'react';
import { Button } from './Button';
import { ToastProvider, useToast } from './Toast';
import { HelpProvider, HelpButton, HelpOffer, usePageHelp } from '../help/HelpProvider';
import { ayudaLogin } from '../../features/auth/help/pasos';
describe('interacciones reutilizables', () => {
  it('tabla solicita página/orden al consumidor y respeta límites', async () => {
    const pagina = vi.fn(),
      orden = vi.fn();
    render(
      <Table
        columnas={[
          {
            id: 'usuario',
            titulo: 'Usuario',
            ordenable: true,
            render: (f: { id: number; nombre: string }) => f.nombre,
          },
        ]}
        filas={[{ id: 1, nombre: 'Ana' }]}
        clave={(f) => f.id}
        pagina={1}
        limite={10}
        total={25}
        orden={{ campo: 'usuario', direccion: 'asc' }}
        onPagina={pagina}
        onOrden={orden}
      />,
    );
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(pagina).toHaveBeenCalledWith(2);
    await userEvent.click(screen.getByRole('button', { name: 'Usuario' }));
    expect(orden).toHaveBeenCalledWith('usuario', 'desc');
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending');
  });
  it('tabs permiten navegar por teclado sin mostrar paneles ajenos', async () => {
    function Ejemplo() {
      const [v, setV] = useState('uno');
      return (
        <Tabs
          valor={v}
          onCambiar={setV}
          items={[
            { id: 'uno', titulo: 'Uno', icono: 'usuario', contenido: 'Primer panel' },
            { id: 'dos', titulo: 'Dos', icono: 'documento', contenido: 'Segundo panel' },
          ]}
        />
      );
    }
    render(<Ejemplo />);
    screen.getByRole('tab', { name: 'Uno' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Segundo panel');
  });
  it('botón pendiente evita dobles acciones y solo-ícono tiene nombre y tooltip', async () => {
    render(
      <>
        <Button icono="guardar" cargando>
          Guardar
        </Button>
        <Button icono="cancelar" soloIcono aria-label="Cerrar" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
    await userEvent.hover(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Cerrar');
  });
  it('la campana solo muestra contador cuando recibe datos y lo anuncia de forma accesible', () => {
    const { rerender } = render(<NotificationBell abierto={false} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument();
    rerender(<NotificationBell abierto={false} noLeidas={12} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Notificaciones: 12 sin leer' })).toBeInTheDocument();
  });
  it('toast ofrece cierre accesible', async () => {
    function Ejemplo() {
      const toast = useToast();
      return (
        <Button icono="guardar" onClick={() => toast('Datos guardados.')}>
          Guardar
        </Button>
      );
    }
    render(
      <ToastProvider>
        <Ejemplo />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('status')).toHaveTextContent('Datos guardados.');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('ofrece la ayuda en primera visita y permite reiniciarla desde el botón global', async () => {
    localStorage.clear();
    function Ejemplo() {
      usePageHelp(ayudaLogin);
      return (
        <>
          <div data-tour="marca">Nómina</div>
          <div data-tour="credenciales">Usuario</div>
          <HelpButton />
          <HelpOffer />
        </>
      );
    }
    render(
      <HelpProvider>
        <Ejemplo />
      </HelpProvider>,
    );
    expect(screen.getByLabelText('Recorrido de bienvenida')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
    expect(localStorage.getItem('nomina2:ayuda:login:publico')).toBe('vista');
    await userEvent.click(screen.getByRole('button', { name: 'Ayuda de esta página' }));
    expect(await screen.findByText('Bienvenido a Nómina')).toBeInTheDocument();
  });
});
