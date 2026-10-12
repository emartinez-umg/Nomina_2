import { z } from 'zod';

const entero = (min: number, max: number, valor: number) =>
  z.coerce.number().int().min(min).max(max).default(valor);

const esquemaEntorno = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().trim().min(1).default('0.0.0.0'),
    PORT: entero(1, 65535, 3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    TZ: z.literal('America/Guatemala').default('America/Guatemala'),
    DB_USER: z
      .string()
      .trim()
      .regex(/^[A-Za-z][A-Za-z0-9_]{0,29}$/)
      .refine((usuario) => !['SYS', 'SYSTEM'].includes(usuario.toUpperCase()), {
        message: 'Usa un usuario de aplicación dedicado.',
      }),
    DB_PASSWORD: z.string().min(8).max(30),
    DB_CONNECT_STRING: z.string().trim().min(1),
    DB_POOL_MIN: entero(0, 20, 1),
    DB_POOL_MAX: entero(1, 20, 5),
    DB_POOL_INCREMENT: entero(1, 20, 1),
    DB_POOL_TIMEOUT_SECONDS: entero(1, 3600, 60),
    DB_QUEUE_TIMEOUT_MS: entero(100, 60000, 5000),
    DB_CONNECT_TIMEOUT_SECONDS: entero(1, 60, 10),
    DB_CALL_TIMEOUT_MS: entero(100, 60000, 5000),
    SHUTDOWN_TIMEOUT_MS: entero(1000, 60000, 15000),
  })
  .superRefine((config, ctx) => {
    if (config.DB_POOL_MIN > config.DB_POOL_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['DB_POOL_MIN'],
        message: 'DB_POOL_MIN no puede superar DB_POOL_MAX.',
      });
    }
    if (config.DB_POOL_INCREMENT > config.DB_POOL_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['DB_POOL_INCREMENT'],
        message: 'DB_POOL_INCREMENT no puede superar DB_POOL_MAX.',
      });
    }
  });

export type Config = z.infer<typeof esquemaEntorno>;

export function validarEntorno(entorno: Record<string, string | undefined>): Config {
  const resultado = esquemaEntorno.safeParse(entorno);
  if (!resultado.success) {
    const variables = [...new Set(resultado.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(
      `Configuración inválida. Revisa estas variables en .env: ${variables.join(', ')}.`,
    );
  }
  return resultado.data;
}
