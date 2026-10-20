import { z } from 'zod';
import { solicitar } from '../../../lib/http';

const actualizado = { actualizadoEn: z.string() };
export const agrupacionSchema = z.enum(['empleado', 'departamento']);
export const metricaSchema = z.enum(['salarioBase', 'comisiones', 'horasExtra', 'totalDevengado']);
export const periodoSchema = z.enum(['mes', 'trimestre', 'anio']);
export type Agrupacion = z.infer<typeof agrupacionSchema>;
export type Metrica = z.infer<typeof metricaSchema>;
export type Periodo = z.infer<typeof periodoSchema>;
export const remuneracionesSchema = z.object({
  ...actualizado,
  mes: z.string(),
  agrupar: agrupacionSchema,
  metrica: metricaSchema,
  moneda: z.literal('GTQ'),
  fuente: z.literal('PAGOS_CONFIRMADOS'),
  registros: z.array(
    z.object({
      id: z.number(),
      nombre: z.string(),
      posicion: z.number(),
      valor: z.string(),
      salarioBase: z.string(),
      comisiones: z.string(),
      horasExtra: z.string(),
      totalDevengado: z.string(),
    }),
  ),
});
const categoria = z.object({
  categoria: z.enum([
    'IGSS_JUSTIFICADA',
    'JUSTIFICADA_CON_GOCE',
    'JUSTIFICADA_SIN_GOCE',
    'SIN_JUSTIFICAR',
  ]),
  nombre: z.string(),
  color: z.string(),
  dias: z.string(),
});
export const inasistenciasSchema = z.object({
  ...actualizado,
  inicio: z.string(),
  fin: z.string(),
  periodo: periodoSchema,
  agrupar: agrupacionSchema,
  unidad: z.literal('DIAS'),
  totalDias: z.string(),
  categorias: z.array(categoria),
  registros: z.array(
    z.object({
      id: z.number(),
      nombre: z.string(),
      posicion: z.number(),
      totalDias: z.string(),
      categorias: z.array(categoria),
    }),
  ),
});
const vacacion = z.object({
  id: z.number(),
  idEmpleado: z.number(),
  codigo: z.string(),
  nombre: z.string(),
  inicio: z.string(),
  fin: z.string(),
  diasLaborales: z.string(),
});
export const vacacionesSchema = z.object({
  ...actualizado,
  hoy: z.string(),
  dias: z.number(),
  pagina: z.number(),
  limite: z.number(),
  totalEnCurso: z.number(),
  totalProximas: z.number(),
  ausentesHoy: z.number(),
  enCurso: z.array(vacacion),
  proximas: z.array(vacacion),
});
const celebracion = z.object({
  idEmpleado: z.number(),
  codigo: z.string(),
  nombre: z.string(),
  fecha: z.string(),
  esHoy: z.boolean(),
});
export const celebracionesSchema = z.object({
  ...actualizado,
  hoy: z.string(),
  dias: z.number(),
  cumpleanos: z.array(celebracion),
  aniversarios: z.array(celebracion.extend({ anios: z.number() })),
});
export type Categoria = z.infer<typeof categoria>['categoria'];
export const remuneraciones = (
  q: { agrupar: Agrupacion; metrica: Metrica; mes: string },
  signal?: AbortSignal,
) =>
  solicitar(`/tableros/rh/remuneraciones?${new URLSearchParams(q)}`, remuneracionesSchema, {
    signal,
  });
export const inasistencias = (
  q: { agrupar: Agrupacion; periodo: Periodo; fecha: string },
  signal?: AbortSignal,
) =>
  solicitar(`/tableros/rh/inasistencias?${new URLSearchParams(q)}`, inasistenciasSchema, {
    signal,
  });
export const vacaciones = (dias: number, pagina: number, signal?: AbortSignal) =>
  solicitar(`/tableros/rh/vacaciones?dias=${dias}&pagina=${pagina}&limite=5`, vacacionesSchema, {
    signal,
  });
export const celebraciones = (signal?: AbortSignal) =>
  solicitar('/tableros/rh/celebraciones', celebracionesSchema, { signal });
