import { iconos } from '../../../components/ui/icons';
import { useSalud } from '../hooks/useSalud';
import { ayudaSalud } from '../help/pasos';
import { HelpButton, HelpOffer, usePageHelp } from '../../../components/help/HelpProvider';

const { salud: Actividad, baseDatos: BaseDatos, actualizar: Actualizar } = iconos;
const { correcto: Correcto, error: ErrorIcono } = iconos;

export function SaludPage() {
  const consulta = useSalud();
  usePageHelp(ayudaSalud);
  return (
    <div className="min-h-screen">
      <header className="border-b border-borde bg-superficie">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
          <span className="flex items-center gap-3 text-xl font-bold text-marca">
            <Actividad aria-hidden="true" /> nomina2
          </span>
          <HelpButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10 sm:py-16">
        <p className="mb-3 text-sm font-bold uppercase tracking-widest text-primario">Fase 0</p>
        <h1 className="text-3xl font-bold text-marca sm:text-4xl">Estado del sistema</h1>
        <p className="mb-8 mt-4 max-w-2xl leading-relaxed text-secundario">
          Consulta la disponibilidad del servicio y su conexión con la base de datos.
        </p>
        <section
          data-tour="estado"
          aria-label="Disponibilidad del sistema"
          aria-busy={consulta.isFetching}
          className="rounded-tarjeta border border-borde bg-superficie p-6 shadow-tarjeta sm:p-8"
        >
          <div role="status" aria-live="polite">
            {consulta.isPending ? (
              <div className="space-y-4">
                <p className="font-bold text-marca">Comprobando conexión…</p>
                <div className="h-5 w-2/3 animate-pulse rounded bg-fondo" aria-hidden="true" />
              </div>
            ) : consulta.isError ? (
              <div className="flex items-start gap-3 text-peligro">
                <ErrorIcono className="mt-1 shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="text-xl font-bold">Servicio no disponible</h2>
                  <p className="mt-2">{consulta.error.message}</p>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="flex items-center gap-3 text-xl font-bold text-primario">
                  <Correcto aria-hidden="true" /> Sistema disponible
                </h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <div>
                    <dt className="flex items-center gap-2 text-sm text-secundario">
                      <Actividad size={18} aria-hidden="true" /> Servicio
                    </dt>
                    <dd className="mt-2 font-bold text-marca">{consulta.data.estado}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-2 text-sm text-secundario">
                      <BaseDatos size={18} aria-hidden="true" /> Base de datos
                    </dt>
                    <dd className="mt-2 font-bold text-primario">Oracle conectada</dd>
                  </div>
                </dl>
                <p className="mt-6 text-sm text-secundario">
                  Última comprobación:{' '}
                  <time dateTime={consulta.data.fecha}>
                    {new Intl.DateTimeFormat('es-GT', {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                      timeZone: 'America/Guatemala',
                    }).format(new Date(consulta.data.fecha))}
                  </time>
                </p>
              </div>
            )}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-borde pt-6">
            <button
              data-tour="actualizar"
              type="button"
              className="boton-primario"
              disabled={consulta.isFetching}
              onClick={() => void consulta.refetch()}
            >
              <Actualizar
                size={18}
                aria-hidden="true"
                className={consulta.isFetching ? 'animate-spin' : ''}
              />
              {consulta.isFetching ? 'Comprobando…' : 'Comprobar de nuevo'}
            </button>
            <p className="text-sm text-secundario">Actualización automática cada 30 segundos.</p>
          </div>
        </section>
      </main>
      <HelpOffer />
    </div>
  );
}
