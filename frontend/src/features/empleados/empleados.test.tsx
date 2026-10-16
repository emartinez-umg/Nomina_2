import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { schemaFormulario, iniciales, cuerpo, todosCampos } from './api/formulario';
import { CampoEmpleado } from './pages/CampoEmpleado';
import { Credenciales } from './pages/Credenciales';
import { CargaMasivaPage } from './pages/CargaMasiva';
import { HelpProvider } from '../../components/help/HelpProvider';
import { nitValido, formatearNit } from '../../lib/validadores';
import { guardarCsrf } from '../../lib/http';
vi.mock('../../app/session', () => ({ useSession: () => ({ usuario: { rol: 'RH' } }) }));
const reglas = {
  hoy: '2026-10-12',
  edadMinima: 18,
  edadMaxima: 75,
  ultimoCierre: null,
  salarioMinimo: '4000.00',
};
const d = {
  ...iniciales(),
  codigo: 'EMP_001',
  nombres: 'Ana',
  apellidos: 'López',
  dpi: '1234 56789 0123',
  nit: '1234567-9',
  fechaNacimiento: '1995-05-15',
  sexo: 'F',
  estadoCivil: 'SOLTERO',
  idDepartamentoGt: '1',
  idMunicipioGt: '1',
  zona: '1',
  numeroCasa: '12-A',
  telefono: '5555 1234',
  correo: 'ana@example.test',
  idDepartamento: '1',
  idPuesto: '1',
  idTipoContrato: '1',
  idCentroTrabajo: '1',
  idHorario: '1',
  fechaIngreso: '2026-10-12',
  salarioBase: '5,000.01',
  contactoNombre: 'Persona Familiar',
  contactoParentesco: 'Hermano/a',
  contactoTelefono: '5555 4321',
};
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  guardarCsrf('csrf-prueba');
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
function envolver(ui: React.ReactNode) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={cliente}>
        <HelpProvider>{ui}</HelpProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
const ok = (data: unknown) =>
  new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
