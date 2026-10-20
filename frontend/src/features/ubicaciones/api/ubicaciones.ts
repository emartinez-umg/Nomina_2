import { z } from 'zod';
import { solicitar } from '../../../lib/http';

const departamentoSchema = z.object({ id: z.number(), codigo: z.string(), nombre: z.string() });
const municipioSchema = departamentoSchema.extend({
  idDepartamentoGt: z.number(),
  departamento: z.string(),
});
export type MunicipioGt = z.infer<typeof municipioSchema>;
export const departamentosGt = (signal?: AbortSignal) =>
  solicitar('/ubicaciones/departamentos', z.array(departamentoSchema), { signal });
export const municipiosGt = (idDepartamentoGt?: string, signal?: AbortSignal) =>
  solicitar(
    `/ubicaciones/municipios${idDepartamentoGt ? `?${new URLSearchParams({ idDepartamentoGt })}` : ''}`,
    z.array(municipioSchema),
    { signal },
  );
