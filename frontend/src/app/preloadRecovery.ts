const clave = 'nomina2:recarga-modulo';

export function instalarRecuperacionModulos(
  version: string,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
  recargar = () => window.location.reload(),
) {
  const recuperar = (evento: Event) => {
    try {
      const almacen = storage ?? window.sessionStorage;
      // La marca sobrevive a la recarga: un fallo persistente queda en el error de ruta.
      if (almacen.getItem(clave) === version) return;
      almacen.setItem(clave, version);
    } catch {
      return; // Sin almacenamiento no se puede garantizar una única recarga.
    }
    evento.preventDefault();
    recargar();
  };
  window.addEventListener('vite:preloadError', recuperar);
  return () => window.removeEventListener('vite:preloadError', recuperar);
}

// Se registra antes de evaluar el router y sus imports dinámicos.
if (import.meta.env.PROD) instalarRecuperacionModulos(import.meta.url);
