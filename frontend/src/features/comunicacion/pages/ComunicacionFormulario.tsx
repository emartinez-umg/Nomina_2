import { useFormDraft } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { HelpButton } from '../../../components/help/HelpProvider';
import {
  TextField,
  TextAreaField,
  DateField,
  SelectField,
  FormErrorSummary,
} from '../../../components/forms';
import { InputField } from '../../../components/forms/Field';
import type { CampoProps } from '../../../components/forms/Field';
import { useToast } from '../../../components/ui/Toast';
import { mapearErrores } from '../../../lib/http';
import { opciones } from '../../catalogos/api/catalogos';
import * as api from '../api/comunicacion';
export function GrupoField({
  tipo,
  onSeleccion,
  ...props
}: CampoProps & { tipo: string; onSeleccion?: (nombre: string) => void }) {
  const [buscar, setBuscar] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['comunicacion', 'grupos', tipo, buscar],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => opciones(tipo, buscar, pageParam, signal),
    getNextPageParam: (p, _all, n) => (p.length === 100 ? n + 1 : undefined),
  });
  return (
    <div>
      <SelectField
        {...props}
        opciones={q.data?.pages.flat() ?? []}
        onBuscar={setBuscar}
        onValueChange={(v) => {
          props.onValueChange(v);
          onSeleccion?.(q.data?.pages.flat().find((o) => o.value === v)?.label ?? v);
        }}
        error={props.error ?? q.error?.message}
      />
      {q.isPending && <p role="status">Cargando grupos…</p>}
      {q.hasNextPage && (
        <Button
          icono="siguiente"
          variante="texto"
          cargando={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
        >
          Más grupos
        </Button>
      )}
    </div>
  );
}
export function FechaHoraField({
  value,
  onValueChange,
  min,
  ...props
}: CampoProps & { min?: string }) {
  const fecha = value.slice(0, 10),
    hora = value.slice(11, 16);
  return (
    <div className="fecha-hora-campo">
      <DateField
        {...props}
        value={fecha}
        {...(min ? { min: min.slice(0, 10) } : {})}
        onValueChange={(v) => onValueChange(`${v}T${hora}`)}
      />
      <InputField
        {...props}
        name={`${props.name}Hora`}
        label={`Hora de ${props.label.toLowerCase()}`}
        hint="Hora de Guatemala, formato de 24 horas: 14:30."
        placeholder="hh:mm"
        value={hora}
        onValueChange={(v) => onValueChange(`${fecha}T${v}`)}
        maxLength={5}
        inputMode="numeric"
        pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
        sanitizar={(v) => v.replace(/[^0-9:]/g, '')}
        validar={(v) =>
          /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v)
            ? undefined
            : 'Ingresa una hora entre 00:00 y 23:59.'
        }
      />
    </div>
  );
}
export function ComunicacionFormulario({
  tipo,
  id,
  dia,
  onCerrar,
}: {
  tipo: api.Tipo;
  id?: number;
  dia?: string;
  onCerrar: () => void;
}) {
  const q = useQuery({
    queryKey: ['comunicacion', tipo, id],
    queryFn: ({ signal }) => api.detalle(tipo, id!, signal),
    enabled: !!id,
  });
  return (
    <Modal
      abierto
      titulo={`${id ? 'Editar' : 'Crear'} ${tipo === 'anuncios' ? 'anuncio' : 'evento'}`}
      onCerrar={onCerrar}
    >
      <HelpButton />
      {id && q.isPending ? (
        <Skeleton />
      ) : q.error ? (
        <p role="alert">{q.error.message}</p>
      ) : (
        <Editor tipo={tipo} id={id} dia={dia} inicial={q.data} onCerrar={onCerrar} />
      )}
    </Modal>
  );
}
function Editor({
  tipo,
  id,
  dia,
  inicial,
  onCerrar,
}: {
  tipo: api.Tipo;
  id?: number | undefined;
  dia?: string | undefined;
  inicial?: Awaited<ReturnType<typeof api.detalle>> | undefined;
  onCerrar: () => void;
}) {
  const ahora = api.horaGuatemala(),
    cache = useQueryClient(),
    toast = useToast();
  const f = useForm<
    api.Formulario & { grupoPendiente: string; seleccionPendiente: string; nombrePendiente: string }
  >({
    resolver: zodResolver(api.formularioSchema(tipo, ahora)),
    mode: 'onBlur',
    defaultValues: inicial
      ? {
          grupoPendiente: 'DEPARTAMENTO',
          seleccionPendiente: '',
          nombrePendiente: '',
          ...inicial,
          paraTodos: !!inicial.paraTodos,
          destinatarios: inicial.destinatarios,
        }
      : {
          grupoPendiente: 'DEPARTAMENTO',
          seleccionPendiente: '',
          nombrePendiente: '',
          titulo: '',
          contenido: '',
          inicio: tipo === 'anuncios' ? ahora.slice(0, 10) : `${dia ?? ahora.slice(0, 10)}T`,
          fin: tipo === 'anuncios' ? ahora.slice(0, 10) : `${dia ?? ahora.slice(0, 10)}T`,
          lugar: '',
          paraTodos: true,
          destinatarios: [],
          version: 1,
        },
  });
  const draft = useFormDraft(`comunicacion-${tipo}`, id, { form: f, version: 1 });
  const grupo = f.watch('grupoPendiente'),
    seleccion = f.watch('seleccionPendiente'),
    nombreSeleccion = f.watch('nombrePendiente');
  const setGrupo = (v: string) => f.setValue('grupoPendiente', v, { shouldDirty: true });
  const setSeleccion = (v: string) => f.setValue('seleccionPendiente', v, { shouldDirty: true });
  const setNombreSeleccion = (v: string) => f.setValue('nombrePendiente', v, { shouldDirty: true });
  const todos = f.watch('paraTodos'),
    destinatarios = f.watch('destinatarios');
  const m = useMutation({
    mutationFn: (d: api.Formulario) =>
      api.guardar(
        tipo,
        { ...d, destinatarios: d.destinatarios.map(({ tipo, id }) => ({ tipo, id })) },
        id,
      ),
    onSuccess: () => {
      draft.limpiar();
      void cache.invalidateQueries({ queryKey: ['comunicacion'] });
      void cache.invalidateQueries({ queryKey: ['tablero'] });
      void cache.invalidateQueries({ queryKey: ['notificaciones'] });
      toast('Publicación guardada y destinatarios notificados.', 'correcto');
      onCerrar();
    },
    onError: (e) =>
      mapearErrores(e, f.setError, [
        'titulo',
        'contenido',
        'inicio',
        'fin',
        'lugar',
        'destinatarios',
      ]),
  });
  const campo = (
    name: 'titulo' | 'contenido' | 'lugar' | 'inicio' | 'fin',
    label: string,
    hint: string,
  ) => (
    <Controller
      control={f.control}
      name={name}
      render={({ field: { ref: _ref, ...field }, fieldState }) => {
        const props = {
          ...field,
          label,
          hint,
          required: name !== 'lugar' || tipo === 'eventos',
          onValueChange: field.onChange,
          error: fieldState.error?.message,
        };
        return name === 'contenido' ? (
          <TextAreaField
            {...props}
            maxLength={10000}
            placeholder="Escribe el mensaje para el personal…"
          />
        ) : name === 'inicio' || name === 'fin' ? (
          tipo === 'eventos' ? (
            <FechaHoraField {...props} min={name === 'fin' ? f.watch('inicio') : ahora} />
          ) : (
            <DateField {...props} {...(name === 'fin' ? { min: f.watch('inicio') } : {})} />
          )
        ) : (
          <TextField
            {...props}
            maxLength={name === 'titulo' ? 200 : 250}
            ancho={name === 'lugar' ? 'ancho' : 'medio'}
            placeholder={
              name === 'titulo' ? 'Título de la publicación' : 'Sala, dirección o enlace'
            }
          />
        );
      }}
    />
  );
  return (
    <form
      onSubmit={f.handleSubmit((d) => m.mutate(d))}
      noValidate
      data-tour="comunicacion-formulario"
    >
      <FormDraftNotice draft={draft} />
      <fieldset disabled={m.isPending}>
        <div className="form-grid my-6">
          {campo('titulo', 'Título', 'Nombre breve que se mostrará en el tablero y en la campana.')}
          {campo(
            'contenido',
            'Contenido',
            'Texto de la publicación. Se conserva como texto, hasta 10,000 caracteres.',
          )}
          {campo(
            'inicio',
            'Inicio',
            tipo === 'eventos'
              ? 'Fecha y hora futuras en America/Guatemala.'
              : 'Primer día de vigencia, incluido.',
          )}
          {campo(
            'fin',
            'Fin',
            tipo === 'eventos'
              ? 'Fecha y hora iguales o posteriores al inicio.'
              : 'Último día visible, incluido.',
          )}
          {tipo === 'eventos' &&
            campo('lugar', 'Lugar', 'Indica ubicación o enlace de la reunión.')}
        </div>
        <section data-tour="destinatarios" className="mb-6">
          <h3>Destinatarios</h3>
          <label className="flex gap-2 my-3">
            <input
              type="checkbox"
              checked={todos}
              onChange={(e) => {
                f.setValue('paraTodos', e.target.checked);
                if (e.target.checked) f.setValue('destinatarios', []);
              }}
            />
            Todos los empleados activos
          </label>
          <p className="campo-hint">
            Si eliges grupos, reciben la publicación quienes pertenezcan a cualquiera de ellos. Una
            persona recibe un solo aviso por versión.
          </p>
          {!todos && (
            <>
              <div className="form-grid my-4">
                <SelectField
                  name="grupo"
                  label="Agrupar por"
                  hint="Selecciona departamento, puesto o jefatura."
                  value={grupo}
                  onValueChange={(v) => {
                    setGrupo(v);
                    setSeleccion('');
                  }}
                  opciones={[
                    { value: 'DEPARTAMENTO', label: 'Departamento' },
                    { value: 'PUESTO', label: 'Puesto' },
                    { value: 'JEFATURA', label: 'Jefatura' },
                  ]}
                />
                <GrupoField
                  key={grupo}
                  tipo={
                    grupo === 'DEPARTAMENTO'
                      ? 'departamentos'
                      : grupo === 'PUESTO'
                        ? 'puestos'
                        : 'jefaturas'
                  }
                  onSeleccion={setNombreSeleccion}
                  name="seleccion"
                  label="Grupo destinatario"
                  hint="Busca y selecciona un grupo activo; después presiona Agregar grupo."
                  value={seleccion}
                  onValueChange={setSeleccion}
                />
              </div>
              <Button
                icono="crear"
                variante="secundario"
                disabled={
                  !seleccion ||
                  destinatarios.some((d) => d.tipo === grupo && d.id === Number(seleccion))
                }
                onClick={() => {
                  f.setValue(
                    'destinatarios',
                    [
                      ...destinatarios,
                      {
                        tipo: grupo as 'DEPARTAMENTO' | 'PUESTO' | 'JEFATURA',
                        id: Number(seleccion),
                        nombre: nombreSeleccion,
                      },
                    ],
                    { shouldValidate: true },
                  );
                  setSeleccion('');
                }}
              >
                Agregar grupo
              </Button>
              <ul className="my-3">
                {destinatarios.map((d) => (
                  <li key={`${d.tipo}:${d.id}`} className="flex items-center gap-2">
                    <span>
                      {d.tipo} · {d.nombre ?? d.id}
                    </span>
                    <Button
                      icono="cancelar"
                      variante="texto"
                      aria-label={`Quitar ${d.tipo} ${d.nombre ?? d.id}`}
                      onClick={() =>
                        f.setValue(
                          'destinatarios',
                          destinatarios.filter((v) => v !== d),
                          { shouldValidate: true },
                        )
                      }
                    >
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </fieldset>
      <FormErrorSummary
        mensajes={Object.values(f.formState.errors).map((e) => e.message)}
        mensajeServidor={m.error?.message}
      />
      <div className="flex gap-3 justify-end">
        <Button icono="cancelar" variante="secundario" disabled={m.isPending} onClick={onCerrar}>
          Cancelar
        </Button>
        <Button icono="guardar" type="submit" cargando={m.isPending}>
          Guardar y notificar
        </Button>
      </div>
    </form>
  );
}
