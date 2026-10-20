const conectores = new Set('DE DEL LA LAS EL LOS Y E EN PARA POR CON A'.split(' '));
export function limpiarPalabra(palabra: string) {
  return palabra
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .replace(/ +/g, ' ');
}
export function generarCodigoGenerico(palabra: string, longitudMax = 3): string {
  if (!Number.isInteger(longitudMax) || longitudMax < 1 || longitudMax > 30)
    throw new RangeError('La longitud debe estar entre 1 y 30.');
  const limpio = limpiarPalabra(palabra);
  const palabras = limpio.split(' ').filter(Boolean);
  if (palabras.length <= 1) return limpio.slice(0, longitudMax);
  const significativas = palabras.filter((p) => !conectores.has(p));
  const iniciales = significativas.map((p) => p[0]).join('');
  return (iniciales.length >= 2 ? iniciales : (significativas[0] ?? '')).slice(0, longitudMax);
}
export function opcionB(palabra: string, longitudMax = 3) {
  const limpio = limpiarPalabra(palabra).replace(/ /g, '');
  return ((limpio[0] ?? '') + limpio.slice(1).replace(/[AEIOU]/g, '')).slice(0, longitudMax);
}
export async function resolverCodigoGenerico(
  palabra: string,
  longitudMax: number,
  existe: (codigo: string) => Promise<boolean>,
) {
  const base = generarCodigoGenerico(palabra, longitudMax);
  if (!base) throw new Error('El nombre debe contener al menos una palabra significativa.');
  if (!(await existe(base))) return base;
  const alternativa = opcionB(palabra, longitudMax);
  if (alternativa && !(await existe(alternativa))) return alternativa;
  let numero = 2;
  while (await existe(`${base}${numero}`)) numero++;
  return `${base}${numero}`;
}
