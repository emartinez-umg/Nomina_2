import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { HelpProvider } from '../../components/help/HelpProvider';
import { ExpedientePanel } from './ExpedientePanel';
import * as api from './api';
const sesion = vi.hoisted(() => ({ rol: 'RH', idUsuario: 1 }));
vi.mock('../../app/session', () => ({ useSession: () => ({ usuario: sesion }) }));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  listar: vi.fn(),
  cargar: vi.fn(),
  archivo: vi.fn(),
  guardarArchivo: vi.fn(),
  baja: vi.fn(),
  configurarTipo: vi.fn(),
}));
vi.mock('../solicitudes/pages/PdfView', () => ({
  PdfView: ({ onDescargar }: { onDescargar: () => void }) => (
    <button onClick={onDescargar}>Descargar PDF</button>
  ),
}));
const tipo = { id: 1, nombre: 'DPI', obligatorio: true, requiereVencimiento: true };
const documento = {
  id: 10,
  idTipo: 1,
  version: 2,
  actual: true,
  activo: true,
  nombre: 'identidad.pdf',
  tipo: 'application/pdf',
  tamano: 1024,
  hash: 'a'.repeat(64),
  vencimiento: '2026-11-20',
  creado: '2026-10-29T10:00:00-06:00',
  motivoBaja: null,
  bajaEn: null,
  estado: 'Por vencer',
};
const datos = {
  maxMb: 10,
  avisoDias: 30,
  hoy: '2026-10-29',
  tipos: [tipo],
  completos: 1,
  requeridos: 1,
  actuales: [documento],
  historial: {
    registros: [documento, { ...documento, id: 9, actual: false, version: 1 }],
    total: 21,
    pagina: 1,
    limite: 20,
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sesion.rol = 'RH';
  vi.mocked(api.listar).mockResolvedValue(datos);
  vi.mocked(api.archivo).mockResolvedValue({
    nombre: 'identidad.pdf',
    tipo: 'application/pdf',
    base64: 'JVBERg==',
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={cliente}>
        <HelpProvider>
          <ExpedientePanel id={7} />
        </HelpProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return cliente;
}
describe('Expediente: interfaz protegida, versiones y carga guiada', () => {
  it('empleado solo tiene consulta/descarga y las descargas de la vista usan otra petición', async () => {
    sesion.rol = 'EMPLEADO';
    montar();
    await screen.findByText('Expediente 1 de 1');
    expect(screen.queryByRole('button', { name: 'Reemplazar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Configurar tipo' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await screen.findByRole('dialog');
    expect(api.archivo).toHaveBeenCalledWith(10, true);
    await userEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(api.archivo).toHaveBeenCalledWith(10));
    expect(api.guardarArchivo).toHaveBeenCalledTimes(1);
  });
  it('conserva historial y pide la página y tipo al servidor', async () => {
    montar();
    await screen.findByText('Expediente 1 de 1');
    await userEvent.click(screen.getByRole('button', { name: 'Historial' }));
    const modal = await screen.findByRole('dialog');
    expect(api.listar).toHaveBeenLastCalledWith(7, 1, 1, expect.any(AbortSignal));
    expect(within(modal).getByText('1')).toBeInTheDocument();
    await userEvent.click(within(modal).getByRole('button', { name: /siguiente/i }));
    await waitFor(() =>
      expect(api.listar).toHaveBeenLastCalledWith(7, 2, 1, expect.any(AbortSignal)),
    );
  });
  it('rechaza archivo grande y exige vencimiento antes de subir', async () => {
    montar();
    await screen.findByText('Expediente 1 de 1');
    await userEvent.click(screen.getByRole('button', { name: 'Reemplazar' }));
    const input = screen.getByLabelText(/^Archivo del expediente/, { selector: 'input' });
    const grande = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(input, { target: { files: [grande] } });
    expect(await screen.findByText(/supera 10 MB/)).toBeInTheDocument();
    const archivo = new File(['%PDF-1.7'], 'documento.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [archivo] } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar archivo' }));
    expect(
      await screen.findByText('Este documento requiere fecha de vencimiento.'),
    ).toBeInTheDocument();
    expect(api.cargar).not.toHaveBeenCalled();
  });
  it('arrastrar y soltar muestra progreso, conserva versión anterior y no duplica el envío', async () => {
    let resolver: () => void = () => {};
    vi.mocked(api.cargar).mockImplementation(
      async (_id, _tipo, _anterior, _vencimiento, _archivo, progreso) => {
        progreso(50);
        await new Promise<void>((r) => (resolver = r));
        return { id: 11, version: 3 };
      },
    );
    montar();
    await screen.findByText('Expediente 1 de 1');
    await userEvent.click(screen.getByRole('button', { name: 'Reemplazar' }));
    const file = new File(['%PDF-1.7'], 'nuevo.pdf', { type: 'application/pdf' });
    fireEvent.drop(screen.getByText('Arrastra un archivo aquí o selecciónalo.').parentElement!, {
      dataTransfer: { files: [file] },
    });
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Fecha de vencimiento/ }),
      '31122029',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar archivo' }));
    await screen.findByText('Cargando 50%');
    expect(screen.getByRole('button', { name: /Guardar archivo/ })).toBeDisabled();
    expect(api.cargar).toHaveBeenCalledTimes(1);
    expect(api.cargar).toHaveBeenCalledWith(7, 1, 10, '2029-12-31', file, expect.any(Function));
    resolver();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.stringify(localStorage)).not.toContain('%PDF');
  });
  it('baja exige motivo y confirmación, y expone el error del servidor sin cerrar', async () => {
    vi.mocked(api.baja).mockRejectedValue(new Error('Esta versión ya está dada de baja.'));
    montar();
    await screen.findByText('Expediente 1 de 1');
    await userEvent.click(screen.getByRole('button', { name: 'Dar de baja' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /^Motivo/ }),
      'Corrección documental',
    );
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Confirmo el cambio indicado' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(api.baja).toHaveBeenCalledWith(10, 'Corrección documental');
    expect(await screen.findByText('Esta versión ya está dada de baja.')).toBeInTheDocument();
  });
  it('retira los datos previos si la siguiente comprobación de acceso falla', async () => {
    const cliente = montar();
    await screen.findByText('Expediente 1 de 1');
    vi.mocked(api.listar).mockRejectedValue(new Error('Solo puedes consultar tus propios datos.'));
    await cliente.invalidateQueries({ queryKey: ['expedientes'] });
    await screen.findByText('Solo puedes consultar tus propios datos.');
    expect(screen.queryByText('identidad.pdf')).not.toBeInTheDocument();
  });
  it('configuración compara banderas y exige renovar la confirmación al modificarlas', async () => {
    vi.mocked(api.configurarTipo).mockResolvedValue({ id: 1 });
    montar();
    await screen.findByText('Expediente 1 de 1');
    await userEvent.click(screen.getByRole('button', { name: 'Configurar tipo' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /^Motivo/ }),
      'Política documental actualizada',
    );
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Confirmo el cambio indicado' }),
    );
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Obligatorio' }));
    expect(within(dialog).getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Confirmo el cambio indicado' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(api.configurarTipo).toHaveBeenCalledWith(
        { ...tipo, obligatorio: false },
        'Política documental actualizada',
      ),
    );
  });
});
