import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { driver } from 'driver.js';
import type { Driver } from 'driver.js';
import type { Rol } from '../../features/auth/api/auth';
import { Button } from '../ui/Button';
import { iconos } from '../ui/icons';
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
  ofrecida: boolean;
  descartar: () => void;
}
const Contexto = createContext<ContextoAyuda | null>(null);
export function HelpProvider({ children }: PropsWithChildren) {
  const [ofrecida, setOfrecida] = useState(false);
  const [definicion, setDefinicion] = useState<{
    ayuda: DefinicionAyuda;
    rol?: Rol | undefined;
  } | null>(null);
  const activo = useRef<Driver>();
  const plantillaIconos = useRef<HTMLSpanElement>(null);
  const registrar = useCallback((ayuda: DefinicionAyuda | null, rol?: Rol) => {
    activo.current?.destroy();
    setDefinicion(ayuda ? { ayuda, rol } : null);
    if (!ayuda) {
      setOfrecida(false);
      return;
    }
    const clave = `nomina2:ayuda:${ayuda.id}:${rol ?? 'publico'}`;
    try {
      setOfrecida(localStorage.getItem(clave) !== 'vista');
    } catch {
      setOfrecida(true);
    }
  }, []);
  const descartar = useCallback(() => {
    setOfrecida(false);
    if (definicion)
      try {
        localStorage.setItem(
          `nomina2:ayuda:${definicion.ayuda.id}:${definicion.rol ?? 'publico'}`,
          'vista',
        );
      } catch {
        /* Preferencia opcional si el navegador bloquea almacenamiento. */
      }
  }, [definicion]);
  const iniciar = useCallback(() => {
    if (!definicion) return;
    descartar();
    activo.current?.destroy();
    activo.current = driver({
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
      steps: definicion.ayuda.pasos
        .filter(
          (p) =>
            (!p.roles || (definicion.rol && p.roles.includes(definicion.rol))) &&
            document.querySelector(`[data-tour="${p.elemento}"]`),
        )
        .map((p) => ({
          element: `[data-tour="${p.elemento}"]`,
          popover: { title: p.titulo, description: p.descripcion },
        })),
    });
    activo.current.drive();
  }, [definicion, descartar]);
  useEffect(() => () => activo.current?.destroy(), []);
  return (
    <Contexto.Provider value={{ registrar, iniciar, ofrecida, descartar }}>
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
    <Button icono="ayuda" variante="texto" aria-label="Ayuda de esta página" onClick={iniciar}>
      Ayuda
    </Button>
  );
}
export function HelpOffer() {
  const { ofrecida, iniciar, descartar } = useHelp();
  return ofrecida ? (
    <aside className="oferta-ayuda" aria-label="Recorrido de bienvenida">
      <div>
        <strong>Conoce esta página</strong>
        <p>Te guiamos paso a paso. Puedes repetir el recorrido desde Ayuda.</p>
      </div>
      <div className="flex gap-2">
        <Button icono="ayuda" onClick={iniciar}>
          Ver recorrido
        </Button>
        <Button icono="cancelar" variante="texto" onClick={descartar}>
          Ahora no
        </Button>
      </div>
    </aside>
  ) : null;
}
