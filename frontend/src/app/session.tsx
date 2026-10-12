import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { consultarSesion } from '../features/auth/api/auth';
import type { Usuario } from '../features/auth/api/auth';
import { ErrorApi, guardarCsrf } from '../lib/http';
interface Sesion {
  usuario: Usuario | null;
  cargando: boolean;
  error: Error | null;
  expirada: boolean;
  establecer: (usuario: Usuario | null) => void;
  reintentar: () => void;
}
const Contexto = createContext<Sesion | null>(null);
export const claveSesion = ['sesion'] as const;
export function SessionProvider({ children }: PropsWithChildren) {
  const client = useQueryClient();
  const [expirada, setExpirada] = useState(false);
  const consulta = useQuery({
    queryKey: claveSesion,
    queryFn: async ({ signal }) => {
      try {
        return await consultarSesion(signal);
      } catch (e) {
        if (e instanceof ErrorApi && e.estado === 401) {
          if (client.getQueryData(claveSesion)) setExpirada(true);
          return null;
        }
        throw e;
      }
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const establecer = useCallback(
    (usuario: Usuario | null) => {
      client.cancelQueries();
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'sesion' });
      client.setQueryData(claveSesion, usuario);
      setExpirada(false);
      if (!usuario) guardarCsrf();
    },
    [client],
  );
  useEffect(() => {
    const vencer = () => {
      establecer(null);
      setExpirada(true);
    };
    const cambiar = () =>
      client.setQueryData<Usuario | null>(claveSesion, (u) =>
        u ? { ...u, cambioObligatorio: true } : null,
      );
    window.addEventListener('nomina2:sesion-expirada', vencer);
    window.addEventListener('nomina2:cambio-obligatorio', cambiar);
    return () => {
      window.removeEventListener('nomina2:sesion-expirada', vencer);
      window.removeEventListener('nomina2:cambio-obligatorio', cambiar);
    };
  }, [client, establecer]);
  // Consultar al volver a la pestaña detecta expiración sin mantener viva la sesión por polling.
  useEffect(() => {
    if (consulta.data === null) guardarCsrf();
  }, [consulta.data]);
  return (
    <Contexto.Provider
      value={{
        usuario: consulta.data ?? null,
        cargando: consulta.isPending,
        error: consulta.error,
        expirada,
        establecer,
        reintentar: () => {
          void consulta.refetch();
        },
      }}
    >
      {children}
    </Contexto.Provider>
  );
}
export function useSession() {
  const sesion = useContext(Contexto);
  if (!sesion) throw new Error('Falta el proveedor de sesión.');
  return sesion;
}
