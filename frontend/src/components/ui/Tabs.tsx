import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { iconos } from './icons';
import type { NombreIcono } from './icons';
export function Tabs({
  items,
  valor,
  onCambiar,
}: {
  items: { id: string; titulo: string; icono: NombreIcono; contenido: ReactNode }[];
  valor: string;
  onCambiar: (id: string) => void;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div>
      <div role="tablist" aria-label="Secciones" className="tabs">
        {items.map((t, i) => {
          const Icono = iconos[t.icono];
          return (
            <button
              key={t.id}
              ref={(e) => {
                refs.current[i] = e;
              }}
              type="button"
              role="tab"
              id={`${id}-${t.id}`}
              aria-selected={valor === t.id}
              aria-controls={`${id}-panel-${t.id}`}
              tabIndex={valor === t.id ? 0 : -1}
              onClick={() => onCambiar(t.id)}
              onKeyDown={(e) => {
                let n = i;
                if (e.key === 'ArrowRight') n = (i + 1) % items.length;
                else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length;
                else if (e.key === 'Home') n = 0;
                else if (e.key === 'End') n = items.length - 1;
                else return;
                e.preventDefault();
                const tab = items[n];
                if (tab) {
                  onCambiar(tab.id);
                  refs.current[n]?.focus();
                }
              }}
            >
              <Icono size={18} aria-hidden="true" />
              {t.titulo}
            </button>
          );
        })}
      </div>
      {items.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${id}-panel-${t.id}`}
          aria-labelledby={`${id}-${t.id}`}
          hidden={valor !== t.id}
          tabIndex={0}
        >
          {t.contenido}
        </div>
      ))}
    </div>
  );
}
