import { MiEquipoPage } from '../features/equipo/MiEquipoPage';
import { SaldosVacacionesPage } from '../features/vacaciones/pages/SaldosVacacionesPage';
import { TituloPagina, type TituloRuta } from './titulos';
import type { RouteObject } from 'react-router-dom';
import { opcionesNavegacion } from '../components/layout/navigation.config';
import { titulos as titulosNovedades } from '../features/novedades/api/novedades';
import { SimularPagoPage } from '../features/nomina/pages/SimularPagoPage';
import { EmpresaPage } from '../features/empresa/pages/EmpresaPage';
import { Suspense } from 'react';
import { lazyPagina as lazy } from './lazyPagina';
import { RouteError } from './RouteError';
const ComisionesEstadisticasPage = lazy(() =>
  import('../features/comisiones/ComisionesEstadisticasPage').then((m) => ({
    default: m.ComisionesEstadisticasPage,
  })),
);
const PendientesPage = lazy(() =>
  import('../features/novedades/pages/PendientesPage').then((m) => ({ default: m.PendientesPage })),
);
const ParqueoPage = lazy(() =>
  import('../features/novedades/pages/ParqueoPage').then((m) => ({ default: m.ParqueoPage })),
);
const TarifasParqueoPage = lazy(() =>
  import('../features/novedades/pages/TarifasParqueoPage').then((m) => ({
    default: m.TarifasParqueoPage,
  })),
);

