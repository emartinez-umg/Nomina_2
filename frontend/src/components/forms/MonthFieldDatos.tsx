import { MonthField } from './MonthField';
import type { ComponentProps } from 'react';
import { useRangoAnios, type FuenteAnios } from '../../hooks/useRangoAnios';
import { Button } from '../ui/Button';
import { SelectField } from './SelectField';
import type { CampoProps } from './Field';
export function MonthFieldDatos({
  fuente,
  ...props
}: ComponentProps<typeof MonthField> & { fuente: FuenteAnios }) {
  const { consulta, rango } = useRangoAnios(fuente);
  return (
    <div className="contents" data-anios-datos>
      <MonthField
        {...props}
        anioMin={rango.anioMin}
        anioMax={rango.anioMax}
        anios={rango.anios}
        hint={`${props.hint} Años con registros y año actual; se omiten los años sin datos.`}
      />
      {consulta.isError && (
        <p role="alert" className="campo-error">
          No se pudieron consultar los años; se ofrece el año actual.
          <Button icono="actualizar" variante="texto" onClick={() => void consulta.refetch()}>
            Reintentar años
          </Button>
        </p>
      )}
    </div>
  );
}
export function AnioFieldDatos({ fuente, ...props }: CampoProps & { fuente: FuenteAnios }) {
  const { consulta, rango } = useRangoAnios(fuente);
  return (
    <SelectField
      {...props}
      hint={`${props.hint} Años con registros y año actual.`}
      opciones={rango.anios.map((anio) => ({ value: String(anio), label: String(anio) }))}
      complemento={
        consulta.isError ? (
          <Button icono="actualizar" variante="texto" onClick={() => void consulta.refetch()}>
            Reintentar años
          </Button>
        ) : undefined
      }
    />
  );
}
