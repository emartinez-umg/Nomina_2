import type { ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
export interface Columna<T> {
  id: string;
  titulo: string;
  render: (fila: T) => ReactNode;
  ordenable?: boolean;
}
// El consumidor envía página/orden a la API; no se pagina ni reordena el lote local.
export function Table<T>({
  columnas,
  filas,
  clave,
  pagina,
  limite,
  total,
  orden,
  onPagina,
  onOrden,
  cargando = false,
  error,
  onReintentar,
  titulo = 'Registros',
}: {
  columnas: Columna<T>[];
  filas: T[];
  clave: (fila: T) => string | number;
  pagina: number;
  limite: number;
  total: number;
  orden: { campo: string; direccion: 'asc' | 'desc' };
  onPagina: (pagina: number) => void;
  onOrden: (campo: string, direccion: 'asc' | 'desc') => void;
  cargando?: boolean;
  error?: string;
  onReintentar?: () => void;
  titulo?: string;
}) {
  const paginas = Math.max(1, Math.ceil(total / limite));
  if (error)
    return (
      <EmptyState
        titulo="No se pudieron cargar los registros"
        descripcion={error}
        accion={
          onReintentar && (
            <Button icono="actualizar" onClick={onReintentar}>
              Reintentar
            </Button>
          )
        }
      />
    );
  return (
    <section aria-label={titulo} aria-busy={cargando}>
      {cargando ? (
        <Skeleton lineas={5} />
      ) : filas.length === 0 ? (
        <EmptyState
          titulo="Sin resultados"
          descripcion="Revisa la búsqueda o limpia los filtros para consultar otros registros."
        />
      ) : (
        <div className="table-scroll">
          <table>
            <caption className="sr-only">{titulo}</caption>
            <thead>
              <tr>
                {columnas.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={
                      c.ordenable
                        ? orden.campo === c.id
                          ? orden.direccion === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                        : undefined
                    }
                  >
                    {c.ordenable ? (
                      <Button
                        icono={
                          orden.campo === c.id
                            ? orden.direccion === 'asc'
                              ? 'subir'
                              : 'desplegar'
                            : 'ordenar'
                        }
                        variante="texto"
                        onClick={() =>
                          onOrden(
                            c.id,
                            orden.campo === c.id && orden.direccion === 'asc' ? 'desc' : 'asc',
                          )
                        }
                      >
                        {c.titulo}
                      </Button>
                    ) : (
                      c.titulo
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={clave(f)}>
                  {columnas.map((c) => (
                    <td key={c.id}>{c.render(f)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="paginacion">
        <span>
          {total} registros · Página {pagina} de {paginas}
        </span>
        <div className="flex gap-2">
          <Button
            icono="anterior"
            variante="secundario"
            disabled={pagina <= 1 || cargando}
            onClick={() => onPagina(pagina - 1)}
          >
            Anterior
          </Button>
          <Button
            icono="siguiente"
            variante="secundario"
            disabled={pagina >= paginas || cargando}
            onClick={() => onPagina(pagina + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </section>
  );
}
