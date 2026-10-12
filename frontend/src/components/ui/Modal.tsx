import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
export function Modal({
  abierto,
  titulo,
  children,
  onCerrar,
}: {
  abierto: boolean;
  titulo: string;
  children: ReactNode;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previo = document.activeElement as HTMLElement | null;
    if (abierto && dialog && !dialog.open) dialog.showModal();
    if (!abierto && dialog?.open) dialog.close();
    return () => {
      if (dialog?.open) dialog.close();
      previo?.focus();
    };
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id={id}>{titulo}</h2>
        <Button
          icono="cancelar"
          soloIcono
          variante="texto"
          aria-label="Cerrar ventana"
          onClick={onCerrar}
        />
      </div>
      {children}
    </dialog>
  );
}
export function ConfirmModal({
  abierto,
  titulo,
  descripcion,
  onConfirmar,
  onCancelar,
  cargando = false,
}: {
  abierto: boolean;
  titulo: string;
  descripcion: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  cargando?: boolean;
}) {
  return (
    <Modal
      abierto={abierto}
      titulo={titulo}
      onCerrar={() => {
        if (!cargando) onCancelar();
      }}
    >
      <p className="my-6 text-secundario">{descripcion}</p>
      <div className="flex justify-end gap-3">
        <Button icono="cancelar" variante="secundario" disabled={cargando} onClick={onCancelar}>
          Cancelar
        </Button>
        <Button icono="aprobar" variante="peligro" cargando={cargando} onClick={onConfirmar}>
          Confirmar
        </Button>
      </div>
    </Modal>
  );
}
