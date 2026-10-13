import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MisDatosPage } from './pages/MisDatosPage';
import * as api from './api/solicitudes';
import { HelpProvider } from '../../components/help/HelpProvider';
vi.mock('../../app/session', () => ({ useSession: () => ({ usuario: { rol: 'EMPLEADO' } }) }));
vi.mock('./api/solicitudes', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  misDatos: vi.fn(),
  contacto: vi.fn(),
  crear: vi.fn(),
}));
const datos = {
  criticos: {
    nombres: 'Persona',
    apellidos: 'Prueba',
    dpi: '1234567890123',
    nit: '1234567-9',
    estadoCivil: 'SOLTERO',
  },
  contacto: {
    telefono: '55551234',
    direccion: 'Dirección de prueba',
    correo: 'persona@example.test',
    contactoNombre: 'Contacto Prueba',
    contactoParentesco: 'Madre',
    contactoTelefono: '55558888',
  },
};
function abrir() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <HelpProvider>
        <MisDatosPage />
      </HelpProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.misDatos).mockResolvedValue(datos);
  vi.mocked(api.contacto).mockResolvedValue({ actualizado: true });
  vi.mocked(api.crear).mockResolvedValue({ id: 1 });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
describe('Mis datos: máscaras y separación de contacto e identidad', () => {
  it('normaliza teléfonos enmascarados antes de guardar solo contacto', async () => {
    abrir();
    const campo = await screen.findByRole('textbox', { name: /^Teléfono$/ });
    expect(campo).toHaveValue('5555 1234');
    fireEvent.change(campo, { target: { value: '5555 9999abc' } });
    fireEvent.blur(campo);
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar contacto' }).closest('form')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(api.contacto).toHaveBeenCalledWith({ ...datos.contacto, telefono: '55559999' }),
    );
    expect(api.crear).not.toHaveBeenCalled();
  });
  it('normaliza DPI con espacios y envía propuesta sin editar el expediente', async () => {
    abrir();
    const campo = await screen.findByRole('textbox', { name: /^DPI$/ });
    expect(campo).toHaveValue('1234 56789 0123');
    fireEvent.change(campo, { target: { value: '9876 54321 0123xyz' } });
    fireEvent.blur(campo);
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Solicitar actualización de datos críticos' })
        .closest('form')!,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(api.crear).toHaveBeenCalledWith({
        tipo: 'ACTUALIZACION_DATOS',
        datos: { ...datos.criticos, dpi: '9876543210123' },
        confirmado: true,
      }),
    );
    expect(api.contacto).not.toHaveBeenCalled();
  });
});
