import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { fecha as fechaBase } from '../empleados/empleados.schemas.js';
const fecha = fechaBase.refine((v) => v >= '1900-01-01', 'Selecciona una fecha desde el año 1900.');

const limiteDecimal = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Ingresa un número no negativo con hasta dos decimales.');
export const tipoSchema = z.enum([
  'descuentos',
  'prestamos',
  'comisiones',
  'horas-extra',
  'ausencias',
]);
export type Tipo = z.infer<typeof tipoSchema>;
const id = z.number().int().positive().safe();
export const importe = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Ingresa un monto con hasta dos decimales.')
  .refine(
    (v) => /^\d{1,10}(\.\d{1,2})?$/.test(v) && new Decimal(v).gt(0),
    'El monto debe ser mayor que cero.',
  );
const motivo = z.string().trim().min(5, 'Explica el motivo con al menos 5 caracteres.').max(500);
export const adjuntoSchema = z
  .object({
    nombre: z
      .string()
      .min(1)
      .max(150)
      .regex(
        /^[\p{L}\p{N} ._()-]+$/u,
        'Usa un nombre de archivo sin rutas ni caracteres especiales.',
      ),
    tipo: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
    base64: z
      .string()
      .min(4)
      .max(1398104)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  })
  .strict();
const base = z.object({ idEmpleado: id, motivo, confirmado: z.boolean().optional() });
const estado = z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA']);
const descuento = base
  .extend({
    idTipo: id,
    modalidad: z.enum(['FIJO', 'CUOTAS', 'UNICO']),
    monto: importe,
    cuotas: z.number().int().min(1).max(600).nullable(),
    fechaInicio: fecha,
    fechaFin: fecha.nullable(),
  })
  .strict();
const prestamo = base
  .extend({
    idTipo: id,
    monto: importe,
    cuotas: z.number().int().min(1).max(600),
    fechaInicio: fecha,
    fechaDesembolso: fecha,
    referencia: z.string().trim().min(1).max(100),
  })
  .strict();
const comision = base
  .extend({ fecha, monto: importe, referencia: z.string().trim().min(1).max(100) })
  .strict();
const hora = base
  .extend({
    fecha,
    horas: importe.refine(
      (v) => /^\d{1,10}(\.\d{1,2})?$/.test(v) && new Decimal(v).lte(24),
      'No puede superar 24 horas por día.',
    ),
    jornada: z.enum(['DIURNA', 'MIXTA', 'NOCTURNA']),
    estado,
  })
  .strict();
const ausencia = base
  .extend({
    idTipo: id,
    fechaInicio: fecha,
    fechaFin: fecha,
    estado,
    adjunto: adjuntoSchema.nullable().optional(),
  })
  .strict();
export const schemas = {
  descuentos: descuento,
  prestamos: prestamo,
  comisiones: comision,
  'horas-extra': hora,
  ausencias: ausencia,
};
export type Datos = z.infer<typeof base> & {
  idTipo?: number;
  modalidad?: 'FIJO' | 'CUOTAS' | 'UNICO';
  monto?: string;
  cuotas?: number | null;
  fechaInicio?: string;
  fechaFin?: string | null;
  fechaDesembolso?: string;
  referencia?: string;
  fecha?: string;
  horas?: string;
  jornada?: 'DIURNA' | 'MIXTA' | 'NOCTURNA';
  estado?: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  adjunto?: z.infer<typeof adjuntoSchema> | null | undefined;
};
export const accionSchema = z
  .object({
    motivo,
    confirmado: z.literal(true, {
      errorMap: () => ({ message: 'Confirma la anulación antes de continuar.' }),
    }),
  })
  .strict();
export const querySchema = z
  .object({
    pagina: z.coerce.number().int().min(1).max(1000000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
    ordenarPor: z
      .enum(['id', 'codigo', 'empleado', 'fechaInicio', 'monto', 'estado', 'saldo'])
      .default('id'),
    direccion: z.enum(['asc', 'desc']).default('desc'),
    buscar: z.string().trim().max(150).optional(),
    idEmpleado: z.coerce.number().int().positive().optional(),
    idTipo: z.coerce.number().int().positive().optional(),
    idPeriodo: z.coerce.number().int().positive().optional(),
    desde: fecha.optional(),
    hasta: fecha.optional(),
    estado: z
      .enum([
        'VIGENTE',
        'LIQUIDADO',
        'CANCELADO',
        'PENDIENTE',
        'APROBADA',
        'RECHAZADA',
        'ACTIVA',
        'INACTIVA',
      ])
      .optional(),
    modalidad: z.enum(['FIJO', 'CUOTAS', 'UNICO']).optional(),
    jornada: z.enum(['DIURNA', 'MIXTA', 'NOCTURNA']).optional(),
    efecto: z.enum(['CON_GOCE', 'SIN_GOCE', 'SUBSIDIO_IGSS']).optional(),
    montoMin: limiteDecimal.optional(),
    montoMax: limiteDecimal.optional(),
    saldoMin: z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/)
      .optional(),
    saldoMax: limiteDecimal.optional(),
    horasMin: limiteDecimal.optional(),
    horasMax: limiteDecimal.optional(),
    cuotasMin: z.coerce.number().int().min(1).max(600).optional(),
    cuotasMax: z.coerce.number().int().min(1).max(600).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.desde && d.hasta && d.desde > d.hasta)
      ctx.addIssue({
        code: 'custom',
        path: ['hasta'],
        message: 'Hasta debe ser igual o posterior a Desde.',
      });
    for (const key of ['monto', 'saldo', 'horas', 'cuotas'] as const) {
      const min = d[`${key}Min`],
        max = d[`${key}Max`];
      if (
        min !== undefined &&
        max !== undefined &&
        /^\d+(\.\d+)?$/.test(String(min)) &&
        /^\d+(\.\d+)?$/.test(String(max)) &&
        new Decimal(min).gt(max)
      )
        ctx.addIssue({
          code: 'custom',
          path: [`${key}Max`],
          message: 'El máximo no puede ser menor que el mínimo.',
        });
    }
  });
export type Query = z.infer<typeof querySchema>;

export function validarAdjunto(d: z.infer<typeof adjuntoSchema>) {
  const b = Buffer.from(d.base64, 'base64');
  const firma =
    d.tipo === 'application/pdf'
      ? b.subarray(0, 5).toString() === '%PDF-'
      : d.tipo === 'image/png'
        ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : b[0] === 255 && b[1] === 216 && b[2] === 255;
  return b.length <= 1048576 && b.toString('base64') === d.base64 && firma;
}
