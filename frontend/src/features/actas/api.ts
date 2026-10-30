import { z } from 'zod';
import { solicitar, enviarArchivo } from '../../lib/http';
import { actaSchema } from '../../../../backend/src/shared/actas/modelo';
import type { DatosActa, AccionActa } from '../../../../backend/src/shared/actas/modelo';
const fila = z.object({
  id: z.number(),
  codigo: z.string(),
  idEmpleado: z.number(),
  empleado: z.string(),
  departamento: z.string(),
  tipo: z.string(),
  estado: z.string(),
  fechaHecho: z.string(),
});
export const listadoSchema = z.object({
  registros: z.array(fila),
  pagina: z.number(),
  limite: z.number(),
  total: z.number(),
});
export type FilaActa = z.infer<typeof fila>;
const adjunto = z.object({
  id: z.number(),
  clase: z.string(),
  nombre: z.string(),
  tipo: z.string(),
  tamano: z.number(),
  hash: z.string(),
});
export const detalleSchema = actaSchema.extend({
  id: z.number(),
  idDepartamento: z.number(),
  codigo: z.string(),
  estado: z.string(),
  version: z.number(),
  empleado: z.string(),
  departamento: z.string(),
  tipo: z.string(),
  gravedad: z.string(),
  suspension: z.number(),
  emisorNombre: z.string().nullable(),
  emisorCargo: z.string().nullable(),
  emitidaEn: z.string().nullable(),
  motivoAnulacion: z.string().nullable(),
  idAusencia: z.number().nullable(),
  adjuntos: z.array(adjunto),
  historial: z.array(
    z.object({
      id: z.number(),
      anterior: z.string().nullable(),
      estado: z.string(),
      motivo: z.string().nullable(),
      testigos: z.string().nullable(),
      actor: z.string(),
      fecha: z.string(),
    }),
  ),
});
export type Acta = z.infer<typeof detalleSchema>;
export const reglasSchema = z.object({
  hoy: z.string(),
  maxDias: z.number(),
  maxMb: z.number(),
  codigo: z.string(),
  tipos: z.array(
    z.object({
      id: z.number(),
      nombre: z.string(),
      gravedad: z.string(),
      suspension: z.number(),
      activo: z.number().optional(),
    }),
  ),
});
export type ReglasActas = z.infer<typeof reglasSchema>;
const resultado = z.object({ id: z.number() });
export const listar = (q: URLSearchParams, signal?: AbortSignal) =>
  solicitar(`/actas?${q}`, listadoSchema, { signal });
export const detalle = (id: number, signal?: AbortSignal) =>
  solicitar(`/actas/${id}`, detalleSchema, { signal });
export const reglas = (signal?: AbortSignal) =>
  solicitar('/actas/reglas', reglasSchema, { signal });
export const antecedentes = (id: number, pagina: number, signal?: AbortSignal) =>
  solicitar(
    `/actas/antecedentes/${id}?pagina=${pagina}`,
    listadoSchema.extend({ ingreso: z.string() }),
    { signal },
  );
export const guardar = (d: DatosActa, id?: number) =>
  solicitar(`/actas${id ? `/${id}` : ''}`, resultado, { method: id ? 'PATCH' : 'POST', body: d });
export const accion = (id: number, d: AccionActa) =>
  solicitar(`/actas/${id}/estado`, resultado, { method: 'POST', body: d });
export const cargar = (
  id: number,
  version: number,
  clase: 'EVIDENCIA' | 'FIRMA',
  f: File,
  progreso: (v: number) => void,
) =>
  enviarArchivo(
    `/actas/${id}/adjuntos?${new URLSearchParams({ clase, version: String(version), confirmado: '1' })}`,
    f,
    resultado,
    progreso,
  );
const archivoSchema = z.object({ nombre: z.string(), tipo: z.string(), base64: z.string() });
export type ArchivoActa = z.infer<typeof archivoSchema>;
export const archivo = (id: number, adjunto = false, vista = false) =>
  solicitar(
    `/actas/${adjunto ? 'adjuntos/' : ''}${id}${adjunto ? '' : '/pdf'}${vista ? '?vista=1' : ''}`,
    archivoSchema,
    { archivo: true, timeoutMs: 60000 },
  );
export const exportar = (q: URLSearchParams) =>
  solicitar(`/actas/exportar?${q}`, archivoSchema, { archivo: true });
export const plantillaSchema = z.object({
  id: z.number(),
  version: z.number(),
  nombre: z.string(),
  contenido: z.string(),
  variables: z.array(z.string()),
});
export const plantilla = (signal?: AbortSignal) =>
  solicitar('/actas/plantilla', plantillaSchema, { signal });
export const guardarPlantilla = (d: unknown) =>
  solicitar('/actas/plantilla', resultado, { method: 'PATCH', body: d });
