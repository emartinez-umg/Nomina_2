import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { driver } from 'driver.js';
import type { Driver } from 'driver.js';
import type { Rol } from '../../features/auth/api/auth';
import { Button } from '../ui/Button';
import { iconos } from '../ui/icons';
import { pasosVisibles } from './pasosVisibles';
export interface PasoAyuda {
  elemento: string;
  titulo: string;
  descripcion: string;
  roles?: Rol[];
}
export interface DefinicionAyuda {
  id: string;
  pasos: PasoAyuda[];
}
interface ContextoAyuda {
  registrar: (definicion: DefinicionAyuda | null, rol?: Rol) => void;
  iniciar: () => void;
}
const Contexto = createContext<ContextoAyuda | null>(null);
export function HelpProvider({ children }: PropsWithChildren) {
  const [definicion, setDefinicion] = useState<{
    ayuda: DefinicionAyuda;
    rol?: Rol | undefined;
  } | null>(null);
  const activo = useRef<Driver>();
  const plantillaIconos = useRef<HTMLSpanElement>(null);
  const registrar = useCallback((ayuda: DefinicionAyuda | null, rol?: Rol) => {
    activo.current?.destroy();
    setDefinicion(ayuda ? { ayuda, rol } : null);
  }, []);
  const iniciar = useCallback(() => {
    if (!definicion) return;
    activo.current?.destroy();
    const abiertos = document.querySelectorAll('dialog[open]');
    const alcance = abiertos.item(abiertos.length - 1) ?? document;
    const activador = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const origen = { left: window.scrollX, top: window.scrollY };
    const restaurar = () => {
      // Driver puede enfocar otro control al cerrar; devolvemos foco y posición al origen.
      queueMicrotask(() => {
        if (activador?.isConnected) {
          activador.focus({ preventScroll: true });
          window.scrollTo(origen);
        }
      });
    };
    activo.current = driver({
      onDestroyed: restaurar,
      onDestroyStarted: (_elemento, _paso, { driver: recorrido }) => {
        // Un cierre durante la animación puede omitir onDestroyed de driver.js.
        recorrido.destroy();
        restaurar();
      },
      showProgress: true,
      progressText: 'Paso {{current}} de {{total}}',
      nextBtnText: 'Siguiente',
      prevBtnText: 'Anterior',
      doneBtnText: 'Terminar',
      popoverClass: 'ayuda-popover',
      allowClose: true,
      onPopoverRender: (popover, { driver: recorrido }) => {
        // El recorrido debe pertenecer a la capa superior del diálogo para recibir foco y clics.
        const dialogos = document.querySelectorAll('dialog[open]');
        const dialogo = dialogos.item(dialogos.length - 1);
        if (dialogo) {
          dialogo.appendChild(popover.wrapper);
          const overlay = document.querySelector('.driver-overlay');
          if (overlay) dialogo.appendChild(overlay);
        }
        const agregar = (boton: HTMLButtonElement, nombre: string) => {
          const svg = plantillaIconos.current?.querySelector(`[data-icono="${nombre}"] svg`);
          if (svg) boton.prepend(svg.cloneNode(true));
        };
        agregar(popover.previousButton, 'anterior');
        agregar(popover.nextButton, recorrido.isLastStep() ? 'aprobar' : 'siguiente');
        popover.closeButton.textContent = '';
        popover.closeButton.setAttribute('aria-label', 'Cerrar recorrido');
        popover.closeButton.setAttribute('title', 'Cerrar recorrido');
        agregar(popover.closeButton, 'cancelar');
      },
      steps: pasosVisibles(definicion.ayuda, definicion.rol, alcance),
    });
    activo.current.drive();
  }, [definicion]);
  useEffect(() => {
    try {
      Object.keys(localStorage)
        .filter((clave) => clave.startsWith('nomina2:ayuda:'))
        .forEach((clave) => localStorage.removeItem(clave));
    } catch {
      /* La ayuda manual funciona también con el almacenamiento bloqueado. */
    }
    return () => activo.current?.destroy();
  }, []);
  return (
    <Contexto.Provider value={{ registrar, iniciar }}>
      {children}
      <span hidden aria-hidden="true" ref={plantillaIconos}>
        {(['anterior', 'siguiente', 'aprobar', 'cancelar'] as const).map((nombre) => {
          const Icono = iconos[nombre];
          return (
            <span key={nombre} data-icono={nombre}>
              <Icono size={16} aria-hidden="true" />
            </span>
          );
        })}
      </span>
    </Contexto.Provider>
  );
}
export function useHelp() {
  const c = useContext(Contexto);
  if (!c) throw new Error('Falta el proveedor de ayuda.');
  return c;
}
export function usePageHelp(ayuda: DefinicionAyuda, rol?: Rol) {
  const { registrar } = useHelp();
  useEffect(() => {
    registrar(ayuda, rol);
    return () => registrar(null);
  }, [ayuda, rol, registrar]);
}
export function HelpButton() {
  const { iniciar } = useHelp();
  return (
    <Button
      icono="ayuda"
      variante="texto"
      aria-label="Ayuda de esta página"
      title="Iniciar el recorrido de ayuda de esta página"
      onClick={iniciar}
    >
      Ayuda
    </Button>
  );
}
export function DialogHelpButton() {
  const contexto = useContext(Contexto);
  return contexto ? (
    <Button
      icono="ayuda"
      soloIcono
      variante="texto"
      aria-label="Ayuda de esta ventana"
      onClick={contexto.iniciar}
    />
  ) : null;
}
