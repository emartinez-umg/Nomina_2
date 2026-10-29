import { z } from 'zod';
import { solicitar } from '../../../lib/http';
export const saldoGeneralSchema = z.object({
  id: z.number(),
  codigo: z.string(),
  nombre: z.string(),
  departamento: z.string(),
  centro: z.string().nullable(),
  jefatura: z.string().nullable(),
  ingreso: z.string(),
  activo: z.boolean(),
  corte: z.string(),
  mesesCompletos: z.number(),
  acumulado: z.string(),
  tomados: z.string(),
  previas: z.string(),
  disponible: z.string(),
  solicitables: z.number(),
  alerta: z.boolean(),
});
export type SaldoGeneral = z.infer<typeof saldoGeneralSchema>;
export const saldosSchema = z.object({
  registros: z.array(saldoGeneralSchema),
  total: z.number(),
  pagina: z.number(),
  limite: z.number(),
  corte: z.string(),
  umbral: z.string(),
  idParametro: z.number(),
  etiquetaAlerta: z.string(),
  indicadores: z.object({
    empleadosAlerta: z.number(),
    promedioDisponible: z.string(),
    totalAcumulado: z.string(),
  }),
});
const query = (q: Record<string, string>) =>
  new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '')).toString();
export const listarSaldos = (q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(`/vacaciones/saldos?${query(q)}`, saldosSchema, { signal });
export const exportarSaldos = (q: Record<string, string>, formato: 'csv' | 'excel') =>
  solicitar(
    `/vacaciones/saldos/exportar/${formato}?${query(q)}`,
    z.object({ nombre: z.string(), tipo: z.string(), base64: z.string() }),
    { timeoutMs: 120000 },
  );
