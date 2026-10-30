import { z } from 'zod';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { estadosActa, fechaActa } from '../../shared/actas/modelo.js';
export { actaSchema, accionActaSchema, plantillaActaSchema } from '../../shared/actas/modelo.js';
export const queryActasSchema = z
  .object({
    buscar: z.string().trim().max(150).optional(),
    pagina: z.coerce.number().int().min(1).max(1000000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
    idEmpleado: idSchema.optional(),
    idDepartamento: idSchema.optional(),
    idTipo: idSchema.optional(),
    estado: z.enum(estadosActa).optional(),
    desde: fechaActa.optional(),
    hasta: fechaActa.optional(),
    ordenarPor: z
      .enum(['codigo', 'empleado', 'fechaHecho', 'estado', 'tipo'])
      .default('fechaHecho'),
    direccion: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine((d) => !d.desde || !d.hasta || d.hasta >= d.desde, {
    path: ['hasta'],
    message: 'Hasta debe ser igual o posterior a Desde.',
  });
export type QueryActas = z.infer<typeof queryActasSchema>;
export const cargaActaSchema = z
  .object({ clase: z.enum(['EVIDENCIA', 'FIRMA']), version: idSchema, confirmado: z.literal('1') })
  .strict();
