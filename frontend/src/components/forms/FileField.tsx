import { useId, useState } from 'react';
import { Field } from './Field';
import type { TamanoCampo } from './tamanoCampo';
import { iconos } from '../ui/icons';
export function FileField({
  name,
  label,
  hint,
  onValueChange,
  accept,
  maxBytes,
  required = false,
  error,
  disabled = false,
  tamano,
}: {
  tamano?: TamanoCampo;
  name: string;
  label: string;
  hint: string;
  onValueChange: (v: File | null) => void;
  accept: string;
  maxBytes: number;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [problema, setProblema] = useState<string>();
  const Subir = iconos.cargar;
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      required={required}
      error={error ?? problema}
      tipo="archivo"
      tamano={tamano}
    >
      <div className="control-grupo">
        <Subir size={18} className="ml-3" aria-hidden="true" />
        <input
          id={id}
          type="file"
          name={name}
          accept={accept}
          required={required}
          disabled={disabled}
          aria-invalid={!!(error ?? problema)}
          aria-describedby={`${id}-hint${error || problema ? ` ${id}-error` : ''}`}
          onBlur={(e) => {
            if (required && !e.target.files?.length)
              setProblema('Selecciona el archivo solicitado.');
          }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setProblema(undefined);
            const permitido =
              f &&
              accept.split(',').some((t) => {
                const tipo = t.trim().toLowerCase();
                return tipo.startsWith('.')
                  ? f.name.toLowerCase().endsWith(tipo)
                  : tipo.endsWith('/*')
                    ? f.type.startsWith(tipo.slice(0, -1))
                    : f.type === tipo;
              });
            if (f && (!permitido || f.size > maxBytes)) {
              setProblema(
                !permitido
                  ? `El formato no está permitido. Selecciona un archivo ${accept}.`
                  : `El archivo supera ${Math.ceil(maxBytes / 1024 / 1024)} MB. Selecciona uno más pequeño.`,
              );
              e.target.value = '';
              onValueChange(null);
              return;
            }
            onValueChange(f ?? null);
          }}
        />
      </div>
    </Field>
  );
}
