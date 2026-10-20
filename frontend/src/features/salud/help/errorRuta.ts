import type { DefinicionAyuda } from '../../../components/help/HelpProvider';

export const ayudaErrorRuta: DefinicionAyuda = {
  id: 'error-ruta-r2-1',
  pasos: [
    {
      elemento: 'recuperar-ruta',
      titulo: 'Volver a abrir la página',
      descripcion:
        'Reintentar vuelve a cargar el módulo de esta página sin enviar nuevamente operaciones ni pagos. Si el problema persiste, revisa tu conexión y usa Recargar para obtener la versión actual de la aplicación. Los borradores locales se conservan; al abrir de nuevo su formulario puedes retomarlos con Continuar.',
    },
  ],
};
