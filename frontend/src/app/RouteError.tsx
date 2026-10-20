import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { reintentarPaginas } from './lazyPagina';
import { HelpButton, usePageHelp } from '../components/help/HelpProvider';
import { ayudaErrorRuta } from '../features/salud/help/errorRuta';

export function RouteError() {
  usePageHelp(ayudaErrorRuta);
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <main className="mx-auto max-w-xl p-6 mt-20">
      <Card>
        <div className="flex justify-between gap-3">
          <h1>Algo salió mal</h1>
          <HelpButton />
        </div>
        <p role="alert" className="my-4">
          No se pudo abrir esta página. Comprueba tu conexión y vuelve a intentarlo. Si hay una
          actualización disponible, recarga la aplicación. Tus borradores se conservan en este
          navegador.
        </p>
        <div className="flex flex-wrap gap-3" data-tour="recuperar-ruta">
          <Button
            icono="actualizar"
            onClick={() => {
              reintentarPaginas();
              void navigate(`${location.pathname}${location.search}${location.hash}`, {
                replace: true,
              });
            }}
          >
            Reintentar
          </Button>
          <Button icono="actualizar" variante="secundario" onClick={() => window.location.reload()}>
            Recargar
          </Button>
        </div>
      </Card>
    </main>
  );
}
