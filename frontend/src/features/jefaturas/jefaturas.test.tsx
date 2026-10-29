import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { HelpProvider } from '../../components/help/HelpProvider';
import { guardarCsrf } from '../../lib/http';
import { AsignarJefatura, JefaturasPanel } from './JefaturasPanel';
vi.mock('../../app/session', () => ({ useSession: () => ({ usuario: { rol: 'RH' } }) }));
const ok = (data: unknown) =>
  new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
const persona = (id: number) => ({
  id,
  codigo: `EMP_PRU_${id}`,
  nombre: `Persona ${id}`,
  dpi: '*********1234',
  nit: '****-1',
  departamento: 'Prueba',
  idDepartamento: 1,
  puesto: 'Analista',
  fechaIngreso: '2026-01-01',
  salarioBase: null,
  estado: 'ACTIVO',
  perfilIncompleto: true,
  faltantes: ['Salario'],
  jefatura: null,
  jefeInmediato: 'Ana López',
});
function mostrar(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <HelpProvider>{ui}</HelpProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  guardarCsrf('prueba-jefaturas');
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/resumen')) return ok({ total: 0, sinJefatura: 3, sinJefe: 0 });
      if (url.includes('/opciones/departamentos')) return ok([{ value: '1', label: 'Prueba' }]);
      if (url.includes('/catalogos/jefaturas?'))
        return ok({
          registros: [
            {
              id: 1,
              nombre: 'Equipo',
              idDepartamento: 1,
              idDepartamentoEtiqueta: 'Prueba',
              activo: true,
              enUso: false,
            },
          ],
          total: 1,
          pagina: 1,
          limite: 100,
        });
      if (url.includes('/catalogos/centros-trabajo'))
        return ok({
          registros: [{ id: 1, nombre: 'Central', activo: true, enUso: false }],
          total: 1,
          pagina: 1,
          limite: 100,
        });
      if (url.includes('/asignaciones')) return ok({ asignados: 2, sinCambios: 0 });
      const pagina = Number(new URL(url, 'http://localhost').searchParams.get('pagina') ?? 1);
      return ok({ registros: [persona(pagina)], total: 21, pagina, limite: 20 });
    }),
  );
});
describe('R3-5: jefaturas en interfaz', () => {
  it('guía el catálogo vacío y no permite asignar antes de crear una jefatura', async () => {
    const crear = vi.fn();
    mostrar(<JefaturasPanel crear={crear} asignar={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Configurar jefaturas' });
    expect(screen.getByText(/3 empleado\(s\) sin jefatura/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Asignar empleados' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Configurar jefaturas' }));
    expect(crear).toHaveBeenCalledOnce();
  });
  it('conserva selección entre páginas, filtra por centro y confirma la asignación completa', async () => {
    const cerrar = vi.fn();
    mostrar(<AsignarJefatura inicial="1" cerrar={cerrar} />);
    await screen.findByLabelText('Seleccionar Persona 1');
    await userEvent.click(screen.getByLabelText('Seleccionar Persona 1'));
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByLabelText('Seleccionar Persona 2');
    await userEvent.click(screen.getByLabelText('Seleccionar Persona 2'));
    const centro = screen.getByRole('combobox', { name: 'Centro de trabajo' });
    await userEvent.click(centro);
    await userEvent.click(screen.getByRole('option', { name: 'Central' }));
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('idCentroTrabajo=1')),
      ).toBe(true),
    );
    expect(screen.getByText(/2 empleado\(s\) seleccionados/)).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: /Motivo de asignación/ }),
      'Organización del equipo',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Revisar asignación' }));
    expect(screen.getByText(/Se asignarán 2 empleados/)).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/asignaciones'))).toBe(
      false,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce());
    const llamada = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/asignaciones'))!;
    expect(JSON.parse(String(llamada[1]?.body))).toMatchObject({
      idJefatura: 1,
      empleados: [1, 2],
      motivo: 'Organización del equipo',
      confirmado: true,
    });
  });
  it('rechaza una selección vacía y conserva el formulario tras un fallo del servidor', async () => {
    mostrar(<AsignarJefatura inicial="1" cerrar={vi.fn()} />);
    await screen.findByLabelText('Seleccionar Persona 1');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar asignación' }));
    await screen.findAllByText('Selecciona al menos un empleado.');
    await userEvent.click(screen.getByLabelText('Seleccionar Persona 1'));
    await userEvent.type(
      screen.getByRole('textbox', { name: /Motivo de asignación/ }),
      'Reorganización',
    );
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (...args) =>
      String(args[0]).includes('/asignaciones')
        ? new Response(
            JSON.stringify({
              ok: false,
              error: { codigo: 'CONFLICTO', mensaje: 'El empleado dejó de estar activo.' },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          )
        : original(...args),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Revisar asignación' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('El empleado dejó de estar activo.');
    expect(screen.getByLabelText('Seleccionar Persona 1')).toBeChecked();
    expect(screen.getByRole('textbox', { name: /Motivo de asignación/ })).toHaveValue(
      'Reorganización',
    );
  });
});
