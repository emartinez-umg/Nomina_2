import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MiEquipoPage } from './MiEquipoPage';
import { SaldosVacacionesPage } from '../vacaciones/pages/SaldosVacacionesPage';
import { PermisosJefaturas } from '../jefaturas/PermisosJefaturas';
import * as api from './api';
import * as saldos from '../vacaciones/api/saldos';
import { listar } from '../catalogos/api/catalogos';
const reintentar = vi.fn();
vi.mock('../../app/session', () => ({
  useSession: () => ({ usuario: { rol: 'RH', idUsuario: 1 }, reintentar }),
}));
vi.mock('../../components/help/HelpProvider', () => ({
  usePageHelp: vi.fn(),
  DialogHelpButton: () => null,
  HelpProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./api', async (original) => ({
  ...(await original<typeof api>()),
  resumenEquipo: vi.fn(),
  listarEquipo: vi.fn(),
  opcionesEquipo: vi.fn(),
  consultarPermisos: vi.fn(),
  guardarPermisos: vi.fn(),
}));
vi.mock('../vacaciones/api/saldos', async (original) => ({
  ...(await original<typeof saldos>()),
  listarSaldosEquipo: vi.fn(),
  exportarSaldosEquipo: vi.fn(),
}));
vi.mock('../catalogos/api/catalogos', () => ({ listar: vi.fn() }));
const opciones = {
  departamentos: [{ id: 1, nombre: 'Ventas' }],
  centros: [{ id: 1, nombre: 'Central' }],
  jefaturas: [{ id: 1, nombre: 'Comercial' }],
};
function mostrar(ui: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.mocked(api.opcionesEquipo).mockResolvedValue(opciones);
  vi.mocked(api.resumenEquipo).mockResolvedValue({
    total: 1,
    permisos: ['VER_EQUIPO', 'VER_VACACIONES_EQUIPO'],
  });
  vi.mocked(api.listarEquipo).mockResolvedValue({
    registros: [
      {
        id: 2,
        codigo: 'EMP_VEN_0001',
        nombre: 'Ana Pérez',
        puesto: 'Vendedora',
        departamento: 'Ventas',
        centro: 'Central',
      },
    ],
    total: 1,
    equipo: 1,
    pagina: 1,
    limite: 10,
  });
});
describe('R3-8: vistas de equipo', () => {
  it('directorio sin acceso a ficha ni campos sensibles y con filtros exclusivos del equipo', async () => {
    mostrar(<MiEquipoPage />);
    await screen.findByText('Ana Pérez');
    expect(screen.getByText('Equipo: 1 personas')).toBeVisible();
    expect(screen.queryByRole('link', { name: /Ana/ })).not.toBeInTheDocument();
    for (const campo of ['Salario', 'DPI', 'NIT', 'Banco', 'Expediente', 'Actas'])
      expect(screen.queryByText(campo, { exact: false })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(api.opcionesEquipo).toHaveBeenCalledWith('personas', expect.anything());
    expect(listar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar nombre o código' }), {
      target: { value: 'Ajeno' },
    });
    await waitFor(() =>
      expect(api.listarEquipo).toHaveBeenLastCalledWith(
        expect.objectContaining({ buscar: 'Ajeno', pagina: '1' }),
        expect.anything(),
      ),
    );
  });
  it('solo vacaciones o comisiones no consulta el directorio y revocar muestra error sin datos anteriores', async () => {
    vi.mocked(api.resumenEquipo).mockResolvedValue({
      total: 3,
      permisos: ['VER_VACACIONES_EQUIPO'],
    });
    mostrar(<MiEquipoPage />);
    await screen.findByText('Equipo: 3 personas');
    expect(api.listarEquipo).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Saldos de vacaciones/ })).toBeVisible();
  });
  it('sin permisos permite actualizar sesión sin mostrar personas', async () => {
    vi.mocked(api.resumenEquipo).mockRejectedValue(new Error('No tienes este permiso de equipo.'));
    mostrar(<MiEquipoPage />);
    await screen.findByText('Equipo no disponible');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar permisos' }));
    expect(reintentar).toHaveBeenCalled();
    expect(api.listarEquipo).not.toHaveBeenCalled();
  });
  it('reutiliza saldos con endpoints y opciones de equipo, sin edición ni aprobación', async () => {
    vi.mocked(saldos.listarSaldosEquipo).mockResolvedValue({
      registros: [],
      total: 0,
      pagina: 1,
      limite: 10,
      corte: '2026-10-29',
      umbral: '15',
      idParametro: 1,
      etiquetaAlerta: 'Más de 15 días',
      indicadores: { empleadosAlerta: 0, promedioDisponible: '0.00', totalAcumulado: '0.00' },
    });
    mostrar(<SaldosVacacionesPage equipo />);
    await screen.findByText(/disponible estrictamente/);
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    await waitFor(() =>
      expect(api.opcionesEquipo).toHaveBeenCalledWith('vacaciones', expect.anything()),
    );
    expect(listar).not.toHaveBeenCalled();
    const departamento = screen.getByRole('combobox', { name: 'Departamento' });
    fireEvent.focus(departamento);
    fireEvent.change(departamento, { target: { value: 'Inexistente' } });
    expect(screen.queryByRole('option', { name: 'Ventas' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryAllByText('Cargando opciones…')).toHaveLength(0));
    expect(screen.queryByRole('button', { name: 'Configurar umbral' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprobar/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() =>
      expect(saldos.exportarSaldosEquipo).toHaveBeenCalledWith(expect.anything(), 'excel'),
    );
  });
  it('interruptores tienen tooltip, resumen real, motivo y confirmación antes de escribir', async () => {
    vi.mocked(listar).mockResolvedValue({
      registros: [{ id: 1, nombre: 'Comercial', activo: true, enUso: true }],
      total: 1,
      pagina: 1,
      limite: 100,
    });
    const datos = {
      jefatura: 'Comercial',
      equipo: 4,
      revision: 'a'.repeat(64),
      permisos: [
        {
          codigo: 'VER_EQUIPO' as const,
          nombre: 'Ver equipo',
          descripcion: 'Consulta los datos básicos del equipo.',
          activo: false,
        },
      ],
    };
    vi.mocked(api.consultarPermisos).mockResolvedValue(datos);
    vi.mocked(api.guardarPermisos).mockResolvedValue(datos);
    mostrar(
      <PermisosJefaturas
        cat={{ slug: 'jefaturas', titulo: 'Jefaturas', campos: [], legal: false }}
      />,
    );
    const elegir = screen.getByRole('combobox', { name: 'Jefatura' });
    fireEvent.focus(elegir);
    fireEvent.change(elegir, { target: { value: 'Comercial' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Comercial' }));
    await screen.findByText('Equipo: 4 personas');
    const interruptor = screen.getByRole('switch', { name: 'Ver equipo' });
    expect(interruptor).toHaveAttribute('title', 'Consulta los datos básicos del equipo.');
    fireEvent.click(interruptor);
    expect(interruptor).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo del cambio' }), {
      target: { value: 'Supervisión comercial' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar permisos' }));
    await screen.findByRole('dialog', { name: 'Confirmar permisos de jefatura' });
    expect(api.guardarPermisos).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(api.guardarPermisos).toHaveBeenCalledWith(1, {
        permisos: ['VER_EQUIPO'],
        motivo: 'Supervisión comercial',
        revision: 'a'.repeat(64),
        confirmado: true,
      }),
    );
  });
});
