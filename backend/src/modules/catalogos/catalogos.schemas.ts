import { z } from 'zod';
import { nitValido } from '../empleados/empleados.schemas.js';
import { Decimal } from 'decimal.js';
import type { Catalogo, CampoCatalogo, DatosCatalogo } from './catalogos.definiciones.js';
import { idSchema, paginacionSchema } from '../auditoria/auditoria.schemas.js';

export const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha válida.')
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return v >= '1900-01-01' && !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'La fecha no existe. Revisa el día, mes y año.');
export const motivoSchema = z
  .string()
  .trim()
  .min(5, 'Explica el motivo con al menos 5 caracteres.')
  .max(500);
export const decimalSchema = (decimales = 6) =>
  z
    .string()
    .regex(
      new RegExp(`^\\d{1,12}(\\.\\d{1,${decimales}})?$`),
      'Ingresa un número positivo con los decimales permitidos.',
    )
    .refine((v) => {
      try {
        return new Decimal(v).lte(decimales === 2 ? '9999999999.99' : '999999999999.999999');
      } catch {
        return false;
      }
    }, 'El valor supera el máximo permitido.');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa hora de 24 horas (hh:mm).');
export const minutos = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
export const diaSchema = z
  .object({
    diaSemana: z.number().int().min(1).max(7),
    laborable: z.boolean(),
    entrada: hora.nullable(),
    salida: hora.nullable(),
    cruzaMedianoche: z.boolean(),
    minutosDescanso: z.number().int().min(0).max(1439),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (!d.laborable) {
      if (d.entrada !== null || d.salida !== null || d.cruzaMedianoche || d.minutosDescanso)
        ctx.addIssue({
          code: 'custom',
          message: 'Un día no laborable no debe tener horas ni descanso.',
        });
      return;
    }
    if (!d.entrada || !d.salida) {
      ctx.addIssue({ code: 'custom', message: 'Indica entrada y salida del día laborable.' });
      return;
    }
    const duracion = minutos(d.salida) + (d.cruzaMedianoche ? 1440 : 0) - minutos(d.entrada);
    if (duracion <= d.minutosDescanso || duracion > 1440)
      ctx.addIssue({
        code: 'custom',
        message:
          'La salida debe ser posterior a la entrada y el descanso menor a la duración. Revisa el cruce de medianoche.',
      });
  });
