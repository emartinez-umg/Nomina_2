import { z } from 'zod';
import { solicitar } from '../../../lib/http';
import { query } from '../../nomina/api/nomina';
export const componente = z.object({
  concepto: z.string(),
  inicio: z.string(),
  fin: z.string(),
  promedio: z.string(),
  meses: z.string(),
  tiempo: z.string(),
  monto: z.string(),
  exento: z.string(),
  gravado: z.string(),
});
export type Componente = z.infer<typeof componente>;
export const vista = z.object({
  idEmpleado: z.number(),
  empleado: z.string(),
  inicio: z.string(),
  fin: z.string(),
  componentes: z.array(componente),
  total: z.string(),
  exento: z.string(),
  gravado: z.string(),
  hash: z.string(),
  error: z.string().optional(),
});
export type Vista = z.infer<typeof vista>;
const registro = z.object({
  id: z.number(),
  idEmpleado: z.number(),
  empleado: z.string(),
  tipo: z.string(),
  inicio: z.string(),
  fin: z.string(),
  promedio: z.string(),
  total: z.string(),
  estado: z.string(),
  hash: z.string().nullable(),
  fechaPago: z.string().nullable(),
  referencia: z.string().nullable(),
  motivo: z.string(),
});
export type Registro = z.infer<typeof registro>;
export const archivo = z.object({ nombre: z.string(), tipo: z.string(), base64: z.string() });
export const listar = (q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(
    `/prestaciones?${query(q)}`,
    z.object({
      registros: z.array(registro),
      total: z.number(),
      pagina: z.number(),
      limite: z.number(),
    }),
    { signal },
  );
export const detalle = (id: number, signal?: AbortSignal) =>
  solicitar(`/prestaciones/${id}`, registro.extend({ snapshot: vista.nullable() }), { signal });
export const previsualizar = (body: unknown) =>
  solicitar(
    '/prestaciones/previsualizar',
    z.object({
      filas: z.array(vista),
      hash: z.string(),
      limitePago: z.string(),
      total: z.string(),
    }),
    { method: 'POST', body, timeoutMs: 120000 },
  );
export const calcular = (body: unknown) =>
  solicitar('/prestaciones/calcular', z.object({ ids: z.array(z.number()) }), {
    method: 'POST',
    body,
    timeoutMs: 120000,
  });
export const simular = (body: unknown) =>
  solicitar('/prestaciones/simular', vista, { method: 'POST', body, timeoutMs: 120000 });
export const liquidar = (body: unknown) =>
  solicitar('/prestaciones/liquidar', z.object({ id: z.number() }), {
    method: 'POST',
    body,
    timeoutMs: 120000,
  });
export const accion = (id: number, op: string, body: unknown) =>
  solicitar(`/prestaciones/${id}/${op}`, z.object({ id: z.number(), estado: z.string() }), {
    method: 'POST',
    body,
    timeoutMs: 120000,
  });
export const pdf = (id: number) =>
  solicitar(`/prestaciones/${id}/pdf`, archivo, { timeoutMs: 120000 });
export const constancia = (q: Record<string, string>) =>
  solicitar(`/prestaciones/constancia?${query(q)}`, archivo, { timeoutMs: 120000 });
export const exportar = (q: Record<string, string>) =>
  solicitar(`/prestaciones/exportar?${query(q)}`, archivo, { timeoutMs: 120000 });
