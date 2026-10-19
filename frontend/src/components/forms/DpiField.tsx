import { InputField } from './Field';
import type { CampoProps } from './Field';
import { dpiSchema, errorDe, formatearDpi } from '../../lib/validadores';
export function DpiField(props: CampoProps) {
  return (
    <InputField
      {...props}
      tipoDato="dpi"
      maxLength={15}
      inputMode="numeric"
      pattern="[0-9]{4} [0-9]{5} [0-9]{4}"
      placeholder={props.placeholder ?? '1234 56789 0101'}
      sanitizar={formatearDpi}
      validar={(v) => (!v && !props.required ? undefined : errorDe(dpiSchema, v))}
    />
  );
}
