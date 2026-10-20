import Decimal from 'decimal.js';
import { InputField } from './Field';
import type { CampoProps } from './Field';
import { limpiarNumero } from '../../lib/validadores';
export function NumberField({
  decimales = 0,
  min,
  max,
  negativo = false,
  maxLength = 18,
  ...props
}: CampoProps & {
  decimales?: number;
  maxLength?: number;
  min?: string;
  max?: string;
  negativo?: boolean;
}) {
  return (
    <InputField
      {...props}
      tipoDato="numero"
      maxLength={maxLength}
      inputMode={decimales ? 'decimal' : 'numeric'}
      pattern={negativo ? '-?[0-9]+(\\.[0-9]+)?' : '[0-9]+(\\.[0-9]+)?'}
      sanitizar={(v) => limpiarNumero(v, decimales, negativo)}
      validar={(v) => {
        if (!v && !props.required) return;
        if (!/^-?\d+(\.\d+)?$/.test(v)) return 'Ingresa un número válido.';
        const n = new Decimal(v);
        if (min !== undefined && n.lt(min))
          return `El valor mínimo es ${min}. Ingresa un valor igual o mayor.`;
        if (max !== undefined && n.gt(max))
          return `El valor máximo es ${max}. Ingresa un valor igual o menor.`;
      }}
    />
  );
}
