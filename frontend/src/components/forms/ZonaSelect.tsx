import type { CampoProps } from './Field';
import { SelectField } from './SelectField';

export const zonaValida = (codigoMunicipio: string, zona: string) =>
  (zona === '' || /^(?:[1-9]|1\d|2[0-5])$/.test(zona)) &&
  (codigoMunicipio !== '0101' || zona !== '');

export function ZonaSelect({
  codigoMunicipio,
  ...props
}: Omit<CampoProps, 'label' | 'hint' | 'required'> & { codigoMunicipio: string }) {
  const required = codigoMunicipio === '0101';
  return (
    <SelectField
      {...props}
      tipoDato="zona"
      label="Zona"
      required={required}
      hint={
        required
          ? 'En el municipio de Guatemala debes elegir una zona del 1 al 25. No aplica no es válido aquí.'
          : 'Selecciona una zona del 1 al 25 si corresponde; en otros municipios puedes usar No aplica.'
      }
      placeholder="Buscar zona…"
      error={
        props.error ??
        (!zonaValida(codigoMunicipio, props.value)
          ? 'Selecciona una zona del 1 al 25 para el municipio de Guatemala.'
          : undefined)
      }
      opciones={[
        { value: '', label: 'No aplica' },
        ...Array.from({ length: 25 }, (_, i) => ({ value: String(i + 1), label: `Zona ${i + 1}` })),
      ]}
    />
  );
}
