import { useState } from 'react';
import { ConfirmModal } from '../../../components/ui/Modal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificaciones, leer, borrarNotificacion, borrarNotificaciones } from '../api/vacaciones';
import { useSession } from '../../../app/session';
import { NotificationBell } from '../../../components/ui/NotificationBell';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
export function Notificaciones({ abierto, onClick }: { abierto: boolean; onClick: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const { usuario } = useSession(),
    cache = useQueryClient(),
    nav = useNavigate(),
    toast = useToast();
  const q = useQuery({
    queryKey: ['notificaciones', usuario?.idUsuario],
    queryFn: ({ signal }) => notificaciones(signal),
    refetchInterval: 30000,
    enabled: !!usuario,
  });
  const marcar = useMutation({
    mutationFn: leer,
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['notificaciones'] }),
    onError: (e) => toast(e.message, 'peligro'),
  });
  const borrar = useMutation({
    mutationFn: (id?: number) =>
      id === undefined ? borrarNotificaciones() : borrarNotificacion(id),
    onSuccess: async (_resultado, id) => {
      // Retira el aviso y su contador en el mismo ciclo; la consulta verifica el total del servidor.
      await cache.cancelQueries({ queryKey: ['notificaciones', usuario?.idUsuario] });
      cache.setQueryData<Awaited<ReturnType<typeof notificaciones>>>(
        ['notificaciones', usuario?.idUsuario],
        (datos) =>
          datos
            ? {
                pendientes:
                  id === undefined
                    ? 0
                    : Math.max(
                        0,
                        datos.pendientes -
                          (datos.registros.some((n) => n.id === id && !n.leida) ? 1 : 0),
                      ),
                registros: id === undefined ? [] : datos.registros.filter((n) => n.id !== id),
              }
            : datos,
      );
      setConfirmar(false);
      toast(
        id === undefined ? 'Se borraron tus notificaciones.' : 'Notificación borrada.',
        'correcto',
      );
      await cache.invalidateQueries({ queryKey: ['notificaciones', usuario?.idUsuario] });
    },
    onError: (e) => toast(e.message, 'peligro'),
  });
  return (
    <>
      <NotificationBell noLeidas={q.data?.pendientes ?? 0} abierto={abierto} onClick={onClick} />
      {abierto && (
        <section
          className="panel-flotante panel-notificaciones"
          id="panel-notificaciones"
          aria-label="Notificaciones"
        >
          <h2>Notificaciones</h2>
          {!!q.data?.registros.length && (
            <Button
              icono="eliminar"
              variante="texto"
              disabled={borrar.isPending || marcar.isPending}
              onClick={() => setConfirmar(true)}
            >
              Borrar todas
            </Button>
          )}
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
                  <div className="flex items-start justify-between gap-2">
                    <strong>{n.titulo}</strong>
                    <Button
                      icono="eliminar"
                      variante="texto"
                      soloIcono
                      aria-label={`Borrar notificación: ${n.titulo}`}
                      disabled={borrar.isPending || marcar.isPending}
                      onClick={() => borrar.mutate(n.id)}
                    />
                  </div>
                  <p>{n.mensaje}</p>
                  <div className="flex flex-wrap gap-2">
                    {n.clave.startsWith('NOMINA:') && (
                      <Button
                        icono="ver"
                        variante="texto"
                        onClick={() => {
                          nav(usuario?.rol === 'EMPLEADO' ? '/mis-gestiones/boletas' : '/planilla');
                          onClick();
                        }}
                      >
                        Ver boletas
                      </Button>
                    )}
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
                    {n.clave.startsWith('SOLICITUD:') && (
                      <Button
                        icono="ver"
                        variante="texto"
                        onClick={() => {
                          nav(
                            `${usuario?.rol === 'EMPLEADO' ? '/mis-gestiones/solicitudes' : '/solicitudes'}?solicitud=${n.clave.split(':')[1]}`,
                          );
                          onClick();
                        }}
                      >
                        Ver solicitud{n.clave.endsWith(':ENTREGADA') ? ' y documento' : ''}
                      </Button>
                    )}
                    {(n.clave.startsWith('ANUNCIO:') || n.clave.startsWith('EVENTO:')) && (
                      <Button
                        icono="ver"
                        variante="texto"
                        onClick={() => {
                          nav(
                            `${usuario?.rol === 'EMPLEADO' ? '/mis-gestiones' : '/comunicacion'}/${n.clave.startsWith('ANUNCIO:') ? 'anuncios' : 'eventos'}?ver=${n.clave.split(':')[1]}`,
                          );
                          onClick();
                        }}
                      >
                        Ver publicación
                      </Button>
                    )}
                    {!n.leida && (
                      <Button
                        icono="correcto"
                        variante="texto"
                        cargando={marcar.isPending}
                        disabled={borrar.isPending}
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
      <ConfirmModal
        abierto={confirmar}
        titulo="Borrar todas las notificaciones"
        descripcion="Se borrarán todos tus avisos, incluidos los que no aparecen en esta lista. Esta acción solo afecta a tu cuenta; las solicitudes, documentos y avisos de otras personas se conservan."
        cargando={borrar.isPending}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => borrar.mutate(undefined)}
      />
    </>
  );
}
