import { z } from 'zod';
import { Decimal } from 'decimal.js';
export const fechaValida = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) &&
  new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
export const fecha = z
  .string()
  .refine(fechaValida, 'Ingresa una fecha válida en formato dd/mm/aaaa.');
export function aniversario(v: string, anos: number) {
  const d = new Date(`${v}T12:00:00Z`),
    mes = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + anos);
  if (d.getUTCMonth() !== mes) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
export function sumarDias(v: string, dias: number) {
  const d = new Date(`${v}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
export function nitValido(v: string) {
  if (!/^\d{1,12}-[0-9K]$/.test(v)) return false;
  const [cuerpo, digito] = v.split('-');
  if (/^0+$/.test(cuerpo!)) return false;
  const n =
    (11 - ([...cuerpo!].reverse().reduce((s, d, i) => s + Number(d) * (i + 2), 0) % 11)) % 11;
  return digito === (n === 10 ? 'K' : String(n));
}
const texto = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Este campo es obligatorio.')
    .max(max)
    .regex(/^\P{Cc}*$/u, 'No uses caracteres de control.');
const nombre = texto(100).regex(/^[\p{L}\p{M} '-]+$/u, 'Usa letras, espacios, apóstrofo o guion.');
const telefono = z
  .string()
  .regex(/^\d{8}$/, 'El teléfono debe tener 8 dígitos, sin código de país.');
const id = z.number().int().positive();
export const dinero = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Ingresa un monto positivo con hasta 2 decimales.')
  .refine(
    (v) => /^\d{1,10}(\.\d{1,2})?$/.test(v) && new Decimal(v).gt(0),
    'El salario debe ser mayor a cero.',
  )
  .transform((v) => new Decimal(v).toFixed(2, Decimal.ROUND_HALF_UP));
const opcionalFecha = fecha.nullable();
const datos = z
  .object({
    codigo: texto(40).regex(/^[A-Z0-9_-]+$/, 'Usa mayúsculas, números, guion o guion bajo.'),
    nombres: nombre,
    apellidos: nombre,
    dpi: z.string().regex(/^\d{13}$/, 'El DPI debe tener exactamente 13 dígitos.'),
    nit: z
      .string()
      .trim()
      .toUpperCase()
      .refine(nitValido, 'El NIT o su dígito verificador no es válido. Revisa tu RTU.'),
    afiliacionIgss: z
      .string()
      .regex(/^\d{1,20}$/, 'La afiliación IGSS solo admite hasta 20 dígitos.')
      .nullable(),
    fechaNacimiento: fecha,
    sexo: z.enum(['F', 'M', 'O']),
    estadoCivil: z.enum(['SOLTERO', 'CASADO', 'UNIDO', 'DIVORCIADO', 'VIUDO']),
    direccion: texto(500),
    telefono,
    correo: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .email('Usa un correo válido: nombre@dominio.com.'),
    idDepartamento: id,
    idPuesto: id,
    idJefatura: id.nullable(),
    idTipoContrato: id,
    idCentroTrabajo: id,
    idHorario: id,
    fechaIngreso: fecha,
    fechaFinContrato: opcionalFecha,
    idBanco: id.nullable(),
    cuentaBancaria: z
      .string()
      .regex(/^[A-Za-z0-9-]{1,34}$/, 'Usa hasta 34 letras, números o guiones.')
      .nullable(),
    tipoCuenta: z.enum(['AHORRO', 'MONETARIA']).nullable(),
    contactoNombre: texto(200).regex(/^[\p{L}\p{M} '-]+$/u, 'Usa letras y espacios.'),
    contactoParentesco: texto(60),
    contactoTelefono: telefono,
    estado: z.enum(['ACTIVO', 'SUSPENDIDO']).default('ACTIVO'),
  })
  .strict();
const banco = (d: z.infer<typeof datos>, ctx: z.RefinementCtx) => {
  const presentes = [d.idBanco, d.cuentaBancaria, d.tipoCuenta].filter((v) => v !== null).length;
  if (presentes !== 0 && presentes !== 3)
    ctx.addIssue({
      code: 'custom',
      path: ['cuentaBancaria'],
      message: 'Completa banco, cuenta y tipo de cuenta, o deja los tres vacíos.',
    });
  if (d.fechaFinContrato && d.fechaFinContrato < d.fechaIngreso)
    ctx.addIssue({
      code: 'custom',
      path: ['fechaFinContrato'],
      message: 'El fin de contrato no puede ser anterior al ingreso.',
    });
};
export const crearEmpleadoSchema = datos
  .extend({ salarioBase: dinero, generarUsuario: z.boolean().default(false) })
  .superRefine(banco);
export const editarEmpleadoSchema = datos
  .extend({ motivo: texto(500).min(5), fechaHorario: fecha.optional() })
  .superRefine(banco);
export type DatosEmpleado = z.infer<typeof crearEmpleadoSchema>;
export type EditarEmpleado = z.infer<typeof editarEmpleadoSchema>;
export const salarioSchema = z
  .object({
    salarioBase: dinero,
    fechaEfectiva: fecha,
    motivo: texto(500).min(5),
    confirmado: z.literal(true),
  })
  .strict();
export const bajaSchema = z
  .object({ fechaEgreso: fecha, motivo: texto(500).min(5), confirmado: z.literal(true) })
  .strict();
const qid = z.coerce.number().int().positive().optional();
export const querySchema = z
  .object({
    pagina: z.coerce.number().int().min(1).max(1000000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
    nombre: z.string().trim().max(200).optional(),
    dpi: z
      .string()
      .regex(/^\d{1,13}$/)
      .optional(),
    nit: z
      .string()
      .toUpperCase()
      .regex(/^[0-9K-]{1,20}$/)
      .optional(),
    idDepartamento: qid,
    idPuesto: qid,
    idJefatura: qid,
    idTipoContrato: qid,
    estado: z.enum(['ACTIVO', 'SUSPENDIDO', 'EGRESADO']).optional(),
    ingresoDesde: fecha.optional(),
    ingresoHasta: fecha.optional(),
    salarioMin: dinero.optional(),
    salarioMax: dinero.optional(),
    ordenarPor: z
      .enum([
        'id',
        'codigo',
        'nombre',
        'departamento',
        'puesto',
        'fechaIngreso',
        'salarioBase',
        'estado',
      ])
      .default('nombre'),
    direccion: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.ingresoDesde && q.ingresoHasta && q.ingresoHasta < q.ingresoDesde)
      ctx.addIssue({
        code: 'custom',
        path: ['ingresoHasta'],
        message: 'El fin debe ser igual o posterior al inicio.',
      });
    if (q.salarioMin && q.salarioMax && new Decimal(q.salarioMax).lt(q.salarioMin))
      ctx.addIssue({
        code: 'custom',
        path: ['salarioMax'],
        message: 'El máximo debe ser igual o mayor al mínimo.',
      });
  });
export type QueryEmpleados = z.infer<typeof querySchema>;
export const cargaSchema = z
  .object({
    nombreArchivo: texto(200).regex(/\.csv$/i, 'Selecciona un archivo CSV.'),
    csv: z.string().min(1).max(1000000),
  })
  .strict();
export const confirmarCargaSchema = z
  .object({ modalidad: z.enum(['TODO_O_NADA', 'SOLO_VALIDAS']), confirmado: z.literal(true) })
  .strict();
export interface ReglasEmpleado {
  hoy: string;
  edadMinima: number;
  edadMaxima: number;
  ultimoCierre: string | null;
}
export function erroresFechas(
  d: { fechaNacimiento: string; fechaIngreso: string },
  r: ReglasEmpleado,
) {
  const errores: Record<string, string[]> = {};
  if (d.fechaNacimiento > r.hoy)
    errores.fechaNacimiento = ['La fecha de nacimiento no puede ser futura.'];
  else if (
    aniversario(d.fechaNacimiento, r.edadMinima) > r.hoy ||
    aniversario(d.fechaNacimiento, r.edadMaxima + 1) <= r.hoy
  )
    errores.fechaNacimiento = [`La edad debe estar entre ${r.edadMinima} y ${r.edadMaxima} años.`];
  if (d.fechaIngreso < aniversario(d.fechaNacimiento, r.edadMinima))
    errores.fechaIngreso = [`El ingreso debe ser a partir de los ${r.edadMinima} años.`];
  if (d.fechaIngreso > sumarDias(r.hoy, 30))
    errores.fechaIngreso = ['El ingreso no puede superar 30 días en el futuro.'];
  return errores;
}
