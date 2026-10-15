import { z } from 'zod';
import { idSchema } from '../auditoria/auditoria.schemas.js';
export const objetivoPagoSchema = z
  .object({
    mes: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
    tipoPago: z.enum(['ANTICIPO', 'PAGO', 'BONO_14', 'AGUINALDO']),
    objetivo: z.enum(['EMPLEADO', 'DEPARTAMENTO', 'TODOS']),
    idEmpleado: idSchema.optional(),
    idDepartamento: idSchema.optional(),
  })
  .strict();
export type ObjetivoPago = z.infer<typeof objetivoPagoSchema>;
export function validarObjetivo(d: ObjetivoPago) {
  return (
    (d.objetivo === 'EMPLEADO' && !!d.idEmpleado && !d.idDepartamento) ||
    (d.objetivo === 'DEPARTAMENTO' && !!d.idDepartamento && !d.idEmpleado) ||
    (d.objetivo === 'TODOS' && !d.idEmpleado && !d.idDepartamento)
  );
}
export const simularSchema = objetivoPagoSchema.refine(
  validarObjetivo,
  'Selecciona únicamente el empleado o departamento del objetivo.',
);
export const pagarSchema = objetivoPagoSchema
  .extend({
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    confirmado: z.literal(true),
    novedadesCompletas: z.literal(true),
  })
  .refine(validarObjetivo, 'Selecciona el objetivo completo.');
export const revertirPagoSchema = z
  .object({ motivo: z.string().trim().min(10).max(500), confirmado: z.literal(true) })
  .strict();
