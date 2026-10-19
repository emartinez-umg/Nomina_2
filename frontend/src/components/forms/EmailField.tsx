import { InputField } from './Field';
import type { CampoProps } from './Field';
import { correoSchema, errorDe, limpiarCorreo } from '../../lib/validadores';
export function EmailField(props: CampoProps) {
  return (
    <InputField
      {...props}
      tipoDato="correo"
      type="email"
      maxLength={254}
      inputMode="email"
      autoComplete="email"
      pattern="[^@\\s]+@[^@\\s]+\\.[^@\\s]+"
      placeholder={props.placeholder ?? 'nombre@empresa.com'}
      sanitizar={limpiarCorreo}
      validar={(v) => (!v && !props.required ? undefined : errorDe(correoSchema, v))}
    />
  );
}
