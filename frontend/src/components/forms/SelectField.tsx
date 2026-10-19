import { useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { TipoCampo } from './tamanoCampo';
import { Field } from './Field';
import type { CampoProps } from './Field';
import { limpiarTexto } from '../../lib/validadores';
import { iconos } from '../ui/icons';
export function SelectField({
  opciones,
  onBuscar,
  maxLength,
  tipoDato = 'select',
  complemento,
  ...props
}: CampoProps & {
  tipoDato?: TipoCampo;
  maxLength?: number;
  complemento?: ReactNode;
  opciones: { value: string; label: string; disabled?: boolean }[];
  onBuscar?: (buscar: string) => void;
}) {
  const id = useId();
  const [buscar, setBuscar] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(0);
  const [tocado, setTocado] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Flecha = iconos.desplegar;
  const normalizar = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const filtradas = useMemo(
    () => opciones.filter((o) => normalizar(o.label).includes(normalizar(buscar))),
    [opciones, buscar],
  );
  const seleccionada = opciones.find((o) => o.value === props.value);
  const problema =
    props.error ??
    (tocado && props.required && !props.value ? 'Selecciona una opción de la lista.' : undefined);
  const elegir = (v: string) => {
    props.onValueChange(v);
    setBuscar('');
    setAbierto(false);
    setTocado(true);
    props.onBlur?.();
  };
  return (
    <Field
      id={id}
      label={props.label}
      hint={props.hint}
      required={props.required}
      error={problema}
      tipo={tipoDato}
      tamano={props.tamano}
      maxLength={maxLength ?? Math.max(20, ...opciones.map((o) => o.label.length))}
    >
      <div
        ref={ref}
        className="select-campo"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setAbierto(false);
            setBuscar('');
            setTocado(true);
            props.onBlur?.();
          }
        }}
      >
        <div className="control-grupo">
          <input
            id={id}
            aria-label={props.label}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={abierto}
            aria-controls={`${id}-lista`}
            aria-activedescendant={
              abierto && filtradas[indice] ? `${id}-opcion-${indice}` : undefined
            }
            aria-required={props.required}
            aria-invalid={!!problema}
            aria-describedby={`${id}-hint${problema ? ` ${id}-error` : ''}`}
            name={`${props.name}-buscar`}
            value={abierto ? buscar : (seleccionada?.label ?? '')}
            disabled={props.disabled}
            maxLength={100}
            inputMode="search"
            placeholder={props.placeholder ?? 'Buscar y seleccionar…'}
            autoComplete="off"
            onFocus={() => {
              setAbierto(true);
              setIndice(0);
            }}
            onChange={(e) => {
              setBuscar(limpiarTexto(e.target.value));
              onBuscar?.(limpiarTexto(e.target.value));
              setIndice(0);
              setAbierto(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setAbierto(false);
                setBuscar('');
              }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setAbierto(true);
                setIndice((i) =>
                  Math.max(0, Math.min(filtradas.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))),
                );
              }
              if (e.key === 'Enter' && abierto) {
                e.preventDefault();
                const o = filtradas[indice];
                if (o && !o.disabled) elegir(o.value);
              }
            }}
          />
          <Flecha className="mr-3 shrink-0" size={16} aria-hidden="true" />
        </div>
        <input type="hidden" name={props.name} value={props.value} />
        {abierto && (
          <ul
            role="listbox"
            id={`${id}-lista`}
            className="select-opciones"
            aria-label={props.label}
          >
            {filtradas.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-opcion-${i}`}
                role="option"
                aria-selected={o.value === props.value}
                aria-disabled={o.disabled || undefined}
                className={i === indice ? 'opcion-activa' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!o.disabled) elegir(o.value);
                }}
              >
                {o.label}
              </li>
            ))}
            {!filtradas.length && (
              <li role="presentation">Sin coincidencias. Cambia la búsqueda.</li>
            )}
          </ul>
        )}
      </div>
      {complemento}
    </Field>
  );
}
