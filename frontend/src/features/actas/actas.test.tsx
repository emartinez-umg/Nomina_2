import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelpProvider } from '../../components/help/HelpProvider';
import { ActaDetallePage } from './ActaDetalle';
import { ActasPage } from './ActasListado';
import { ActaFormularioPage } from './ActaFormulario';
import { opcionesNavegacion } from '../../components/layout/navigation.config';
import * as api from './api';
const sesion = vi.hoisted(() => ({ rol: 'RH', idUsuario: 1 }));
vi.mock('../../app/session', () => ({ useSession: () => ({ usuario: sesion }) }));
vi.mock('../../app/titulos', () => ({ useTituloRegistro: () => {} }));
vi.mock('../../lib/http', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  solicitar: vi.fn().mockResolvedValue([
    { value: '1', label: 'Ingeniería' },
    { value: '2', label: 'Ventas' },
  ]),
}));
vi.mock('../empleados/api/empleados', () => ({
  seleccionarEmpleados: vi.fn().mockResolvedValue({
    registros: [
      {
        value: '2',
        codigo: 'EMP_ING_0001',
        nombre: 'Persona Apellido',
        departamento: 'Ingeniería',
        idDepartamento: 1,
        estado: 'ACTIVO',
      },
    ],
    total: 1,
    pagina: 1,
    limite: 20,
    seleccionado: { value: '2', idDepartamento: 1 },
  }),
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  detalle: vi.fn(),
  listar: vi.fn(),
  reglas: vi.fn(),
  accion: vi.fn(),
  cargar: vi.fn(),
  archivo: vi.fn(),
  antecedentes: vi.fn(),
  guardar: vi.fn(),
}));
vi.mock('../solicitudes/pages/PdfView', () => ({ PdfView: () => <p>Vista del PDF</p> }));
const acta = {
  id: 1,
  codigo: 'ACT_2026_0001',
  idEmpleado: 2,
  idDepartamento: 1,
  idTipo: 1,
  fechaHecho: '2026-10-29',
  lugar: 'Sede',
  descripcion: 'Descripción del hecho que supera treinta caracteres para documentar.',
  testigos: 'Testigo Uno',
  norma: 'Norma de trabajo',
  medida: 'Medida adoptada',
  descargos: '',
  diasSuspension: 0,
  version: 1,
  estado: 'EMITIDA',
  empleado: 'Persona Apellido',
  departamento: 'Ingeniería',
  tipo: 'Amonestación escrita',
  gravedad: 'MODERADA',
  suspension: 0,
  emisorNombre: 'Emisora Apellido',
  emisorCargo: 'Analista RH',
  emitidaEn: '2026-10-29 10:30:00',
  motivoAnulacion: null,
  idAusencia: null,
  adjuntos: [],
  historial: [
    {
      id: 1,
      anterior: null,
      estado: 'EMITIDA',
      motivo: null,
      testigos: null,
      actor: 'Emisora Apellido',
      fecha: '2026-10-29 10:30:00',
    },
  ],
};
const reglas = {
  hoy: '2026-10-29',
  maxDias: 8,
  maxMb: 10,
  codigo: 'ACT_2026_0002',
  tipos: [
    { id: 1, nombre: 'Amonestación escrita', gravedad: 'MODERADA', suspension: 0 },
    { id: 2, nombre: 'Suspensión sin goce', gravedad: 'GRAVE', suspension: 1 },
  ],
};
function montar(page: 'detalle' | 'lista' | 'formulario', url?: string) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter
      initialEntries={[
        url ??
          (page === 'detalle'
            ? '/actas/1'
            : page === 'formulario'
              ? '/actas/nueva?empleado=2'
              : '/actas'),
      ]}
    >
      <QueryClientProvider client={c}>
        <HelpProvider>
          <Routes>
            <Route path="/actas/1" element={<ActaDetallePage />} />
            <Route path="/actas" element={<ActasPage />} />
            <Route path="/actas/nueva" element={<ActaFormularioPage />} />
          </Routes>
        </HelpProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sesion.rol = 'RH';
  vi.mocked(api.detalle).mockResolvedValue(acta);
  vi.mocked(api.reglas).mockResolvedValue(reglas);
  vi.mocked(api.listar).mockResolvedValue({ registros: [acta], pagina: 1, limite: 20, total: 1 });
  vi.mocked(api.antecedentes).mockResolvedValue({
    registros: [acta],
    pagina: 1,
    limite: 20,
    total: 1,
    ingreso: '2020-01-01',
  });
  vi.mocked(api.accion).mockResolvedValue({ id: 1 });
  vi.mocked(api.cargar).mockResolvedValue({ id: 1 });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
