import { lazy, Suspense } from 'react';
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
import { Entrada, RequireSession, SessionGate } from './guards';
import { Outlet } from 'react-router-dom';
export const rutas = [
  { path: '/salud', element: <SaludPage /> },
  {
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
                    { path: '/mis-gestiones/anuncios', element: comunicacionPage },
                    { path: '/mis-gestiones/eventos', element: comunicacionPage },
                    { path: '/mis-gestiones/vacaciones', element: <VacacionesPage /> },
                    { path: '/mis-gestiones/boletas', element: <NominaPage /> },
                    { path: '/mis-gestiones/solicitudes', element: solicitudesPage },
                    {
                      path: '/mis-gestiones/datos',
                      element: (
                        <Suspense fallback={<Skeleton lineas={6} />}>
                          <MisDatos />
                        </Suspense>
                      ),
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
                path: '/prestaciones',
                element: (
                  <Suspense fallback={<Skeleton lineas={6} />}>
                    <PrestacionesPage />
                  </Suspense>
                ),
              },
              { path: '/vacaciones', element: <VacacionesPage /> },
              { path: '/solicitudes', element: solicitudesPage },
              { path: '/novedades', element: <NovedadesPage /> },
              { path: '/novedades/:tipo', element: <NovedadesPage /> },
              { path: '/novedades/:tipo/nuevo', element: <NovedadFormularioPage /> },
              { path: '/novedades/:tipo/:id', element: <NovedadDetallePage /> },
              { path: '/novedades/:tipo/:id/editar', element: <NovedadFormularioPage /> },
              { path: '/empleados', element: <EmpleadosPage /> },
              { path: '/empleados/nuevo', element: <EmpleadoFormularioPage /> },
              { path: '/empleados/carga-masiva', element: <CargaMasivaPage /> },
              { path: '/empleados/:id', element: <EmpleadoDetallePage /> },
              { path: '/empleados/:id/editar', element: <EmpleadoFormularioPage /> },
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
export const router = createBrowserRouter(rutas);
