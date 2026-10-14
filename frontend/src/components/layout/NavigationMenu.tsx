import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Rol } from '../../features/auth/api/auth';
import { Button } from '../ui/Button';
import { iconos } from '../ui/icons';
import { accesoActivo, navigation } from './navigation.config';

export function NavigationMenu({ rol, onElegir }: { rol: Rol; onElegir: (id: string) => void }) {
  const [grupo, setGrupo] = useState<string | null>(null);
  const [movil, setMovil] = useState(false);
  const [foco, setFoco] = useState<{ id: string; ultimo: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const activadorMovil = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const grupos = navigation[rol];
  const activo = accesoActivo(rol, pathname);
  const cerrar = () => {
    setGrupo(null);
    setMovil(false);
  };
  useEffect(() => {
    setGrupo(null);
    setMovil(false);
  }, [pathname, rol]);
  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) cerrar();
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, []);
  useLayoutEffect(() => {
    if (!grupo) return;
    const posicionar = () => {
      const activador = ref.current?.querySelector<HTMLElement>(`#activar-${grupo}`);
      const panel = ref.current?.querySelector<HTMLElement>(`#grupo-${grupo}`);
      if (!activador || !panel) return;
      const izquierda = activador.getBoundingClientRect().left;
      const destino = Math.max(16, Math.min(izquierda, window.innerWidth - panel.offsetWidth - 16));
      panel.style.left = `${destino - izquierda}px`;
    };
    posicionar();
    window.addEventListener('resize', posicionar);
    return () => window.removeEventListener('resize', posicionar);
  }, [grupo]);
  useLayoutEffect(() => {
    if (!foco || grupo !== foco.id) return;
    const enlaces = ref.current?.querySelectorAll<HTMLAnchorElement>(`#grupo-${foco.id} a`);
    enlaces?.[foco.ultimo ? enlaces.length - 1 : 0]?.focus();
    setFoco(null);
  }, [foco, grupo]);
  function tecladoGrupo(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const id = grupos[indice]!.id;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setGrupo(id);
      setFoco({ id, ultimo: e.key === 'ArrowUp' });
    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const siguiente =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? grupos.length - 1
            : (indice + (e.key === 'ArrowRight' ? 1 : -1) + grupos.length) % grupos.length;
      setGrupo(null);
      ref.current?.querySelectorAll<HTMLButtonElement>('.grupo-boton')[siguiente]?.focus();
    }
  }
  function tecladoEnlaces(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const enlaces = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>('a')];
    const indice = enlaces.indexOf(document.activeElement as HTMLAnchorElement);
    const siguiente =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? enlaces.length - 1
          : (indice + (e.key === 'ArrowDown' ? 1 : -1) + enlaces.length) % enlaces.length;
    enlaces[siguiente]?.focus();
  }
  return (
    <div
      className="navegacion"
      ref={ref}
      data-tour="navegacion"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) cerrar();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        if (grupo) {
          ref.current?.querySelector<HTMLButtonElement>(`#activar-${grupo}`)?.focus();
          setGrupo(null);
        } else {
          cerrar();
          activadorMovil.current?.focus();
        }
      }}
    >
      <Button
        ref={activadorMovil}
        icono="menu"
        variante="texto"
        className="menu-movil"
        aria-label="Abrir menú de navegación"
        aria-expanded={movil}
        aria-controls="secciones-sistema"
        onClick={() => {
          setMovil((valor) => !valor);
          setGrupo(null);
        }}
      >
        Menú
      </Button>
      <nav
        id="secciones-sistema"
        className={`menu-horizontal ${movil ? 'menu-abierto' : ''}`}
        aria-label="Secciones del sistema"
      >
        {grupos.map((g, indice) => {
          const Icono = iconos[g.icono];
          const esActivo = g.items.some((item) => item.id === activo);
          return (
            <div className="grupo-navegacion" key={g.id}>
              <button
                type="button"
                id={`activar-${g.id}`}
                className={`grupo-boton ${esActivo ? 'grupo-activo' : ''}`}
                aria-expanded={grupo === g.id}
                aria-controls={`grupo-${g.id}`}
                onClick={() => setGrupo((actual) => (actual === g.id ? null : g.id))}
                onKeyDown={(e) => tecladoGrupo(e, indice)}
              >
                <Icono size={17} aria-hidden="true" />
                <span>{g.titulo}</span>
                <iconos.desplegar size={14} aria-hidden="true" />
              </button>
              <div
                id={`grupo-${g.id}`}
                className="grupo-panel"
                hidden={grupo !== g.id}
                onKeyDown={tecladoEnlaces}
              >
                {g.items.map((item) => {
                  const IconoItem = iconos[item.icono];
                  return (
                    <Link
                      key={item.id}
                      to={item.ruta}
                      className="opcion-navegacion"
                      aria-current={activo === item.id ? 'page' : undefined}
                      onClick={() => {
                        onElegir(item.id);
                        cerrar();
                      }}
                    >
                      <IconoItem size={21} aria-hidden="true" />
                      <span>
                        <strong>{item.titulo}</strong>
                        <small>{item.descripcion}</small>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
