import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TableroRh } from './components/TableroRh';
import { InicioPage } from './pages/InicioPage';
import { Actualizado } from './components/RhCompartidos';
import { filtrosEnlace } from '../../lib/filtrosEnlace';
import type * as Validadores from '../../lib/validadores';
import type * as Motion from 'framer-motion';

const preferencia = vi.hoisted(() => ({ reducir: true }));
vi.mock('framer-motion', async (importar) => ({
  ...(await importar<typeof Motion>()),
  useReducedMotion: () => preferencia.reducir,
}));

vi.mock('../../app/session', () => ({
  useSession: () => ({
    usuario: { idUsuario: 7, rol: 'RH', usuario: 'ana.perez', nombreMostrado: 'Ana Pérez' },
  }),
}));
vi.mock('../../components/help/HelpProvider', () => ({ usePageHelp: vi.fn() }));
vi.mock('./pages/RhGraficas', () => ({ RhGraficas: () => <div>Gráficas secundarias</div> }));
vi.mock('../../lib/validadores', async (importar) => ({
  ...(await importar<typeof Validadores>()),
  hoyGuatemala: () => '2026-10-20',
}));

const categorias = [
  'IGSS_JUSTIFICADA',
  'JUSTIFICADA_CON_GOCE',
  'JUSTIFICADA_SIN_GOCE',
  'SIN_JUSTIFICAR',
].map((categoria, i) => ({
  categoria,
  nombre: categoria,
  color: ['verde', 'amarillo', 'naranja', 'rojo'][i],
  dias: `${i + 1}.00`,
}));
const actualizadoEn = '2026-10-20T10:00:00-06:00';
function datos(u: URL, vacio = false): unknown {
  if (u.pathname.endsWith('remuneraciones'))
    return {
      actualizadoEn,
      mes: u.searchParams.get('mes'),
      agrupar: u.searchParams.get('agrupar'),
      metrica: u.searchParams.get('metrica'),
      moneda: 'GTQ',
      fuente: 'PAGOS_CONFIRMADOS',
      registros: vacio
        ? []
        : [
            {
              id: 8,
              nombre: u.searchParams.get('agrupar') === 'departamento' ? 'Ingeniería' : 'Ana Pérez',
              posicion: 1,
              valor: '12345.67',
              salarioBase: '10000.00',
              comisiones: '1000.00',
              horasExtra: '1095.67',
              totalDevengado: '12345.67',
            },
          ],
    };
  if (u.pathname.endsWith('inasistencias'))
    return {
      actualizadoEn,
      inicio: '2026-10-01',
      fin: '2026-10-31',
      periodo: u.searchParams.get('periodo'),
      agrupar: u.searchParams.get('agrupar'),
      unidad: 'DIAS',
      totalDias: vacio ? '0.00' : '10.00',
      categorias: vacio ? categorias.map((c) => ({ ...c, dias: '0.00' })) : categorias,
      registros: vacio
        ? []
        : [{ id: 8, nombre: 'Ana Pérez', posicion: 1, totalDias: '10.00', categorias }],
    };
  if (u.pathname.endsWith('vacaciones')) {
    const persona = (id: number) => ({
      id,
      idEmpleado: id,
      codigo: `EMP_${id}`,
      nombre: `Persona ${id}`,
      inicio: '2026-10-20',
      fin: '2026-10-30',
      diasLaborales: '8.00',
    });
    return {
      actualizadoEn,
      hoy: '2026-10-20',
      dias: Number(u.searchParams.get('dias')),
      pagina: Number(u.searchParams.get('pagina')),
      limite: 5,
      ausentesHoy: vacio ? 0 : 2,
      totalEnCurso: vacio ? 0 : 1,
      totalProximas: vacio ? 0 : 6,
      enCurso: vacio ? [] : [persona(8)],
      proximas: vacio ? [] : [persona(u.searchParams.get('pagina') === '2' ? 14 : 9)],
    };
  }
  if (u.pathname.endsWith('celebraciones'))
    return {
      actualizadoEn,
      hoy: '2026-10-20',
      dias: 30,
      cumpleanos: vacio
        ? []
        : [
            {
              idEmpleado: 8,
              codigo: 'EMP_8',
              nombre: 'Ana Pérez',
              fecha: '2026-10-20',
              esHoy: true,
            },
          ],
      aniversarios: vacio
        ? []
        : [
            {
              idEmpleado: 9,
              codigo: 'EMP_9',
              nombre: 'Luis Soto',
              fecha: '2026-10-25',
              esHoy: false,
              anios: 5,
            },
          ],
    };
  return {
    rol: 'RH',
    ahora: actualizadoEn,
    indicadores: { activos: 2, altas: 1, bajas: 0, solicitudes: 3, vacaciones: 2 },
    periodo: null,
    departamentos: [],
    evolucion: [],
    celebraciones: [],
    alertas: [
      {
        id: 8,
        tipo: 'PERFIL_INCOMPLETO',
        mensaje: 'Ana Pérez: perfil incompleto sin salario',
        fecha: '2026-10-20',
      },
    ],
  };
}
function fetchDatos(vacio = false) {
  return vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: datos(new URL(url, 'http://localhost'), vacio) }),
  }));
}
function mostrar(pagina = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{pagina ? <InicioPage /> : <TableroRh />}</MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  preferencia.reducir = true;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal('fetch', fetchDatos());
});
describe('R2-9: primera vista de RRHH', () => {
  it('mantiene el texto opaco durante entrada y transición para conservar contraste', async () => {
    preferencia.reducir = false;
    mostrar();
    for (const seccion of document.querySelectorAll<HTMLElement>('.rh-recuadro'))
      expect(seccion.style.opacity).toBe('');
    const card = screen.getByRole('region', { name: 'Cumpleaños y aniversarios' });
    await within(card).findByText('¡Hoy!');
    fireEvent.click(within(card).getByRole('tab', { name: 'Aniversarios' }));
    expect(card.querySelector<HTMLElement>('[role="tabpanel"] > div')!.style.opacity).toBe('');
  });
  it('presenta los cuatro recuadros antes de indicadores y conserva alertas de perfiles incompletos', async () => {
    mostrar(true);
    expect(screen.getByRole('heading', { name: 'Hola, Ana Pérez' })).toBeInTheDocument();
    const tablero = screen.getByRole('region', { name: 'Estadísticas de Recursos Humanos' });
    await screen.findByText('Ana Pérez: perfil incompleto sin salario');
    expect(within(tablero).getAllByRole('region')).toHaveLength(4);
    const indicadores = screen.getByRole('region', { name: 'Indicadores de Recursos Humanos' });
    expect(
      tablero.compareDocumentPosition(indicadores) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
  it('muestra cuatro esqueletos independientes mientras espera a la API', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    mostrar();
    expect(screen.getAllByRole('status', { name: 'Cargando estadísticas' })).toHaveLength(4);
    expect(screen.getAllByRole('region')).toHaveLength(5);
  });
  it('alterna agrupación, todas las métricas y mes y año sin conservar barras de otro filtro', async () => {
    mostrar();
    const card = screen.getByRole('region', { name: 'Top 5 de remuneraciones' });
    await within(card).findByRole('link', { name: /Ana Pérez: Q 12,345.67/ });
    fireEvent.click(within(card).getByRole('button', { name: 'Departamentos' }));
    for (const metrica of ['salarioBase', 'comisiones', 'horasExtra', 'totalDevengado']) {
      fireEvent.change(within(card).getByLabelText('Métrica'), { target: { value: metrica } });
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining(`metrica=${metrica}`),
          expect.anything(),
        ),
      );
    }
    fireEvent.change(within(card).getByLabelText('Mes de remuneraciones'), {
      target: { value: '09' },
    });
    fireEvent.change(within(card).getByLabelText('Año de mes de remuneraciones'), {
      target: { value: '2025' },
    });
    const link = await within(card).findByRole('link', { name: /Ingeniería: Q 12,345.67/ });
    expect(link).toHaveAttribute('href', '/planilla?historial=1&anio=2025&mes=9&idDepartamento=8');
    expect(within(card).getByRole('button', { name: 'Departamentos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('desglosa las cuatro categorías con totales y enlaza a las ausencias aprobadas del rango', async () => {
    mostrar();
    const card = screen.getByRole('region', { name: 'Inasistencias' });
    const link = await within(card).findByRole('link', {
      name: /IGSS: 1.00 días.*Con goce: 2.00 días.*Sin goce: 3.00 días.*Sin justificación: 4.00 días/,
    });
    expect(link).toHaveAttribute(
      'href',
      '/novedades/ausencias?idEmpleado=8&desde=2026-10-01&hasta=2026-10-31&estado=APROBADA',
    );
    expect(
      within(card).getByRole('list', { name: 'Totales de días por categoría' }).children,
    ).toHaveLength(4);
    fireEvent.focus(link);
    expect(await screen.findByRole('tooltip', { name: /IGSS: 1.00 días/ })).toBeVisible();
    fireEvent.keyDown(link, { key: 'Escape' });
    expect(screen.queryByRole('tooltip', { name: /IGSS: 1.00 días/ })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Departamentos' }));
    for (const periodo of ['trimestre', 'anio', 'mes']) {
      fireEvent.change(within(card).getByLabelText('Periodo de inasistencias'), {
        target: { value: periodo },
      });
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining(`periodo=${periodo}`),
          expect.anything(),
        ),
      );
    }
    await waitFor(() =>
      expect(within(card).getByRole('link', { name: /Ana Pérez/ })).toHaveAttribute(
        'href',
        expect.stringContaining('idDepartamento=8'),
      ),
    );
  });
  it('cambia vacaciones por teclado, plazo y página, conservando fechas y días laborales', async () => {
    mostrar();
    const card = screen.getByRole('region', { name: 'Vacaciones' });
    await within(card).findByText('personas ausentes hoy');
    const enCurso = within(card).getByRole('tab', { name: 'En curso (1)' });
    enCurso.focus();
    fireEvent.keyDown(enCurso, { key: 'ArrowRight' });
    expect(within(card).getByRole('tab', { name: 'Próximas (6)' })).toHaveFocus();
    expect(within(card).getByRole('link', { name: /Persona 9/ })).toHaveAttribute(
      'href',
      '/vacaciones?empleado=9&estado=&desde=2026-10-20&hasta=2026-10-30',
    );
    for (const dias of ['60', '90', '30']) {
      fireEvent.change(within(card).getByLabelText('Próximas vacaciones'), {
        target: { value: dias },
      });
      await within(card).findByLabelText('Próximas vacaciones');
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining(`dias=${dias}`),
          expect.anything(),
        ),
      );
    }
    fireEvent.click(within(card).getByRole('button', { name: 'Siguiente' }));
    await within(card).findByText('Persona 14');
    expect(within(card).getByText('Página 2')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('tab', { name: 'En curso (1)' }));
    await within(card).findByText('Persona 8');
    expect(within(card).queryByText('Página 2')).not.toBeInTheDocument();
  });
  it('resalta cumpleaños de hoy, no publica edad y muestra años solo en aniversarios', async () => {
    mostrar();
    const card = screen.getByRole('region', { name: 'Cumpleaños y aniversarios' });
    await within(card).findByText('¡Hoy!');
    expect(within(card).getByRole('link', { name: /Ana Pérez/ })).toHaveAttribute(
      'href',
      '/empleados/8',
    );
    expect(within(card).queryByText(/\d+ años/)).not.toBeInTheDocument();
    expect(card.querySelector('.rh-celebracion-hoy')).toHaveStyle({ transform: 'none' });
    fireEvent.click(within(card).getByRole('tab', { name: 'Aniversarios' }));
    expect(within(card).getByText('5 años en el equipo')).toBeInTheDocument();
  });
  it('explica los cuatro estados vacíos con acciones útiles y conserva ceros', async () => {
    vi.stubGlobal('fetch', fetchDatos(true));
    mostrar();
    for (const titulo of [
      'Sin pagos para esta métrica',
      'Sin inasistencias aprobadas',
      'Sin vacaciones en curso',
      'Sin celebraciones próximas',
    ])
      expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument();
    expect(screen.getByText('0.00 días en total')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Consultar ausencias' })).toHaveAttribute(
      'href',
      '/novedades/ausencias',
    );
  });
  it('aísla el error de un endpoint y permite reintentar sin bloquear el resto', async () => {
    let fallar = true;
    const bien = fetchDatos();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/remuneraciones?') && fallar
          ? Promise.reject(new Error('Sin conexión'))
          : bien(url),
      ),
    );
    mostrar();
    const card = screen.getByRole('region', { name: 'Top 5 de remuneraciones' });
    await within(card).findByRole('heading', { name: 'No se pudo cargar este recuadro' });
    await screen.findByText('¡Hoy!');
    fallar = false;
    fireEvent.click(within(card).getByRole('button', { name: 'Reintentar' }));
    await within(card).findByRole('link', { name: /Ana Pérez/ });
  });
  it('mide antigüedad del corte sin depender de un nuevo render del servidor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(actualizadoEn));
    const { unmount } = render(<Actualizado fecha={actualizadoEn} cargando={false} />);
    expect(screen.getByText('Actualizado hace unos segundos')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(120000));
    expect(screen.getByText('Actualizado hace 2 min')).toBeInTheDocument();
    unmount();
    vi.useRealTimers();
  });
  it('solo admite filtros conocidos y válidos al entrar desde los enlaces', () => {
    const q = new URLSearchParams(
      'idEmpleado=8&idDepartamento=-1&desde=2026-02-30&hasta=2026-12-01&mes=13&estado=APROBADA&ordenarPor=secreto',
    );
    expect(
      filtrosEnlace(q, ['idEmpleado', 'idDepartamento', 'desde', 'hasta', 'mes', 'estado']),
    ).toEqual({ idEmpleado: '8', hasta: '2026-12-01', estado: 'APROBADA' });
  });
});
