import { useId, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import { Field } from './Field';
import type { CampoProps } from './Field';
import { Button } from '../ui/Button';
import { fechaIso, fechaVisible, fechaValida } from '../../lib/validadores';
export function DateField({
  min,
  max,
  deshabilitar,
  validar,
  ...props
}: CampoProps & {
  min?: string;
  max?: string;
  deshabilitar?: (iso: string) => boolean;
  validar?: (iso: string) => string | undefined;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [borrador, setBorrador] = useState<string | null>(null);
  const iso = fechaIso(props.value);
  const noPermitida = (v: string) => !!((min && v < min) || (max && v > max) || deshabilitar?.(v));
  const localError =
    !props.value && !props.required
      ? undefined
      : !fechaValida(iso)
        ? 'Ingresa una fecha válida en formato dd/mm/aaaa.'
        : noPermitida(iso)
          ? 'Esta fecha no está permitida. Selecciona una fecha habilitada en el calendario.'
          : validar?.(iso);
  const problema = props.error ?? (tocado ? localError : undefined);
  const cambiar = (valor: string) => {
    const digits = valor.replace(/\D/g, '').slice(0, 8);
    const texto = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
      .filter(Boolean)
      .join('/');
    setBorrador(texto);
    props.onValueChange(fechaIso(texto));
  };
  return (
    <Field
      id={id}
      label={props.label}
      hint={props.hint}
      required={props.required}
      error={problema}
      tipo="fecha"
      tamano={props.tamano}
    >
      <div className="control-grupo">
        <input
          id={id}
          aria-label={props.label}
          name={props.name}
          value={borrador ?? fechaVisible(props.value)}
          maxLength={10}
          inputMode="numeric"
          pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
          placeholder="dd/mm/aaaa"
          required={props.required}
          disabled={props.disabled}
          aria-invalid={!!problema}
          aria-describedby={`${id}-hint${problema ? ` ${id}-error` : ''}`}
          onKeyDown={(e) => {
            if (!e.ctrlKey && !e.metaKey && e.key.length === 1 && !/[0-9/]/.test(e.key))
              e.preventDefault();
          }}
          onChange={(e) => cambiar(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            const el = e.currentTarget;
            cambiar(
              el.value.slice(0, el.selectionStart ?? el.value.length) +
                e.clipboardData.getData('text') +
                el.value.slice(el.selectionEnd ?? el.value.length),
            );
          }}
          onBlur={() => {
            setTocado(true);
            setBorrador(null);
            props.onBlur?.();
          }}
        />
        <Button
          icono="calendario"
          soloIcono
          variante="texto"
          aria-label={`Seleccionar ${props.label}`}
          aria-expanded={abierto}
          disabled={props.disabled}
          onClick={() => setAbierto((v) => !v)}
        />
      </div>
      {abierto && (
        <div
          role="dialog"
          aria-label={`Calendario: ${props.label}`}
          className="calendario"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAbierto(false);
          }}
        >
          <DayPicker
            mode="single"
            locale={es}
            showOutsideDays
            captionLayout="dropdown"
            startMonth={new Date('1900-01-01T12:00:00Z')}
            endMonth={new Date(`${max?.slice(0, 4) ?? '2100'}-12-31T12:00:00Z`)}
            selected={fechaValida(iso) ? new Date(`${iso}T12:00:00`) : undefined}
            disabled={(dia) =>
              noPermitida(
                `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`,
              )
            }
            onSelect={(dia) => {
              if (dia) {
                const v = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
                props.onValueChange(v);
                setBorrador(null);
                setTocado(true);
                props.onBlur?.();
                setAbierto(false);
              }
            }}
          />
          <Button icono="cancelar" variante="texto" onClick={() => setAbierto(false)}>
            Cerrar calendario
          </Button>
        </div>
      )}
    </Field>
  );
}
