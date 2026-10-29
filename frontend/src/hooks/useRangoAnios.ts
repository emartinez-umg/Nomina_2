import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { solicitar } from '../lib/http';
import { hoyGuatemala } from '../lib/validadores';
import { useSession } from '../app/session';
import type { FuenteAnios } from '../../../backend/src/shared/presentacion/calendario';
export type { FuenteAnios };
const rangoSchema = z.object({
  anioActual: z.number().int(),
  anioMin: z.number().int(),
  anioMax: z.number().int(),
  anios: z.array(z.number().int()),
});
export function useRangoAnios(fuente: FuenteAnios) {
  const { usuario } = useSession();
  const consulta = useQuery({
    queryKey: ['rango-anios', usuario?.idUsuario, fuente],
    queryFn: ({ signal }) => solicitar(`/tableros/anios?fuente=${fuente}`, rangoSchema, { signal }),
    staleTime: 0,
  });
  const actual = Number(hoyGuatemala().slice(0, 4));
  return {
    consulta,
    rango: consulta.data ?? {
      anioActual: actual,
      anioMin: actual,
      anioMax: actual,
      anios: [actual],
    },
  };
}
