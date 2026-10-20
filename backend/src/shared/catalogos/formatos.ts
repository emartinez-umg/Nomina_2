// Formatos externos de catálogos, compartidos por API y formularios.
export const hintCodigoPostal =
  'Código postal guatemalteco de 5 dígitos. Ejemplo: 01001. Conserva el cero inicial.';
export const hintCodigoIso =
  'Dos letras de A a Z (ISO 3166-1 alfa-2). Ejemplo: GT. Se convierten a mayúsculas.';
export const validarCodigoPostal = (valor: string) =>
  /^\d{5}$/.test(valor)
    ? undefined
    : 'El código postal debe tener exactamente 5 dígitos. Ejemplo: 01001.';
export const validarCodigoIso = (valor: string) =>
  /^[A-Za-z]{2}$/.test(valor)
    ? undefined
    : 'El código ISO debe tener exactamente 2 letras de la A a la Z. Ejemplo: GT.';
export const sanearCodigoPostal = (valor: string) => valor.replace(/[^0-9]/g, '');
export const sanearCodigoIso = (valor: string) => valor.replace(/[^a-zA-Z]/g, '').toUpperCase();
