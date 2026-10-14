import type { OpcionNavegacion } from './navigation.config';

const clave = (idUsuario: number) => `nomina2:navegacion:v1:${idUsuario}`;
export function leerRecientes(idUsuario: number, opciones: OpcionNavegacion[]): string[] {
  try {
    const guardado: unknown = JSON.parse(localStorage.getItem(clave(idUsuario)) ?? '[]');
    if (!Array.isArray(guardado)) return [];
    const permitidos = new Set(opciones.map((opcion) => opcion.id));
    return [
      ...new Set(
        guardado.filter((id): id is string => typeof id === 'string' && permitidos.has(id)),
      ),
    ].slice(0, 5);
  } catch {
    return [];
  }
}
export function guardarReciente(
  idUsuario: number,
  id: string,
  opciones: OpcionNavegacion[],
): string[] {
  const recientes = [id, ...leerRecientes(idUsuario, opciones).filter((previo) => previo !== id)]
    .filter((item) => opciones.some((opcion) => opcion.id === item))
    .slice(0, 5);
  try {
    localStorage.setItem(clave(idUsuario), JSON.stringify(recientes));
  } catch {
    // Sin almacenamiento disponible, la navegación y el buscador siguen funcionando.
  }
  return recientes;
}
