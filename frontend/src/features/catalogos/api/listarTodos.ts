import { listar } from './catalogos';
import type { Fila } from './catalogos';
export async function listarTodos(slug: string, q: Record<string, string>, signal?: AbortSignal) {
  const filas: Fila[] = [];
  let pagina = 1,
    total = 0;
  do {
    const r = await listar(slug, { ...q, pagina: String(pagina), limite: '100' }, signal);
    filas.push(...r.registros);
    total = r.total;
    pagina++;
    if (!r.registros.length) break;
  } while (filas.length < total);
  return filas;
}
