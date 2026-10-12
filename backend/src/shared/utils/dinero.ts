import { Decimal } from 'decimal.js';

export const dinero = (valor: Decimal.Value) =>
  new Decimal(valor).toFixed(2, Decimal.ROUND_HALF_UP);
