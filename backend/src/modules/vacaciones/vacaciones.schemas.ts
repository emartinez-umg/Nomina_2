import { z } from 'zod';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { diasInclusivos } from '../novedades/novedades.reglas.js';
export const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      v >= '1900-01-01' &&
      v <= '2199-12-31' &&
      !Number.isNaN(Date.parse(v)) &&
      new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v,
    'Ingresa una fecha real en formato aaaa-mm-dd.',
  );
export const rangoSchema = z
  .object({ inicio: fechaSchema, fin: fechaSchema })
  .strict()
  .refine((d) => d.fin >= d.inicio && diasInclusivos(d.inicio, d.fin) <= 366, {
    path: ['fin'],
    message: 'El fin debe ser posterior o igual al inicio; el rango admite hasta 366 días.',
  });
export const estadoSchema = z.enum(['EN_PROCESO', 'APROBADA', 'RECHAZADA', 'CANCELADA', 'TOMADA']);
export const querySchema = z
  .object({
    buscar: z.string().trim().max(150).default(''),
    idEmpleado: idSchema.optional(),
    estado: estadoSchema.optional(),
    desde: fechaSchema.optional(),
    hasta: fechaSchema.optional(),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(10),
    ordenarPor: z.enum(['id', 'empleado', 'inicio', 'fin', 'dias', 'estado']).default('id'),
    direccion: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine((q) => !q.desde || !q.hasta || q.hasta >= q.desde, {
    path: ['hasta'],
    message: 'Hasta debe ser igual o posterior a Desde.',
  });
export type Query = z.infer<typeof querySchema>;
export const resolverSchema = z
  .object({
    estado: z.enum(['APROBADA', 'RECHAZADA']),
    motivo: z.string().trim().max(500).default(''),
    confirmado: z.literal(true),
  })
  .strict()
  .refine((d) => d.estado !== 'RECHAZADA' || d.motivo.length >= 10, {
    path: ['motivo'],
    message: 'Explica el rechazo con al menos 10 caracteres.',
  });
export const cargaSchema = z
  .object({
    tipo: z.enum(['SALDO_INICIAL', 'TOMADAS']),
    dias: z.string().regex(/^\d{1,5}(\.\d{1,2})?$/, 'Ingresa días con hasta dos decimales.'),
    referencia: z
      .string()
      .trim()
      .min(3)
      .max(60)
      .regex(/^[A-Za-z0-9_-]+$/, 'Usa letras, números, guion o guion bajo.'),
    motivo: z.string().trim().min(10).max(500),
    confirmado: z.literal(true),
  })
  .strict();
