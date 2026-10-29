import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelpProvider } from '../../components/help/HelpProvider';
import { ToastProvider } from '../../components/ui/Toast';
import { Resolver } from './pages/VacacionesPage';
import { InsigniaColisiones, PanelColisiones } from './components/PanelColisiones';
import * as api from './api/vacaciones';
const sesion = vi.hoisted(() => ({ rol: 'RH' }));
vi.mock('../../app/session', () => ({
  useSession: () => ({ usuario: { idUsuario: 7, rol: sesion.rol } }),
}));
vi.mock('./api/vacaciones', async (original) => ({
  ...(await original<typeof api>()),
  detalle: vi.fn(),
  colisiones: vi.fn(),
  resolver: vi.fn(),
}));
const fila: api.Fila = {
  codigo: 'SOL_2026_0001',
  id: 1,
  idEmpleado: 1,
  empleado: 'Titular López',
  inicio: '2026-11-02',
  fin: '2026-11-03',
  dias: '2',
  diasRegistrados: '2',
  saldoAlSolicitar: '5',
  saldoAlResolver: null,
  estado: 'EN_PROCESO',
  motivo: null,
  saldo: null,
  puedeCancelar: false,
  solicitadoPor: 'Titular López',
  solicitadoEn: '2026-10-29 08:00:00',
  aprobadoPor: null,
  aprobadoEn: null,
  canceladoPor: null,
  canceladoEn: null,
  motivoCancelacion: null,
  disponible: '5',
  solicitables: 5,
  alcanza: true,
  puedeAprobar: true,
  bloqueo: null,
  cantidadColisiones: 1,
};
const informe = {
  idSolicitud: 1,
  inicio: fila.inicio,
  fin: fila.fin,
  revision: 'a'.repeat(64),
  aprobacion: null,
  colisiones: [
    {
      idSolicitud: 2,
      codigoSolicitud: 'SOL_2026_0002',
      idEmpleado: 2,
      empleado: 'Ana López',
      codigo: 'EMP_ING_0002',
      departamento: 'Ingeniería',
      centro: null,
      inicio: '2026-11-01',
      fin: '2026-11-04',
      inicioCoincidencia: fila.inicio,
      finCoincidencia: fila.fin,
      diasCoincidentes: 2,
      estado: 'EN_PROCESO' as const,
      tipoCoincidencia: 'Mismo departamento' as const,
    },
  ],
  ocupacion: { tamanoEquipo: 5, maximoAusentes: 2, fechaMaximo: fila.inicio },
  lineaTiempo: [
    { fecha: fila.inicio, aprobadas: 0, enProceso: 2, ausentes: 2 },
    { fecha: fila.fin, aprobadas: 0, enProceso: 2, ausentes: 2 },
  ],
};
function abrir(estado: 'VER' | 'APROBADA' = 'APROBADA') {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <HelpProvider>
        <ToastProvider>
          <Resolver fila={fila} estado={estado} cerrar={vi.fn()} resuelto={vi.fn()} />
        </ToastProvider>
      </HelpProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sesion.rol = 'RH';
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.mocked(api.detalle).mockResolvedValue(fila);
  vi.mocked(api.colisiones).mockResolvedValue(informe);
  vi.mocked(api.resolver).mockResolvedValue({ id: 1 });
});
describe('R3-6: advertencia y confirmación de colisiones', () => {
  it('presenta lista, ocupación, días naturales, estado legible y línea de tiempo accesible', () => {
    render(<PanelColisiones informe={informe} />);
    expect(screen.getByRole('region', { name: 'Advertencia de colisiones' })).toBeVisible();
    expect(screen.getByText('Máximo de personas ausentes: 2 de 5')).toBeVisible();
    expect(screen.getByText(/2 días coincidentes/)).toBeVisible();
    expect(screen.getByText(/Sin centro de trabajo/)).toBeVisible();
    expect(screen.getByText('En proceso', { exact: true, selector: 'span' })).toBeVisible();
    expect(screen.getByRole('figure', { name: 'Línea de tiempo de colisiones' })).toBeVisible();
    fireEvent.click(screen.getByText('Ver ocupación por día'));
    expect(screen.getByRole('table')).toBeVisible();
  });
  it('explica la insignia al recibir foco', () => {
    render(<InsigniaColisiones cantidad={3} />);
    const texto = screen.getByText('⚠ 3 colisiones');
    fireEvent.focus(texto.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('3 solicitudes de otros empleados');
  });
  it('aprobar de todos modos exige el clic explícito y envía la revisión consultada', async () => {
    abrir();
    const boton = await screen.findByRole('button', {
      name: 'Aprobar de todos modos',
    });
    await waitFor(() => expect(boton).toBeEnabled());
    expect(api.resolver).not.toHaveBeenCalled();
    fireEvent.click(boton);
    await waitFor(() =>
      expect(api.resolver).toHaveBeenCalledWith(1, 'APROBADA', '', informe.revision),
    );
  });
  it('el saldo insuficiente sigue bloqueando aunque existan colisiones', async () => {
    vi.mocked(api.detalle).mockResolvedValue({
      ...fila,
      disponible: '0',
      solicitables: 0,
      alcanza: false,
      puedeAprobar: false,
      bloqueo: 'Saldo insuficiente',
    });
    abrir();
    const boton = await screen.findByRole('button', {
      name: 'Aprobar de todos modos',
    });
    expect(boton).toBeDisabled();
    fireEvent.click(boton);
    expect(api.resolver).not.toHaveBeenCalled();
  });
  it('una consulta fallida bloquea aprobar hasta revisar las colisiones', async () => {
    vi.mocked(api.colisiones).mockRejectedValue(new Error('No hay conexión'));
    abrir();
    expect(await screen.findByText('No se pudieron revisar las colisiones')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });
  it('sin colisiones conserva la confirmación habitual', async () => {
    vi.mocked(api.colisiones).mockResolvedValue({ ...informe, colisiones: [] });
    abrir();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.resolver).toHaveBeenCalledWith(1, 'APROBADA', '', undefined));
  });
  it('el detalle del empleado no consulta ni renderiza colisiones', async () => {
    sesion.rol = 'EMPLEADO';
    abrir('VER');
    expect(await screen.findByText(/Días registrados/)).toBeVisible();
    expect(api.colisiones).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Advertencia de colisiones' })).toBeNull();
    expect(screen.queryByText('Ana López')).toBeNull();
  });
});
