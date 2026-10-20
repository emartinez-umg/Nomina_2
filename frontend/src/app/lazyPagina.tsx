import { lazy } from 'react';
import type { ComponentType } from 'react';

const reiniciar = new Set<() => void>();
export function reintentarPaginas() {
  reiniciar.forEach((restablecer) => restablecer());
}
export function lazyPagina(importar: () => Promise<{ default: ComponentType }>) {
  let Pagina = lazy(importar);
  reiniciar.add(() => {
    Pagina = lazy(importar);
  });
  return function PaginaReintentable() {
    return <Pagina />;
  };
}
