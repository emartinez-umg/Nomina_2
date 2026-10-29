import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneElement, type ReactElement } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type * as Recharts from 'recharts';
import type * as Validadores from '../../lib/validadores';
import type * as Motion from 'framer-motion';
import { ComisionesEstadisticasPage } from './ComisionesEstadisticasPage';
import { validarFiltrosComisiones } from './FiltrosComisiones';
import { opcionesNavegacion } from '../../components/layout/navigation.config';
import { puntuarBusqueda } from '../../components/layout/navigation.search';
import { descargar } from '../nomina/api/nomina';
import { ayudaComisiones } from './help/pasos';
const sesion = vi.hoisted(() => ({ rol: 'RH', reducir: true, denegar: false, vacio: false }));
vi.mock('../../app/session', () => ({
  useSession: () => ({
    usuario: { idUsuario: 7, rol: sesion.rol, permisosEquipo: ['VER_COMISIONES_EQUIPO'] },
    reintentar: vi.fn(),
  }),
}));
vi.mock('../../components/help/HelpProvider', () => ({ usePageHelp: vi.fn() }));
vi.mock('../nomina/api/nomina', () => ({ descargar: vi.fn() }));
vi.mock('framer-motion', async (original) => ({
  ...(await original<typeof Motion>()),
  useReducedMotion: () => sesion.reducir,
}));
vi.mock('recharts', async (original) => ({
  ...(await original<typeof Recharts>()),
  ResponsiveContainer: ({ children }: { children: ReactElement }) => (
    <div>
      {cloneElement(children as ReactElement<{ width: number; height: number }>, {
        width: 600,
        height: 300,
      })}
    </div>
  ),
}));
vi.mock('../../lib/validadores', async (original) => ({
  ...(await original<typeof Validadores>()),
  hoyGuatemala: () => '2026-10-29',
}));
const persona = {
  idEmpleado: 3,
  codigo: 'EMP_VEN_0001',
  nombre: 'Ana López',
  puesto: 'Analista',
  idDepartamento: 1,
  departamento: 'Ventas',
  centro: null,
};
function datos(u: URL) {
  if (u.pathname.endsWith('/anios'))
    return { anioActual: 2026, anioMin: 2024, anioMax: 2026, anios: [2024, 2026] };
  const q = u.searchParams,
    desde = q.get('desde')!,
    hasta = q.get('hasta')!,
    comparar = q.get('comparar') === 'true';
  const meses = desde === hasta ? [desde] : [desde, hasta];
  const serie = meses.map((mes, i) => ({
    mes,
    total: sesion.vacio ? '0.00' : i === 0 ? '300.10' : '0.00',
    ...(comparar ? { mesAnterior: '2026-09', totalAnterior: '100.00' } : {}),
  }));
  const indicadores = {
    total: sesion.vacio ? '0.00' : '300.10',
    promedioMensual: '150.05',
    mejorMes: sesion.vacio ? null : serie[0],
    totalAnterior: comparar ? '100.00' : null,
    variacionPorcentual: comparar ? '200.10' : null,
    sinBaseComparacion: false,
  };
  const meta = {
    actualizadoEn: '2026-10-29T12:00:00-06:00',
    moneda: 'GTQ',
    periodo: { desde, hasta, meses: meses.length },
    periodoAnterior: comparar ? { desde: '2026-09', hasta: '2026-09' } : null,
    alcance: {
      tipo: sesion.rol === 'EMPLEADO' ? 'EQUIPO' : 'GENERAL',
      personas: sesion.rol === 'EMPLEADO' ? 2 : null,
    },
  };
  const fila = {
    ...persona,
    ...indicadores,
    participacionPorcentual: '100.00',
    posicion: 1,
    serie,
  };
  if (u.pathname.includes('/historial'))
    return {
      ...meta,
      vendedor: persona,
      indicadores: { ...indicadores, peorMes: serie.at(-1) },
      promedioMensualEquipo: '75.03',
      vendedoresEquipo: 2,
      evolucion: serie.map((m) => ({ ...m, promedioEquipo: '75.03' })),
      total: 1,
      pagina: 1,
      limite: 10,
      registros: [
        {
          id: 1,
          mes: desde,
          monto: '300.10',
          descripcion: 'Venta del mes',
          referencia: null,
          estado: 'PENDIENTE',
        },
      ],
    };
  if (u.pathname.endsWith('/opciones'))
    return {
      ...meta,
      vendedores: [
        persona,
        { ...persona, idEmpleado: 4, nombre: 'Luis Soto', codigo: 'EMP_VEN_0002' },
        {
          ...persona,
          idEmpleado: 5,
          nombre: 'Otra Área',
          idDepartamento: 2,
          departamento: 'Servicios',
        },
      ],
      departamentos: [
        { id: 1, nombre: 'Ventas' },
        { id: 2, nombre: 'Servicios' },
      ],
    };
  if (u.pathname.endsWith('/resumen'))
    return {
      ...meta,
      indicadores: { ...indicadores, vendedoresConComision: sesion.vacio ? 0 : 2 },
    };
  if (u.pathname.endsWith('/tendencia')) return { ...meta, registros: serie };
  if (u.pathname.includes('/exportar/'))
    return {
      nombre: 'comisiones.xlsx',
      tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: 'UEs=',
    };
  return {
    ...meta,
    total: sesion.vacio ? 0 : 1,
    pagina: 1,
    limite: 20,
    totalComisiones: '300.10',
    meses,
    totalesMensuales: serie,
    registros: sesion.vacio ? [] : [fila],
  };
}
function mostrar(ruta = '/estadisticas/comisiones') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[ruta]}>
        <ComisionesEstadisticasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  sesion.rol = 'RH';
  sesion.denegar = false;
  sesion.vacio = false;
  sesion.reducir = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: !sesion.denegar,
      status: sesion.denegar ? 403 : 200,
      headers: { get: () => 'application/json' },
      json: async () =>
        sesion.denegar
          ? {
              ok: false,
              error: { codigo: 'PROHIBIDO', mensaje: 'Permiso de comisiones revocado.' },
            }
          : { ok: true, data: datos(new URL(url, 'http://localhost')) },
    })),
  );
});
describe('R3-10: análisis de comisiones', () => {
  it('muestra indicadores, meses en cero, tablas accesibles y detalle frente al equipo', async () => {
    mostrar('/estadisticas/comisiones?desde=2026-09&hasta=2026-10&comparar=true');
    expect(await screen.findByText('Alcance: toda la empresa')).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Indicadores de comisiones' })).getByText(
        'Aumento: 200.10%',
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByText('Ver datos: Tendencia mensual'));
    expect(
      within(screen.getByRole('table', { name: 'Tendencia mensual · GTQ' })).getByText('Q 0.00'),
    ).toBeVisible();
    const matriz = screen.getByRole('region', {
      name: 'Matriz mensual de comisiones',
    });
    fireEvent.click(within(matriz).getByRole('button', { name: 'Ana López' }));
    expect(await screen.findByText('Detalle de vendedor: Ana López')).toBeVisible();
    expect(screen.getByText('Peor mes')).toBeVisible();
    expect(screen.getByText('Q 75.03 · 2 vendedores')).toBeVisible();
    fireEvent.click(screen.getByText('Ver datos: Evolución del vendedor'));
    expect(screen.getByRole('table', { name: 'Evolución del vendedor · GTQ' })).toBeVisible();
    expect(screen.getByText('Pendiente')).toBeVisible();
    expect(ayudaComisiones.pasos.map((p) => p.elemento)).toContain('com-detalle');
  });
  it('combina selección múltiple, departamento y estado, limpia vendedores al cambiar departamento', async () => {
    mostrar();
    await screen.findByText('Alcance: toda la empresa');
    fireEvent.click(screen.getByText('Vendedores: todos'));
    fireEvent.click(screen.getByLabelText(/Ana López · EMP_VEN_0001/));
    fireEvent.click(screen.getByLabelText(/Luis Soto · EMP_VEN_0002/));
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(
            ([url]) =>
              String(url).includes('vendedores=3%2C4') && String(url).includes('comparar=true'),
          ),
      ).toBe(true),
    );
    fireEvent.focus(screen.getByRole('combobox', { name: 'Departamento' }));
    fireEvent.click(screen.getByRole('option', { name: 'Servicios' }));
    expect(screen.getByText('Vendedores: todos')).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByLabelText(/Ana López · EMP_VEN_0001/)).not.toBeInTheDocument(),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([u]) => String(u).includes('opciones?') && String(u).includes('idDepartamento=2'),
        ),
    ).toBe(true);
  });
  it('aplica atajos, exporta con los mismos filtros y mantiene un año sin datos visible', async () => {
    mostrar();
    await screen.findByText('Alcance: toda la empresa');
    fireEvent.click(screen.getByRole('button', { name: 'Año anterior' }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([u]) => String(u).includes('desde=2025-01&hasta=2025-12')),
      ).toBe(true),
    );
    expect(screen.getByLabelText('Año de desde')).toHaveValue('2025');
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => expect(descargar).toHaveBeenCalled());
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([u]) =>
          String(u).includes('/exportar/excel?desde=2025-01&hasta=2025-12'),
        ),
    ).toBe(true);
  });
  it.each(['RH', 'EMPLEADO'])('vacío útil y acción de carga solo RH (%s)', async (rol) => {
    sesion.rol = rol;
    sesion.vacio = true;
    mostrar();
    expect(await screen.findByText('Sin comisiones registradas en octubre de 2026')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Cargar comisiones' }) !== null).toBe(rol === 'RH');
    if (rol === 'EMPLEADO')
      expect(screen.getByText('Equipo: tus jefaturas autorizadas, 2 personas')).toBeVisible();
  });
  it('revocación elimina datos previos y el historial, incluso al actualizar con caché', async () => {
    sesion.rol = 'EMPLEADO';
    const client = mostrar();
    await screen.findByText('Equipo: tus jefaturas autorizadas, 2 personas');
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Matriz mensual de comisiones' })).getByRole(
        'button',
        { name: 'Ana López' },
      ),
    );
    await screen.findByText('Detalle de vendedor: Ana López');
    sesion.denegar = true;
    await client.invalidateQueries({ queryKey: ['comisiones-panel'] });
    expect(await screen.findByText('Estadísticas no disponibles')).toBeVisible();
    expect(screen.queryByText('Detalle de vendedor: Ana López')).not.toBeInTheDocument();
    expect(screen.queryByText('Total de comisiones')).not.toBeInTheDocument();
  });
  it('valida rangos y el buscador exige el permiso específico sin otorgar otras vistas', () => {
    for (const [desde, hasta] of [
      ['2026-11', '2026-10'],
      ['2020-01', '2026-10'],
      ['2026-10', '2026-11'],
    ])
      expect(
        validarFiltrosComisiones({
          desde: desde!,
          hasta: hasta!,
          estado: 'todas',
          comparar: 'false',
        }),
      ).not.toBe('');
    expect(opcionesNavegacion('RH').find((o) => o.id === 'estadisticas-comisiones')?.grupo).toBe(
      'Estadísticas',
    );
    expect(
      opcionesNavegacion('EMPLEADO', ['VER_EQUIPO']).some((o) => o.id === 'comisiones-equipo'),
    ).toBe(false);
    const acceso = opcionesNavegacion('EMPLEADO', ['VER_COMISIONES_EQUIPO']).find(
      (o) => o.id === 'comisiones-equipo',
    )!;
    expect(acceso.ruta).toBe('/mi-equipo/comisiones');
    expect(puntuarBusqueda(acceso.titulo, 'vendedores', acceso.palabras)).toBeGreaterThan(0);
  });
  it.each([true, false])(
    'conserva cifras accesibles y texto opaco con movimiento reducido=%s',
    async (reducir) => {
      sesion.reducir = reducir;
      mostrar();
      await screen.findByText('Alcance: toda la empresa');
      const indicadores = screen.getByRole('region', { name: 'Indicadores de comisiones' });
      expect(
        within(indicadores).getAllByText('Q 300.10', { selector: '.sr-only' })[0],
      ).toBeInTheDocument();
      for (const tarjeta of indicadores.querySelectorAll<HTMLElement>('.com-indicador'))
        expect(tarjeta.style.opacity).toBe('');
    },
  );
  it('muestra esqueletos sin datos inventados mientras espera el servidor', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    mostrar();
    expect(screen.getByRole('status', { name: 'Cargando comisiones' })).toBeVisible();
    expect(screen.queryByText('Total de comisiones')).not.toBeInTheDocument();
  });
});
