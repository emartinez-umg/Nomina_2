import { z } from 'zod';
import { idSchema } from '../auditoria/auditoria.schemas.js';

const buscar = z.string().trim().max(120).default('');
export const departamentosQuery = z.object({ buscar }).strict();
export const municipiosQuery = z.object({ buscar, idDepartamentoGt: idSchema.optional() }).strict();

export const zonaSchema = z.number().int().min(1).max(25).nullable();
export function zonaValida(codigoMunicipio: string, zona: number | null) {
  return zonaSchema.safeParse(zona).success && (codigoMunicipio !== '0101' || zona !== null);
}
