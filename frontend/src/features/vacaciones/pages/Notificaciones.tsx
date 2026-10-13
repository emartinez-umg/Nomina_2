import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificaciones, leer } from '../api/vacaciones';
import { useSession } from '../../../app/session';
import { NotificationBell } from '../../../components/ui/NotificationBell';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
export function Notificaciones({ abierto, onClick }: { abierto: boolean; onClick: () => void }) {
  const { usuario } = useSession(),
    cache = useQueryClient(),
    nav = useNavigate(),
    toast = useToast();
  const q = useQuery({
    queryKey: ['notificaciones'],
    queryFn: ({ signal }) => notificaciones(signal),
    refetchInterval: 30000,
    enabled: !!usuario,
  });
  const marcar = useMutation({
    mutationFn: leer,
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['notificaciones'] }),
    onError: (e) => toast(e.message, 'peligro'),
  });
  return (
    <>
      <NotificationBell noLeidas={q.data?.pendientes ?? 0} abierto={abierto} onClick={onClick} />
      {abierto && (
        <section className="panel-flotante" id="panel-notificaciones" aria-label="Notificaciones">
          <h2>Notificaciones</h2>
          {q.isPending ? (
            <Skeleton lineas={3} />
          ) : q.error ? (
            <EmptyState
              titulo="No se pudieron cargar los avisos"
              descripcion={q.error.message}
              accion={
                <Button icono="actualizar" onClick={() => void q.refetch()}>
                  Reintentar
                </Button>
              }
            />
          ) : !q.data?.registros.length ? (
            <EmptyState
              icono="notificaciones"
              titulo="Sin notificaciones"
              descripcion="Aquí recibirás avisos sobre tus solicitudes y su resolución."
            />
          ) : (
            <>
              <p className="campo-hint">Últimos 30 avisos · {q.data.pendientes} sin leer</p>
              {q.data.registros.map((n) => (
                <article key={n.id} className="my-4 border-b border-borde pb-3">
                  <strong>{n.titulo}</strong>
                  <p>{n.mensaje}</p>
                  <div className="flex flex-wrap gap-2">
                    {n.clave.startsWith('VACACIONES:') && (
                      <Button
                        icono="ver"
                        variante="texto"
                        onClick={() => {
                          nav(
                            usuario?.rol === 'EMPLEADO'
                              ? '/mis-gestiones/vacaciones'
                              : '/vacaciones',
                          );
                          onClick();
                        }}
                      >
                        Ver vacaciones
                      </Button>
                    )}
                    {!n.leida && (
                      <Button
                        icono="correcto"
                        variante="texto"
                        cargando={marcar.isPending}
                        onClick={() => marcar.mutate(n.id)}
                      >
                        Marcar como leída
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </>
          )}
        </section>
      )}
    </>
  );
}
