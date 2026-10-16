import { useMemo } from 'react';
import { HelpProvider, usePageHelp } from '../../components/help/HelpProvider';
import { useSession } from '../../app/session';
import { ayudaCatalogo } from '../catalogos/help/pasos';
import { useQuery } from '@tanstack/react-query';
import type { Catalogo } from '../catalogos/api/catalogos';
import { definiciones } from '../catalogos/api/catalogos';
import { CatalogoFormulario } from '../catalogos/pages/CatalogoFormulario';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
export function CrearHorarioModal({
  onCerrar,
  onCreado,
}: {
  onCerrar: () => void;
  onCreado: (id: string) => void;
}) {
  const q = useQuery({
    queryKey: ['catalogos', 'definiciones'],
    queryFn: ({ signal }) => definiciones(signal),
  });
  const cat = q.data?.find((c) => c.slug === 'horarios');
  if (cat)
    return (
      <HelpProvider>
        <FormularioHorario cat={cat} onCerrar={onCerrar} onCreado={onCreado} />
      </HelpProvider>
    );
  return (
    <Modal abierto titulo="Crear horario personalizado" onCerrar={onCerrar}>
      {q.isPending ? (
        <Skeleton lineas={4} />
      ) : (
        <div role="alert">
          <p>{q.error?.message ?? 'No se encontró el catálogo de horarios.'}</p>
          <Button icono="actualizar" onClick={() => void q.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
    </Modal>
  );
}
function FormularioHorario({
  cat,
  onCerrar,
  onCreado,
}: {
  cat: Catalogo;
  onCerrar: () => void;
  onCreado: (id: string) => void;
}) {
  const { usuario } = useSession();
  const ayuda = useMemo(() => ayudaCatalogo(cat, true), [cat]);
  usePageHelp(ayuda, usuario?.rol);
  return (
    <CatalogoFormulario
      cat={cat}
      cierre={null}
      onCerrar={onCerrar}
      onGuardado={(fila) => onCreado(String(fila.id))}
    />
  );
}
