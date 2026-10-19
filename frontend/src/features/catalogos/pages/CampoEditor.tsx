import { InputField } from '../../../components/forms/Field';
import {
  hintNombreCatalogo,
  validarNombreCatalogo,
  recortarNombreCatalogo,
  sanearNombreCatalogo,
} from '../../../../../backend/src/shared/catalogos/nombre';
import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Campo, Fila } from '../api/catalogos';
import { opciones } from '../api/catalogos';
import {
  TextField,
  NitField,
  EmailField,
  PhoneField,
  TextAreaField,
  MoneyField,
  NumberField,
  DateField,
  SelectField,
} from '../../../components/forms';
import type { CampoProps } from '../../../components/forms/Field';
import { Button } from '../../../components/ui/Button';
export function Referencia({
  campo,
  actual,
  ...props
}: CampoProps & { campo: Campo; actual?: Fila | undefined }) {
  const [buscar, setBuscar] = useState('');
  const [busqueda, setBusqueda] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setBusqueda(buscar), 250);
    return () => clearTimeout(timer);
  }, [buscar]);
  const q = useInfiniteQuery({
    queryKey: ['catalogos', 'opciones', campo.referencia, busqueda],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => opciones(campo.referencia!, busqueda, pageParam, signal),
    getNextPageParam: (ultima, todas) => (ultima.length === 100 ? todas.length + 1 : undefined),
  });
  const lista = q.data?.pages.flat() ?? [];
  if (
    props.value &&
    actual &&
    String(actual[campo.nombre]) === props.value &&
    !lista.some((o) => o.value === props.value)
  )
    lista.unshift({
      value: props.value,
      label: String(actual?.[campo.nombre + 'Etiqueta'] ?? `Registro ${props.value}`),
    });
  return (
    <SelectField
      {...props}
      opciones={lista}
      onBuscar={setBuscar}
      complemento={
        <>
          {q.hasNextPage && (
            <div className="col-span-12">
              <Button
                icono="siguiente"
                variante="texto"
                cargando={q.isFetchingNextPage}
                onClick={() => void q.fetchNextPage()}
              >
                Cargar más opciones de {campo.etiqueta}
              </Button>
            </div>
          )}
          {q.error && (
            <p role="alert" className="campo-error col-span-12">
              {q.error.message}
              <Button icono="actualizar" variante="texto" onClick={() => void q.refetch()}>
                Reintentar opciones
              </Button>
            </p>
          )}
        </>
      }
    />
  );
}
export function CampoEditor({
  campo,
  actual,
  minFecha,
  ...props
}: CampoProps & { campo: Campo; actual?: Fila | undefined; minFecha?: string | undefined }) {
  if (campo.nombre === 'nombre')
    return (
      <InputField
        {...props}
        hint={hintNombreCatalogo}
        maxLength={campo.max ?? 120}
        sanitizar={sanearNombreCatalogo}
        alSalir={recortarNombreCatalogo}
        validar={(v) => validarNombreCatalogo(v, campo.max)}
        pattern={String.raw`[\p{L}\p{M}0-9 .,\-\/&\(\)']+`}
      />
    );
  switch (campo.tipo) {
    case 'nit':
      return <NitField {...props} />;
    case 'correo':
      return <EmailField {...props} />;
    case 'telefono':
      return <PhoneField {...props} />;
    case 'nombre':
      return <TextField {...props} tipo="nombre" maxLength={campo.max ?? 200} />;
    case 'referencia':
      return <Referencia {...props} campo={campo} actual={actual} />;
    case 'fecha':
      return <DateField {...props} {...(minFecha ? { min: minFecha } : {})} />;
    case 'dinero':
      return <MoneyField {...props} />;
    case 'entero':
    case 'decimal':
      return (
        <NumberField
          {...props}
          decimales={campo.decimales ?? 0}
          min="0"
          {...(campo.tipo === 'entero' ? { max: '1440' } : {})}
        />
      );
    case 'opcion':
      return (
        <SelectField
          {...props}
          opciones={campo.opciones?.map((v) => ({ value: v, label: v.replace(/_/g, ' ') })) ?? []}
        />
      );
    case 'booleano':
      return (
        <SelectField
          {...props}
          opciones={[
            { value: '1', label: 'Sí' },
            { value: '0', label: 'No' },
          ]}
        />
      );
    case 'area':
      return <TextAreaField {...props} maxLength={campo.max ?? 500} />;
    case 'codigo':
      return null; // CampoCodigo recibe el contexto del formulario.
    default:
      return <TextField {...props} maxLength={campo.max ?? 120} />;
  }
}
