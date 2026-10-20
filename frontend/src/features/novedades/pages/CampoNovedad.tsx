import { MonthField } from '../../../components/forms/MonthField';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { opciones } from '../api/novedades';
import type { Restricciones } from '../api/novedades';
import type { Campo } from '../api/formulario';
import type { CampoProps } from '../../../components/forms/Field';
import {
  DateField,
  MoneyField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../components/forms';
import { Button } from '../../../components/ui/Button';
import { SelectorEmpleado } from '../../../components/forms/SelectorEmpleado';
export function ReferenciaNovedad({
  referencia,
  departamentoId,
  soloActivos,
  ...props
}: CampoProps & {
  referencia: string;
  departamentoId?: string | undefined;
  soloActivos?: boolean | undefined;
}) {
  return referencia === 'empleados' ? (
    <SelectorEmpleado {...props} departamentoId={departamentoId} soloActivos={soloActivos} />
  ) : (
    <OpcionesNovedad {...props} referencia={referencia} />
  );
}
function OpcionesNovedad({ referencia, ...props }: CampoProps & { referencia: string }) {
  const [buscar, setBuscar] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['novedades', 'opciones', referencia, buscar, props.value],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      opciones(referencia, buscar, pageParam, props.value, signal),
    getNextPageParam: (last, _all, lastPage) => (last.length === 100 ? lastPage + 1 : undefined),
  });
  const lista = [...new Map((q.data?.pages.flat() ?? []).map((o) => [o.value, o])).values()];
  return (
    <SelectField
      {...props}
      opciones={lista}
      onBuscar={setBuscar}
      error={props.error ?? q.error?.message}
      complemento={
        <>
          {q.isPending && (
            <p role="status" className="campo-hint">
              Cargando opciones…
            </p>
          )}
          {q.hasNextPage && (
            <Button
              icono="siguiente"
              variante="texto"
              cargando={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              Más opciones
            </Button>
          )}
          {!props.required && props.value && (
            <Button
              icono="cancelar"
              variante="texto"
              disabled={props.disabled}
              onClick={() => props.onValueChange('')}
            >
              Quitar selección
            </Button>
          )}
        </>
      }
    />
  );
}
export function CampoNovedad({
  campo,
  r,
  hoy,
  tipoN,
  inicio,
  soloActivos,
  ...props
}: CampoProps & {
  campo: Campo;
  soloActivos?: boolean;
  r?: Restricciones | undefined;
  hoy?: string | undefined;
  tipoN?: string;
  inicio?: string | undefined;
}) {
  if (campo.tipo === 'mes')
    return (
      <MonthField
        {...props}
        max={hoy?.slice(0, 7)}
        deshabilitar={(mes) =>
          !!r?.cierres.some((x) => x.inicio.slice(0, 7) <= mes && x.fin.slice(0, 7) >= mes)
        }
      />
    );
  if (campo.tipo === 'referencia')
    return <ReferenciaNovedad {...props} referencia={campo.ref!} soloActivos={soloActivos} />;
  if (campo.tipo === 'opcion')
    return (
      <SelectField
        {...props}
        opciones={(campo.opciones ?? []).map((value) => ({
          value,
          label: value.replace(/_/g, ' '),
        }))}
      />
    );
  if (campo.tipo === 'dinero') return <MoneyField {...props} />;
  if (campo.tipo === 'numero')
    return (
      <NumberField
        {...props}
        decimales={campo.nombre.startsWith('horas') ? 2 : 0}
        min={/Min$|Max$/.test(campo.nombre) ? '0' : campo.nombre.startsWith('horas') ? '0.5' : '1'}
        max={campo.nombre.startsWith('horas') ? '9999999999' : '600'}
      />
    );
  if (campo.tipo === 'fecha') {
    const minimo =
      campo.nombre === 'fechaFin'
        ? inicio
        : tipoN === 'prestamos' && campo.nombre === 'fechaInicio'
          ? hoy
          : r?.empleado?.inicio;
    const min = [minimo, r?.empleado?.inicio]
      .filter((v): v is string => !!v)
      .sort()
      .at(-1);
    const max = [
      r?.empleado?.fin,
      tipoN === 'prestamos' && campo.nombre === 'fechaDesembolso' ? inicio : undefined,
    ]
      .filter((v): v is string => !!v)
      .sort()[0];
    return (
      <DateField
        {...props}
        {...(min ? { min } : {})}
        {...(max ? { max } : {})}
        deshabilitar={(v) =>
          !!r?.cierres.some((x) => v >= x.inicio && v <= x.fin) ||
          (tipoN === 'ausencias' && !!r?.rangos.some((x) => v >= x.inicio && v <= x.fin))
        }
      />
    );
  }
  if (campo.tipo === 'area') return <TextAreaField {...props} maxLength={500} />;
  return <TextField {...props} maxLength={100} />;
}
