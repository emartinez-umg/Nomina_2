import { z } from 'zod';
import { solicitar } from '../../../lib/http';
export const campoSchema = z.object({
  nombre: z.string(),
  etiqueta: z.string(),
  tipo: z.enum([
    'texto',
    'codigo',
    'area',
    'dinero',
    'decimal',
    'entero',
    'fecha',
    'opcion',
    'referencia',
    'booleano',
  ]),
  hint: z.string(),
  requerido: z.boolean().optional(),
  max: z.number().optional(),
  decimales: z.number().optional(),
  opciones: z.array(z.string()).optional(),
  referencia: z.enum(['departamentos', 'empleados']).optional(),
});
export const catalogoSchema = z.object({
  slug: z.string(),
  titulo: z.string(),
  campos: z.array(campoSchema),
  legal: z.boolean(),
});
export type Campo = z.infer<typeof campoSchema>;
export type Catalogo = z.infer<typeof catalogoSchema>;
export const diaSchema = z.object({
  diaSemana: z.number(),
  laborable: z.boolean(),
  entrada: z.string().nullable(),
  salida: z.string().nullable(),
  cruzaMedianoche: z.boolean(),
  minutosDescanso: z.number(),
});
export type Dia = z.infer<typeof diaSchema>;
export const filaSchema = z
  .object({ id: z.number(), activo: z.boolean(), enUso: z.boolean() })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(diaSchema)]));
export type Fila = z.infer<typeof filaSchema>;
const listadoSchema = z.object({
  registros: z.array(filaSchema),
  total: z.number(),
  pagina: z.number(),
  limite: z.number(),
});
export type Listado = z.infer<typeof listadoSchema>;
export const definiciones = (signal?: AbortSignal) =>
  solicitar('/catalogos', z.array(catalogoSchema), { signal });
export const restricciones = (signal?: AbortSignal) =>
  solicitar('/catalogos/restricciones', z.object({ ultimoCierre: z.string().nullable() }), {
    signal,
  });
export const listar = (slug: string, q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(`/catalogos/${slug}?${new URLSearchParams(q)}`, listadoSchema, { signal });
export const detalle = (slug: string, id: number) =>
  solicitar(`/catalogos/${slug}/${id}`, filaSchema);
export const guardar = (slug: string, body: unknown, id?: number) =>
  solicitar(`/catalogos/${slug}${id ? `/${id}` : ''}`, filaSchema, {
    method: id ? 'PATCH' : 'POST',
    body,
  });
export const estado = (slug: string, id: number, body: unknown) =>
  solicitar(`/catalogos/${slug}/${id}/estado`, filaSchema, { method: 'PATCH', body });
export const eliminar = (slug: string, id: number, body: unknown) =>
  solicitar(`/catalogos/${slug}/${id}`, z.object({ id: z.number() }), { method: 'DELETE', body });
const opcionesSchema = z.array(z.object({ value: z.string(), label: z.string() }));
export const opciones = (ref: string, buscar: string, pagina: number, signal?: AbortSignal) =>
  solicitar(
    `/catalogos/opciones/${ref}?${new URLSearchParams({ buscar, pagina: String(pagina) })}`,
    opcionesSchema,
    { signal },
  );
export function csv(cat: Catalogo, filas: Fila[]) {
  const celda = (v: unknown) =>
    `"${String(v ?? '')
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replace(/"/g, '""')}"`;
  return (
    '\uFEFF' +
    [
      ['ID', ...cat.campos.map((f) => f.etiqueta), 'Estado'],
      ...filas.map((r) => [
        r.id,
        ...cat.campos.map((f) => r[f.nombre]),
        r.activo ? 'Activo' : 'Inactivo',
      ]),
    ]
      .map((r) => r.map(celda).join(','))
      .join('\r\n')
  );
}
