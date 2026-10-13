import { z } from 'zod';

export const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const paginacionSchema = {
  pagina: z.coerce.number().int().min(1).max(1000000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  direccion: z.enum(['asc', 'desc']).default('desc'),
};
const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato aaaa-mm-dd.')
  .refine((valor) => {
    const d = new Date(`${valor}T00:00:00Z`);
    return valor >= '1900-01-01' && !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
  }, 'Ingresa una fecha válida.');
export const auditoriaQuerySchema = z
  .object({
    ...paginacionSchema,
    usuario: idSchema.optional(),
    rol: z.enum(['ADMIN', 'RH', 'EMPLEADO']).optional(),
    idEntidad: idSchema.optional(),
    ip: z.string().trim().max(45).optional(),
    entidad: z.string().trim().min(1).max(60).optional(),
    accion: z.string().trim().min(1).max(60).optional(),
    desde: fecha.optional(),
    hasta: fecha.optional(),
    ordenarPor: z.enum(['fecha', 'id']).default('fecha'),
  })
  .strict()
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
    path: ['hasta'],
    message: 'La fecha final debe ser igual o posterior a la inicial.',
  });
export type AuditoriaQuery = z.infer<typeof auditoriaQuerySchema>;
