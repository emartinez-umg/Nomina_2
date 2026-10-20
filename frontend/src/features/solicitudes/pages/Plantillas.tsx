import { FormGrid } from '../../../components/forms/FormGrid';
import { useFormDraft } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import * as api from '../api/solicitudes';
import { HelpButton } from '../../../components/help/HelpProvider';
import { Modal, ConfirmModal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { SelectField, TextAreaField, FormErrorSummary } from '../../../components/forms';
import { useToast } from '../../../components/ui/Toast';
import { mapearErrores } from '../../../lib/http';
export function Plantillas({ onCerrar }: { onCerrar: () => void }) {
  const q = useQuery({
      queryKey: ['solicitudes', 'plantillas'],
      queryFn: ({ signal }) => api.plantillas(signal),
    }),
    [tipo, setTipo] = useState('');
  const p = q.data?.registros.find((p) => p.tipo === tipo) ?? q.data?.registros[0];
  return (
    <Modal abierto titulo="Plantillas de documentos" onCerrar={onCerrar}>
      {q.isPending ? (
        <Skeleton lineas={5} />
      ) : q.error ? (
        <>
          <p role="alert">{q.error.message}</p>
          <Button icono="actualizar" onClick={() => void q.refetch()}>
            Reintentar
          </Button>
        </>
      ) : (
        <>
          <FormGrid className="my-5">
            <SelectField
              name="plantilla"
              label="Tipo de documento"
              hint="Se conservará una versión por cada edición."
              value={p?.tipo ?? ''}
              opciones={(q.data?.registros ?? []).map((p) => ({ value: p.tipo, label: p.nombre }))}
              onValueChange={setTipo}
            />
          </FormGrid>
          {p && <Editor key={`${p.id}:${p.version}`} p={p} variables={q.data!.variables} />}
        </>
      )}
    </Modal>
  );
}
function Editor({ p, variables }: { p: api.Plantilla; variables: string[] }) {
  const cache = useQueryClient(),
    toast = useToast(),
    [confirmar, setConfirmar] = useState(false);
  const f = useForm<{ contenido: string; motivo: string }>({
    defaultValues: { contenido: p.contenido, motivo: '' },
    mode: 'onBlur',
    resolver: zodResolver(
      z.object({
        contenido: z
          .string()
          .trim()
          .min(20, 'Escribe al menos 20 caracteres.')
          .max(20000)
          .refine(
            (s) =>
              !/[{}]/.test(
                s.replace(/\{\{([a-z_]+)\}\}/g, (_, v: string) =>
                  variables.includes(v) ? '' : '{{}}',
                ),
              ),
            'Usa solo variables permitidas con el formato {{nombre}}.',
          ),
        motivo: z.string().trim().min(5, 'Explica el cambio con al menos 5 caracteres.').max(500),
      }),
    ),
  });
  const draft = useFormDraft('plantilla', p.id, {
    form: f,
    version: 1,
    alDescartar: () => setConfirmar(false),
  });
  const m = useMutation({
    mutationFn: () =>
      api.guardarPlantilla(p.tipo, { ...f.getValues(), version: p.version, confirmado: true }),
    onSuccess: () => {
      draft.limpiar();
      toast('Nueva versión guardada. Los documentos anteriores se conservan.');
      void cache.invalidateQueries({ queryKey: ['solicitudes', 'plantillas'] });
      setConfirmar(false);
    },
    onError: (e) => {
      mapearErrores(e, f.setError, ['contenido', 'motivo']);
      setConfirmar(false);
    },
  });
  return (
    <form data-tour="plantillas-editor" onSubmit={f.handleSubmit(() => setConfirmar(true))}>
      <FormDraftNotice draft={draft} />
      <HelpButton />
      <p>Versión {p.version} · Inserta datos del expediente:</p>
      <div className="flex flex-wrap gap-2 my-3">
        {variables.map((v) => (
          <Button
            key={v}
            icono="crear"
            variante="texto"
            disabled={m.isPending}
            onClick={() => {
              const area = document.querySelector<HTMLTextAreaElement>(
                'textarea[name="contenido"]',
              );
              const inicio = area?.selectionStart ?? f.getValues('contenido').length,
                fin = area?.selectionEnd ?? inicio;
              const texto = f.getValues('contenido');
              f.setValue('contenido', texto.slice(0, inicio) + `{{${v}}}` + texto.slice(fin), {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
          >{`{{${v}}}`}</Button>
        ))}
      </div>
      <FormGrid>
        <Controller
          control={f.control}
          name="contenido"
          render={({ field: { ref: _ref, ...field }, fieldState }) => (
            <TextAreaField
              {...field}
              label="Texto de la plantilla"
              required
              maxLength={20000}
              hint="Texto simple y variables insertables. Los datos faltantes impedirán aprobar el documento."
              placeholder="{{empresa}} hace constar que {{nombre}}…"
              error={fieldState.error?.message}
              onValueChange={field.onChange}
            />
          )}
        />
        <Controller
          control={f.control}
          name="motivo"
          render={({ field: { ref: _ref, ...field }, fieldState }) => (
            <TextAreaField
              {...field}
              label="Motivo del cambio"
              required
              maxLength={500}
              hint="Describe la modificación; quedará en la bitácora."
              error={fieldState.error?.message}
              onValueChange={field.onChange}
            />
          )}
        />
      </FormGrid>
      <FormErrorSummary
        mensajes={Object.values(f.formState.errors).map((e) => e.message)}
        mensajeServidor={m.error?.message}
      />
      <Button type="submit" icono="guardar" cargando={m.isPending}>
        Guardar nueva versión
      </Button>
      <ConfirmModal
        abierto={confirmar}
        titulo="Guardar plantilla"
        descripcion={`Se creará la versión ${p.version + 1}. Los documentos aprobados conservarán el texto de la versión anterior.`}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => m.mutate()}
        cargando={m.isPending}
      />
    </form>
  );
}
