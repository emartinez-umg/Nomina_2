import { z } from 'zod';
import { solicitar } from '../../../lib/http';
const movimiento = z.object({
  id: z.number(),
  fecha: z.string(),
  tipo: z.string(),
  dias: z.string(),
  clave: z.string(),
  motivo: z.string(),
});
export const saldoSchema = z.object({
  idEmpleado: z.number(),
  empleado: z.string(),
  corte: z.string(),
  acumulado: z.string(),
  tomados: z.string(),
  previas: z.string(),
  solicitables: z.number().int(),
  mesesCompletos: z.number().int(),
  tasaMensual: z.string(),
  saldoInicial: z.string(),
  movimientos: z.string(),
  disponible: z.string(),
  kardex: z.array(movimiento),
});
export type Saldo = z.infer<typeof saldoSchema>;
const comparacion = z.object({
  dias: z.string(),
  disponible: z.string().nullable(),
  solicitables: z.number().int().nullable(),
  alcanza: z.boolean(),
  puedeAprobar: z.boolean(),
  bloqueo: z.string().nullable(),
});
export const filaSchema = comparacion.extend({
  codigo: z.string(),
  id: z.number(),
  idEmpleado: z.number(),
  empleado: z.string(),
  inicio: z.string(),
  fin: z.string(),
  diasRegistrados: z.string(),
  saldoAlSolicitar: z.string(),
  saldoAlResolver: z.string().nullable(),
  estado: z.string(),
  motivo: z.string().nullable(),
  saldo: saldoSchema.nullable(),
  puedeCancelar: z.boolean(),
  solicitadoPor: z.string().nullable(),
  solicitadoEn: z.string(),
  aprobadoPor: z.string().nullable(),
  aprobadoEn: z.string().nullable(),
  canceladoPor: z.string().nullable(),
  canceladoEn: z.string().nullable(),
  motivoCancelacion: z.string().nullable(),
});
export type Fila = z.infer<typeof filaSchema>;
const rango = z.object({ inicio: z.string(), fin: z.string() });
export const calendarioSchema = z.object({
  hoy: z.string(),
  bloqueos: z.array(rango),
  dias: z.array(
    z.object({
      fecha: z.string(),
      laborable: z.boolean(),
      motivo: z.string().nullable(),
      bloqueado: z.boolean(),
    }),
  ),
});
export type Calendario = z.infer<typeof calendarioSchema>;
const qs = (q: Record<string, string>) =>
  new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '')).toString();
export const saldo = (id?: string, signal?: AbortSignal) =>
  solicitar(id ? `/vacaciones/empleados/${id}/saldo` : '/vacaciones/mi-saldo', saldoSchema, {
    signal,
  });
export const calendario = (inicio: string, fin: string, signal?: AbortSignal) =>
  solicitar(`/vacaciones/mi-calendario?${qs({ inicio, fin })}`, calendarioSchema, { signal });
export const preview = (inicio: string, fin: string, signal?: AbortSignal) =>
  solicitar('/vacaciones/previsualizar', comparacion, {
    method: 'POST',
    body: { inicio, fin },
    signal,
  });
export const crear = (inicio: string, fin: string) =>
  solicitar('/vacaciones/solicitudes', z.object({ id: z.number() }), {
    method: 'POST',
    body: { inicio, fin },
  });
export const listar = (q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(
    `/vacaciones/solicitudes?${qs(q)}`,
    z.object({
      registros: z.array(filaSchema),
      total: z.number(),
      pagina: z.number(),
      limite: z.number(),
    }),
    { signal },
  );
export const resolver = (id: number, estado: string, motivo: string) =>
  solicitar(`/vacaciones/solicitudes/${id}/resolver`, z.object({ id: z.number() }), {
    method: 'POST',
    body: { estado, motivo, confirmado: true },
  });
export const detalle = (id: number, signal?: AbortSignal) =>
  solicitar(`/vacaciones/solicitudes/${id}`, filaSchema, { signal });
export const cancelar = (id: number, motivo: string) =>
  solicitar(`/vacaciones/solicitudes/${id}/cancelar`, z.object({ id: z.number() }), {
    method: 'POST',
    body: { motivo, confirmado: true },
  });
export const cargar = (id: string, body: unknown) =>
  solicitar(`/vacaciones/empleados/${id}/cargar`, saldoSchema, { method: 'POST', body });
export const exportar = (q: Record<string, string>) =>
  solicitar(`/vacaciones/exportar?${qs(q)}`, z.string());
export const notificacionesSchema = z.object({
  pendientes: z.number(),
  registros: z.array(
    z.object({
      id: z.number(),
      titulo: z.string(),
      mensaje: z.string(),
      clave: z.string(),
      leida: z.number(),
    }),
  ),
});
export const notificaciones = (signal?: AbortSignal) =>
  solicitar('/notificaciones', notificacionesSchema, { signal });
export const leer = (id: number) =>
  solicitar(`/notificaciones/${id}/leida`, z.object({ leida: z.boolean() }), {
    method: 'POST',
    body: {},
  });
export const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function rangoLibre(inicio: string, fin: string, c: Calendario) {
  return !c.bloqueos.some((b) => inicio <= b.fin && b.inicio <= fin);
}
