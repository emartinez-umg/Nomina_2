import { HelpProvider, usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaAccionCatalogo } from '../help/pasos';
import { useDraftValues } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eliminar, estado } from '../api/catalogos';
import type { Catalogo, Fila } from '../api/catalogos';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { TextAreaField, SelectField, FormErrorSummary } from '../../../components/forms';
import { useToast } from '../../../components/ui/Toast';
import { useSession } from '../../../app/session';
function Accion({
  cat,
  fila,
  tipo,
  onCerrar,
  onExito,
}: {
  cat: Catalogo;
  fila: Fila;
  tipo: 'eliminar' | 'estado';
  onCerrar: () => void;
  onExito?: () => void;
}) {
  const { campo, draft } = useDraftValues(`catalogo-${cat.slug}-${tipo}`, fila.id, {
    motivo: '',
    fisica: '0',
  });
  const [motivo, setMotivo] = campo('motivo');
  const [fisica, setFisica] = campo('fisica');
  const [error, setError] = useState<string>();
  const cliente = useQueryClient();
  const toast = useToast();
  const { usuario } = useSession();
  const ayuda = useMemo(() => ayudaAccionCatalogo(tipo), [tipo]);
  usePageHelp(ayuda, usuario?.rol);
  const accion = useMutation({
    mutationFn: () =>
      tipo === 'eliminar'
        ? eliminar(cat.slug, fila.id, {
            motivo: motivo.trim(),
            fisica: fisica === '1',
            confirmado: true,
          })
        : estado(cat.slug, fila.id, {
            motivo: motivo.trim(),
            activo: !fila.activo,
            ...(cat.legal ? { confirmado: true } : {}),
          }),
    onSuccess: () => {
      draft.limpiar();
      void cliente.invalidateQueries({ queryKey: ['catalogos'] });
      void cliente.invalidateQueries({ queryKey: ['empleados', 'opciones'] });
      void cliente.invalidateQueries({ queryKey: ['empleados', 'parentescos'] });
      toast('Cambio aplicado y auditado.');
      onExito?.();
      onCerrar();
    },
  });
  return (
    <Modal
      abierto
      titulo={`${cat.legal ? 'ADVERTENCIA · ' : ''}${tipo === 'eliminar' ? 'Eliminar registro' : fila.activo ? 'Desactivar registro' : 'Activar registro'}`}
      onCerrar={() => {
        if (!accion.isPending) onCerrar();
      }}
    >
      <FormDraftNotice draft={draft} />
      <p className="mt-4 font-bold" data-tour="catalogo-accion-datos">
        {String(fila.nombre ?? cat.titulo)}
      </p>
      <p className="alerta mt-4">
        {tipo === 'eliminar'
          ? 'La baja lógica conserva el registro y lo oculta de nuevas asignaciones. No se pueden eliminar registros en uso.'
          : fila.activo
            ? 'La desactivación impide nuevas asignaciones y conserva las referencias existentes.'
            : 'El registro volverá a estar disponible para nuevas asignaciones.'}
      </p>
      {fila.enUso && fila.activo && tipo === 'estado' && (
        <p className="alerta mt-4">
          Advertencia: lo usan {fila.usos} registro(s) de empleados u otras tablas. Seguirá visible
          en esos registros, pero no podrá elegirse en formularios nuevos.
        </p>
      )}
      {cat.legal && (
        <p className="my-4 font-bold">
          Estado anterior: {fila.activo ? 'Activo' : 'Inactivo'} → Nuevo:{' '}
          {tipo === 'eliminar' || fila.activo ? 'Inactivo' : 'Activo'}. Los valores y documentos de
          periodos cerrados se conservan; cambiar el estado afecta su disponibilidad futura.
        </p>
      )}
      {usuario?.rol === 'ADMIN' && tipo === 'eliminar' && (
        <SelectField
          name="fisica"
          label="Tipo de eliminación"
          hint="La eliminación física es irreversible y exige que no existan referencias."
          value={fisica}
          onValueChange={setFisica}
          opciones={[
            { value: '0', label: 'Baja lógica (recomendada)' },
            { value: '1', label: 'Eliminación física irreversible' },
          ]}
          disabled={accion.isPending}
        />
      )}
      <div className="my-4" data-tour="catalogo-accion-motivo">
        <TextAreaField
          name="motivo"
          label="Motivo"
          hint="Explica por qué realizas esta acción (5–500 caracteres)."
          required
          maxLength={500}
          value={motivo}
          onValueChange={setMotivo}
          error={error}
          disabled={accion.isPending}
        />
      </div>
      <FormErrorSummary mensajes={[]} mensajeServidor={accion.error?.message} />
      <div className="mt-5 flex justify-end gap-3" data-tour="catalogo-accion-confirmar">
        <Button
          icono="cancelar"
          variante="secundario"
          disabled={accion.isPending}
          onClick={onCerrar}
          cancelarFormulario
        >
          Cancelar
        </Button>
        <Button
          icono="aprobar"
          variante="peligro"
          cargando={accion.isPending}
          onClick={() => {
            if (motivo.trim().length < 5) {
              setError('Explica el motivo con al menos 5 caracteres.');
              return;
            }
            setError(undefined);
            if (!accion.isPending) accion.mutate();
          }}
        >
          Confirmar
        </Button>
      </div>
    </Modal>
  );
}

export function CatalogoAccion(props: Parameters<typeof Accion>[0]) {
  return (
    <HelpProvider>
      <Accion {...props} />
    </HelpProvider>
  );
}