function schemaCampo(f: CampoCatalogo): z.ZodTypeAny {
  let s: z.ZodTypeAny;
  switch (f.tipo) {
    case 'nit':
      s = z
        .string()
        .trim()
        .toUpperCase()
        .max(20)
        .refine(nitValido, 'El NIT no tiene un verificador válido. Revisa el RTU.');
      break;
    case 'correo':
      s = z.string().trim().toLowerCase().email('Ingresa un correo válido.').max(254);
      break;
    case 'telefono':
      s = z.string().regex(/^\d{8}$/, 'Ingresa ocho dígitos, sin código de país.');
      break;
    case 'nombre':
      s = z
        .string()
        .trim()
        .min(1)
        .max(f.max ?? 200)
        .regex(/^[\p{L}\p{M} '-]+$/u, 'Usa letras, espacios, apóstrofo o guion.');
      break;
    case 'fecha':
      s = fechaSchema;
      break;
    case 'referencia':
      s = z.number().int().positive();
      break;
    case 'entero':
      s = z.number().int().min(0).max(1440);
      break;
    case 'booleano':
      s = z.boolean();
      break;
    case 'opcion':
      s = z.string().refine((v) => f.opciones?.includes(v), 'Selecciona una opción válida.');
      break;
    case 'dinero':
    case 'decimal':
      s = decimalSchema(f.decimales);
      break;
    default:
      s = z
        .string()
        .trim()
        .min(1, 'Este campo es obligatorio.')
        .max(f.max ?? 500)
        .refine(
          (v) =>
            [...v].every(
              (c) => c === '\n' || c === '\t' || (c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
            ),
          'El texto contiene caracteres inválidos.',
        );
  }
  if (f.tipo === 'codigo')
    s = z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]*$/, 'Usa mayúsculas, números y guion bajo; empieza con una letra.')
      .max(f.max ?? 40);
  return f.requerido ? s : s.nullable().default(null);
}
export function entradaSchema(cat: Catalogo) {
  const shape: z.ZodRawShape = Object.fromEntries(
    cat.campos.map((f) => [f.nombre, schemaCampo(f)]),
  );
  if (cat.slug === 'horarios')
    shape.dias = z.array(diaSchema).length(7, 'Configura los siete días.');
  if (cat.legal) {
    shape.motivo = motivoSchema;
    shape.confirmado = z.literal(true, {
      errorMap: () => ({ message: 'Confirma la advertencia de cambio legal.' }),
    });
  }
  return z
    .object(shape)
    .strict()
    .superRefine((d, ctx) => {
      if (
        cat.campos.some(
          (f) =>
            ['dinero', 'decimal'].includes(f.tipo) &&
            d[f.nombre] != null &&
            !/^\d+(\.\d+)?$/.test(String(d[f.nombre])),
        )
      )
        return;
      const error = (campo: string, mensaje: string) =>
        ctx.addIssue({ code: 'custom', path: [campo], message: mensaje });
      if (d.vigenteHasta && d.vigenteDesde > d.vigenteHasta)
        error('vigenteHasta', 'La fecha final debe ser igual o posterior a la inicial.');
      if (
        cat.slug === 'puestos' &&
        ((d.salarioMinimo === null) !== (d.salarioMaximo === null) ||
          (d.salarioMinimo !== null && new Decimal(d.salarioMinimo).gt(d.salarioMaximo ?? 0)))
      )
        error(
          'salarioMaximo',
          'Ingresa ambos límites; el máximo debe ser igual o mayor al mínimo.',
        );
      if (
        cat.slug === 'parametros-legales' &&
        d.unidad === 'PORCENTAJE' &&
        new Decimal(d.valor).gt(100)
      )
        error('valor', 'El porcentaje debe estar entre 0 y 100.');
      if (cat.slug === 'parametros-legales') {
        const max = String(d.codigo).endsWith('_DIA')
          ? 31
          : String(d.codigo).endsWith('_MES')
            ? 12
            : null;
        if (
          max !== null &&
          (!new Decimal(d.valor).isInteger() ||
            new Decimal(d.valor).lt(1) ||
            new Decimal(d.valor).gt(max))
        )
          error('valor', `Ingresa un entero entre 1 y ${max} para esta posición del calendario.`);
        if (
          /^JORNADA_.*_HORAS$/.test(String(d.codigo)) &&
          (new Decimal(d.valor).lte(0) || new Decimal(d.valor).gt(24))
        )
          error('valor', 'La duración de una jornada debe superar 0 y no exceder 24 horas.');
      }
      if (cat.slug === 'tramos-isr') {
        if (d.limiteSuperior !== null && new Decimal(d.limiteSuperior).lte(d.limiteInferior))
          error('limiteSuperior', 'El límite superior debe superar el inferior.');
        if (new Decimal(d.tasaPorcentaje).gt(100))
          error('tasaPorcentaje', 'La tasa debe estar entre 0 y 100.');
      }
      if (cat.slug === 'feriados') {
        if (d.minutoFin <= d.minutoInicio)
          error('minutoFin', 'El fin debe ser posterior al inicio.');
        if (
          (d.ambito === 'NACIONAL' && d.localidad !== '*') ||
          (d.ambito === 'LOCAL' && d.localidad === '*')
        )
          error('localidad', 'Para nacional usa *; para local ingresa la localidad.');
      }
      if (cat.slug === 'horarios') {
        if (new Set(d.dias.map((dia: { diaSemana: number }) => dia.diaSemana)).size !== 7)
          error('dias', 'Incluye cada día de la semana una sola vez.');
        if (!d.dias.some((dia: { laborable: boolean }) => dia.laborable))
          error('dias', 'Selecciona al menos un día laborable.');
      }
    })
    .transform((d) => d as DatosCatalogo);
}
export function querySchema(cat: Catalogo) {
  const shape: z.ZodRawShape = {
    ...paginacionSchema,
    buscar: z.string().trim().max(150).optional(),
    activo: z.enum(['0', '1']).optional(),
    ordenarPor: z
      .string()
      .default(cat.campos[0]!.nombre)
      .refine(
        (v) => ['id', 'activo', ...cat.campos.map((f) => f.nombre)].includes(v),
        'Orden no permitido.',
      ),
  };
  for (const f of cat.campos) {
    if (['dinero', 'decimal', 'entero', 'fecha'].includes(f.tipo)) {
      for (const sufijo of ['Min', 'Max'])
        shape[f.nombre + sufijo] = (
          f.tipo === 'fecha' ? fechaSchema : decimalSchema(f.decimales ?? 6)
        ).optional();
    } else
      shape[f.nombre === 'direccion' ? 'direccionTexto' : f.nombre] = (
        f.tipo === 'referencia'
          ? idSchema
          : f.tipo === 'booleano'
            ? z.enum(['0', '1'])
            : f.tipo === 'opcion'
              ? z.string().refine((v) => f.opciones?.includes(v))
              : z
                  .string()
                  .trim()
                  .max(f.max ?? 500)
      ).optional();
  }
  if (cat.slug === 'feriados') shape.anio = z.coerce.number().int().min(1900).max(9999).optional();
  if (cat.slug === 'horarios') {
    shape.diaSemana = z.coerce.number().int().min(1).max(7).optional();
    shape.entradaMin = z.coerce.number().int().min(0).max(1439).optional();
    shape.entradaMax = z.coerce.number().int().min(0).max(1439).optional();
    shape.salidaMin = z.coerce.number().int().min(0).max(1439).optional();
    shape.descansoMin = z.coerce.number().int().min(0).max(1439).optional();
    shape.descansoMax = z.coerce.number().int().min(0).max(1439).optional();
    shape.cruzaMedianoche = z.enum(['0', '1']).optional();
    shape.laborable = z.enum(['0', '1']).optional();
    shape.salidaMax = z.coerce.number().int().min(0).max(1439).optional();
    shape.horasMin = decimalSchema(2).optional();
    shape.horasMax = decimalSchema(2).optional();
  }
  return z
    .object(shape)
    .strict()
    .superRefine((d, ctx) => {
      for (const f of cat.campos) {
        const min = d[f.nombre + 'Min'],
          max = d[f.nombre + 'Max'];
        if (
          min !== undefined &&
          max !== undefined &&
          (f.tipo === 'fecha'
            ? min > max
            : /^\d+(\.\d+)?$/.test(String(min)) &&
              /^\d+(\.\d+)?$/.test(String(max)) &&
              new Decimal(min).gt(max))
        )
          ctx.addIssue({
            code: 'custom',
            path: [f.nombre + 'Max'],
            message: 'El máximo debe ser igual o mayor al mínimo.',
          });
      }
    });
}
export type QueryCatalogo = Record<string, string | number | undefined> & {
  pagina: number;
  limite: number;
  direccion: 'asc' | 'desc';
  ordenarPor: string;
};
export const estadoCatalogoSchema = z
  .object({ activo: z.boolean(), motivo: motivoSchema, confirmado: z.literal(true).optional() })
  .strict();
export const eliminarCatalogoSchema = z
  .object({ motivo: motivoSchema, fisica: z.boolean().default(false), confirmado: z.literal(true) })
  .strict();
