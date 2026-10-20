import Decimal from 'decimal.js';
import { InputField } from './Field';
import type { CampoProps } from './Field';
import { limpiarNumero } from '../../lib/validadores';
export function formatoMoneda(v: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(v.replace(/,/g, ''))) return v;
  const [entero, centavos] = new Decimal(v.replace(/,/g, ''))
    .toFixed(2, Decimal.ROUND_HALF_UP)
    .split('.');
  return `${entero?.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${centavos}`;
}
export function MoneyField(props: CampoProps) {
  return (
    <InputField
      {...props}
      tipoDato="monto"
      prefijo="Q"
      inputMode="decimal"
      maxLength={16}
      placeholder={props.placeholder ?? '1,234.56'}
      pattern="[0-9,]+(\\.[0-9]{1,2})?"
      sanitizar={(v) => limpiarNumero(v, 2)}
      alSalir={formatoMoneda}
      validar={(v) => {
        if (!v && !props.required) return;
        const n = v.replace(/,/g, '');
        if (!/^\d+(\.\d{1,2})?$/.test(n)) return 'Ingresa un monto positivo con hasta 2 decimales.';
        if (new Decimal(n).gt('9999999999.99'))
          return 'El monto supera Q 9,999,999,999.99. Revisa el valor.';
      }}
    />
  );
}
export const CurrencyField = MoneyField;
