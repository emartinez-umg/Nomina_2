import { Button } from './Button';
export function NotificationBell({
  noLeidas,
  abierto,
  onClick,
}: {
  noLeidas?: number;
  abierto: boolean;
  onClick: () => void;
}) {
  const cantidad = noLeidas === undefined ? undefined : Math.max(0, Math.floor(noLeidas));
  return (
    <span className="relative inline-flex">
      <Button
        icono="notificaciones"
        variante="texto"
        soloIcono
        aria-label={cantidad ? `Notificaciones: ${cantidad} sin leer` : 'Notificaciones'}
        aria-expanded={abierto}
        aria-controls="panel-notificaciones"
        onClick={onClick}
      />
      {cantidad !== undefined && cantidad > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-1 -right-1 rounded-boton bg-peligro px-1.5 text-xs font-bold text-white"
        >
          {cantidad > 99 ? '99+' : cantidad}
        </span>
      )}
    </span>
  );
}
