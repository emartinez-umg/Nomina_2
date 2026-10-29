import { z } from 'zod';
import { solicitar } from '../../lib/http';
export const permisoEquipoSchema = z.enum([
  'VER_EQUIPO',
  'VER_COMISIONES_EQUIPO',
  'VER_VACACIONES_EQUIPO',
]);
export type PermisoEquipo = z.infer<typeof permisoEquipoSchema>;
export const configuracionSchema = z.object({
  jefatura: z.string(),
  equipo: z.number(),
  revision: z.string(),
  permisos: z.array(
    z.object({
      codigo: permisoEquipoSchema,
      nombre: z.string(),
      descripcion: z.string(),
      activo: z.boolean(),
    }),
  ),
});
export const consultarPermisos = (id: number, signal?: AbortSignal) =>
  solicitar(`/equipo/jefaturas/${id}/permisos`, configuracionSchema, { signal });
export const guardarPermisos = (
  id: number,
  d: { permisos: PermisoEquipo[]; revision: string; motivo: string; confirmado: true },
) =>
  solicitar(`/equipo/jefaturas/${id}/permisos`, configuracionSchema, { method: 'PATCH', body: d });
export const resumenEquipo = (signal?: AbortSignal) =>
  solicitar(
    '/equipo/resumen',
    z.object({ total: z.number(), permisos: z.array(permisoEquipoSchema) }),
    { signal },
  );
export const personaEquipoSchema = z.object({
  id: z.number(),
  codigo: z.string(),
  nombre: z.string(),
  puesto: z.string(),
  departamento: z.string(),
  centro: z.string().nullable(),
});
export const listarEquipo = (q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(
    `/equipo/personas?${new URLSearchParams(q)}`,
    z.object({
      registros: z.array(personaEquipoSchema),
      total: z.number(),
      equipo: z.number(),
      pagina: z.number(),
      limite: z.number(),
    }),
    { signal },
  );
const opcion = z.object({ id: z.number(), nombre: z.string() });
export const opcionesEquipo = (vista: 'personas' | 'vacaciones', signal?: AbortSignal) =>
  solicitar(
    `/equipo/opciones?vista=${vista}`,
    z.object({
      departamentos: z.array(opcion),
      centros: z.array(opcion),
      jefaturas: z.array(opcion),
    }),
    { signal },
  );
