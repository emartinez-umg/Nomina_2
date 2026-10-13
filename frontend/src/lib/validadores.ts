import { Decimal } from 'decimal.js';
import { z } from 'zod';
export const soloDigitos = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);
export const limpiarTexto = (v: string) =>
  [...v].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('');
export const limpiarNombre = (v: string) => v.replace(/[^\p{L}\p{M} '-]/gu, '');
export const limpiarUsuario = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .slice(0, 80);
export const limpiarCorreo = (v: string) =>
  v.replace(/[^a-zA-Z0-9.!#$%&'*+/=?^_`{|}~@-]/g, '').slice(0, 254);
export const limpiarNit = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^0-9K]/g, '')
    .replace(/K(?!$)/g, '')
    .slice(0, 13);
export const formatearDpi = (v: string) =>
  soloDigitos(v, 13).replace(/^(\d{4})(\d{0,5})(\d{0,4})$/, (_, a: string, b: string, c: string) =>
    [a, b, c].filter(Boolean).join(' '),
  );
export const formatearTelefono = (v: string) =>
  soloDigitos(v, 8).replace(/^(\d{4})(\d+)$/, '$1 $2');
export const formatearNit = (v: string) => {
  const limpio = limpiarNit(v);
  return limpio.length > 1 ? `${limpio.slice(0, -1)}-${limpio.slice(-1)}` : limpio;
};
export const limpiarNumero = (v: string, decimales = 0, negativo = false) => {
  const signo = negativo && v.trim().startsWith('-') ? '-' : '';
  const partes = v.replace(/[^0-9.]/g, '').split('.');
  return (
    signo +
    (partes[0] ?? '') +
    (decimales && partes.length > 1 ? `.${partes.slice(1).join('').slice(0, decimales)}` : '')
  );
};
export function nitValido(valor: string) {
  if (!/^\d{1,12}-?[\dK]$/.test(valor.toUpperCase())) return false;
  const nit = valor.toUpperCase().replace('-', '');
  if (!/^\d{1,12}[\dK]$/.test(nit)) return false;
  const cuerpo = nit.slice(0, -1);
  if (/^0+$/.test(cuerpo)) return false;
  const suma = [...cuerpo].reverse().reduce((acc, n, i) => acc + Number(n) * (i + 2), 0);
  const verificador = (11 - (suma % 11)) % 11;
  return nit.slice(-1) === (verificador === 10 ? 'K' : String(verificador));
}
export const dpiSchema = z
  .string()
  .transform((v) => v.replace(/\s/g, ''))
  .refine(
    (v) => /^\d{13}$/.test(v),
    'El DPI debe tener 13 dígitos. Ingresa todos los números de tu documento.',
  );
export const nitSchema = z
  .string()
  .refine(
    nitValido,
    'El NIT o su dígito verificador no es válido. Revisa el número de tu constancia de RTU.',
  );
export const telefonoSchema = z
  .string()
  .transform((v) => v.replace(/\s/g, ''))
  .refine((v) => /^\d{8}$/.test(v), 'El teléfono debe tener 8 dígitos, sin código de país.');
export const correoSchema = z
  .string()
  .max(254, 'El correo no puede superar 254 caracteres.')
  .email('El correo no es válido. Usa el formato nombre@dominio.com.');
export const contrasenaSchema = z
  .string()
  .min(10, 'Usa al menos 10 caracteres.')
  .max(128, 'Usa como máximo 128 caracteres.')
  .regex(/[A-Z]/, 'Agrega una letra mayúscula.')
  .regex(/[a-z]/, 'Agrega una letra minúscula.')
  .regex(/[0-9]/, 'Agrega un número.')
  .regex(/[^A-Za-z0-9\s]/, 'Agrega un símbolo, por ejemplo # o !.');
export function fechaValida(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export const fechaSchema = z
  .string()
  .refine(fechaValida, 'La fecha no existe. Ingresa una fecha válida en formato dd/mm/aaaa.');
export const fechaVisible = (v: string) => (fechaValida(v) ? v.split('-').reverse().join('/') : v);
export const fechaIso = (v: string) =>
  /^\d{2}\/\d{2}\/\d{4}$/.test(v) ? v.split('/').reverse().join('-') : v;
export function hoyGuatemala() {
  const partes = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return ['year', 'month', 'day'].map((t) => partes.find((p) => p.type === t)?.value).join('-');
}
function agregarDias(v: string, dias: number) {
  const d = new Date(`${v}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function aniversario(v: string, anos: number) {
  const d = new Date(`${v}T12:00:00Z`);
  const mes = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + anos);
  if (d.getUTCMonth() !== mes) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
export type Rango = { inicio: string; fin: string };
export const seTraslapan = (a: Rango, b: Rango) => a.inicio <= b.fin && a.fin >= b.inicio;
export function validarNacimiento(
  fecha: string,
  hoy = hoyGuatemala(),
  min = 18,
  max = 75,
): string | undefined {
  if (!fechaValida(fecha)) return 'Ingresa una fecha de nacimiento válida en formato dd/mm/aaaa.';
  if (fecha > hoy)
    return 'La fecha de nacimiento no puede ser futura. Ingresa una fecha anterior a hoy.';
  if (aniversario(fecha, min) > hoy || aniversario(fecha, max + 1) <= hoy)
    return `La edad debe estar entre ${min} y ${max} años. Revisa la fecha de nacimiento.`;
}
export function validarIngreso(
  fecha: string,
  nacimiento: string,
  hoy = hoyGuatemala(),
  edadMinima = 18,
): string | undefined {
  if (!fechaValida(fecha) || !fechaValida(nacimiento))
    return 'Ingresa fechas válidas de nacimiento e ingreso.';
  if (fecha < aniversario(nacimiento, edadMinima))
    return `El ingreso debe ser a partir de los ${edadMinima} años del empleado.`;
  if (fecha > agregarDias(hoy, 30)) return 'El ingreso no puede superar 30 días en el futuro.';
}
export function validarEgreso(fecha: string, ingreso: string): string | undefined {
  if (!fechaValida(fecha) || !fechaValida(ingreso))
    return 'Ingresa fechas válidas de ingreso y egreso.';
  if (fecha < ingreso)
    return 'El egreso no puede ser anterior al ingreso. Selecciona una fecha igual o posterior.';
}
export function validarRango(rango: Rango, existentes: Rango[] = []): string | undefined {
  if (!fechaValida(rango.inicio) || !fechaValida(rango.fin))
    return 'Selecciona fechas válidas para el inicio y el fin.';
  if (rango.fin < rango.inicio)
    return 'El fin no puede ser anterior al inicio. Revisa el rango seleccionado.';
  if (existentes.some((r) => seTraslapan(rango, r)))
    return 'El rango coincide con otro registro. Elige fechas sin traslape.';
}
export function esDiaLaboral(fecha: string, dias: number[], feriados: string[] = []) {
  return (
    fechaValida(fecha) &&
    dias.includes(new Date(`${fecha}T12:00:00Z`).getUTCDay()) &&
    !feriados.includes(fecha)
  );
}
export function validarVacaciones(
  rango: Rango,
  dias: number[],
  feriados: string[],
  existentes: Rango[] = [],
  hoy = hoyGuatemala(),
): string | undefined {
  const error = validarRango(rango, existentes);
  if (error) return error;
  if (rango.inicio < hoy)
    return 'Las vacaciones deben iniciar hoy o después. Selecciona una fecha futura.';
  if (!esDiaLaboral(rango.inicio, dias, feriados) || !esDiaLaboral(rango.fin, dias, feriados))
    return 'Selecciona días laborales según el horario del empleado, excluyendo feriados.';
}
export function validarFechaEfectiva(fecha: string, cerrados: Rango[]): string | undefined {
  if (!fechaValida(fecha)) return 'Selecciona una fecha efectiva válida.';
  if (cerrados.some((r) => fecha >= r.inicio && fecha <= r.fin))
    return 'La fecha pertenece a un periodo cerrado. Selecciona una fecha fuera de ese periodo.';
}
export function validarEvento(inicio: string, fin: string, ahora = new Date()): string | undefined {
  const a = new Date(inicio),
    b = new Date(fin);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()))
    return 'Ingresa fecha y hora válidas para el evento.';
  if (a <= ahora) return 'El evento debe iniciar en el futuro. Revisa la fecha y hora.';
  if (b < a) return 'El fin del evento no puede ser anterior al inicio.';
}
export function errorDe(schema: z.ZodTypeAny, v: unknown): string | undefined {
  const r = schema.safeParse(v);
  return r.success ? undefined : r.error.issues[0]?.message;
}

export const moneda = (valor: string) =>
  `Q ${new Decimal(valor).toFixed(2, Decimal.ROUND_HALF_UP).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
