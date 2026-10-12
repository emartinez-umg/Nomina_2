import { Navigate, Outlet } from 'react-router-dom';
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
  if (!usuario) return <Navigate to="/login" replace />;
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
