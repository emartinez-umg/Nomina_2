import { z } from 'zod';

const id = z.string().regex(/^[1-9]\d{0,9}$/);
const fecha = z.string().date();
const esquema = z.object({
  idEmpleado: id.optional(),
  idDepartamento: id.optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  anio: z
    .string()
    .regex(/^(19|[2-9]\d)\d{2}$/)
    .optional(),
  mes: z
    .string()
    .regex(/^(?:[1-9]|1[0-2])$/)
    .optional(),
  estado: z.enum(['APROBADA', 'TOMADA', 'EN_PROCESO', '']).optional(),
});
/** Solo traslada filtros conocidos del enlace; la API revalida permisos y valores. */
export function filtrosEnlace(params: URLSearchParams, campos: (keyof z.infer<typeof esquema>)[]) {
  const filtros: Record<string, string> = {};
  for (const campo of campos) {
    const valor = params.get(campo);
    if (valor !== null && esquema.shape[campo].safeParse(valor).success) filtros[campo] = valor;
  }
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    delete filtros.desde;
    delete filtros.hasta;
  }
  return filtros;
}
