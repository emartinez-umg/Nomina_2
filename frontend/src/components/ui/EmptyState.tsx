import type { ReactNode } from 'react';
import { iconos } from './icons';
import type { NombreIcono } from './icons';
export function EmptyState({
  titulo,
  descripcion,
  accion,
  icono = 'documento',
}: {
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
  icono?: NombreIcono;
}) {
  const Icono = iconos[icono];
  return (
    <div className="estado-vacio">
      <Icono size={42} aria-hidden="true" />
      <h2>{titulo}</h2>
      <p>{descripcion}</p>
      {accion}
    </div>
  );
}
