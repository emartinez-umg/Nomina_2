import { lazy, Suspense } from 'react';
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
import { InicioPage } from '../features/inicio/pages/InicioPage';
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
              { path: ['/admin', '/rh', '/mis-gestiones'][i]!, element: <InicioPage /> },
              ...(rol === 'EMPLEADO'
                ? [
                    { path: '/mis-gestiones/vacaciones', element: <VacacionesPage /> },
                    { path: '/mis-gestiones/boletas', element: <NominaPage /> },
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
              { path: '/planilla', element: <NominaPage /> },
              { path: '/vacaciones', element: <VacacionesPage /> },
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