const Usuarios = lazy(() =>
  import('../features/usuarios/pages/UsuariosPage').then((m) => ({ default: m.UsuariosPage })),
);
const Solicitudes = lazy(() =>
  import('../features/solicitudes/pages/SolicitudesPage').then((m) => ({
    default: m.SolicitudesPage,
  })),
);
const MisDatos = lazy(() =>
  import('../features/solicitudes/pages/MisDatosPage').then((m) => ({ default: m.MisDatosPage })),
);
const solicitudesPage = (
  <Suspense fallback={<Skeleton lineas={6} />}>
    <Solicitudes />
  </Suspense>
);
const PrestacionesPage = lazy(() =>
  import('../features/prestaciones/pages/PrestacionesPage').then((m) => ({
    default: m.PrestacionesPage,
  })),
);
import { Skeleton } from '../components/ui/Skeleton';
const Nomina = lazy(() =>
  import('../features/nomina/pages/NominaPage').then((m) => ({ default: m.NominaPage })),
);
function NominaPage() {
  return (
    <Suspense fallback={<Skeleton lineas={6} />}>
      <Nomina />
    </Suspense>
  );
}
import { VacacionesPage } from '../features/vacaciones/pages/VacacionesPage';
import { EmpleadosPage } from '../features/empleados/pages/EmpleadosPage';
import { EmpleadoFormularioPage } from '../features/empleados/pages/EmpleadoFormulario';
import { EmpleadoDetallePage } from '../features/empleados/pages/EmpleadoDetalle';
import { CargaMasivaPage } from '../features/empleados/pages/CargaMasiva';
import { NovedadesPage } from '../features/novedades/pages/NovedadesPage';
import { NovedadFormularioPage } from '../features/novedades/pages/NovedadFormulario';
import { NovedadDetallePage } from '../features/novedades/pages/NovedadDetalle';
import { createBrowserRouter } from 'react-router-dom';
import { CatalogosPage } from '../features/catalogos/pages/CatalogosPage';
import { SaludPage } from '../features/salud/pages/SaludPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { CambioContrasenaPage } from '../features/auth/pages/CambioContrasenaPage';
const Inicio = lazy(() =>
  import('../features/inicio/pages/InicioPage').then((m) => ({ default: m.InicioPage })),
);
function InicioPage() {
  return (
    <Suspense fallback={<Skeleton lineas={8} />}>
      <Inicio />
    </Suspense>
  );
}
const Comunicacion = lazy(() =>
  import('../features/comunicacion/pages/ComunicacionPage').then((m) => ({
    default: m.ComunicacionPage,
  })),
);
const comunicacionPage = (
  <Suspense fallback={<Skeleton lineas={6} />}>
    <Comunicacion />
  </Suspense>
);
const Auditoria = lazy(() =>
  import('../features/auditoria/pages/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })),
);
import { AppLayout } from '../components/layout/AppLayout';
import { FormPageContainer } from '../components/layout/FormPageContainer';
import { Entrada, RequireSession, SessionGate, RequireEquipo } from './guards';
import { Outlet } from 'react-router-dom';
const paginas: RouteObject[] = [
  { path: '/salud', element: <SaludPage />, errorElement: <RouteError /> },
  {
    errorElement: <RouteError />,
    element: (
      <SessionGate>
        <Outlet />
      </SessionGate>
    ),
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireSession permitirCambio />,
        children: [{ path: '/cambiar-contrasena', element: <CambioContrasenaPage /> }],
      },
      ...(['ADMIN', 'RH', 'EMPLEADO'] as const).map((rol, i) => ({
        element: <RequireSession roles={[rol]} />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                path: ['/admin', '/rh', '/mis-gestiones'][i]!,
                element: <InicioPage />,
              },
              ...(rol === 'ADMIN'
                ? [
                    {
                      path: '/admin/usuarios',
                      element: (
                        <Suspense fallback={<Skeleton />}>
                          <Usuarios />
                        </Suspense>
                      ),
                    },
                    {
                      path: '/admin/bitacora',
                      element: (
                        <Suspense fallback={<Skeleton />}>
                          <Auditoria />
                        </Suspense>
                      ),
                    },
                  ]
                : []),
              ...(rol === 'EMPLEADO'
                ? [
                    {
                      path: '/mi-equipo',
                      element: (
                        <RequireEquipo>
                          <MiEquipoPage />
                        </RequireEquipo>
                      ),
                    },
                    {
                      path: '/mi-equipo/comisiones',
                      element: (
                        <RequireEquipo permiso="VER_COMISIONES_EQUIPO">
                          <Suspense fallback={<Skeleton lineas={8} />}>
                            <ComisionesEstadisticasPage />
                          </Suspense>
                        </RequireEquipo>
                      ),
                    },
                    {
                      path: '/mi-equipo/vacaciones',
                      element: (
                        <RequireEquipo permiso="VER_VACACIONES_EQUIPO">
                          <SaldosVacacionesPage equipo />
                        </RequireEquipo>
                      ),
                    },
                    { path: '/mis-gestiones/anuncios', element: comunicacionPage },
                    { path: '/mis-gestiones/eventos', element: comunicacionPage },
                    { path: '/mis-gestiones/vacaciones', element: <VacacionesPage /> },
                    { path: '/mis-gestiones/boletas', element: <NominaPage /> },
                    {
                      path: '/mis-gestiones/parqueo',
                      element: (
                        <Suspense fallback={<Skeleton lineas={6} />}>
                          <ParqueoPage />
                        </Suspense>
                      ),
                    },
                    { path: '/mis-gestiones/solicitudes', element: solicitudesPage },
                    {
                      element: <FormPageContainer />,
                      children: [
                        {
                          path: '/mis-gestiones/datos',
                          element: (
                            <Suspense fallback={<Skeleton lineas={6} />}>
                              <MisDatos />
                            </Suspense>
                          ),
                        },
                      ],
                    },
                  ]
                : []),
            ],
          },
        ],
      })),
      {
        element: <RequireSession roles={['ADMIN', 'RH']} />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/comunicacion/:tipo', element: comunicacionPage },
              { path: '/planilla', element: <NominaPage /> },
              {
                element: <FormPageContainer />,
                children: [
                  { path: '/nomina/simular', element: <SimularPagoPage /> },
                  {
                    path: '/configuracion/parqueo',
                    element: (
                      <Suspense fallback={<Skeleton lineas={6} />}>
                        <TarifasParqueoPage />
                      </Suspense>
                    ),
                  },
                  { path: '/novedades/:tipo/nuevo', element: <NovedadFormularioPage /> },
                  { path: '/novedades/:tipo/:id/editar', element: <NovedadFormularioPage /> },
                  { path: '/empleados/nuevo', element: <EmpleadoFormularioPage /> },
                  { path: '/empleados/carga-masiva', element: <CargaMasivaPage /> },
                  { path: '/empleados/:id/editar', element: <EmpleadoFormularioPage /> },
                  { path: '/catalogos/empresa', element: <EmpresaPage /> },
                ],
              },
              {
                path: '/prestaciones',
                element: (
                  <Suspense fallback={<Skeleton lineas={6} />}>
                    <PrestacionesPage />
                  </Suspense>
                ),
              },
              { path: '/vacaciones', element: <VacacionesPage /> },
              {
                path: '/estadisticas/comisiones',
                element: (
                  <Suspense fallback={<Skeleton lineas={8} />}>
                    <ComisionesEstadisticasPage />
                  </Suspense>
                ),
              },
              { path: '/vacaciones/saldos', element: <SaldosVacacionesPage /> },
              { path: '/solicitudes', element: solicitudesPage },
              {
                path: '/novedades/pendientes',
                element: (
                  <Suspense fallback={<Skeleton lineas={6} />}>
                    <PendientesPage />
                  </Suspense>
                ),
              },
              {
                path: '/novedades/parqueo',
                element: (
                  <Suspense fallback={<Skeleton lineas={6} />}>
                    <ParqueoPage />
                  </Suspense>
                ),
              },
              { path: '/novedades', element: <NovedadesPage /> },
              { path: '/novedades/:tipo', element: <NovedadesPage /> },
              { path: '/novedades/:tipo/:id', element: <NovedadDetallePage /> },
              { path: '/empleados', element: <EmpleadosPage /> },
              { path: '/empleados/:id', element: <EmpleadoDetallePage /> },
              { path: '/catalogos', element: <CatalogosPage /> },
              { path: '/catalogos/:catalogo', element: <CatalogosPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <Entrada /> },
    ],
  },
];
// Cada ruta declara su título en el árbol que consume React Router.
const destinos = opcionesNavegacion('ADMIN');
const fijos: Record<string, TituloRuta> = {
  '/mi-equipo': 'Mi equipo',
  '/mi-equipo/comisiones': 'Estadísticas de comisiones',
  '/estadisticas/comisiones': 'Estadísticas de comisiones',
  '/mi-equipo/vacaciones': 'Vacaciones de mi equipo',
  '/salud': 'Estado del sistema',
  '/login': 'Iniciar sesión',
  '/cambiar-contrasena': 'Cambiar contraseña',
  '/vacaciones': 'Vacaciones',
  '/vacaciones/saldos': 'Saldos de vacaciones',
  '/solicitudes': 'Solicitudes',
  '/prestaciones': 'Prestaciones',
  '/admin': 'Inicio',
  '/rh': 'Inicio',
  '/mis-gestiones': 'Mis gestiones',
  '/admin/usuarios': 'Usuarios',
  '/admin/bitacora': 'Bitácora',
  '/mis-gestiones/anuncios': 'Anuncios',
  '/mis-gestiones/eventos': 'Eventos',
  '/mis-gestiones/vacaciones': 'Mis vacaciones',
  '/mis-gestiones/boletas': 'Mis boletas',
  '/mis-gestiones/parqueo': 'Mi parqueo',
  '/mis-gestiones/solicitudes': 'Mis solicitudes',
  '/mis-gestiones/datos': 'Mis datos',
  '/empleados/:id': ({ codigo }) => (codigo ? `Empleado ${codigo}` : 'Detalle de empleado'),
  '/empleados/:id/editar': ({ codigo }) =>
    codigo ? `Editar empleado ${codigo}` : 'Editar empleado',
  '/comunicacion/:tipo': ({ params }) => (params.tipo === 'eventos' ? 'Eventos' : 'Anuncios'),
  '/catalogos/:catalogo': ({ params }) =>
    destinos.find((d) => d.ruta === `/catalogos/${params.catalogo}`)?.titulo ?? 'Catálogos',
  '/novedades': 'Novedades',
  '/novedades/:tipo': ({ params }) =>
    titulosNovedades[params.tipo as keyof typeof titulosNovedades] ?? 'Novedades',
  '/novedades/:tipo/nuevo': ({ params }) =>
    `Nuevo registro de ${titulosNovedades[params.tipo as keyof typeof titulosNovedades]?.toLowerCase() ?? 'novedades'}`,
  '/novedades/:tipo/:id': ({ params, codigo }) =>
    `${titulosNovedades[params.tipo as keyof typeof titulosNovedades] ?? 'Novedad'} ${codigo ?? (/^\d+$/.test(params.id ?? '') ? `#${params.id}` : '')}`,
  '/novedades/:tipo/:id/editar': ({ params, codigo }) =>
    `Editar ${titulosNovedades[params.tipo as keyof typeof titulosNovedades]?.toLowerCase() ?? 'novedad'} ${codigo ?? (/^\d+$/.test(params.id ?? '') ? `#${params.id}` : '')}`,
  '/planilla': ({ query }) => (query.has('historial') ? 'Historial de nómina' : 'Planilla'),
  '*': 'nomina2',
};
function conTitulos(rutas: RouteObject[]): RouteObject[] {
  return rutas.map(
    (ruta) =>
      ({
        ...ruta,
        ...(ruta.path
          ? {
              handle: {
                titulo:
                  fijos[ruta.path] ??
                  destinos.find((d) => d.ruta.split('?')[0] === ruta.path)?.titulo ??
                  'nomina2',
              },
            }
          : {}),
        ...(ruta.children ? { children: conTitulos(ruta.children) } : {}),
      }) as RouteObject,
  );
}
export const rutas: RouteObject[] = [{ element: <TituloPagina />, children: conTitulos(paginas) }];
export const router = createBrowserRouter(rutas);
