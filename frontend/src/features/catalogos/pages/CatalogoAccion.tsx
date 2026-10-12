import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eliminar, estado } from '../api/catalogos';
import type { Catalogo, Fila } from '../api/catalogos';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { TextAreaField, SelectField, FormErrorSummary } from '../../../components/forms';
import { useToast } from '../../../components/ui/Toast';
import { useSession } from '../../../app/session';
export function CatalogoAccion({
  cat,
  fila,
  tipo,
  onCerrar,
}: {
  cat: Catalogo;
  fila: Fila;
  tipo: 'eliminar' | 'estado';
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [fisica, setFisica] = useState('0');
  const [error, setError] = useState<string>();
  const cliente = useQueryClient();
  const toast = useToast();
  const { usuario } = useSession();
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
      void cliente.invalidateQueries({ queryKey: ['catalogos'] });
      toast('Cambio aplicado y auditado.');
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
      <p className="alerta mt-4">
        {tipo === 'eliminar'
          ? 'La baja lógica conserva el registro y lo oculta de nuevas asignaciones. No se pueden eliminar registros en uso.'
          : fila.activo
            ? 'La desactivación impide nuevas asignaciones y conserva las referencias existentes.'
            : 'El registro volverá a estar disponible para nuevas asignaciones.'}
      </p>
      {cat.legal && (
        <p className="my-4 font-bold">
          Estado anterior: {fila.activo ? 'Activo' : 'Inactivo'} → Nuevo:{' '}
          {tipo === 'eliminar' || fila.activo ? 'Inactivo' : 'Activo'}. Las versiones que afectan
          periodos cerrados o ya utilizadas se conservan.
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
      <div className="my-4">
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
      <div className="mt-5 flex justify-end gap-3">
        <Button
          icono="cancelar"
          variante="secundario"
          disabled={accion.isPending}
          onClick={onCerrar}
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
