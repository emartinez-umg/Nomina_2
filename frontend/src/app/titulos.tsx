import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useMatches } from 'react-router-dom';
export interface ContextoTitulo {
  params: Record<string, string | undefined>;
  query: URLSearchParams;
  codigo?: string | undefined;
}
export type TituloRuta = string | ((contexto: ContextoTitulo) => string);
const RegistroTitulo = createContext<((codigo: string | undefined) => void) | null>(null);
export function TituloPagina() {
  const { pathname } = useLocation();
  const [registro, setRegistro] = useState<{ pathname: string; codigo: string | undefined }>();
  const registrar = useMemo(
    () => (codigo: string | undefined) => setRegistro({ pathname, codigo }),
    [pathname],
  );
  useTituloPagina(registro?.pathname === pathname ? registro.codigo : undefined);
  return (
    <RegistroTitulo.Provider value={registrar}>
      <Outlet />
    </RegistroTitulo.Provider>
  );
}
/** Solo registra el código público recibido de la API; no acepta nombres, correos ni datos personales. */
export function useTituloRegistro(codigo: string | null | undefined) {
  const registrar = useContext(RegistroTitulo);
  useEffect(() => {
    registrar?.(codigo && /^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(codigo) ? codigo : undefined);
    return () => registrar?.(undefined);
  }, [registrar, codigo]);
}

export function useTituloPagina(codigo?: string) {
  const matches = useMatches(),
    { search } = useLocation();
  const ultima = [...matches]
    .reverse()
    .find((m) => (m.handle as { titulo?: TituloRuta } | undefined)?.titulo);
  const definicion = (ultima?.handle as { titulo?: TituloRuta } | undefined)?.titulo;
  const titulo =
    typeof definicion === 'function'
      ? definicion({ params: ultima?.params ?? {}, query: new URLSearchParams(search), codigo })
      : definicion;
  useEffect(() => {
    document.title = titulo ? `${titulo} | nomina2` : 'nomina2';
  }, [titulo]);
}
