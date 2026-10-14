import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { CampoProps } from '../../../components/forms/Field';
import { InputField } from '../../../components/forms/Field';
import {
  TextField,
  DpiField,
  NitField,
  PhoneField,
  EmailField,
  DateField,
  MoneyField,
  TextAreaField,
  SelectField,
} from '../../../components/forms';
import { Button } from '../../../components/ui/Button';
import type { CampoEmpleado as Def } from '../api/formulario';
import { opciones } from '../api/empleados';
import type { Reglas } from '../api/empleados';
import { validarNacimiento, validarIngreso, fechaValida } from '../../../lib/validadores';
export function RefField(props: CampoProps & { departamento?: string | undefined }) {
  const [buscar, setBuscar] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['empleados', 'opciones', props.name, buscar, props.value, props.departamento],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      opciones(props.name, buscar, pageParam, props.value, props.departamento, signal),
    getNextPageParam: (last, _all, lastPage) => (last.length === 100 ? lastPage + 1 : undefined),
  });
  const todas = [...new Map((q.data?.pages.flat() ?? []).map((o) => [o.value, o])).values()];
  return (
    <div>
      <SelectField
        {...props}
        opciones={todas}
        onBuscar={setBuscar}
        error={props.error ?? q.error?.message}
      />
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
    </div>
  );
}
export function CampoEmpleado({
  campo,
  reglas,
  nacimiento,
  ingreso,
  departamento,
  ...props
}: CampoProps & {
  campo: Def;
  reglas?: Reglas | undefined;
  nacimiento?: string | undefined;
  ingreso?: string | undefined;
  departamento?: string | undefined;
}) {
  if (campo.tipo === 'referencia') return <RefField {...props} departamento={departamento} />;
  if (campo.tipo === 'opcion')
    return (
      <>
        <SelectField
          {...props}
          opciones={(campo.opciones ?? []).map((v) => ({
            value: v,
            label: v === 'F' ? 'Femenino' : v === 'M' ? 'Masculino' : v === 'O' ? 'Otro' : v,
          }))}
        />
        {!props.required && props.value && (
          <Button icono="cancelar" variante="texto" onClick={() => props.onValueChange('')}>
            Quitar selección
          </Button>
        )}
      </>
    );
  if (campo.tipo === 'dpi') return <DpiField {...props} />;
  if (campo.tipo === 'nit') return <NitField {...props} />;
  if (campo.tipo === 'telefono') return <PhoneField {...props} />;
  if (campo.tipo === 'correo') return <EmailField {...props} />;
  if (campo.tipo === 'dinero') return <MoneyField {...props} />;
  if (campo.tipo === 'area') return <TextAreaField {...props} maxLength={campo.max ?? 500} />;
  if (campo.tipo === 'fecha')
    return (
      <DateField
        {...props}
        {...(campo.nombre === 'fechaNacimiento' && reglas
          ? {
              max: reglas.hoy,
              deshabilitar: (v: string) =>
                !!validarNacimiento(v, reglas.hoy, reglas.edadMinima, reglas.edadMaxima),
            }
          : {})}
        {...(campo.nombre === 'fechaIngreso' && reglas && nacimiento && fechaValida(nacimiento)
          ? {
              deshabilitar: (v: string) =>
                !!validarIngreso(v, nacimiento, reglas.hoy, reglas.edadMinima),
            }
          : {})}
        {...(campo.nombre === 'fechaFinContrato' && ingreso ? { min: ingreso } : {})}
      />
    );
  if (campo.tipo === 'numero')
    return (
      <InputField
        {...props}
        maxLength={campo.max ?? 20}
        sanitizar={(v) => v.replace(/\D/g, '')}
        inputMode="numeric"
        pattern="[0-9]*"
      />
    );
  if (campo.nombre === 'codigo') return null;
  if (campo.nombre === 'cuentaBancaria')
    return (
      <InputField
        {...props}
        maxLength={34}
        sanitizar={(v) => v.replace(/[^A-Za-z0-9-]/g, '')}
        pattern="[A-Za-z0-9-]*"
      />
    );
  return (
    <TextField
      {...props}
      tipo={campo.tipo === 'nombre' ? 'nombre' : 'texto'}
      maxLength={campo.max ?? 100}
    />
  );
}
