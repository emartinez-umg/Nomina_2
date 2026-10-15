import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { HelpProvider } from '../../components/help/HelpProvider';
import { ToastProvider } from '../../components/ui/Toast';
import { EmpresaPage } from './pages/EmpresaPage';
import { AvisoEmpresa } from './pages/AvisoEmpresa';
import * as api from './api/empresa';
vi.mock('../../app/session', () => ({
  useSession: () => ({ usuario: { idUsuario: 7, rol: 'RH' } }),
}));
vi.mock('./api/empresa', async (original) => ({
  ...(await original<typeof api>()),
  consultarEmpresa: vi.fn(),
  guardarEmpresa: vi.fn(),
  estadoEmpresa: vi.fn(),
}));
const empresa: api.Empresa = {
  id: 1,
  version: 1,
  razonSocial: 'Empresa',
  nombreComercial: null,
  nit: '1234567-9',
  direccion: 'Guatemala',
  telefono: '55551234',
  correo: 'empresa@example.test',
  sitioWeb: null,
  logo: null,
};
function abrir(componente = <EmpresaPage />) {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <HelpProvider>
          <ToastProvider>{componente}</ToastProvider>
        </HelpProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(api.consultarEmpresa).mockResolvedValue(empresa);
  vi.mocked(api.estadoEmpresa).mockResolvedValue({
    configurada: true,
    mensaje: null,
    firmante: { nombre: 'Ana Pérez', cargo: 'Jefa de RRHH' },
  });
});
describe('Configuración de empresa', () => {
  it('valida NIT, campos de contacto y sitio web', () => {
    const d = { ...empresa, nombreComercial: '', sitioWeb: '' };
    expect(api.formularioEmpresa.safeParse(d).success).toBe(true);
    for (const cambio of [
      { nit: '1234567-0' },
      { telefono: 'abc' },
      { correo: 'mal' },
      { sitioWeb: 'javascript:alert(1)' },
    ])
      expect(api.formularioEmpresa.safeParse({ ...d, ...cambio }).success).toBe(false);
  });
  it('valida tipo y 2 MB antes de leer/mostrar el logo', async () => {
    expect(api.validarArchivoLogo(new File(['x'], 'logo.txt', { type: 'text/plain' }))).toMatch(
      /PNG/,
    );
    expect(
      api.validarArchivoLogo(
        new File([new Uint8Array(2097153)], 'logo.png', { type: 'image/png' }),
      ),
    ).toMatch(/2 MB/);
    const logo = await api.leerLogo(new File(['svg'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(logo.mime).toBe('image/svg+xml');
    expect(logo.base64).toBe('c3Zn');
  });
  it('muestra datos reales, firma, vista previa y guarda por API con versión', async () => {
    vi.mocked(api.guardarEmpresa).mockResolvedValue({
      ...empresa,
      version: 2,
      nombreComercial: 'Nuevo nombre',
    });
    abrir();
    const campo = await screen.findByLabelText('Nombre comercial', { exact: true });
    fireEvent.change(campo, { target: { value: 'Nuevo nombre' } });
    expect(screen.getByText('Ana Pérez · Jefa de RRHH')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    await waitFor(() =>
      expect(api.guardarEmpresa).toHaveBeenCalledWith(
        expect.objectContaining({ version: 1, nombreComercial: 'Nuevo nombre' }),
      ),
    );
    await screen.findByText('Configuración de empresa guardada.');
    expect(Object.keys(localStorage).filter((k) => k.startsWith('nomina2:borrador:'))).toEqual([]);
  });
  it('avisa empresa incompleta y orienta sobre el perfil faltante', async () => {
    vi.mocked(api.estadoEmpresa).mockResolvedValue({
      configurada: false,
      mensaje: 'Falta configurar la empresa.',
      firmante: null,
    });
    abrir(<AvisoEmpresa firma />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta configurar la empresa');
    expect(
      screen.getByRole('link', { name: 'Abrir Configuración de empresa' }),
    ).toBeInTheDocument();
  });
});