describe('Gestión de empleados: formularios y carga masiva', () => {
  it.each([
    ['1234567-9', true],
    ['6-K', true],
    ['6-k', true],
    ['123456-0', true],
    ['6-0', false],
    ['1234567-4', false],
    ['0-0', false],
  ])('NIT módulo 11 frontend: %s válido=%s', (nit, valid) => expect(nitValido(nit)).toBe(valid));
  it('sanea K solo al final y valida fin, zona y fecha predeterminada', () => {
    expect(formatearNit('6k!')).toBe('6-K');
    expect(formatearNit('K12a3K')).toBe('123-K');
    expect(iniciales(undefined, reglas.hoy).fechaIngreso).toBe(reglas.hoy);
    expect(schemaFormulario(reglas, false, true, '0101').safeParse(d).success).toBe(false);
    expect(
      schemaFormulario(reglas, false, true, '0101').safeParse({
        ...d,
        fechaFinContrato: '2027-01-01',
      }).success,
    ).toBe(true);
    expect(
      schemaFormulario(reglas, false, false, '0101').safeParse({
        ...d,
        fechaFinContrato: '2027-01-01',
      }).success,
    ).toBe(false);
    expect(
      schemaFormulario(reglas, false, false, '0101').safeParse({ ...d, zona: '' }).success,
    ).toBe(false);
    expect(
      schemaFormulario(reglas, false, false, '0102').safeParse({ ...d, zona: '' }).success,
    ).toBe(true);
  });
  it('valida campos enmascarados y envía dinero y teléfonos canónicos', () => {
    const parse = schemaFormulario(reglas).parse(d);
    expect(parse.salarioBase).toBe('5000.01');
    const body = cuerpo(parse);
    expect(body.dpi).toBe('1234567890123');
    expect(body.telefono).toBe('55551234');
    expect(body.idBanco).toBe(null);
    expect(body.idDepartamento).toBe(1);
  });
  it.each([
    { fechaNacimiento: '2027-01-01' },
    { fechaIngreso: '2010-01-01' },
    { fechaIngreso: '2026-11-12' },
    { fechaFinContrato: '2026-01-01' },
    { nit: '1234567-4' },
    { salarioBase: 'mal' },
    { idBanco: '1' },
  ])('muestra errores antes de enviar %j', (c) =>
    expect(schemaFormulario(reglas).safeParse({ ...d, ...c }).success).toBe(false),
  );
  it('edición exige motivo y omite salario y generación de usuario en su cuerpo', () => {
    const edit = { ...d, motivo: 'Corrección del contacto' };
    expect(schemaFormulario(reglas, true).safeParse(edit).success).toBe(true);
    const body = cuerpo(edit, true);
    expect(body).not.toHaveProperty('salarioBase');
    expect(body).not.toHaveProperty('generarUsuario');
    expect(schemaFormulario(reglas, true).safeParse({ ...edit, motivo: '' }).success).toBe(false);
  });
  it('sanea DPI y cuenta bancaria al escribir y pegar', async () => {
    const user = userEvent.setup();
    const campo = todosCampos.find((f) => f.nombre === 'cuentaBancaria')!;
    const onChange = vi.fn();
    render(
      <CampoEmpleado
        campo={campo}
        name={campo.nombre}
        label={campo.label}
        hint={campo.hint}
        value=""
        onValueChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Cuenta bancaria');
    await user.click(input);
    await user.paste('12 3!#ABC-45');
    expect(onChange).toHaveBeenLastCalledWith('123ABC-45');
  });
  it('credenciales permiten copiar y desaparecen al cerrar', async () => {
    const copiar = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: copiar },
      configurable: true,
    });
    const cerrar = vi.fn();
    const { rerender } = render(
      <Credenciales
        datos={[{ idUsuario: 1, usuario: 'ana.lopez', contrasenaTemporal: 'Temporal!2026' }]}
        onCerrar={cerrar}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copiar credenciales' }));
    await waitFor(() =>
      expect(copiar).toHaveBeenCalledWith(expect.stringContaining('Temporal!2026')),
    );
    expect(screen.getByRole('button', { name: 'Cerrar entrega' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Ya copié o descargué las credenciales'));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar entrega' }));
    expect(cerrar).toHaveBeenCalledOnce();
    rerender(<div />);
    expect(screen.queryByText('Temporal!2026')).not.toBeInTheDocument();
  });
  it('entrega un PDF una sola vez y bloquea cierre/Escape hasta confirmar', async () => {
    const cerrar = vi.fn();
    const crearUrl = vi.fn(() => 'blob:credenciales');
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = crearUrl;
        static revokeObjectURL = vi.fn();
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(
      <Credenciales
        datos={[{ idUsuario: 1, usuario: 'ana.lopez', contrasenaTemporal: 'Temporal!2026' }]}
        pdf={btoa('%PDF-prueba')}
        onCerrar={cerrar}
      />,
    );
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(cerrar).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Ya copié o descargué las credenciales')).toBeDisabled();
    const b = screen.getByRole('button', { name: 'Descargar PDF' });
    fireEvent.click(b);
    expect(crearUrl).toHaveBeenCalledOnce();
    expect(b).toBeDisabled();
    fireEvent.click(b);
    expect(crearUrl).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByLabelText('Ya copié o descargué las credenciales'));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar entrega' }));
    expect(cerrar).toHaveBeenCalledOnce();
  });
  it('CSV: vista previa con errores bloquea todo o nada y permite solo válidas', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (url) =>
      String(url).includes('/empresa/estado')
        ? ok({ configurada: true, mensaje: null, firmante: null })
        : ok({
            id: 7,
            filas: [
              { numero: 2, nombre: 'Ana Lopez', errores: {}, advertencias: [] },
              {
                numero: 3,
                nombre: 'Otra Persona',
                errores: { telefono: ['Usa 8 dígitos.'] },
                advertencias: [],
              },
            ],
          }),
    );
    envolver(<CargaMasivaPage />);
    const f = new File(['cabecera\nfila'], 'empleados.csv', { type: 'text/csv' });
    Object.defineProperty(f, 'text', { value: async () => 'cabecera\nfila' });
    fireEvent.change(screen.getByLabelText(/Archivo de empleados/, { selector: 'input' }), {
      target: { files: [f] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar y ver vista previa' }));
    await screen.findByText('Usa 8 dígitos.', { exact: false });
    expect(screen.getByRole('button', { name: 'Importar empleados' })).toBeDisabled();
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Solo filas válidas' }));
    expect(screen.getByRole('button', { name: 'Importar empleados' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Importar empleados' }));
    expect(screen.getByRole('dialog', { name: 'Confirmar alta masiva' })).toBeVisible();
    fetchMock.mockResolvedValueOnce(
      ok({ id: 7, importadas: 1, credenciales: [], pdfCredenciales: '' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('Importación completada');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/empleados/cargas/7/confirmar',
      expect.objectContaining({
        body: JSON.stringify({ modalidad: 'SOLO_VALIDAS', confirmado: true }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Descargar reporte de resultados' })).toBeVisible();
  });
});
