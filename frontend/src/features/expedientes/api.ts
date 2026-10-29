import { z } from 'zod';
import { solicitar, enviarArchivo } from '../../lib/http';
export const tipoSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  obligatorio: z.boolean(),
  requiereVencimiento: z.boolean(),
});
export type TipoExpediente = z.infer<typeof tipoSchema>;
const documentoSchema = z.object({
  id: z.number(),
  idTipo: z.number(),
  version: z.number(),
  actual: z.boolean(),
  activo: z.boolean(),
  nombre: z.string(),
  tipo: z.string(),
  tamano: z.number(),
  hash: z.string(),
  vencimiento: z.string().nullable(),
  creado: z.string(),
  motivoBaja: z.string().nullable(),
  bajaEn: z.string().nullable(),
  estado: z.string(),
});
export type DocumentoExpediente = z.infer<typeof documentoSchema>;
const listadoSchema = z.object({
  maxMb: z.number(),
  avisoDias: z.number(),
  hoy: z.string(),
  tipos: z.array(tipoSchema),
  completos: z.number(),
  requeridos: z.number(),
  actuales: z.array(documentoSchema),
  historial: z.object({
    registros: z.array(documentoSchema),
    total: z.number(),
    pagina: z.number(),
    limite: z.number(),
  }),
});
export const listar = (id: number, pagina = 1, tipo?: number, signal?: AbortSignal) =>
  solicitar(
    `/expedientes/empleados/${id}?pagina=${pagina}${tipo ? `&tipo=${tipo}` : ''}`,
    listadoSchema,
    { signal },
  );
export const propio = (signal?: AbortSignal) =>
  solicitar('/expedientes/mio', z.object({ id: z.number() }), { signal });
export const cargar = (
  id: number,
  tipo: number,
  anterior: number | undefined,
  vencimiento: string,
  file: File,
  progreso: (n: number) => void,
) => {
  const q = new URLSearchParams({ tipo: String(tipo) });
  if (anterior) q.set('anterior', String(anterior));
  if (vencimiento) q.set('vencimiento', vencimiento);
  return enviarArchivo(
    `/expedientes/empleados/${id}?${q}`,
    file,
    z.object({ id: z.number(), version: z.number() }),
    progreso,
  );
};
export const baja = (id: number, motivo: string) =>
  solicitar(`/expedientes/documentos/${id}/baja`, z.object({ id: z.number() }), {
    method: 'POST',
    body: { motivo, confirmado: true },
  });
export const configurarTipo = (t: TipoExpediente, motivo: string) =>
  solicitar(`/expedientes/tipos/${t.id}`, z.object({ id: z.number() }), {
    method: 'PATCH',
    body: {
      obligatorio: t.obligatorio,
      requiereVencimiento: t.requiereVencimiento,
      motivo,
      confirmado: true,
    },
  });
const archivoSchema = z.object({ nombre: z.string(), tipo: z.string(), base64: z.string() });
export type ArchivoExpediente = z.infer<typeof archivoSchema>;
export const archivo = (id: number, vista = false) =>
  solicitar(`/expedientes/documentos/${id}${vista ? '?vista=1' : ''}`, archivoSchema, {
    archivo: true,
    timeoutMs: 60000,
  });
export function blobDe(a: ArchivoExpediente) {
  return new Blob([Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0))], { type: a.tipo });
}
export function guardarArchivo(a: ArchivoExpediente) {
  const url = URL.createObjectURL(blobDe(a)),
    link = document.createElement('a');
  link.href = url;
  link.download = a.nombre;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
