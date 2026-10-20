import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectorEmpleado } from './SelectorEmpleado';

const empleados = [
  {
    value: '1',
    codigo: 'EMP_ING_0001',
    nombre: 'Ana Peña',
    idDepartamento: 10,
    departamento: 'Ingeniería',
    estado: 'ACTIVO',
  },
  {
    value: '2',
    codigo: 'EMP_VEN_0001',
    nombre: 'Luis López',
    idDepartamento: 20,
    departamento: 'Ventas',
    estado: 'ACTIVO',
  },
  {
    value: '3',
    codigo: 'EMP_ING_0002',
    nombre: 'Eva Gil',
    idDepartamento: 10,
    departamento: 'Ingeniería',
    estado: 'EGRESADO',
  },
];
const clientes: QueryClient[] = [];
function Controlado({ inicial = '', departamento = '', soloActivos = true, seleccionActual = '' }) {
  const [value, onValueChange] = useState(inicial);
  const [dep, setDep] = useState(departamento);
  return (
    <>
      <select aria-label="Departamento" value={dep} onChange={(e) => setDep(e.target.value)}>
        <option value="">Todos</option>
        <option value="10">Ingeniería</option>
        <option value="20">Ventas</option>
        <option value="30">Vacío</option>
      </select>
      <SelectorEmpleado
        name="empleado"
        label="Empleado"
        hint="Expediente."
        value={value}
        onValueChange={onValueChange}
        departamentoId={dep}
        soloActivos={soloActivos}
        seleccionActual={seleccionActual}
      />
      <output aria-label="Selección">{value}</output>
    </>
  );
}
function montar(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clientes.push(client);
  return render(
    <QueryClientProvider client={client}>
      <Controlado {...props} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const q = new URL(String(url), 'http://localhost').searchParams;
      const delDepartamento = empleados.filter(
        (e) => !q.has('departamentoId') || String(e.idDepartamento) === q.get('departamentoId'),
      );
      const permitidos = empleados.filter(
        (e) =>
          (!q.has('departamentoId') || String(e.idDepartamento) === q.get('departamentoId')) &&
          (q.get('soloActivos') !== 'true' || e.estado === 'ACTIVO'),
      );
      const buscar = q.get('buscar')?.toLowerCase() ?? '';
      const registros = permitidos.filter((e) =>
        `${e.nombre} ${e.codigo}`.toLowerCase().includes(buscar),
      );
      const pagina = Number(q.get('pagina') ?? 1);
      // Una fila por página comprueba que buscar y seleccionar no dependen de la primera página.
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            registros: registros.slice(pagina - 1, pagina),
            seleccionado:
              (q.get('incluirSeleccionInactiva') === 'true' ? delDepartamento : permitidos).find(
                (e) => e.value === q.get('seleccionado'),
              ) ?? null,
            total: registros.length,
            pagina,
            limite: 1,
          },
        }),
      );
    }),
  );
});
afterEach(() => clientes.splice(0).forEach((c) => c.clear()));
describe('SelectorEmpleado: cascada de servidor', () => {
  it('sin departamento muestra código, nombre y departamento y pagina desde la API', async () => {
    montar();
    fireEvent.focus(screen.getByRole('combobox', { name: 'Empleado' }));
    expect(
      await screen.findByRole('option', { name: 'EMP_ING_0001 · Ana Peña · Ingeniería' }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Más empleados' }));
    expect(
      await screen.findByRole('option', { name: 'EMP_VEN_0001 · Luis López · Ventas' }),
    ).toBeVisible();
    expect(screen.queryByRole('option', { name: /Eva Gil/ })).toBeNull();
  });
  it('filtra en servidor y conserva la selección al elegir su departamento; limpia al cambiar a otro', async () => {
    montar({ inicial: '1' });
    await waitFor(() =>
      expect(
        (screen.getByRole('combobox', { name: 'Empleado' }) as HTMLInputElement).value,
      ).toMatch(/Ana Peña/),
    );
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), '10');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Empleado' })).toHaveValue(
        'EMP_ING_0001 · Ana Peña',
      ),
    );
    expect(screen.getByLabelText('Selección')).toHaveTextContent('1');
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), '20');
    await waitFor(() => expect(screen.getByLabelText('Selección')).toHaveTextContent(/^$/));
    fireEvent.focus(screen.getByRole('combobox', { name: 'Empleado' }));
    expect(await screen.findByRole('option', { name: 'EMP_VEN_0001 · Luis López' })).toBeVisible();
    expect(screen.queryByRole('option', { name: /Ana Peña/ })).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('departamentoId=20'))).toBe(
      true,
    );
  });
  it('limpia un borrador incompatible y explica el departamento sin empleados', async () => {
    montar({ inicial: '1', departamento: '30' });
    await waitFor(() => expect(screen.getByLabelText('Selección')).toHaveTextContent(/^$/));
    expect(await screen.findByText(/Este departamento no tiene empleados activos/)).toBeVisible();
  });
  it('conserva selección fuera de página al buscar y al quitar el departamento', async () => {
    montar({ inicial: '2', departamento: '20' });
    await waitFor(() =>
      expect(
        (screen.getByRole('combobox', { name: 'Empleado' }) as HTMLInputElement).value,
      ).toMatch(/Luis López/),
    );
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), '');
    await waitFor(() =>
      expect(
        (screen.getByRole('combobox', { name: 'Empleado' }) as HTMLInputElement).value,
      ).toMatch(/Ventas/),
    );
    await userEvent.type(screen.getByRole('combobox', { name: 'Empleado' }), 'Ana');
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('buscar=Ana'))).toBe(
        true,
      ),
    );
    expect(screen.getByLabelText('Selección')).toHaveTextContent('2');
  });
  it('los filtros históricos incluyen egresados cuando se solicita explícitamente', async () => {
    montar({ inicial: '3', departamento: '10', soloActivos: false });
    await waitFor(() =>
      expect(
        (screen.getByRole('combobox', { name: 'Empleado' }) as HTMLInputElement).value,
      ).toMatch(/Eva Gil.*egresado/),
    );
    expect(screen.getByLabelText('Selección')).toHaveTextContent('3');
  });
  it('conserva el responsable histórico sin ofrecer otros egresados para nuevas asignaciones', async () => {
    montar({ inicial: '3', departamento: '10', seleccionActual: '3' });
    await waitFor(() => expect(screen.getByLabelText('Selección')).toHaveTextContent('3'));
    await waitFor(() =>
      expect(
        (screen.getByRole('combobox', { name: 'Empleado' }) as HTMLInputElement).value,
      ).toMatch(/Eva Gil/),
    );
    fireEvent.focus(screen.getByRole('combobox', { name: 'Empleado' }));
    expect(screen.getByRole('option', { name: /Eva Gil/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('option', { name: /Ana Peña/ })).not.toHaveAttribute('aria-disabled');
  });
  it('un fallo de red conserva la selección y ofrece reintento', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Sin conexión'));
    montar({ inicial: '1', departamento: '10' });
    expect(await screen.findByRole('button', { name: 'Reintentar empleados' })).toBeVisible();
    expect(screen.getByLabelText('Selección')).toHaveTextContent('1');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar empleados' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('combobox', { name: 'Empleado' }) as HTMLInputElement).value,
      ).toMatch(/Ana Peña/),
    );
  });
});
