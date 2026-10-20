import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { solicitar } from '../../lib/http';
import { Field } from './Field';
import type { TamanoCampo } from './tamanoCampo';
export function CampoCodigo({
  entidad,
  palabra = '',
  idDepartamento,
  codigo,
  tamano,
}: {
  entidad: string;
  palabra?: string | undefined;
  idDepartamento?: string | undefined;
  codigo?: string | undefined;
  tamano?: TamanoCampo | undefined;
}) {
  const id = useId();
  const entrada = JSON.stringify({ entidad, palabra, idDepartamento });
  const [consulta, setConsulta] = useState(entrada);
  useEffect(() => {
    const t = setTimeout(() => setConsulta(entrada), 250);
    return () => clearTimeout(t);
  }, [entrada]);
  const q = useQuery({
    queryKey: ['codigos', 'vista-previa', consulta],
    enabled:
      !codigo &&
      entrada === consulta &&
      (entidad === 'empleados'
        ? !!idDepartamento
        : ['solicitudes', 'prestamos', 'descuentos', 'anuncios', 'eventos'].includes(entidad) ||
          !!palabra.trim()),
    queryFn: ({ signal }) => {
      const d = JSON.parse(consulta) as {
        entidad: string;
        palabra: string;
        idDepartamento?: string;
      };
      const params = new URLSearchParams({ entidad: d.entidad });
      if (d.palabra) params.set('palabra', d.palabra);
      if (d.idDepartamento) params.set('idDepartamento', d.idDepartamento);
      return solicitar(
        `/codigos/vista-previa?${params}`,
        z.object({ codigo: z.string(), definitivo: z.literal(false) }),
        { signal },
      );
    },
    staleTime: 0,
    retry: false,
  });
  const vista = codigo ?? (entrada === consulta ? q.data?.codigo : undefined);
  return (
    <div className="contents" data-tour="codigo-automatico">
      <Field
        id={id}
        label="Código"
        hint={
          codigo
            ? 'Código permanente. Se conserva al cambiar el nombre o departamento.'
            : 'Vista previa orientativa. El servidor asigna el código definitivo al guardar, evitando duplicados. No se puede editar.'
        }
        error={!codigo && entrada === consulta ? q.error?.message : undefined}
        tipo="codigo"
        tamano={tamano ?? Math.max(18, vista?.length ?? 0)}
      >
        <div className="control-grupo">
          <input
            id={id}
            aria-label="Código"
            name="codigo"
            readOnly
            aria-readonly="true"
            value={vista ?? ''}
            maxLength={80}
            aria-describedby={`${id}-hint`}
            placeholder={
              entidad === 'empleados' ? 'Selecciona el departamento' : 'Escribe el nombre'
            }
          />
        </div>
        {!codigo && q.isFetching && (
          <p role="status" className="campo-hint">
            Consultando código…
          </p>
        )}
      </Field>
    </div>
  );
}
