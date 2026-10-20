import { z } from 'zod';
import { importe, mesSchema } from './novedades.schemas.js';
export const vehiculoSchema = z.enum(['CARRO', 'MOTO']);
export const placaSchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(12)
  .regex(/^[A-Z0-9-]*$/, 'Usa letras, números o guion.');
export const tarifaSchema = z
  .object({
    vehiculo: vehiculoSchema,
    monto: importe,
    mes: mesSchema,
    motivo: z.string().trim().min(5).max(500),
    confirmado: z.literal(true),
  })
  .strict();
export const parqueoQuery = z
  .object({
    mes: mesSchema,
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
    buscar: z.string().trim().max(150).optional(),
    ordenarPor: z.enum(['id', 'empleado', 'inicio', 'estado']).optional(),
    direccion: z.enum(['asc', 'desc']).optional(),
    vehiculo: vehiculoSchema.optional(),
    idDepartamento: z.coerce.number().int().positive().optional(),
    estado: z.enum(['ACTIVA', 'BAJA', 'SUSPENDIDA']).optional(),
  })
  .strict();
export const cambioParqueoSchema = z
  .object({
    accion: z.enum(['SOLICITAR_BAJA', 'BAJA', 'SUSPENDER', 'COMPLETAR']),
    motivo: z.string().trim().min(5).max(500),
    vehiculo: vehiculoSchema.optional(),
    placa: placaSchema.optional(),
    confirmado: z.literal(true),
  })
  .strict();