describe('C8: interfaz de actas con permisos y confirmaciones', () => {
  it('solo muestra consulta al empleado; el jefe no recibe gestión por permisos de equipo', async () => {
    sesion.rol = 'EMPLEADO';
    montar('detalle');
    await screen.findByRole('heading', { name: 'Acta ACT_2026_0001' });
    expect(screen.queryByRole('button', { name: 'Adjuntar firma' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver PDF' })).toBeVisible();
    expect(api.reglas).not.toHaveBeenCalled();
    const jefe = opcionesNavegacion('EMPLEADO', [
      'VER_EQUIPO',
      'VER_COMISIONES_EQUIPO',
      'VER_VACACIONES_EQUIPO',
    ]);
    expect(jefe.some((x) => x.ruta === '/actas')).toBe(false);
    expect(jefe.some((x) => x.ruta === '/mis-gestiones/actas')).toBe(true);
  });
  it('bloquea editar una emitida y requiere testigos/confirmación para la negativa', async () => {
    const u = userEvent.setup();
    montar('detalle');
    expect(await screen.findByRole('button', { name: 'Editar' })).toBeDisabled();
    await u.click(screen.getByRole('button', { name: 'Se negó a firmar' }));
    const modal = screen.getByRole('dialog');
    await u.click(within(modal).getByRole('checkbox'));
    await u.click(within(modal).getByRole('button', { name: 'Registrar negativa de firma' }));
    expect(api.accion).not.toHaveBeenCalled();
    await u.type(
      within(modal).getByRole('textbox', { name: 'Testigos de la negativa' }),
      'Ana y Juan, presentes',
    );
    await u.click(within(modal).getByRole('button', { name: 'Registrar negativa de firma' }));
    await waitFor(() =>
      expect(api.accion).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          accion: 'NEGATIVA',
          testigos: 'Ana y Juan, presentes',
          confirmado: true,
          version: 1,
        }),
      ),
    );
  });
  it('suspensión ofrece ausencia y envía fecha únicamente con confirmación explícita', async () => {
    vi.mocked(api.detalle).mockResolvedValue({
      ...acta,
      estado: 'BORRADOR',
      emitidaEn: null,
      idTipo: 2,
      suspension: 1,
      diasSuspension: 2,
    });
    const u = userEvent.setup();
    montar('detalle');
    await u.click(await screen.findByRole('button', { name: 'Emitir acta' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Emitir acta' })).toBeDisabled();
    await u.click(within(dialog).getByLabelText(/Registrar también/));
    expect(within(dialog).getByText(/Se creará una ausencia aprobada de 2/)).toBeVisible();
    await u.click(within(dialog).getByLabelText(/Confirmo que revisé/));
    await u.click(within(dialog).getByRole('button', { name: 'Emitir acta' }));
    await waitFor(() =>
      expect(api.accion).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          accion: 'EMITIR',
          registrarAusencia: true,
          fechaInicio: '2026-10-29',
        }),
      ),
    );
  });
  it('el escaneo requiere archivo y confirmación; usa carga binaria fuera del borrador', async () => {
    const u = userEvent.setup();
    montar('detalle');
    await u.click(await screen.findByRole('button', { name: 'Adjuntar firma' }));
    const dialog = screen.getByRole('dialog');
    await u.upload(
      within(dialog).getByLabelText(/^Escaneo del acta firmada/, { selector: 'input' }),
      new File(['png'], 'firma.png', { type: 'image/png' }),
    );
    expect(within(dialog).getByRole('button', { name: 'Guardar firma' })).toBeDisabled();
    await u.click(within(dialog).getByRole('checkbox'));
    await u.click(within(dialog).getByRole('button', { name: 'Guardar firma' }));
    await waitFor(() =>
      expect(api.cargar).toHaveBeenCalledWith(
        1,
        1,
        'FIRMA',
        expect.any(File),
        expect.any(Function),
      ),
    );
    expect(localStorage.length).toBe(0);
  });
  it('retira el contenido si la siguiente consulta deniega autorización', async () => {
    vi.mocked(api.detalle).mockRejectedValue(new Error('Solo puedes consultar tus propios datos.'));
    montar('detalle');
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo puedes');
    expect(screen.queryByText(acta.descripcion)).not.toBeInTheDocument();
  });
  it('listado conserva filtros y pagina desde el servidor', async () => {
    montar('lista', '/actas?estado=EMITIDA&idDepartamento=1');
    await screen.findByRole('button', { name: 'Consultar ACT_2026_0001' });
    expect(vi.mocked(api.listar).mock.calls[0]![0].get('idDepartamento')).toBe('1');
    expect(screen.getByRole('button', { name: 'Estado: Emitida' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() =>
      expect(vi.mocked(api.listar).mock.calls.at(-1)![0].has('estado')).toBe(false),
    );
  });
  it('formulario muestra antecedentes reales y valida descripción al salir del campo', async () => {
    const u = userEvent.setup();
    montar('formulario');
    await screen.findByRole('heading', { name: 'Antecedentes de los últimos 12 meses' });
    expect(await screen.findByText(/1 acta\(s\)/)).toBeVisible();
    const desc = screen.getByRole('textbox', { name: 'Descripción de los hechos' });
    await u.type(desc, 'Corto');
    await u.tab();
    expect((await screen.findAllByText('Escribe al menos 30 caracteres.')).length).toBeGreaterThan(
      0,
    );
    expect(api.guardar).not.toHaveBeenCalled();
  });
});
