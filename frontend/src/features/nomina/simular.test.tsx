import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimularPagoPage } from './pages/SimularPagoPage';
import * as api from './api/nomina';
vi.mock('../../app/session', () => ({ useSession: () => ({ usuario: { rol: 'RH' } }) }));
vi.mock('../../components/help/HelpProvider', () => ({
  usePageHelp: () => {},
  DialogHelpButton: () => null,
}));
vi.mock('../../components/ui/Toast', () => ({ useToast: () => vi.fn() }));
vi.mock('../empresa/pages/AvisoEmpresa', () => ({
  AvisoEmpresa: () => null,
  useBloqueoFirma: () => '',
}));
vi.mock('./api/nomina', () => ({
  simular: vi.fn(),
  pagar: vi.fn(),
  previewPago: vi.fn(),
  zipPagos: vi.fn(),
  descargar: vi.fn(),
  boleta: vi.fn(),
}));
const resultado = {
  mes: '2026-10',
  tipoPago: 'ANTICIPO',
  fechaPago: '2026-10-15',
  hash: 'a'.repeat(64),
  registros: [
    {
      idEmpleado: 1,
      empleado: 'Persona Prueba',
      departamento: 'Ingeniería',
      idDepartamento: 1,
      resultado: {
        ingresos: '5250.00',
        descuentos: '0.00',
        neto: '5250.00',
        patronal: '0.00',
        devengado: '5250.00',
      },
      alertas: [],
      pagado: false,
    },
    {
      idEmpleado: 2,
      empleado: 'Persona Sin Horario',
      departamento: 'Ingeniería',
      idDepartamento: 1,
      resultado: null,
      alertas: ['Completa un horario vigente.'],
      pagado: false,
    },
  ],
  totales: { ingresos: '5250.00', descuentos: '0.00', neto: '5250.00', patronal: '0.00' },
  verificacion: {
    horasExtra: 0,
    comisiones: 1,
    consumos: 0,
    ausencias: 0,
    retroactivas: 0,
    conAlertas: 1,
  },
};
const montar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter>
        <SimularPagoPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
  vi.clearAllMocks();
  vi.mocked(api.simular).mockResolvedValue(resultado as api.Simulacion);
});
describe('A11: simulación guiada y confirmación', () => {
  it('R3-3: prestación atrasada queda pendiente y exige motivo antes de confirmar', async () => {
    const datos = {
      ...structuredClone(resultado),
      tipoPago: 'BONO_14',
      fechaPago: '2026-10-28',
      limitePago: '2026-07-15',
      extemporaneo: true,
      atrasadoDesde: '2026-07-16',
    };
    datos.registros = [datos.registros[0]!];
    vi.mocked(api.simular).mockResolvedValue(datos as api.Simulacion);
    vi.mocked(api.pagar).mockResolvedValue({
      idPeriodo: 1,
      pagados: [1],
      bloqueados: [],
      mensaje: 'Prestación pagada',
    });
    montar();
    fireEvent.focus(screen.getByRole('combobox', { name: 'Tipo de pago' }));
    fireEvent.click(screen.getByRole('option', { name: 'Bono 14' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simular' }));
    expect(await screen.findByText('Pendiente de pago (atrasado desde 16/07/2026)')).toBeVisible();
    expect(screen.getByText(/^Extemporáneo · Límite legal/)).toBeVisible();
    expect(screen.queryByText('Bloqueado')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    const confirmar = screen.getByRole('button', { name: 'Confirmar y pagar' });
    expect(confirmar).toBeDisabled();
    const campo = screen.getByRole('textbox', { name: 'Motivo del pago extemporáneo' });
    fireEvent.change(campo, { target: { value: 'corto' } });
    expect(confirmar).toBeDisabled();
    const motivo = 'Regularización de prestación pendiente de julio';
    fireEvent.change(campo, { target: { value: motivo } });
    expect(confirmar).toBeEnabled();
    fireEvent.click(confirmar);
    expect(screen.getByRole('dialog')).toHaveTextContent(motivo);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(api.pagar).toHaveBeenCalledWith(
        expect.objectContaining({ tipoPago: 'BONO_14', mes: '2026-07' }),
        datos.hash,
        motivo,
      ),
    );
  });
  it('R3-3: Anticipo y Pago mantienen el bloqueo por orden y una prestación duplicada no queda pendiente', async () => {
    const datos = {
      ...structuredClone(resultado),
      extemporaneo: true,
      atrasadoDesde: '2026-07-16',
      limitePago: '2026-07-15',
    };
    datos.registros = datos.registros.slice(1);
    Object.assign(datos.registros[0]!, {
      pagado: true,
      alertas: ['Este empleado ya tiene este pago registrado. No se permite pagarlo dos veces.'],
    });
    vi.mocked(api.simular).mockResolvedValue(datos as api.Simulacion);
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Simular' }));
    expect(await screen.findByText('Bloqueado')).toBeVisible();
    expect(screen.queryByText(/Pendiente de pago/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar y pagar' })).toBeDisabled();
  });
  it('sin días al 15 informa sin bloqueo, conserva los demás pagos y deshabilita su boleta', async () => {
    const datos = structuredClone(resultado);
    datos.registros[1]!.alertas = [];
    Object.assign(datos.registros[1]!, { informacion: 'Sin anticipo: ingresó después del día 15' });
    datos.verificacion.conAlertas = 0;
    vi.mocked(api.simular).mockResolvedValue(datos as api.Simulacion);
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Simular' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sin anticipo: ingresó después del día 15',
    );
    expect(screen.getByText('No corresponde')).toBeVisible();
    expect(screen.queryByText('Bloqueado')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Vista previa' })[1]).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Confirmar y pagar' })).toBeEnabled();
  });
  it('si todo el objetivo ingresó después del 15 no permite confirmar un pago cero', async () => {
    const datos = structuredClone(resultado);
    datos.registros = [{ ...datos.registros[1]!, alertas: [] }];
    Object.assign(datos.registros[0]!, { informacion: 'Sin anticipo: ingresó después del día 15' });
    vi.mocked(api.simular).mockResolvedValue(datos as api.Simulacion);
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Simular' }));
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Confirmar y pagar' })).toBeDisabled();
    expect(api.pagar).not.toHaveBeenCalled();
  });
  it('muestra el desglose automático sin exigir aperturas individuales ni bloquear la confirmación', async () => {
    const datos = structuredClone(resultado);
    Object.assign(datos.registros[0]!.resultado!, {
      estimacionFiscal: {
        renta: '92250.00',
        igss: '4347.00',
        isr: '2595.15',
        periodos: [
          {
            inicio: '2026-01-01',
            fin: '2026-09-30',
            renta: '92250.00',
            igss: '4347.00',
            isr: '2595.15',
            metodo: 'MENSUAL',
          },
        ],
      },
    });
    vi.mocked(api.simular).mockResolvedValue(datos as api.Simulacion);
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Simular' }));
    await screen.findByRole('heading', { name: 'Acumulados fiscales automáticos' });
    expect(screen.getByText(/historia faltante de 1 empleado/)).toBeVisible();
    fireEvent.click(screen.getByText('Ver desglose de acumulados calculados'));
    expect(screen.getAllByText('Q 92,250.00').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Confirmar y pagar' })).toBeEnabled();
    expect(api.pagar).not.toHaveBeenCalled();
  });
  it('Bono 14 está habilitado y selecciona julio antes de simular', async () => {
    montar();
    fireEvent.focus(screen.getByRole('combobox', { name: 'Tipo de pago' }));
    fireEvent.click(screen.getByRole('option', { name: 'Bono 14' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simular' }));
    await waitFor(() =>
      expect(api.simular).toHaveBeenCalledWith(
        expect.objectContaining({ tipoPago: 'BONO_14', mes: '2026-07' }),
      ),
    );
  });
  it('muestra alertas y totales reales y exige la casilla antes de pagar', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Simular' }));
    await screen.findByText('Persona Prueba');
    expect(screen.getByText('Completa un horario vigente.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar y pagar' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Vista previa' })[1]).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Confirmar y pagar' })).toBeEnabled();
    expect(api.pagar).not.toHaveBeenCalled();
  });
  it('cambiar mes retira simulación y confirmación', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Simular' }));
    await screen.findByText('Persona Prueba');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Mes del pago' }), {
      target: { value: '01' },
    });
    expect(screen.queryByText('Persona Prueba')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(api.pagar).not.toHaveBeenCalled();
  });
  it('confirmación final usa hash, evita doble envío y orienta si cambian las fuentes', async () => {
    montar();
    vi.mocked(api.pagar).mockRejectedValue(new Error('Cambiaron los datos. Simula nuevamente.'));
    fireEvent.click(screen.getByRole('button', { name: 'Simular' }));
    await screen.findByText('Persona Prueba');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y pagar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.pagar).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.pagar).mock.calls[0]?.[1]).toBe('a'.repeat(64));
    await screen.findByText('Cambiaron los datos. Simula nuevamente.');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
