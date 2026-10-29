import { z } from 'zod';
import { fecha } from '../empleados/empleados.schemas.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
export const cargaExpedienteSchema = z
  .object({
    tipo: idSchema,
    anterior: idSchema.optional(),
    vencimiento: fecha.optional(),
  })
  .strict();
export const bajaExpedienteSchema = z
  .object({ motivo: z.string().trim().min(5).max(500), confirmado: z.literal(true) })
  .strict();
export const tipoExpedienteSchema = bajaExpedienteSchema.extend({
  obligatorio: z.boolean(),
  requiereVencimiento: z.boolean(),
});
export type CargaExpediente = z.infer<typeof cargaExpedienteSchema>;
