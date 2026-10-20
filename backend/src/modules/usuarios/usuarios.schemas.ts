import { z } from 'zod';
import { idSchema, paginacionSchema } from '../auditoria/auditoria.schemas.js';

export const rolSchema = z.enum(['ADMIN', 'RH', 'EMPLEADO']);
export const usuarioIdSchema = z.object({ id: idSchema }).strict();
export const motivoSchema = z
  .string()
  .trim()
  .min(5, 'Explica el motivo con al menos 5 caracteres.')
  .max(1000);
export const usuariosQuerySchema = z
  .object({
    ...paginacionSchema,
    buscar: z.string().trim().min(1).max(254).optional(),
    usuario: z.string().trim().max(80).optional(),
    correo: z.string().trim().max(254).optional(),
    rol: rolSchema.optional(),
    activo: z.enum(['0', '1']).optional(),
    cambioObligatorio: z.enum(['0', '1']).optional(),
    ordenarPor: z.enum(['id', 'usuario', 'correo', 'rol', 'activo']).default('usuario'),
  })
  .strict();
export const estadoSchema = z.object({ activo: z.boolean(), motivo: motivoSchema }).strict();
export const cambiarRolSchema = z.object({ rol: rolSchema, motivo: motivoSchema }).strict();
export const restablecerSchema = z.object({ motivo: motivoSchema }).strict();
export const nuevoUsuarioInternoSchema = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[\p{L}\p{M} '-]+$/u, 'Usa letras, espacios, apóstrofo o guion.')
      .refine((v) => /\p{L}/u.test(v), 'Ingresa un nombre con letras.'),
    apellido: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[\p{L}\p{M} '-]+$/u, 'Usa letras, espacios, apóstrofo o guion.')
      .refine((v) => /\p{L}/u.test(v), 'Ingresa un apellido con letras.'),
    correo: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    rol: rolSchema.default('EMPLEADO'),
  })
  .strict();
export type UsuariosQuery = z.infer<typeof usuariosQuerySchema>;

export const crearUsuarioSchema = nuevoUsuarioInternoSchema
  .extend({ rol: z.enum(['ADMIN', 'RH']), motivo: motivoSchema, confirmado: z.literal(true) })
  .strict();
export const expedienteSchema = z
  .object({
    idEmpleado: z.number().int().positive(),
    motivo: motivoSchema,
    confirmado: z.literal(true),
  })
  .strict();
