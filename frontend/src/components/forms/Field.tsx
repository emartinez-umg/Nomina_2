import { useId, useState } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import { calcularAnchoCampo } from './tamanoCampo';
import type { TamanoProps } from './tamanoCampo';
import { Tooltip } from '../ui/Tooltip';
import { iconos } from '../ui/icons';
export interface CampoProps extends Pick<TamanoProps, 'tamano'> {
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
}
export function Field({
  label,
  hint,
  required,
  error,
  tamano,
  tipo,
  maxLength,
  id,
  children,
}: TamanoProps & {
  label: string;
  hint: string;
  required?: boolean | undefined;
  error?: string | undefined;
  id: string;
  children: ReactNode;
}) {
  const Info = iconos.informacion;
  const ancho = calcularAnchoCampo({ tipo, maxLength, tamano });
  const orientacion =
    maxLength && tipo !== 'select' && tipo !== 'zona' && !/caracteres|dígitos/i.test(hint)
      ? `${hint} Máximo ${maxLength} caracteres.`
      : hint;
  return (
    <div className="campo" style={{ '--campo-ancho': ancho } as CSSProperties} data-campo={label}>
      <div className="campo-etiqueta">
        <label htmlFor={id}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
        <Tooltip texto={orientacion}>
          <span role="img" tabIndex={0} aria-label={`Ayuda: ${label}`}>
            <Info size={16} aria-hidden="true" />
          </span>
        </Tooltip>
      </div>
      {children}
      <p id={`${id}-hint`} className="campo-hint">
        {orientacion}
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
  tipoDato?: TamanoProps['tipo'];
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
  tamano,
  tipoDato = 'texto',
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
    <Field
      id={id}
      label={label}
      hint={hint}
      required={required}
      error={problema}
      tamano={tamano}
      tipo={tipoDato}
      maxLength={maxLength}
    >
      <div className={`control-grupo ${problema ? 'control-error' : ''}`}>
        {prefijo && <span className="control-prefijo">{prefijo}</span>}
        <input
          id={id}
          ref={inputRef}
          name={name}
          aria-label={label}
          type={type}
          value={value}
          required={required}
          disabled={disabled}
          placeholder={placeholder ?? hint}
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
