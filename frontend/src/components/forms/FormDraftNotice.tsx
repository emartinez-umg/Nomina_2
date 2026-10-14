import { useEffect, useState } from 'react';
import type { FormDraft } from '../../hooks/useFormDraft';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/Modal';
import { iconos } from '../ui/icons';

export function FormDraftNotice({ draft }: { draft: FormDraft }) {
  const [confirmar, setConfirmar] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    if (!draft.pendiente) return;
    const timer = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [draft.pendiente]);
  const minutos = Math.max(0, Math.floor((ahora - (draft.pendiente?.guardado ?? ahora)) / 60000));
  return (
    <aside
      className="my-4 rounded-xl border border-borde bg-suave p-4 col-span-12"
      data-tour="borrador-formulario"
      aria-label="Borrador del formulario"
    >
      {draft.pendiente ? (
        <>
          <p role="status">
            Tienes un borrador guardado hace {minutos} {minutos === 1 ? 'minuto' : 'minutos'}.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button icono="siguiente" onClick={draft.continuar}>
              Continuar
            </Button>
            <Button icono="eliminar" variante="secundario" onClick={() => setConfirmar(true)}>
              Descartar borrador
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="flex items-center gap-2">
            <iconos.guardar size={18} aria-hidden="true" />
            {draft.error
              ? 'No se pudo guardar el borrador en este navegador.'
              : draft.guardado
                ? 'Borrador guardado'
                : 'Autoguardado de borrador activado'}
          </p>
          {draft.guardado && (
            <Button icono="eliminar" variante="texto" onClick={() => setConfirmar(true)}>
              Descartar borrador
            </Button>
          )}
        </div>
      )}
      <p className="campo-hint mt-2">
        Se guarda en este navegador mientras escribes. Al volver, pulsa Continuar para retomarlo.
        Guardar con éxito o cerrar sesión elimina el borrador. Contraseñas, tokens y archivos quedan
        excluidos; vuelve a seleccionar los adjuntos.
      </p>
      {draft.error && (
        <p className="campo-hint">
          Puedes seguir editando y guardar el formulario. Revisa el espacio y los permisos de
          almacenamiento del navegador.
        </p>
      )}
      {confirmar && (
        <ConfirmModal
          abierto
          titulo="Descartar borrador"
          descripcion="Se eliminará el borrador de este formulario y se volverá a sus valores iniciales. Esta acción no se puede deshacer."
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() => {
            draft.descartar();
            setConfirmar(false);
          }}
        />
      )}
    </aside>
  );
}
