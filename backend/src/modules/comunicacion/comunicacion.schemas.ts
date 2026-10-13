import { z } from 'zod';
import { idSchema, paginacionSchema } from '../auditoria/auditoria.schemas.js';
export const tipoSchema = z.enum(['anuncios', 'eventos']);
export type Tipo = z.infer<typeof tipoSchema>;
export const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa aaaa-mm-dd.')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return s >= '1900-01-01' && !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Ingresa una fecha válida.');
export const instanteSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Indica fecha y hora local.')
  .refine(
    (s) =>
      fechaSchema.safeParse(s.slice(0, 10)).success &&
      Number(s.slice(11, 13)) < 24 &&
      Number(s.slice(14)) < 60,
    'Ingresa una fecha y hora válidas.',
  );
export const destinatarioSchema = z
  .object({ tipo: z.enum(['DEPARTAMENTO', 'PUESTO', 'JEFATURA']), id: idSchema })
  .strict();
export const datosSchema = z
  .object({
    titulo: z.string().trim().min(3, 'Escribe al menos tres caracteres.').max(200),
    contenido: z.string().trim().min(3, 'Explica el anuncio o evento.').max(10000),
    inicio: z.string(),
    fin: z.string(),
    lugar: z.string().trim().max(250).default(''),
    paraTodos: z.boolean(),
    destinatarios: z.array(destinatarioSchema).max(100),
    version: z.number().int().min(1).default(1),
  })
  .strict()
  .superRefine((d, ctx) => {
    if ((!d.paraTodos && !d.destinatarios.length) || (d.paraTodos && d.destinatarios.length))
      ctx.addIssue({
        code: 'custom',
        path: ['destinatarios'],
        message: 'Elige todos o al menos un grupo; no combines ambas opciones.',
      });
    if (new Set(d.destinatarios.map((v) => `${v.tipo}:${v.id}`)).size !== d.destinatarios.length)
      ctx.addIssue({
        code: 'custom',
        path: ['destinatarios'],
        message: 'Quita los grupos repetidos.',
      });
    if (d.fin < d.inicio)
      ctx.addIssue({
        code: 'custom',
        path: ['fin'],
        message: 'El fin debe ser igual o posterior al inicio.',
      });
  });
export type Datos = z.infer<typeof datosSchema>;
export const querySchema = z
  .object({
    ...paginacionSchema,
    buscar: z.string().trim().max(200).optional(),
    desde: fechaSchema.optional(),
    hasta: fechaSchema.optional(),
    activo: z.enum(['0', '1']).optional(),
    paraTodos: z.enum(['0', '1']).optional(),
    grupo: destinatarioSchema.shape.tipo.optional(),
    idGrupo: idSchema.optional(),
    ordenarPor: z.enum(['titulo', 'inicio', 'fin', 'id']).default('inicio'),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.desde && q.hasta && q.hasta < q.desde)
      ctx.addIssue({
        code: 'custom',
        path: ['hasta'],
        message: 'La fecha final debe ser posterior a la inicial.',
      });
    if (!!q.grupo !== !!q.idGrupo)
      ctx.addIssue({
        code: 'custom',
        path: ['grupo'],
        message: 'Indica el tipo de grupo y su selección.',
      });
  });
export type Query = z.infer<typeof querySchema>;
export const borrarSchema = z
  .object({
    version: z.number().int().positive(),
    motivo: z.string().trim().min(10, 'Explica el motivo con al menos diez caracteres.').max(500),
    confirmado: z.literal(true),
  })
  .strict();
