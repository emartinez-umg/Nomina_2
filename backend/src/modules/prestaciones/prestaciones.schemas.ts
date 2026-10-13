import { z } from 'zod';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { fechaSchema } from '../vacaciones/vacaciones.schemas.js';
export const motivo = z
  .string()
  .trim()
  .min(10, 'Explica el motivo con al menos 10 caracteres.')
  .max(500);
export const anualSchema = z
  .object({
    tipo: z.enum(['AGUINALDO', 'BONO_14']),
    anio: z.coerce.number().int().min(1901).max(2199),
    idDepartamento: idSchema.optional(),
    idEmpleado: idSchema.optional(),
  })
  .strict();
export const finiquitoSchema = z
  .object({
    idEmpleado: idSchema,
    corte: fechaSchema,
    causa: z.enum(['DESPIDO_INJUSTIFICADO', 'RENUNCIA', 'DESPIDO_JUSTIFICADO']),
  })
  .strict();
export const guardarSchema = z
  .object({
    seleccion: anualSchema,
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    motivo,
    confirmado: z.literal(true),
  })
  .strict();
export const liquidarSchema = z
  .object({
    seleccion: finiquitoSchema,
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    motivo,
    confirmado: z.literal(true),
  })
  .strict();
export const accionSchema = z
  .object({
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    motivo,
    confirmado: z.literal(true),
    fechaPago: fechaSchema.optional(),
    referencia: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[A-Za-z0-9_-]+$/, 'Usa letras, números, guion o guion bajo.')
      .optional(),
  })
  .strict();
export const constanciaSchema = z
  .object({ idEmpleado: idSchema, inicio: fechaSchema, fin: fechaSchema })
  .strict()
  .refine(
    (d) => d.fin >= d.inicio && Number(d.fin.slice(0, 4)) - Number(d.inicio.slice(0, 4)) <= 5,
    {
      path: ['fin'],
      message: 'El fin debe ser posterior al inicio; el rango admite hasta cinco años.',
    },
  );
export const querySchema = z
  .object({
    buscar: z.string().trim().max(150).default(''),
    idEmpleado: idSchema.optional(),
    idDepartamento: idSchema.optional(),
    tipo: z.enum(['AGUINALDO', 'BONO_14', 'INDEMNIZACION']).optional(),
    estado: z.enum(['CALCULADA', 'APROBADA', 'PAGADA', 'ANULADA']).optional(),
    desde: fechaSchema.optional(),
    hasta: fechaSchema.optional(),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(10),
    ordenarPor: z.enum(['id', 'empleado', 'tipo', 'fin', 'total', 'estado']).default('id'),
    direccion: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine((d) => !d.desde || !d.hasta || d.hasta >= d.desde, {
    path: ['hasta'],
    message: 'Hasta debe ser posterior o igual a Desde.',
  });
export type Query = z.infer<typeof querySchema>;
export type Seleccion = z.infer<typeof anualSchema>;
export type Finiquito = z.infer<typeof finiquitoSchema>;
