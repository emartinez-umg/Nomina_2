import { InputField } from './Field';
import type { CampoProps } from './Field';
import { telefonoSchema, errorDe, formatearTelefono } from '../../lib/validadores';
export function PhoneField(props: CampoProps) {
  return (
    <InputField
      {...props}
      ancho={props.ancho ?? 'corto'}
      maxLength={9}
      inputMode="tel"
      autoComplete="tel-national"
      pattern="[0-9]{4} [0-9]{4}"
      placeholder={props.placeholder ?? '5555 1234'}
      sanitizar={formatearTelefono}
      validar={(v) => (!v && !props.required ? undefined : errorDe(telefonoSchema, v))}
    />
  );
}
