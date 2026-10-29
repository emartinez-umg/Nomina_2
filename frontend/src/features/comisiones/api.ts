import { z } from 'zod';
import { solicitar } from '../../lib/http';
export {
  comisionesQuerySchema,
  indiceMes,
  mesDeIndice,
} from '../../../../backend/src/shared/estadisticas/comisiones';
const punto = z.object({
  mes: z.string(),
  total: z.string(),
  mesAnterior: z.string().optional(),
  totalAnterior: z.string().optional(),
});
const indicadores = z.object({
  total: z.string(),
  promedioMensual: z.string(),
  mejorMes: punto.nullable(),
  totalAnterior: z.string().nullable(),
  variacionPorcentual: z.string().nullable(),
  sinBaseComparacion: z.boolean(),
});
const persona = z.object({
  idEmpleado: z.number(),
  codigo: z.string(),
  nombre: z.string(),
  puesto: z.string(),
  idDepartamento: z.number(),
  departamento: z.string(),
  centro: z.string().nullable(),
});
const meta = z.object({
  actualizadoEn: z.string(),
  moneda: z.literal('GTQ'),
  periodo: z.object({ desde: z.string(), hasta: z.string(), meses: z.number() }),
  periodoAnterior: z.object({ desde: z.string(), hasta: z.string() }).nullable(),
  alcance: z.object({ tipo: z.enum(['GENERAL', 'EQUIPO']), personas: z.number().nullable() }),
});
const paginacion = { total: z.number(), pagina: z.number(), limite: z.number() };
const fila = persona.merge(indicadores).extend({ participacionPorcentual: z.string() });
export const resumenSchema = meta.extend({
  indicadores: indicadores.extend({ vendedoresConComision: z.number() }),
});
export const tendenciaSchema = meta.extend({ registros: z.array(punto) });
export const rankingSchema = meta.extend({
  ...paginacion,
  totalComisiones: z.string(),
  registros: z.array(fila.extend({ posicion: z.number() })),
});
export const tablaSchema = meta.extend({
  ...paginacion,
  totalComisiones: z.string(),
  meses: z.array(z.string()),
  totalesMensuales: z.array(punto),
  registros: z.array(fila.extend({ serie: z.array(punto) })),
});
export const opcionesSchema = meta.extend({
  vendedores: z.array(persona),
  departamentos: z.array(z.object({ id: z.number(), nombre: z.string() })),
});
export const historialSchema = meta.extend({
  ...paginacion,
  vendedor: persona,
  indicadores: indicadores.extend({ peorMes: punto.nullable() }),
  promedioMensualEquipo: z.string(),
  vendedoresEquipo: z.number(),
  evolucion: z.array(punto.extend({ promedioEquipo: z.string() })),
  registros: z.array(
    z.object({
      id: z.number(),
      mes: z.string(),
      monto: z.string(),
      descripcion: z.string(),
      referencia: z.string().nullable(),
      estado: z.string(),
    }),
  ),
});
export type FiltrosComisiones = {
  desde: string;
  hasta: string;
  estado: string;
  comparar: string;
  idDepartamento?: string;
  vendedores?: string;
};
export type TablaComisiones = z.infer<typeof tablaSchema>;
export type RankingComisiones = z.infer<typeof rankingSchema>;
export type ResumenComisiones = z.infer<typeof resumenSchema>;
export type HistorialComisiones = z.infer<typeof historialSchema>;
export type PuntoComisiones = z.infer<typeof punto>;
const base = '/tableros/comisiones';
export function consultar<T>(
  ruta: string,
  schema: z.ZodType<T>,
  q: Record<string, string>,
  signal?: AbortSignal,
) {
  return solicitar(`${base}/${ruta}?${new URLSearchParams(q)}`, schema, { signal });
}
export const exportar = (q: FiltrosComisiones, formato: 'csv' | 'excel') =>
  solicitar(
    `${base}/exportar/${formato}?${new URLSearchParams(q)}`,
    z.object({ nombre: z.string(), tipo: z.string(), base64: z.string() }),
    { archivo: true, timeoutMs: 120000 },
  );
