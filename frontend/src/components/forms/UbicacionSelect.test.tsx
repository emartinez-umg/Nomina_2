import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UbicacionSelect } from './UbicacionSelect';
import { ZonaSelect, zonaValida } from './ZonaSelect';
import type { UbicacionValor } from './UbicacionSelect';

const clientes: QueryClient[] = [];
const departamentos = [
  { id: 11, codigo: '01', nombre: 'Guatemala' },
  { id: 22, codigo: '03', nombre: 'Sacatepéquez' },
];
const municipios = [
  { id: 101, codigo: '0101', nombre: 'Guatemala', idDepartamentoGt: 11, departamento: 'Guatemala' },
  { id: 102, codigo: '0108', nombre: 'Mixco', idDepartamentoGt: 11, departamento: 'Guatemala' },
  {
    id: 301,
    codigo: '0301',
    nombre: 'Antigua Guatemala',
    idDepartamentoGt: 22,
    departamento: 'Sacatepéquez',
  },
];
function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: status === 200, data }), { status });
}
function envolver(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clientes.push(client);
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
function Controlado({
  inicial = { idDepartamentoGt: '', idMunicipioGt: '' },
  predeterminar = true,
}: {
  inicial?: UbicacionValor;
  predeterminar?: boolean;
}) {
  const [value, onChange] = useState(inicial);
  return (
    <>
      <UbicacionSelect value={value} onChange={onChange} predeterminar={predeterminar} />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const u = new URL(String(url), 'http://localhost');
      return respuesta(
        u.pathname.endsWith('departamentos')
          ? departamentos
          : municipios.filter(
              (m) => String(m.idDepartamentoGt) === u.searchParams.get('idDepartamentoGt'),
            ),
      );
    }),
  );
});
afterEach(() => clientes.splice(0).forEach((c) => c.clear()));
describe('UbicacionSelect reutilizable', () => {
  it('resuelve Guatemala / Guatemala por código INE sin asumir los IDs de Oracle', async () => {
    envolver(<Controlado />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('"idMunicipioGt":"101"'),
    );
    expect(screen.getByRole('combobox', { name: 'Departamento de Guatemala' })).toHaveValue(
      'Guatemala',
    );
    expect(screen.getByRole('combobox', { name: 'Municipio' })).toHaveValue('Guatemala');
  });
  it('busca sin acentos, limpia municipio al cambiar departamento y consulta solo sus municipios', async () => {
    envolver(<Controlado />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Municipio' })).toHaveValue('Guatemala'),
    );
    const dep = screen.getByRole('combobox', { name: 'Departamento de Guatemala' });
    await userEvent.click(dep);
    await userEvent.type(dep, 'sacatepe');
    await userEvent.click(screen.getByRole('option', { name: 'Sacatepéquez' }));
    const mun = screen.getByRole('combobox', { name: 'Municipio' });
    await waitFor(() => expect(mun).toBeEnabled());
    expect(mun).toHaveValue('');
    await userEvent.click(mun);
    expect(screen.queryByRole('option', { name: 'Mixco' })).toBeNull();
    await userEvent.type(mun, 'antigua');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('"idMunicipioGt":"301"');
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('idDepartamentoGt=22')),
    ).toBe(true);
  });
  it('no asigna valores por defecto a una ubicación histórica pendiente y detecta un par restaurado inválido', async () => {
    const r = envolver(<Controlado predeterminar={false} />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Departamento de Guatemala' })).toBeEnabled(),
    );
    expect(screen.getByRole('combobox', { name: 'Municipio' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('"idDepartamentoGt":""');
    r.unmount();
    envolver(
      <Controlado
        inicial={{ idDepartamentoGt: '22', idMunicipioGt: '101' }}
        predeterminar={false}
      />,
    );
    expect(
      await screen.findByText(
        'El municipio no pertenece al departamento seleccionado. Vuelve a seleccionarlo.',
      ),
    ).toBeInTheDocument();
  });
  it('muestra error recuperable al fallar la API y reintenta sin inventar opciones', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Sin conexión'));
    envolver(<Controlado />);
    expect(
      await screen.findByRole('button', { name: 'Reintentar ubicaciones' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar ubicaciones' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Municipio' })).toHaveValue('Guatemala'),
    );
  });
});
describe('ZonaSelect', () => {
  it('ofrece 1–25 y No aplica, exige zona solo en el municipio Guatemala y bloquea escritura libre', async () => {
    function Zona() {
      const [value, setValue] = useState('');
      return (
        <ZonaSelect codigoMunicipio="0101" name="zona" value={value} onValueChange={setValue} />
      );
    }
    envolver(<Zona />);
    const campo = screen.getByRole('combobox', { name: 'Zona' });
    expect(campo).toHaveAttribute('aria-required', 'true');
    await userEvent.click(campo);
    expect(screen.getAllByRole('option')).toHaveLength(26);
    await userEvent.click(screen.getByRole('option', { name: 'Zona 25' }));
    expect(campo).toHaveValue('Zona 25');
    expect(campo).toHaveAttribute('aria-invalid', 'false');
    expect(zonaValida('0108', '')).toBe(true);
    expect(zonaValida('0101', '')).toBe(false);
    for (const v of ['0', '26', '1.5', 'texto']) expect(zonaValida('0101', v)).toBe(false);
  });
});
