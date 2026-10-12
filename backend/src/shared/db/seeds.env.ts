import { z } from 'zod';

const esquema = z.object({
  ADMIN_USER: z.string().regex(/^[a-z][a-z0-9.]{2,79}$/),
  ADMIN_EMAIL: z
    .string()
    .email()
    .max(254)
    .transform((correo) => correo.toLowerCase()),
  ADMIN_PASSWORD: z
    .string()
    .min(10)
    .max(128)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9\s]/),
});

export type CredencialesAdmin = z.infer<typeof esquema>;

export function validarEntornoSeeds(
  entorno: Record<string, string | undefined>,
): CredencialesAdmin {
  const resultado = esquema.safeParse(entorno);
  if (!resultado.success) {
    const variables = [...new Set(resultado.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Configuración de seeds inválida. Revisa: ${variables.join(', ')}.`);
  }
  return resultado.data;
}
