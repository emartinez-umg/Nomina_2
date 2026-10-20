import { useEffect, useId, useState, type ReactNode } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { iconos, type NombreIcono } from '../../../components/ui/icons';
import { moneda } from '../../../lib/validadores';

export function NumeroAnimado({
  valor,
  dinero = false,
}: {
  valor: string | number;
  dinero?: boolean;
}) {
  const reducir = useReducedMotion();
  const [visible, setVisible] = useState(Number(valor));
  useEffect(() => {
    if (reducir) return;
    // Solo la interpolación visual usa Number; el importe exacto de API permanece accesible.
    const control = animate(0, Number(valor), { duration: 0.65, onUpdate: setVisible });
    return () => control.stop();
  }, [valor, reducir]);
  const exacto = dinero ? moneda(String(valor)) : String(valor);
  return (
    <>
      <span className="sr-only">{exacto}</span>
      <span aria-hidden="true">
        {reducir ? exacto : dinero ? moneda(visible.toFixed(2)) : Math.round(visible)}
      </span>
    </>
  );
}
export function Actualizado({
  fecha,
  cargando,
}: {
  fecha?: string | undefined;
  cargando: boolean;
}) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setAhora(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const minutos = fecha ? Math.max(0, Math.floor((ahora - new Date(fecha).getTime()) / 60000)) : 0;
  return (
    <p className="rh-actualizado">
      <iconos.tiempo size={13} aria-hidden="true" />
      {cargando
        ? 'Actualizando…'
        : fecha
          ? `Actualizado hace ${minutos < 1 ? 'unos segundos' : `${minutos} min`}`
          : 'Esperando datos'}
    </p>
  );
}
export function Recuadro({
  titulo,
  icono,
  orden,
  children,
  pie,
  tour,
}: {
  titulo: string;
  icono: NombreIcono;
  orden: number;
  children: ReactNode;
  pie: ReactNode;
  tour: string;
}) {
  const reducir = useReducedMotion(),
    id = useId(),
    Icono = iconos[icono];
  return (
    <motion.section
      className="tarjeta rh-recuadro"
      aria-labelledby={id}
      data-tour={tour}
      initial={reducir ? false : { y: 12 }}
      animate={{ y: 0 }}
      transition={{ duration: reducir ? 0 : 0.3, delay: reducir ? 0 : orden * 0.07 }}
    >
      <header className="rh-titulo">
        <span className="rh-icono">
          <Icono size={22} aria-hidden="true" />
        </span>
        <h2 id={id}>{titulo}</h2>
      </header>
      {children}
      <footer>{pie}</footer>
    </motion.section>
  );
}
export function Alternador<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string;
  valor: T;
  opciones: readonly { valor: T; texto: string; icono: NombreIcono }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="rh-alternador" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <Button
          key={o.valor}
          icono={o.icono}
          variante="texto"
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
        >
          {o.texto}
        </Button>
      ))}
    </div>
  );
}
export function Pestanas<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
  children,
}: {
  etiqueta: string;
  valor: T;
  opciones: readonly { valor: T; texto: string; icono: NombreIcono }[];
  onChange: (v: T) => void;
  children: ReactNode;
}) {
  const id = useId(),
    reducir = useReducedMotion();
  return (
    <>
      <div className="rh-alternador" role="tablist" aria-label={etiqueta}>
        {opciones.map((o, i) => (
          <Button
            key={o.valor}
            id={`${id}-${o.valor}`}
            role="tab"
            icono={o.icono}
            variante="texto"
            aria-selected={valor === o.valor}
            aria-controls={`${id}-panel`}
            tabIndex={valor === o.valor ? 0 : -1}
            onClick={() => onChange(o.valor)}
            onKeyDown={(e) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
              e.preventDefault();
              const indice =
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? opciones.length - 1
                    : (i + (e.key === 'ArrowRight' ? 1 : -1) + opciones.length) % opciones.length;
              const siguiente = opciones[indice]!;
              onChange(siguiente.valor);
              document.getElementById(`${id}-${siguiente.valor}`)?.focus();
            }}
          >
            {o.texto}
          </Button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${valor}`}
        tabIndex={0}
        className="rh-panel"
      >
        <motion.div
          key={valor}
          initial={reducir ? false : { y: 4 }}
          animate={{ y: 0 }}
          transition={{ duration: reducir ? 0 : 0.18 }}
        >
          {children}
        </motion.div>
      </div>
    </>
  );
}
export function EstadoConsulta<T>({
  consulta,
  children,
}: {
  consulta: UseQueryResult<T, Error>;
  children: (d: T) => ReactNode;
}) {
  if (consulta.isPending)
    return (
      <div className="rh-carga" role="status" aria-label="Cargando estadísticas">
        <Skeleton lineas={5} />
      </div>
    );
  if (!consulta.data)
    return (
      <EmptyState
        titulo="No se pudo cargar este recuadro"
        descripcion={consulta.error?.message ?? 'Vuelve a consultar los datos.'}
        accion={
          <Button icono="actualizar" variante="secundario" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  return (
    <>
      {consulta.isError && (
        <div role="alert" className="rh-fallo">
          No se pudo actualizar. Se conserva la última consulta.
          <Button icono="actualizar" variante="texto" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {children(consulta.data)}
    </>
  );
}
export function EnlaceDetalle({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="rh-enlace" to={to}>
      {children}
      <iconos.siguiente size={16} aria-hidden="true" />
    </Link>
  );
}
