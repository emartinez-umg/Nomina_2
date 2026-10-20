import { formatoNitValido, mensajeNit } from '../../../../backend/src/shared/empleados/validadores';
import { InputField } from './Field';
import type { CampoProps } from './Field';
import { nitSchema, errorDe, formatearNit } from '../../lib/validadores';
export function NitField({
  validarDigito = true,
  ...props
}: CampoProps & { validarDigito?: boolean | undefined }) {
  return (
    <InputField
      {...props}
      tipoDato="nit"
      maxLength={14}
      inputMode="text"
      pattern="[0-9]+-[0-9K]"
      placeholder={props.placeholder ?? '1234567-9'}
      sanitizar={formatearNit}
      validar={(v) =>
        !v && !props.required
          ? undefined
          : validarDigito
            ? errorDe(nitSchema, v)
            : formatoNitValido(v)
              ? undefined
              : mensajeNit
      }
    />
  );
}
