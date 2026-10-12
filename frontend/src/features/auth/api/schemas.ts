import { z } from 'zod';
import { contrasenaSchema } from '../../../lib/validadores';
export const loginSchema = z.object({
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9.]{2,79}$/, 'Ingresa el usuario asignado, por ejemplo nombre.apellido.'),
  contrasena: z
    .string()
    .min(1, 'Ingresa tu contraseña.')
    .max(128, 'La contraseña admite hasta 128 caracteres.'),
});
export const cambioSchema = z
  .object({
    contrasenaActual: z.string().min(1, 'Ingresa tu contraseña actual.').max(128),
    contrasenaNueva: contrasenaSchema,
    confirmacion: z.string().min(1, 'Repite la nueva contraseña.'),
  })
  .superRefine((d, c) => {
    if (d.contrasenaActual === d.contrasenaNueva)
      c.addIssue({
        code: 'custom',
        path: ['contrasenaNueva'],
        message: 'La nueva contraseña debe ser diferente de la actual.',
      });
    if (d.confirmacion !== d.contrasenaNueva)
      c.addIssue({
        code: 'custom',
        path: ['confirmacion'],
        message: 'Las contraseñas no coinciden. Escribe la misma contraseña nueva.',
      });
  });
