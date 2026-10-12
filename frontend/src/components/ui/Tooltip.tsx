import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';
export function Tooltip({ texto, children }: PropsWithChildren<{ texto: string }>) {
  const id = useId();
  const ancla = useRef<HTMLSpanElement>(null);
  const contenido = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [posicion, setPosicion] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!visible) return;
    const ubicar = () => {
      const rect = ancla.current?.getBoundingClientRect();
      const tip = contenido.current;
      if (!rect || !tip) return;
      const ancho = Math.min(tip.getBoundingClientRect().width, window.innerWidth - 16);
      const alto = tip.getBoundingClientRect().height;
      setPosicion({
        left: Math.max(
          8,
          Math.min(rect.left + rect.width / 2 - ancho / 2, window.innerWidth - ancho - 8),
        ),
        top: rect.top >= alto + 12 ? rect.top - alto - 8 : rect.bottom + 8,
      });
    };
    ubicar();
    window.addEventListener('resize', ubicar);
    window.addEventListener('scroll', ubicar, true);
    return () => {
      window.removeEventListener('resize', ubicar);
      window.removeEventListener('scroll', ubicar, true);
    };
  }, [visible]);
  return (
    <span
      className="tooltip"
      ref={ancla}
      tabIndex={0}
      aria-describedby={id}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setVisible(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setVisible(false);
      }}
    >
      {children}
      {createPortal(
        <span
          ref={contenido}
          role="tooltip"
          id={id}
          hidden={!visible}
          className="tooltip-contenido"
          style={posicion}
        >
          {texto}
        </span>,
        document.body,
      )}
    </span>
  );
}
