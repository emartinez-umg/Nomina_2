import { z } from 'zod';
import { nitValido } from '../empleados/empleados.schemas.js';
const texto = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Completa este dato.')
    .max(max)
    .regex(/^\P{Cc}*$/u, 'No uses caracteres de control.');
export const empresaSchema = z
  .object({
    razonSocial: texto(200),
    nombreComercial: z.string().trim().max(200).default(''),
    nit: texto(20)
      .transform((v) => v.toUpperCase())
      .refine(nitValido, 'El dígito verificador del NIT no coincide. Revisa el número.'),
    direccion: texto(500),
    telefono: z.string().regex(/^\d{8}$/, 'Ingresa ocho dígitos, sin código de país.'),
    correo: z.string().trim().max(254).email('Ingresa un correo válido.'),
    sitioWeb: z
      .union([
        z.literal(''),
        z
          .string()
          .max(300)
          .url()
          .refine((v) => /^https?:\/\//i.test(v), 'Usa una dirección http o https.'),
      ])
      .default(''),
    version: z.number().int().min(0),
    logo: z
      .object({
        mime: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
        base64: z
          .string()
          .max(2796204)
          .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export type DatosEmpresa = z.infer<typeof empresaSchema>;
