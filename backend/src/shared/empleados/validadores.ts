/** Reglas del expediente compartidas por API, CSV y asistente. */
export const mensajeDireccion =
  'Usa hasta 100 caracteres: letras, números, espacios y . , # - / °; incluye al menos una letra o número.';
export const limpiarDireccion = (v: string) =>
  v
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}0-9 .,#/°-]/gu, '')
    .slice(0, 100);
export const direccionValida = (v: string) =>
  v.trim().length <= 100 && /^[\p{L}\p{M}0-9 .,#/°-]+$/u.test(v) && /[\p{L}0-9]/u.test(v);
export const mensajeNit =
  'Ingresa de 5 a 12 dígitos, con K final y guion opcionales. Ejemplo: 1234567-9.';
export const formatoNitValido = (v: string) => /^(?:\d{5,12}K?|\d{4,11}-\d|\d{5,12}-K)$/i.test(v);
export const normalizarNit = (v: string) => {
  const n = v.trim().toUpperCase().replace('-', '');
  return n.length > 1 ? `${n.slice(0, -1)}-${n.slice(-1)}` : n;
};
export function digitoNitValido(v: string) {
  const n = v.toUpperCase().replace('-', '');
  if (!/^\d{1,12}[0-9K]$/.test(n)) return false;
  const cuerpo = n.slice(0, -1);
  if (/^0+$/.test(cuerpo)) return false;
  const suma = [...cuerpo].reverse().reduce((s, d, i) => s + Number(d) * (i + 2), 0);
  const digito = (11 - (suma % 11)) % 11;
  return n.slice(-1) === (digito === 10 ? 'K' : String(digito));
}
export const camposBanco = ['idBanco', 'cuentaBancaria', 'tipoCuenta'] as const;
export const camposContacto = ['contactoNombre', 'contactoParentesco', 'contactoTelefono'] as const;
export const camposSalariales = ['salarioBase', ...camposBanco] as const;
export function grupoParcial(d: Record<string, unknown>, campos: readonly string[]) {
  const llenos = campos.filter((k) => d[k] != null && d[k] !== '').length;
  return llenos > 0 && llenos < campos.length;
}
