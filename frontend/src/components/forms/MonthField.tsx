import { useId } from 'react';
import { Field } from './Field';
import type { CampoProps } from './Field';
const nombres = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
export function MonthField({
  max,
  deshabilitar,
  ...p
}: CampoProps & {
  max?: string | undefined;
  deshabilitar?: ((mes: string) => boolean) | undefined;
}) {
  const id = useId();
  const limite = Number(max?.slice(0, 4) ?? new Date().getFullYear());
  const [yearValue, month] = p.value.split('-'),
    year = yearValue || String(limite);
  const anios = Array.from({ length: limite - 1899 }, (_, i) => String(limite - i));
  const elegir = (y: string, m: string) => {
    const v = y && m ? `${y}-${m}` : '';
    if (v && ((max && v > max) || deshabilitar?.(v))) {
      const valido = nombres
        .map((_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
        .find((x) => (!max || x <= max) && !deshabilitar?.(x));
      p.onValueChange(valido ?? '');
    } else p.onValueChange(v);
  };
  return (
    <Field id={id} label={p.label} hint={p.hint} error={p.error} required={p.required}>
      <div className="flex gap-2">
        <select
          id={id}
          name={p.name}
          aria-label={p.label}
          aria-required={p.required}
          aria-invalid={!!p.error}
          required={p.required}
          aria-describedby={`${id}-hint${p.error ? ` ${id}-error` : ''}`}
          value={month ?? ''}
          disabled={p.disabled}
          onBlur={p.onBlur}
          onChange={(e) => elegir(year ?? String(limite), e.target.value)}
          className="min-h-11 min-w-0 rounded-control border border-borde bg-white px-3 py-2"
        >
          <option value="">Mes</option>
          {nombres.map((nombre, i) => {
            const m = String(i + 1).padStart(2, '0'),
              valor = `${year ?? limite}-${m}`;
            return (
              <option key={m} value={m} disabled={!!(max && valor > max) || deshabilitar?.(valor)}>
                {nombre}
              </option>
            );
          })}
        </select>
        <select
          aria-label={`Año de ${p.label.toLowerCase()}`}
          aria-describedby={`${id}-hint${p.error ? ` ${id}-error` : ''}`}
          value={year ?? String(limite)}
          disabled={p.disabled}
          onBlur={p.onBlur}
          onChange={(e) => elegir(e.target.value, month ?? '01')}
          className="min-h-11 min-w-0 rounded-control border border-borde bg-white px-3 py-2"
        >
          {anios.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </div>
    </Field>
  );
}
