import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaldosVacacionesPage } from './pages/SaldosVacacionesPage';
import * as api from './api/saldos';
vi.mock('../../components/help/HelpProvider', () => ({ usePageHelp: vi.fn() }));
vi.mock('./api/saldos', async (original) => ({
  ...(await original<typeof api>()),
  listarSaldos: vi.fn(),
  exportarSaldos: vi.fn(),
}));
vi.mock('../catalogos/api/catalogos', () => ({
  listar: vi.fn(async () => ({ registros: [], total: 0, pagina: 1, limite: 100 })),
}));
const fila = {
  id: 1,
  codigo: 'EMP_ING_0001',
  nombre: 'Ana Pérez',
  departamento: 'Ingeniería',
  centro: 'Central',
  jefatura: 'Operaciones',
  ingreso: '2025-01-01',
  activo: true,
  corte: '2026-10-29',
  mesesCompletos: 21,
  acumulado: '26.25',
  tomados: '11.00',
  previas: '0.00',
  disponible: '15.25',
  solicitables: 15,
  alerta: true,
};
const datos = {
  registros: [
    fila,
    {
      ...fila,
      id: 2,
      codigo: 'EMP_ING_0002',
      nombre: 'Luis Soto',
      disponible: '15.00',
      alerta: false,
    },
  ],
  total: 22,
  pagina: 1,
  limite: 10,
  corte: '2026-10-29',
  umbral: '15',
  idParametro: 8,
  etiquetaAlerta: 'Más de 15 días',
  indicadores: { empleadosAlerta: 1, promedioDisponible: '15.12', totalAcumulado: '52.50' },
};
function Ubicacion() {
  return <output aria-label="URL actual">{useLocation().search}</output>;
}
function abrir(url = '/vacaciones/saldos') {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[url]}>
        <SaldosVacacionesPage />
        <Ubicacion />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listarSaldos).mockResolvedValue(datos);
});
describe('R3-7: saldos de vacaciones', () => {
  it('muestra indicadores globales y distingue alerta por fila, ícono y etiqueta', async () => {
    abrir();
    await screen.findByText('Ana Pérez');
    expect(screen.getByText('Ana Pérez').closest('tr')).toHaveClass('saldo-vacaciones-alerta');
    expect(screen.getByText('Luis Soto').closest('tr')).not.toHaveClass('saldo-vacaciones-alerta');
    expect(screen.getByText('Más de 15 días')).toBeVisible();
    expect(screen.getByText('Más de 15 días').querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('52.50')).toBeVisible();
    expect(screen.getByText('15.12')).toBeVisible();
  });
  it('recibe el enlace filtrado del dashboard y envía búsqueda, orden y página a la API', async () => {
    abrir('/vacaciones/saldos?soloAlerta=true&activos=true');
    await screen.findByText('Ana Pérez');
    expect(api.listarSaldos).toHaveBeenLastCalledWith(
      expect.objectContaining({ soloAlerta: 'true', activos: 'true' }),
      expect.anything(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(api.listarSaldos).toHaveBeenLastCalledWith(
        expect.objectContaining({ pagina: '2' }),
        expect.anything(),
      ),
    );
    fireEvent.change(screen.getByLabelText('Buscar nombre o código'), {
      target: { value: 'EMP_ING' },
    });
    await waitFor(() =>
      expect(api.listarSaldos).toHaveBeenLastCalledWith(
        expect.objectContaining({ buscar: 'EMP_ING', pagina: '1' }),
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Disponible$/ }));
    await waitFor(() =>
      expect(api.listarSaldos).toHaveBeenLastCalledWith(
        expect.objectContaining({ ordenarPor: 'disponible', direccion: 'asc' }),
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() =>
      expect(api.listarSaldos).toHaveBeenLastCalledWith(
        expect.objectContaining({ activos: 'todos', pagina: '1' }),
        expect.anything(),
      ),
    );
    expect(screen.getByLabelText('URL actual')).not.toHaveTextContent('soloAlerta');
  });
  it('exporta los mismos filtros y ofrece recuperación ante errores', async () => {
    vi.mocked(api.exportarSaldos).mockRejectedValue(new Error('No se pudo exportar'));
    abrir('/vacaciones/saldos?soloAlerta=true');
    await screen.findByText('Ana Pérez');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() =>
      expect(api.exportarSaldos).toHaveBeenCalledWith(
        expect.objectContaining({ soloAlerta: 'true' }),
        'excel',
      ),
    );
  });
  it('estado vacío y error no presentan saldos inventados', async () => {
    vi.mocked(api.listarSaldos).mockRejectedValue(new Error('Configura el umbral vigente.'));
    abrir();
    await screen.findByText('Configura el umbral vigente.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(screen.queryByText('15.25')).not.toBeInTheDocument();
  });
});
