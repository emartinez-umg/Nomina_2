import { HelpProvider, usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaHistorialCatalogo } from '../help/pasos';
import { useQuery } from '@tanstack/react-query';
import { historial } from '../api/catalogos';
import type { Catalogo, Fila } from '../api/catalogos';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
function Historial({ cat, fila, onCerrar }: { cat: Catalogo; fila: Fila; onCerrar: () => void }) {
  usePageHelp(ayudaHistorialCatalogo);
  const q = useQuery({
    queryKey: ['catalogos', 'historial', cat.slug, fila.id],
    queryFn: ({ signal }) => historial(cat.slug, fila.id, signal),
  });
  return (
    <Modal abierto titulo={`Historial · ${String(fila.nombre ?? cat.titulo)}`} onCerrar={onCerrar}>
      <p className="my-3 text-sm text-secundario" data-tour="catalogo-historial">
        Últimos 100 cambios de este registro.
      </p>
      {q.isPending ? (
        <Skeleton lineas={3} />
      ) : q.error ? (
        <div role="alert">
          {q.error.message}
          <Button icono="actualizar" onClick={() => void q.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : q.data.length ? (
        <ul className="my-4 space-y-3">
          {q.data.map((r) => (
            <li key={r.id}>
              <strong>
                {r.fecha} · {r.accion.replace(/_/g, ' ')}
              </strong>
              <p>{r.motivo ?? 'Sin motivo adicional.'}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="my-4">No hay cambios registrados para este catálogo.</p>
      )}
      <Button icono="cancelar" onClick={onCerrar}>
        Cerrar historial
      </Button>
    </Modal>
  );
}

export function CatalogoHistorial(props: Parameters<typeof Historial>[0]) {
  return (
    <HelpProvider>
      <Historial {...props} />
    </HelpProvider>
  );
}
