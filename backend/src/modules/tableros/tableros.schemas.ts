import { z } from 'zod';
import { fechaSchema } from '../catalogos/catalogos.schemas.js';
const agrupar = z.enum(['empleado', 'departamento']).default('empleado');
export const remuneracionesSchema = z
  .object({
    agrupar,
    metrica: z
      .enum(['salarioBase', 'comisiones', 'horasExtra', 'totalDevengado'])
      .default('totalDevengado'),
    mes: z
      .string()
      .regex(/^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/, 'Selecciona un mes válido (aaaa-mm).')
      .optional(),
  })
  .strict();
export const inasistenciasSchema = z
  .object({
    agrupar,
    periodo: z.enum(['mes', 'trimestre', 'anio']).default('mes'),
    fecha: fechaSchema.optional(),
  })
  .strict();
export const vacacionesTableroSchema = z
  .object({
    dias: z.coerce
      .number()
      .pipe(z.union([z.literal(30), z.literal(60), z.literal(90)]))
      .default(30),
    pagina: z.coerce.number().int().min(1).max(1000000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const celebracionesSchema = z.object({}).strict();
export type QueryRemuneraciones = z.infer<typeof remuneracionesSchema>;
export type QueryInasistencias = z.infer<typeof inasistenciasSchema>;
export type QueryVacacionesTablero = z.infer<typeof vacacionesTableroSchema>;
