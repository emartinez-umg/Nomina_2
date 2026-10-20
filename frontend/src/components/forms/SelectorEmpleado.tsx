import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { seleccionarEmpleados } from '../../features/empleados/api/empleados';
import type { CampoProps } from './Field';
import { SelectField } from './SelectField';
import { Button } from '../ui/Button';

export function SelectorEmpleado({
  departamentoId = '',
  soloActivos = true,
  seleccionActual,
  ...props
}: CampoProps & {
  departamentoId?: string | undefined;
  soloActivos?: boolean | undefined;
  seleccionActual?: string | undefined;
}) {
  const [texto, setTexto] = useState('');
  const [buscar, setBuscar] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setBuscar(texto), 250);
    return () => clearTimeout(timer);
  }, [texto]);
  const q = useInfiniteQuery({
    queryKey: [
      'empleados',
      'selector',
      departamentoId,
      soloActivos,
      buscar,
      props.value,
      seleccionActual,
    ],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      seleccionarEmpleados(
        {
          ...(departamentoId ? { departamentoId } : {}),
          ...(props.value ? { seleccionado: props.value } : {}),
          ...(props.value && props.value === seleccionActual
            ? { incluirSeleccionInactiva: 'true' }
            : {}),
          soloActivos: String(soloActivos),
          buscar,
          pagina: String(pageParam),
        },
        signal,
      ),
    getNextPageParam: (last) =>
      last.pagina * last.limite < last.total ? last.pagina + 1 : undefined,
  });
  const primera = q.data?.pages[0];
  const { value, onValueChange } = props;
  const anterior = useRef<{ value: string; idDepartamento: number } | null>(null);
  useEffect(() => {
    // El servidor comprueba pertenencia incluso en borradores, enlaces y selecciones fuera de página.
    const ajeno =
      departamentoId &&
      anterior.current?.value === value &&
      String(anterior.current.idDepartamento) !== departamentoId;
    if (value && (ajeno || (primera && !primera.seleccionado))) onValueChange('');
    if (primera?.seleccionado) anterior.current = primera.seleccionado;
    if (!value) anterior.current = null;
  }, [value, departamentoId, primera, onValueChange]);
  const seleccion = primera?.seleccionado;
  const registros = [
    ...new Map(
      [...(seleccion ? [seleccion] : []), ...(q.data?.pages.flatMap((p) => p.registros) ?? [])].map(
        (e) => [e.value, e],
      ),
    ).values(),
  ];
  return (
    <div className="contents" data-tour="selector-empleado">
      <SelectField
        {...props}
        hint={`${props.hint} ${departamentoId ? 'Solo empleados del departamento elegido; si cambias a otro, se retira una selección ajena.' : 'Sin departamento se muestran todos e identifican su departamento.'} Busca por código o nombre.`}
        opciones={registros.map((e) => ({
          value: e.value,
          disabled:
            soloActivos &&
            e.value === seleccionActual &&
            !q.data?.pages.some((p) => p.registros.some((r) => r.value === e.value)),
          oculta:
            !!buscar && !q.data?.pages.some((p) => p.registros.some((r) => r.value === e.value)),
          label: `${e.codigo} · ${e.nombre}${!departamentoId ? ` · ${e.departamento}` : ''}${e.estado !== 'ACTIVO' ? ` (${e.estado.toLowerCase()})` : ''}`,
        }))}
        onBuscar={setTexto}
        filtrarEnServidor
        onValueChange={(v) => {
          setTexto('');
          props.onValueChange(v);
        }}
        error={props.error ?? q.error?.message}
        complemento={
          <>
            {q.isFetching && (
              <p role="status" className="campo-hint">
                Cargando empleados…
              </p>
            )}
            {primera?.total === 0 && (
              <p role="status" className="campo-hint">
                {buscar
                  ? 'No hay empleados que coincidan con la búsqueda. Prueba otro código o nombre.'
                  : departamentoId
                    ? `Este departamento no tiene empleados${soloActivos ? ' activos' : ''}. Elige otro departamento o quita el filtro.`
                    : 'No hay empleados disponibles para seleccionar.'}
              </p>
            )}
            {q.error && (
              <Button icono="actualizar" variante="texto" onClick={() => void q.refetch()}>
                Reintentar empleados
              </Button>
            )}
            {q.hasNextPage && (
              <Button
                icono="siguiente"
                variante="texto"
                cargando={q.isFetchingNextPage}
                onClick={() => void q.fetchNextPage()}
              >
                Más empleados
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
    </div>
  );
}
