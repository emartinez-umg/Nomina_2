import { z } from 'zod';
import { politicaContrasena } from '../../shared/security/credenciales.js';

export const sinDatos = z.object({}).strict();
export const loginSchema = z
  .object({
    usuario: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9.]{2,79}$/, 'Ingresa tu nombre de usuario.'),
    contrasena: z.string().min(1, 'Ingresa tu contraseña.').max(128),
  })
  .strict();
export const cambioSchema = z
  .object({
    contrasenaActual: z.string().min(1).max(128),
    contrasenaNueva: politicaContrasena,
  })
  .strict();
