import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { departamentosGt, municipiosGt } from '../../features/ubicaciones/api/ubicaciones';
import { SelectField } from './SelectField';
import { Button } from '../ui/Button';

export interface UbicacionValor {
  idDepartamentoGt: string;
  idMunicipioGt: string;
}
export function UbicacionSelect({
  value,
  onChange,
  predeterminar = true,
  disabled = false,
  errores = {},
  onBlur,
}: {
  value: UbicacionValor;
  onChange: (valor: UbicacionValor, predeterminado?: boolean) => void;
  predeterminar?: boolean;
  disabled?: boolean;
  errores?: { idDepartamentoGt?: string | undefined; idMunicipioGt?: string | undefined };
  onBlur?: ((campo: keyof UbicacionValor) => void) | undefined;
}) {
  const departamentos = useQuery({
    queryKey: ['ubicaciones', 'departamentos'],
    queryFn: ({ signal }) => departamentosGt(signal),
    staleTime: Infinity,
  });
  const departamento =
    value.idDepartamentoGt ||
    (predeterminar && !value.idMunicipioGt
      ? String(departamentos.data?.find((d) => d.codigo === '01')?.id ?? '')
      : '');
  const municipios = useQuery({
    queryKey: ['ubicaciones', 'municipios', departamento],
    queryFn: ({ signal }) => municipiosGt(departamento, signal),
    enabled: !!departamento,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (!predeterminar || value.idDepartamentoGt || value.idMunicipioGt || !departamento) return;
    const guatemala = municipios.data?.find((m) => m.codigo === '0101');
    if (guatemala)
      onChange({ idDepartamentoGt: departamento, idMunicipioGt: String(guatemala.id) }, true);
  }, [
    predeterminar,
    value.idDepartamentoGt,
    value.idMunicipioGt,
    departamento,
    municipios.data,
    onChange,
  ]);
  const incompatible =
    !!value.idMunicipioGt &&
    !!municipios.data &&
    !municipios.data.some((m) => String(m.id) === value.idMunicipioGt);
  return (
    <div
      className="col-span-12 grid grid-cols-12 gap-4"
      data-tour="ubicacion-select"
      aria-busy={departamentos.isPending || (!!departamento && municipios.isPending)}
    >
      <div className="col-span-12 md:col-span-6" data-tour="campo-idDepartamentoGt">
        <SelectField
          name="idDepartamentoGt"
          label="Departamento de Guatemala"
          required
          hint="Departamento geográfico del catálogo oficial del INE. Busca por nombre; al cambiarlo vuelve a elegir el municipio."
          placeholder={departamentos.isPending ? 'Cargando departamentos…' : 'Buscar departamento…'}
          value={value.idDepartamentoGt}
          disabled={disabled || departamentos.isPending || !!departamentos.error}
          opciones={(departamentos.data ?? []).map((d) => ({
            value: String(d.id),
            label: d.nombre,
          }))}
          onValueChange={(idDepartamentoGt) => {
            if (idDepartamentoGt !== value.idDepartamentoGt)
              onChange({ idDepartamentoGt, idMunicipioGt: '' });
          }}
          onBlur={() => onBlur?.('idDepartamentoGt')}
          error={errores.idDepartamentoGt}
        />
      </div>
      <div className="col-span-12 md:col-span-6" data-tour="campo-idMunicipioGt">
        <SelectField
          key={departamento}
          name="idMunicipioGt"
          label="Municipio"
          required
          hint={
            !departamento
              ? 'Selecciona primero el departamento para consultar sus municipios.'
              : 'Busca y selecciona un municipio del departamento elegido. No se permite escribir una localidad libre.'
          }
          placeholder={
            municipios.isPending && departamento ? 'Cargando municipios…' : 'Buscar municipio…'
          }
          value={value.idMunicipioGt}
          disabled={
            disabled || !value.idDepartamentoGt || municipios.isPending || !!municipios.error
          }
          opciones={(municipios.data ?? []).map((m) => ({ value: String(m.id), label: m.nombre }))}
          onValueChange={(idMunicipioGt) => onChange({ ...value, idMunicipioGt })}
          onBlur={() => onBlur?.('idMunicipioGt')}
          error={
            errores.idMunicipioGt ??
            (incompatible
              ? 'El municipio no pertenece al departamento seleccionado. Vuelve a seleccionarlo.'
              : undefined)
          }
        />
      </div>
      {(departamentos.error || municipios.error) && (
        <p className="campo-error col-span-12" role="alert">
          No se pudo cargar el catálogo de ubicaciones. Reintenta para seleccionar una ubicación
          válida.
          <Button
            icono="actualizar"
            variante="texto"
            onClick={() => {
              void departamentos.refetch();
              if (departamento) void municipios.refetch();
            }}
          >
            Reintentar ubicaciones
          </Button>
        </p>
      )}
    </div>
  );
}
