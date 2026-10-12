import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import catalogos from './catalogos.fixture.json';
import { catalogoSchema, csv, filaSchema } from './api/catalogos';
import { cuerpo, schemaFormulario, valoresIniciales } from './api/validacion';
import { listarTodos } from './pages/CatalogosPage';
import { CatalogoFormulario } from './pages/CatalogoFormulario';
import { HelpProvider } from '../../components/help/HelpProvider';
import { ToastProvider } from '../../components/ui/Toast';
import { guardarCsrf } from '../../lib/http';
const cat = (slug: string) =>
  catalogoSchema.parse({
    ...catalogos.find((c) => c.slug === slug),
    legal: !!catalogos.find((c) => c.slug === slug)?.legal,
  });
const actual = filaSchema.parse({
  id: 1,
  activo: true,
  enUso: false,
  codigo: 'TASA',
  nombre: 'Tasa de prueba',
  valor: '4.83',
  unidad: 'PORCENTAJE',
  vigenteDesde: '2026-01-01',
  vigenteHasta: null,
  fundamento: 'Norma de referencia',
});
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  guardarCsrf('csrf-prueba');
});
describe('Catálogos: validación y formularios', () => {
  it('valida las definiciones de la API y conserva el dinero como texto decimal', () => {
    for (const c of catalogos)
      expect(catalogoSchema.safeParse({ ...c, legal: !!c.legal }).success).toBe(true);
    const c = cat('puestos');
    const d = valoresIniciales(c);
    Object.assign(d, {
      codigo: 'PUESTO',
      nombre: 'Puesto',
      idDepartamento: '1',
      salarioMinimo: '1,234.56',
      salarioMaximo: '1,234.57',
    });
    expect(schemaFormulario(c, null).safeParse(d).success).toBe(true);
    expect(cuerpo(c, d).salarioMinimo).toBe('1234.56');
    d.salarioMaximo = '1,234.55';
    expect(schemaFormulario(c, null).safeParse(d).success).toBe(false);
  });
  it('bloquea vigencia cerrada y porcentaje inválido antes de enviar', () => {
    const c = cat('parametros-legales'),
      d = valoresIniciales(c, actual);
    expect(schemaFormulario(c, '2026-01-15').safeParse(d).success).toBe(false);
    d.vigenteDesde = '2027-01-01';
    d.valor = '101';
    expect(schemaFormulario(c, null).safeParse(d).success).toBe(false);
    d.valor = 'abc';
    expect(schemaFormulario(c, null).safeParse(d).success).toBe(false);
  });
  it('exige días laborables con entrada/salida coherentes y respeta medianoche', () => {
    const c = cat('horarios'),
      d = valoresIniciales(c);
    Object.assign(d, { codigo: 'NOCHE', nombre: 'Horario', jornada: 'NOCTURNA' });
    expect(schemaFormulario(c, null).safeParse(d).success).toBe(false);
    const dias = JSON.parse(d.dias!) as {
      laborable: boolean;
      entrada: string;
      salida: string;
      cruzaMedianoche: boolean;
    }[];
    Object.assign(dias[0]!, {
      laborable: true,
      entrada: '22:00',
      salida: '05:00',
      cruzaMedianoche: true,
    });
    d.dias = JSON.stringify(dias);
    expect(schemaFormulario(c, null).safeParse(d).success).toBe(true);
  });
  it('muestra anterior/nuevo y exige motivo antes de confirmar el cambio legal', async () => {
    const cerrar = vi.fn();
    const c = cat('parametros-legales');
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { ...actual, valor: '5' } }), { status: 200 }),
    );
    const cliente = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={cliente}>
        <ToastProvider>
          <HelpProvider>
            <CatalogoFormulario cat={c} actual={actual} cierre={null} onCerrar={cerrar} />
          </HelpProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText(/^Valor/), { target: { value: '5' } });
    await userEvent.click(screen.getByRole('button', { name: 'Revisar cambio' }));
    expect(
      await screen.findByText('ADVERTENCIA · Cambio de parametrización legal'),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Anterior' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nuevo' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio legal' }));
    expect(
      await screen.findByText('Explica el motivo con al menos 5 caracteres.'),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/^Motivo del cambio/), 'Aprobación de la tasa');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio legal' }));
    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce());
    const llamada = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String(llamada[1]?.body))).toMatchObject({
      valor: '5',
      motivo: 'Aprobación de la tasa',
      confirmado: true,
    });
    cliente.clear();
  });
  it('exporta todos los resultados recorriendo las páginas del servidor', async () => {
    const filas = Array.from({ length: 101 }, (_, i) =>
      filaSchema.parse({
        id: i + 1,
        activo: true,
        enUso: false,
        codigo: `DEP_${i}`,
        nombre: `Departamento ${i}`,
        descripcion: null,
      }),
    );
    vi.mocked(fetch).mockImplementation(async (url) => {
      const pagina = Number(new URL(String(url), 'http://localhost').searchParams.get('pagina'));
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            registros: filas.slice((pagina - 1) * 100, pagina * 100),
            total: 101,
            pagina,
            limite: 100,
          },
        }),
        { status: 200 },
      );
    });
    expect(
      await listarTodos('departamentos', { activo: '1', nombre: 'Departamento' }),
    ).toHaveLength(101);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetch).mock.calls[1]![0])).toContain('pagina=2');
    expect(String(vi.mocked(fetch).mock.calls[1]![0])).toContain('nombre=Departamento');
  });
  it('escapa fórmulas, comillas y saltos de línea al exportar CSV', () => {
    const c = cat('departamentos');
    const fila = filaSchema.parse({
      id: 1,
      activo: true,
      enUso: false,
      codigo: 'CSV',
      nombre: '=SUM(A1)',
      descripcion: 'Texto "citado"\nsegunda línea',
    });
    const resultado = csv(c, [fila]);
    expect(resultado).toContain("' =".replace(' ', ''));
    expect(resultado).toContain('""citado""');
    expect(resultado).toContain('segunda línea');
  });
});
