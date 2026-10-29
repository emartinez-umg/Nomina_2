import { z } from 'zod';

export const mesComisionSchema = z
  .string()
  .regex(/^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/, 'Selecciona un mes válido (aaaa-mm).');
const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const booleano = z.enum(['true', 'false']).transform((v) => v === 'true');
const vendedores = z
  .union([z.string().transform((v) => v.split(',')), z.array(z.string())])
  .pipe(
    z
      .array(
        z
          .string()
          .regex(/^[1-9]\d*$/)
          .pipe(id),
      )
      .min(1)
      .max(500),
  )
  .refine((v) => new Set(v).size === v.length, 'No repitas vendedores.')
  .optional();
const base = z
  .object({
    desde: mesComisionSchema,
    hasta: mesComisionSchema,
    idDepartamento: id.optional(),
    vendedores,
    estado: z.enum(['todas', 'pendientes', 'aplicadas']).default('todas'),
    comparar: booleano.default('false'),
  })
  .strict();
export const indiceMes = (mes: string) => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5)) - 1;
export const mesDeIndice = (indice: number) =>
  `${Math.floor(indice / 12)
    .toString()
    .padStart(4, '0')}-${((indice % 12) + 1).toString().padStart(2, '0')}`;
const rangoValido = (q: { desde: string; hasta: string }, ctx: z.RefinementCtx) => {
  const meses = indiceMes(q.hasta) - indiceMes(q.desde) + 1;
  if (meses < 1)
    ctx.addIssue({
      code: 'custom',
      path: ['hasta'],
      message: 'Hasta debe ser igual o posterior a Desde.',
    });
  if (meses > 60)
    ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'Selecciona un máximo de 60 meses.' });
};
export const comisionesQuerySchema = base.superRefine(rangoValido);
const pagina = {
  pagina: z.coerce.number().int().min(1).max(1000000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
};
export const comisionesListaSchema = base
  .extend({
    ...pagina,
    ordenarPor: z.enum(['total', 'nombre', 'codigo', 'promedioMensual']).default('total'),
    direccion: z.enum(['asc', 'desc']).default('desc'),
  })
  .superRefine(rangoValido);
export const comisionesHistorialSchema = base.extend(pagina).superRefine(rangoValido);
export const vendedorParamsSchema = z.object({ id: id }).strict();
export const comisionesAniosSchema = z.object({}).strict();
export type ComisionesQuery = z.infer<typeof comisionesQuerySchema>;
export type ComisionesLista = z.infer<typeof comisionesListaSchema>;
export type ComisionesHistorial = z.infer<typeof comisionesHistorialSchema>;
