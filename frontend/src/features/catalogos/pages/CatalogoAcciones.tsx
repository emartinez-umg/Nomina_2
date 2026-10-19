import type { Catalogo, Fila } from '../api/catalogos';
import { Button } from '../../../components/ui/Button';
export function CatalogoAcciones({
  cat,
  fila,
  ocupado,
  puedeEditar,
  abrir,
  estado,
  eliminar,
  historial,
}: {
  cat: Catalogo;
  fila: Fila;
  ocupado: boolean;
  puedeEditar: boolean;
  abrir: (editar: boolean, copia?: boolean) => void;
  estado: () => void;
  eliminar: () => void;
  historial: () => void;
}) {
  return (
    <div className="flex gap-1">
      <Button
        icono="ver"
        variante="texto"
        soloIcono
        aria-label={`Ver registro ${fila.id}`}
        disabled={ocupado}
        onClick={() => abrir(false)}
      />
      <Button
        icono="editar"
        variante="texto"
        soloIcono
        aria-label={`Editar registro ${fila.id}`}
        disabled={ocupado || !puedeEditar}
        onClick={() => abrir(true)}
      />
      {cat.slug === 'horarios' && (
        <Button
          icono="copiar"
          variante="texto"
          soloIcono
          aria-label={`Duplicar horario ${fila.id}`}
          disabled={ocupado}
          onClick={() => abrir(true, true)}
        />
      )}
      <Button
        icono={fila.activo ? 'rechazar' : 'aprobar'}
        variante="texto"
        soloIcono
        aria-label={`${fila.activo ? 'Desactivar' : 'Activar'} registro ${fila.id}`}
        disabled={ocupado}
        onClick={estado}
      />
      <Button
        icono="historial"
        variante="texto"
        soloIcono
        aria-label={`Historial del registro ${fila.id}`}
        disabled={ocupado}
        onClick={historial}
      />
      <Button
        icono="eliminar"
        variante="texto"
        soloIcono
        aria-label={`Eliminar registro ${fila.id}`}
        disabled={ocupado || fila.enUso}
        motivoDeshabilitado={
          fila.enUso
            ? `No se puede eliminar: lo usan ${fila.usos} registro(s). Puedes inactivarlo.`
            : undefined
        }
        onClick={eliminar}
      />
    </div>
  );
}
