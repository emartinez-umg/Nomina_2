import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { plantillaActaSchema } from '../../../../backend/src/shared/actas/modelo';
import { useDraftValues } from '../../hooks/useFormDraft';
import { useSession } from '../../app/session';
import { FormDraftNotice } from '../../components/forms/FormDraftNotice';
import { TextField, TextAreaField, FormErrorSummary } from '../../components/forms';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { usePageHelp } from '../../components/help/HelpProvider';
import { ayudaActas } from './help/pasos';
import * as api from './api';
import type { z } from 'zod';
export function ActaPlantillaPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaActas(), usuario?.rol);
  const q = useQuery({
    queryKey: ['actas', 'plantilla', usuario?.idUsuario],
    queryFn: ({ signal }) => api.plantilla(signal),
    retry: false,
  });
  if (q.isPending) return <Skeleton lineas={6} />;
  if (q.error)
    return (
      <div role="alert">
        {q.error.message}
        <Button icono="actualizar" onClick={() => void q.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  return <EditorPlantilla key={q.data!.version} p={q.data!} />;
}
function EditorPlantilla({ p }: { p: z.infer<typeof api.plantillaSchema> }) {
  const cliente = useQueryClient(),
    nav = useNavigate(),
    [confirmado, setConfirmado] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState('');
  const {
    valores: v,
    campo,
    draft,
  } = useDraftValues(
    'plantilla-actas',
    p.id,
    { nombre: p.nombre, contenido: p.contenido, motivo: '' },
    true,
    {
      alDescartar: () => {
        setConfirmado(false);
        setError('');
      },
    },
  );
  return (
    <>
      <h1>Plantilla de actas</h1>
      <Card>
        <div data-tour="actas-plantilla">
          <FormDraftNotice draft={draft} />
          <p className="my-3">
            Versión vigente: {p.version}. La nueva versión solo afecta emisiones posteriores.
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (ocupado) return;
              const d = plantillaActaSchema.safeParse({ ...v, version: p.version, confirmado });
              if (!d.success) {
                setError(d.error.issues.map((x) => x.message).join(' '));
                return;
              }
              setOcupado(true);
              void api
                .guardarPlantilla(d.data)
                .then(async () => {
                  draft.limpiar();
                  await cliente.invalidateQueries({ queryKey: ['actas', 'plantilla'] });
                  nav('/actas');
                })
                .catch((err: Error) => setError(err.message))
                .finally(() => setOcupado(false));
            }}
          >
            <TextField
              name="nombre"
              label="Título del documento"
              hint="De 3 a 150 caracteres; aparece debajo del membrete."
              required
              maxLength={150}
              value={v.nombre}
              onValueChange={campo('nombre')[1]}
              disabled={ocupado}
            />
            <TextAreaField
              name="contenido"
              label="Contenido"
              hint="De 30 a 12,000 caracteres. Conserva todas las variables; se reemplazan con los datos del acta al emitir."
              required
              maxLength={12000}
              value={v.contenido}
              onValueChange={campo('contenido')[1]}
              disabled={ocupado}
            />
            <div className="flex flex-wrap gap-2 my-4">
              {p.variables.map((x) => (
                <Button
                  key={x}
                  icono="crear"
                  variante="texto"
                  disabled={ocupado}
                  onClick={() => campo('contenido')[1]((s) => `${s}\n{{${x}}}`)}
                >{`Insertar {{${x}}}`}</Button>
              ))}
            </div>
            <p className="campo-hint my-3">
              El sistema agrega la línea Recibí conforme y la firma con nombre completo y cargo de
              quien emite. Las actas emitidas conservan su PDF original.
            </p>
            <TextAreaField
              name="motivo"
              label="Motivo del cambio"
              hint="De 5 a 500 caracteres; se registra junto a la nueva versión."
              required
              maxLength={500}
              value={v.motivo}
              onValueChange={campo('motivo')[1]}
              disabled={ocupado}
            />
            <label className="flex gap-2 my-4">
              <input
                type="checkbox"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
                disabled={ocupado}
              />
              Confirmo el cambio de la versión {p.version} a la {p.version + 1}.
            </label>
            <FormErrorSummary mensajes={[]} mensajeServidor={error} />
            <div className="flex gap-3 my-4">
              <Button
                icono="cancelar"
                variante="secundario"
                disabled={ocupado}
                onClick={() => draft.cancelar(() => nav('/actas'))}
              >
                Cancelar
              </Button>
              <Button icono="guardar" type="submit" disabled={!confirmado} cargando={ocupado}>
                Guardar nueva versión
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </>
  );
}
