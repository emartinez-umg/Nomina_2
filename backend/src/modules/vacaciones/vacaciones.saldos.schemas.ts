import { z } from 'zod';
import { idSchema } from '../auditoria/auditoria.schemas.js';
export const saldosQuerySchema = z
  .object({
    buscar: z.string().trim().max(150).default(''),
    idDepartamento: idSchema.optional(),
    idCentroTrabajo: idSchema.optional(),
    idJefatura: idSchema.optional(),
    soloAlerta: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .default('false'),
    activos: z.enum(['todos', 'true', 'false']).default('true'),
    alcance: z.enum(['general', 'equipo']).default('general'),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(10),
    ordenarPor: z
      .enum([
        'codigo',
        'nombre',
        'departamento',
        'centro',
        'jefatura',
        'ingreso',
        'mesesCompletos',
        'acumulado',
        'tomados',
        'disponible',
        'solicitables',
      ])
      .default('disponible'),
    direccion: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
export type SaldosQuery = z.infer<typeof saldosQuerySchema>;
