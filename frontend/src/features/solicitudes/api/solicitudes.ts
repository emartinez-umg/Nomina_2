import { z } from 'zod';
import { solicitar } from '../../../lib/http';
export const nombresTipo: Record<string, string> = {
  CONSTANCIA_LABORAL: 'Constancia laboral',
  CERTIFICADO_IGSS: 'Certificado IGSS',
  CONSTANCIA_INTECAP: 'Constancia INTECAP',
  GAFETE: 'Gafete',
  PARQUEO: 'Parqueo',
  ACTUALIZACION_DATOS: 'Actualización de datos',
};
export const nombresEstado: Record<string, string> = {
  EN_PROCESO: 'En proceso',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  ENTREGADA: 'Entregada',
};
export const criticosSchema = z.object({
  nombres: z.string(),
  apellidos: z.string(),
  dpi: z.string(),
  nit: z.string(),
  estadoCivil: z.string(),
});
export const contactoSchema = z.object({
  telefono: z.string(),
  direccion: z.string(),
  correo: z.string(),
  contactoNombre: z.string(),
  contactoParentesco: z.string(),
  contactoTelefono: z.string(),
});
export const datosSchema = z.object({ criticos: criticosSchema, contacto: contactoSchema });
export type MisDatos = z.infer<typeof datosSchema>;
const fila = z.object({
  codigo: z.string(),
  id: z.number(),
  idEmpleado: z.number(),
  empleado: z.string(),
  tipo: z.string(),
  nombreTipo: z.string(),
  generaPdf: z.number(),
  estado: z.string(),
  fecha: z.string(),
  observaciones: z.string().nullable(),
  motivo: z.string().nullable(),
  documento: z.number().nullable(),
});
export type Fila = z.infer<typeof fila>;
export const detalleSchema = fila.extend({
  requiereReemision: z.boolean().optional(),
  datos: z.object({ anterior: criticosSchema, nuevo: criticosSchema }).nullable(),
  historial: z.array(
    z.object({
      id: z.number(),
      anterior: z.string().nullable(),
      estado: z.string(),
      fecha: z.string(),
      motivo: z.string().nullable(),
      actor: z.string(),
    }),
  ),
});
export type Detalle = z.infer<typeof detalleSchema>;
const qs = (q: Record<string, string>) =>
  new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '')).toString();
export const listar = (q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(
    `/solicitudes?${qs(q)}`,
    z.object({
      registros: z.array(fila),
      total: z.number(),
      pagina: z.number(),
      limite: z.number(),
    }),
    { signal },
  );
export const detalle = (id: number, signal?: AbortSignal) =>
  solicitar(`/solicitudes/${id}`, detalleSchema, { signal });
export const crear = (body: unknown) =>
  solicitar('/solicitudes', z.object({ id: z.number() }), { method: 'POST', body });
export const resolver = (id: number, body: unknown) =>
  solicitar(`/solicitudes/${id}/resolver`, z.object({ id: z.number() }), { method: 'POST', body });
export const entregar = (id: number, sha256?: string) =>
  solicitar(`/solicitudes/${id}/entregar`, z.object({ id: z.number() }), {
    method: 'POST',
    body: { confirmado: true, ...(sha256 ? { sha256 } : {}) },
  });
export const documento = (id: number) =>
  solicitar(
    `/solicitudes/${id}/documento`,
    z.object({
      nombre: z.string(),
      mime: z.literal('application/pdf'),
      base64: z.string(),
      sha256: z.string(),
    }),
  );
export type Documento = Awaited<ReturnType<typeof documento>>;
export const misDatos = (signal?: AbortSignal) =>
  solicitar('/solicitudes/mis-datos', datosSchema, { signal });
export const contacto = (body: unknown) =>
  solicitar('/solicitudes/mis-datos/contacto', z.object({ actualizado: z.boolean() }), {
    method: 'PATCH',
    body,
  });
const plantillaSchema = z.object({
  id: z.number(),
  tipo: z.string(),
  nombre: z.string(),
  version: z.number(),
  contenido: z.string(),
});
export type Plantilla = z.infer<typeof plantillaSchema>;
export const plantillas = (signal?: AbortSignal) =>
  solicitar(
    '/solicitudes/plantillas',
    z.object({ registros: z.array(plantillaSchema), variables: z.array(z.string()) }),
    { signal },
  );
export const guardarPlantilla = (tipo: string, body: unknown) =>
  solicitar(`/solicitudes/plantillas/${tipo}`, z.object({ actualizado: z.boolean() }), {
    method: 'PATCH',
    body,
  });
export const exportar = (q: Record<string, string>) =>
  solicitar(`/solicitudes/exportar?${qs(q)}`, z.string());

export const reemitir = (id: number) =>
  solicitar(`/solicitudes/${id}/reemitir`, z.object({ id: z.number() }), {
    method: 'POST',
    body: { confirmado: true },
  });
