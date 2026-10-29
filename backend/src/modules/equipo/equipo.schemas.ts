import { z } from 'zod';
import { idSchema } from '../auditoria/auditoria.schemas.js';
export const permisosEquipo = [
  'VER_EQUIPO',
  'VER_COMISIONES_EQUIPO',
  'VER_VACACIONES_EQUIPO',
] as const;
export type PermisoEquipo = (typeof permisosEquipo)[number];
export const cambiosPermisosSchema = z
  .object({
    permisos: z
      .array(z.enum(permisosEquipo))
      .max(3)
      .refine((p) => new Set(p).size === p.length),
    revision: z.string().length(64),
    motivo: z.string().trim().min(5).max(500),
    confirmado: z.literal(true),
  })
  .strict();
export const equipoQuerySchema = z
  .object({
    buscar: z.string().trim().max(150).default(''),
    idDepartamento: idSchema.optional(),
    idCentroTrabajo: idSchema.optional(),
    idJefatura: idSchema.optional(),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(10),
    ordenarPor: z.enum(['codigo', 'nombre', 'puesto', 'departamento', 'centro']).default('nombre'),
    direccion: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
export type EquipoQuery = z.infer<typeof equipoQuerySchema>;
