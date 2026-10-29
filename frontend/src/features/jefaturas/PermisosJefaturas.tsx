import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listarTodos } from '../catalogos/api/listarTodos';
import { consultarPermisos, guardarPermisos } from '../equipo/api';
import type { PermisoEquipo } from '../equipo/api';
import { SelectField, TextAreaField } from '../../components/forms';
import { FormDraftNotice } from '../../components/forms/FormDraftNotice';
import { useFormDraft } from '../../hooks/useFormDraft';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmModal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { CatalogoHistorial } from '../catalogos/pages/CatalogoHistorial';
import type { Catalogo } from '../catalogos/api/catalogos';
import { iconos } from '../../components/ui/icons';
export function PermisosJefaturas({ cat }: { cat: Catalogo }) {
  const [id, setId] = useState('');
  const q = useQuery({
    queryKey: ['catalogos', 'jefaturas', 'permisos-opciones'],
    queryFn: ({ signal }) => listarTodos('jefaturas', {}, signal),
  });
  return (
    <Card className="my-5">
      <div data-tour="permisos-jefatura">
        <SelectField
          name="jefaturaPermisos"
          label="Jefatura"
          hint="Selecciona la jefatura cuyo responsable recibirá los permisos. Incluye sus descendientes activas."
          value={id}
          onValueChange={setId}
          opciones={q.data?.map((f) => ({ value: String(f.id), label: String(f.nombre) })) ?? []}
          error={q.error?.message}
        />
      </div>
      {id && <EditorPermisos key={id} id={Number(id)} cat={cat} />}
    </Card>
  );
}
function EditorPermisos({ id, cat }: { id: number; cat: Catalogo }) {
  const q = useQuery({
    queryKey: ['equipo', 'permisos', id],
    queryFn: ({ signal }) => consultarPermisos(id, signal),
  });
  if (!q.data || q.error)
    return (
      <p role={q.error ? 'alert' : 'status'}>
        {q.error?.message ?? 'Consultando equipo y permisos…'}
        {q.error && (
          <Button icono="actualizar" onClick={() => void q.refetch()}>
            Reintentar
          </Button>
        )}
      </p>
    );
  return (
    <FormularioPermisos
      key={q.data.revision}
      id={id}
      datos={q.data}
      cat={cat}
      recargar={() => void q.refetch()}
    />
  );
}
function FormularioPermisos({
  id,
  datos,
  cat,
  recargar,
}: {
  id: number;
  datos: Awaited<ReturnType<typeof consultarPermisos>>;
  cat: Catalogo;
  recargar: () => void;
}) {
  const form = useForm({
    defaultValues: {
      permisos: datos.permisos.filter((p) => p.activo).map((p) => p.codigo),
      motivo: '',
    },
  });
  const d = form.watch(),
    cliente = useQueryClient(),
    toast = useToast();
  const draft = useFormDraft('permisos-jefatura', id, { form, version: 1 });
  const [confirmar, setConfirmar] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [historia, setHistoria] = useState(false);
  const guardar = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await guardarPermisos(id, { ...d, revision: datos.revision, confirmado: true });
      draft.limpiar();
      await Promise.all([
        cliente.invalidateQueries({ queryKey: ['equipo'] }),
        cliente.invalidateQueries({ queryKey: ['sesion'] }),
      ]);
      toast('Permisos actualizados y auditados.');
    } catch (e) {
      form.setError('root', { message: (e as Error).message });
    } finally {
      setConfirmar(false);
      setOcupado(false);
    }
  };
  return (
    <>
      <p className="my-4 text-lg">
        <strong>Equipo: {datos.equipo} personas</strong> · {datos.jefatura}
      </p>
      <p className="campo-hint">
        El responsable conserva el rol Empleado. Las ramas inactivas y el propio jefe quedan
        excluidos.
      </p>
      <form onSubmit={form.handleSubmit(() => setConfirmar(true))}>
        <fieldset disabled={ocupado}>
          <FormDraftNotice draft={draft} />
          <div data-tour="permisos-interruptores" className="my-5 space-y-4">
            {datos.permisos.map((p) => (
              <div key={p.codigo} className="flex gap-3 items-start">
                <button
                  type="button"
                  role="switch"
                  aria-checked={d.permisos.includes(p.codigo)}
                  aria-label={p.nombre}
                  title={p.descripcion}
                  className={`relative shrink-0 rounded-full w-12 h-7 border-2 border-primario ${d.permisos.includes(p.codigo) ? 'bg-primario' : 'bg-white'}`}
                  onClick={() =>
                    form.setValue(
                      'permisos',
                      d.permisos.includes(p.codigo)
                        ? d.permisos.filter((v) => v !== p.codigo)
                        : ([...d.permisos, p.codigo] as PermisoEquipo[]),
                      { shouldDirty: true },
                    )
                  }
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full ${d.permisos.includes(p.codigo) ? 'right-0.5 bg-white' : 'left-0.5 bg-primario'}`}
                  >
                    {d.permisos.includes(p.codigo) ? (
                      <iconos.aprobar aria-hidden="true" className="h-4 w-4 m-0.5 text-primario" />
                    ) : (
                      <iconos.cancelar aria-hidden="true" className="h-4 w-4 m-0.5 text-white" />
                    )}
                  </span>
                </button>
                <div>
                  <strong>{p.nombre}</strong>
                  <p className="campo-hint">{p.descripcion}</p>
                  {p.codigo === 'VER_COMISIONES_EQUIPO' && (
                    <p className="campo-hint">
                      Las estadísticas de comisiones estarán disponibles próximamente.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div data-tour="permisos-guardar">
            <TextAreaField
              name="motivo"
              label="Motivo del cambio"
              required
              hint="Explica por qué concedes o retiras estos accesos; se registra en el historial de la jefatura."
              maxLength={500}
              value={d.motivo}
              onValueChange={(v) => form.setValue('motivo', v, { shouldDirty: true })}
              error={form.formState.errors.motivo?.message}
            />
            <input
              type="hidden"
              {...form.register('motivo', {
                validate: (v) =>
                  v.trim().length >= 5 || 'Explica el motivo con al menos 5 caracteres.',
              })}
            />
            {form.formState.errors.root && (
              <p role="alert">
                {form.formState.errors.root.message}{' '}
                <Button icono="actualizar" onClick={recargar}>
                  Recargar permisos
                </Button>
              </p>
            )}
            <div className="my-4 flex flex-wrap gap-3">
              <Button icono="guardar" type="submit" cargando={ocupado}>
                Revisar permisos
              </Button>
              <Button icono="historial" variante="secundario" onClick={() => setHistoria(true)}>
                Ver auditoría
              </Button>
            </div>
          </div>
        </fieldset>
      </form>
      {confirmar && (
        <ConfirmModal
          abierto
          titulo="Confirmar permisos de jefatura"
          descripcion={`Equipo: ${datos.equipo} personas. Permisos activos: ${
            datos.permisos
              .filter((p) => d.permisos.includes(p.codigo))
              .map((p) => p.nombre)
              .join(', ') || 'Ninguno'
          }. El cambio se aplica en las siguientes consultas y queda auditado.`}
          cargando={ocupado}
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() => void guardar()}
        />
      )}
      {historia && (
        <CatalogoHistorial
          cat={cat}
          fila={{ id, nombre: datos.jefatura, activo: true, enUso: true }}
          onCerrar={() => setHistoria(false)}
        />
      )}
      <p className="campo-hint">
        <iconos.ayuda className="inline h-4 w-4" aria-hidden="true" /> Usa Ayuda para revisar el
        alcance de cada permiso.
      </p>
    </>
  );
}
