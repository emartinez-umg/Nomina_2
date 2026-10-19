import { useId, useState } from 'react';
import { Field } from './Field';
import type { CampoProps } from './Field';
export function TextAreaField({
  name,
  label,
  hint,
  value,
  onValueChange,
  onBlur,
  required,
  disabled,
  error,
  placeholder,
  tamano,
  maxLength = 1000,
}: CampoProps & { maxLength?: number }) {
  const id = useId();
  const [tocado, setTocado] = useState(false);
  const problema =
    error ?? (tocado && required && !value.trim() ? 'Escribe el detalle solicitado.' : undefined);
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      required={required}
      error={problema}
      tipo="textarea"
      tamano={tamano}
      maxLength={maxLength}
    >
      <textarea
        id={id}
        aria-label={label}
        name={name}
        rows={4}
        value={value}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        inputMode="text"
        placeholder={placeholder ?? 'Escribe los detalles…'}
        aria-invalid={!!problema}
        aria-describedby={`${id}-hint${problema ? ` ${id}-error` : ''}`}
        onChange={(e) =>
          onValueChange(
            [...e.target.value]
              .filter(
                (c) =>
                  c === '\n' || c === '\t' || (c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
              )
              .join(''),
          )
        }
        onBlur={() => {
          setTocado(true);
          onBlur?.();
        }}
      />
    </Field>
  );
}
