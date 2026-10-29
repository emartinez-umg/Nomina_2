import { z } from 'zod';
export const asignacionJefaturaSchema = z
  .object({
    idJefatura: z.number().int().positive(),
    empleados: z
      .array(z.number().int().positive())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, 'No repitas empleados en la selección.'),
    motivo: z.string().trim().min(5).max(500),
    confirmado: z.literal(true),
  })
  .strict();
