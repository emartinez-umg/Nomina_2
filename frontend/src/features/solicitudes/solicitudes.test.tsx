import * as parqueo from '../novedades/api/parqueo';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelpProvider } from '../../components/help/HelpProvider';
import { SolicitudDetalle } from './pages/SolicitudDetalle';
import * as api from './api/solicitudes';
import type { Detalle } from './api/solicitudes';
vi.mock('../novedades/api/parqueo', () => ({ tarifas: vi.fn() }));
vi.mock('../../app/session', () => ({
  useSession: () => ({ usuario: { idUsuario: 7, rol: 'RH' } }),
}));
vi.mock('./api/solicitudes', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  detalle: vi.fn(),
  resolver: vi.fn(),
  entregar: vi.fn(),
  documento: vi.fn(),
}));
vi.mock('./pages/PdfView', async () => {
  const { useEffect } = await import('react');
  return {
    PdfView: ({ onListo }: { onListo: () => void }) => {
      useEffect(onListo, [onListo]);
      return <p>Documento renderizado</p>;
    },
  };
});
const solicitud: Detalle = {
  codigo: 'PRUEBA_2026_0001',
  id: 1,
  idEmpleado: 1,
  empleado: 'Persona de prueba',
  tipo: 'CONSTANCIA_LABORAL',
  nombreTipo: 'Constancia laboral',
  generaPdf: 1,
  estado: 'EN_PROCESO',
  fecha: '2026-10-13',
  observaciones: 'Para trámite personal',
  motivo: null,
  datos: null,
  documento: null,
  historial: [
    {
      id: 1,
      anterior: null,
      estado: 'EN_PROCESO',
      fecha: '2026-10-13 08:00:00',
      actor: 'persona.prueba',
      motivo: null,
    },
  ],
};
function abrir(s: Detalle, empleado = false) {
  vi.mocked(api.detalle).mockResolvedValue(s);
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <HelpProvider>
        <SolicitudDetalle id={s.id} empleado={empleado} onCerrar={vi.fn()} />
      </HelpProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(parqueo.tarifas).mockResolvedValue([
    { id: 1, vehiculo: 'CARRO', monto: '100', desde: '2020-01-01', hasta: null },
  ]);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
describe('Gestiones: resolución, entrega y permisos en interfaz', () => {
  it('el empleado consulta historial sin acciones de resolución', async () => {
    abrir(solicitud, true);
    expect(await screen.findByText('Historial de cambios')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /documento/i })).toBeNull();
  });
  it('rechazar exige motivo antes de abrir confirmación', async () => {
    abrir(solicitud);
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    expect(screen.getAllByText(/al menos 5 caracteres/).length).toBeGreaterThan(0);
    expect(api.resolver).not.toHaveBeenCalled();
  });
  it('aprobada bloquea entrega hasta revisar preview y envía su hash', async () => {
    vi.mocked(api.documento).mockResolvedValue({
      nombre: 'constancia.pdf',
      mime: 'application/pdf',
      base64: btoa('%PDF-prueba'),
      sha256: 'a'.repeat(64),
    });
    vi.mocked(api.entregar).mockResolvedValue({ id: 1 });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:prueba'), revokeObjectURL: vi.fn() });
    abrir({ ...solicitud, estado: 'APROBADA', documento: 1 });
    const enviar = await screen.findByRole('button', { name: 'Enviar y entregar documento' });
    expect(enviar).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa del PDF' }));
    await waitFor(() => expect(enviar).toBeEnabled());
    fireEvent.click(enviar);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.entregar).toHaveBeenCalledWith(1, 'a'.repeat(64)));
  });
  it('rechazada muestra motivo sin permitir otra transición', async () => {
    abrir({ ...solicitud, estado: 'RECHAZADA', motivo: 'Completa la información.' });
    expect(await screen.findByText(/Motivo de rechazo: Completa/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /entrega/i })).toBeNull();
  });
  it('gafete aprobado admite entrega sin PDF', async () => {
    abrir({ ...solicitud, tipo: 'GAFETE', nombreTipo: 'Gafete', generaPdf: 0, estado: 'APROBADA' });
    expect(
      await screen.findByRole('button', { name: 'Confirmar entrega de la gestión' }),
    ).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Vista previa del PDF' })).toBeNull();
  });
  it('parqueo sin tarifa vigente bloquea aprobación y explica cómo completarla', async () => {
    vi.mocked(parqueo.tarifas).mockResolvedValue([]);
    abrir({ ...solicitud, tipo: 'PARQUEO', generaPdf: 0, vehiculo: 'CARRO' });
    await screen.findByText('Configura una tarifa mensual vigente única para este vehículo.');
    expect(screen.getByText(/Sin tarifa vigente/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeDisabled();
    expect(api.resolver).not.toHaveBeenCalled();
  });
  it('parqueo usa el vehículo solicitado y bloquea doble envío al confirmar', async () => {
    vi.mocked(api.resolver).mockImplementation(() => new Promise(() => {}));
    abrir({
      ...solicitud,
      tipo: 'PARQUEO',
      nombreTipo: 'Parqueo',
      generaPdf: 0,
      vehiculo: 'CARRO',
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aprobar' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(screen.getByText(/tarifa mensual de Q 100.00/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /Tarifa por quincena/ })).toBeNull();
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    fireEvent.click(confirmar);
    await waitFor(() => expect(confirmar).toBeDisabled());
    expect(api.resolver).toHaveBeenCalledTimes(1);
  });
});
