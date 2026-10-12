import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaSalud: DefinicionAyuda = {
  id: 'salud',
  pasos: [
    {
      elemento: 'estado',
      titulo: 'Disponibilidad del sistema',
      descripcion:
        'Esta consulta comprueba la API y su conexión real con Oracle. Mientras carga se muestra un indicador. Un error explica por qué no se puede confirmar la conexión; no significa que los datos hayan sido borrados.',
    },
    {
      elemento: 'actualizar',
      titulo: 'Comprobar nuevamente',
      descripcion:
        'Este botón vuelve a consultar al servidor. Se deshabilita durante la solicitud para evitar duplicados. La página también actualiza la comprobación cada 30 segundos. Si el servicio sigue fallando, informa al administrador.',
    },
  ],
};
