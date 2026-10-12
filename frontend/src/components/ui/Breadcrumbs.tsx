import { Link } from 'react-router-dom';
import { iconos } from './icons';
export function Breadcrumbs({ items }: { items: { titulo: string; ruta?: string }[] }) {
  const Flecha = iconos.siguiente;
  return (
    <nav aria-label="Ruta de navegación">
      <ol className="breadcrumbs">
        {items.map((item, i) => (
          <li key={i}>
            {i > 0 && <Flecha size={14} aria-hidden="true" />}
            {item.ruta ? (
              <Link to={item.ruta}>{item.titulo}</Link>
            ) : (
              <span aria-current="page">{item.titulo}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
