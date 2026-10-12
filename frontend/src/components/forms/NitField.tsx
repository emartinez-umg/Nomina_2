import { InputField } from './Field';
import type { CampoProps } from './Field';
import { nitSchema, errorDe, formatearNit } from '../../lib/validadores';
export function NitField(props: CampoProps) {
  return (
    <InputField
      {...props}
      ancho={props.ancho ?? 'corto'}
      maxLength={14}
      inputMode="text"
      pattern="[0-9]+-[0-9K]"
      placeholder={props.placeholder ?? '1234567-9'}
      sanitizar={formatearNit}
      validar={(v) => (!v && !props.required ? undefined : errorDe(nitSchema, v))}
    />
  );
}
