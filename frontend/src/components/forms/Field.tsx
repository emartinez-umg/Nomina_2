import { useId, useState } from 'react';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { Tooltip } from '../ui/Tooltip';
import { iconos } from '../ui/icons';
export interface CampoProps {
  name: string;
  label: string;
  hint: string;
  value: string;
  onValueChange: (v: string) => void;
  inputRef?: Ref<HTMLInputElement> | undefined;
  onBlur?: (() => void) | undefined;
  error?: string | undefined;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  ancho?: 'corto' | 'medio' | 'ancho';
}
export function Field({
  label,
  hint,
  required,
  error,
  ancho = 'medio',
  id,
  children,
}: {
  label: string;
  hint: string;
  required?: boolean | undefined;
  error?: string | undefined;
  ancho?: CampoProps['ancho'] | undefined;
  id: string;
  children: ReactNode;
}) {
  const Info = iconos.informacion;
  return (
    <div className={`campo campo-${ancho}`}>
      <div className="campo-etiqueta">
        <label htmlFor={id}>
          {label}
          {required && <span aria-label="obligatorio"> *</span>}
        </label>
        <Tooltip texto={hint}>
          <span tabIndex={0} aria-label={`Ayuda: ${label}`}>
            <Info size={16} aria-hidden="true" />
          </span>
        </Tooltip>
      </div>
      {children}
      <p id={`${id}-hint`} className="campo-hint">
        {hint}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="campo-error">
          {error}
        </p>
      )}
    </div>
  );
}
interface InputProps extends CampoProps {
  sanitizar: (v: string) => string;
  validar?: ((v: string) => string | undefined) | undefined;
  type?: string;
  maxLength: number;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  pattern?: string;
  autoComplete?: string;
  prefijo?: string;
  sufijo?: ReactNode;
  alSalir?: ((v: string) => string) | undefined;
}
export function InputField({
  name,
  inputRef,
  label,
  hint,
  value,
  onValueChange,
  onBlur,
  error,
  required,
  disabled,
  placeholder,
  ancho,
  sanitizar,
  validar,
  type = 'text',
  maxLength,
  inputMode = 'text',
  pattern,
  autoComplete,
  prefijo,
  sufijo,
  alSalir,
}: InputProps) {
  const id = useId();
  const [tocado, setTocado] = useState(false);
  const problema =
    error ??
    (tocado
      ? required && !value
        ? 'Este campo es obligatorio. Ingresa el dato solicitado.'
        : validar?.(value)
      : undefined);
  return (
    <Field id={id} label={label} hint={hint} required={required} error={problema} ancho={ancho}>
      <div className={`control-grupo ${problema ? 'control-error' : ''}`}>
        {prefijo && <span className="control-prefijo">{prefijo}</span>}
        <input
          id={id}
          ref={inputRef}
          name={name}
          type={type}
          value={value}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={maxLength}
          inputMode={inputMode}
          pattern={pattern}
          autoComplete={autoComplete}
          aria-invalid={!!problema}
          aria-describedby={`${id}-hint${problema ? ` ${id}-error` : ''}`}
          onChange={(e) => onValueChange(sanitizar(e.target.value).slice(0, maxLength))}
          onKeyDown={(e) => {
            if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && !sanitizar(e.key))
              e.preventDefault();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const el = e.currentTarget;
            const pegado =
              el.value.slice(0, el.selectionStart ?? el.value.length) +
              e.clipboardData.getData('text') +
              el.value.slice(el.selectionEnd ?? el.value.length);
            onValueChange(sanitizar(pegado).slice(0, maxLength));
          }}
          onBlur={() => {
            setTocado(true);
            if (alSalir && value) onValueChange(alSalir(value));
            onBlur?.();
          }}
        />
        {sufijo}
      </div>
    </Field>
  );
}
