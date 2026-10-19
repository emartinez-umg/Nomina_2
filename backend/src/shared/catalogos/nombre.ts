// Regla única para la API y los formularios; sin dependencias del servidor.
export const hintNombreCatalogo =
  "Usa al menos 2 caracteres y una letra. Se permiten letras con acentos, ñ/ü, dígitos, espacios y . , - / & ( ) '.";
export const recortarNombreCatalogo = (valor: string) =>
  valor.normalize('NFC').replace(/\s+/gu, ' ').trim();
export const normalizarNombreCatalogo = (valor: string) =>
  recortarNombreCatalogo(valor).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const sanearNombreCatalogo = (valor: string) =>
  valor.normalize('NFC').replace(/[^\p{L}\p{M}0-9 .,/&()'-]/gu, '');
export function validarNombreCatalogo(valor: string, maximo = 120): string | undefined {
  const nombre = recortarNombreCatalogo(valor);
  if (!nombre) return 'El nombre es obligatorio. Ingresa un nombre con al menos una letra.';
  if ([...nombre].length < 2) return 'El nombre debe tener al menos 2 caracteres.';
  if (!/\p{L}/u.test(nombre))
    return 'El nombre debe contener al menos una letra; no uses solo números o símbolos.';
  if (/[^\p{L}\p{M}0-9 .,/&()'-]/u.test(nombre)) return hintNombreCatalogo;
  if ([...nombre].length > maximo) return `Usa hasta ${maximo} caracteres en el nombre.`;
  return undefined;
}
