import type { PermisoEquipo } from '../features/equipo/api';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from './session';
import { destinoRol } from '../features/auth/api/auth';
import type { Rol } from '../features/auth/api/auth';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
export function SessionGate({ children }: { children: React.ReactNode }) {
  const s = useSession();
  if (s.cargando)
    return (
      <main className="mx-auto mt-20 max-w-lg p-6">
        <Card>
          <Skeleton />
        </Card>
      </main>
    );
  if (s.error)
    return (
      <main className="mx-auto mt-20 max-w-lg p-6">
        <Card>
          <EmptyState
            titulo="No se pudo comprobar la sesión"
            descripcion={s.error.message}
            accion={
              <Button icono="actualizar" onClick={s.reintentar}>
                Reintentar
              </Button>
            }
          />
        </Card>
      </main>
    );
  return children;
}
export function RequireSession({
  roles,
  permitirCambio = false,
}: {
  roles?: Rol[];
  permitirCambio?: boolean;
}) {
  const { usuario } = useSession();
  const location = useLocation();
  if (!usuario)
    return (
      <Navigate to="/login" replace state={{ requiereSesion: true, desde: location.pathname }} />
    );
  if (usuario.cambioObligatorio && !permitirCambio)
    return <Navigate to="/cambiar-contrasena" replace />;
  if (roles && !roles.includes(usuario.rol))
    return <Navigate to={destinoRol(usuario.rol)} replace />;
  return <Outlet />;
}
export function Entrada() {
  const { usuario } = useSession();
  return (
    <Navigate
      to={
        usuario
          ? usuario.cambioObligatorio
            ? '/cambiar-contrasena'
            : destinoRol(usuario.rol)
          : '/login'
      }
      replace
    />
  );
}

export function RequireEquipo({
  permiso,
  children,
}: {
  permiso?: PermisoEquipo;
  children: React.ReactNode;
}) {
  const { usuario, reintentar } = useSession();
  const permisos = usuario?.permisosEquipo ?? [];
  if (usuario?.rol !== 'EMPLEADO' || !(permiso ? permisos.includes(permiso) : permisos.length))
    return (
      <EmptyState
        titulo="Sin permiso de equipo"
        descripcion="Recursos Humanos administra los permisos de tus jefaturas. Actualiza para comprobar los cambios."
        accion={
          <Button icono="actualizar" onClick={reintentar}>
            Actualizar permisos
          </Button>
        }
      />
    );
  return children;
}
