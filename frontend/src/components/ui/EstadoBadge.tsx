import { estadoPresentacion } from '../../lib/estados';
import { Badge } from './Badge';
import { iconos } from './icons';
export function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  const presentacion = estadoPresentacion(estado);
  const Icono = iconos[presentacion.icono];
  return (
    <span data-estado={estado}>
      <Badge tono={presentacion.color}>
        <Icono size={14} aria-hidden="true" />
        {presentacion.etiqueta}
      </Badge>
    </span>
  );
}
