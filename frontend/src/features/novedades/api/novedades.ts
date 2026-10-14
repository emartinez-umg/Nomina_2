import { z } from 'zod';
import { solicitar } from '../../../lib/http';
export const tipos = ['descuentos', 'prestamos', 'comisiones', 'horas-extra', 'ausencias'] as const;
export type Tipo = (typeof tipos)[number];
export const titulos: Record<Tipo, string> = {
  descuentos: 'Descuentos',
  prestamos: 'Préstamos y anticipos',
  comisiones: 'Comisiones',
  'horas-extra': 'Horas extra',
  ausencias: 'Ausencias, permisos e incapacidades',
};
export const calculoSchema = z.object({
  valorHora: z.string(),
  recargo: z.string(),
  monto: z.string(),
});
const cuotaSchema = z.object({
  id: z.number(),
  numero: z.number(),
  fecha: z.string(),
  monto: z.string(),
  pagado: z.string(),
  estado: z.string(),
});
const filaSchema = z.object({
  codigo: z.string().nullable(),
  id: z.number(),
  idEmpleado: z.number(),
  empleado: z.string(),
  activo: z.number(),
  bloqueada: z.number(),
  fechaInicio: z.string(),
  fechaFin: z.string().nullable(),
  estado: z.string(),
  motivo: z.string(),
  monto: z.string().nullable(),
  saldo: z.string().nullable(),
  montoQuincena: z.string().optional(),
  cuotas: z.number().nullable().optional(),
  idTipo: z.number().optional(),
  tipoNombre: z.string().optional(),
  modalidad: z.enum(['FIJO', 'CUOTAS', 'UNICO']).optional(),
  fecha: z.string().optional(),
  fechaDesembolso: z.string().optional(),
  referencia: z.string().optional(),
  idPeriodo: z.number().optional(),
  horas: z.string().optional(),
  jornada: z.string().nullable().optional(),
  efecto: z.string().optional(),
  dias: z.number().optional(),
  soporteNombre: z.string().nullable().optional(),
  soporteTipo: z.string().nullable().optional(),
  calculo: calculoSchema.nullable().optional(),
  advertencia: z.string().nullable().optional(),
  cuotasDetalle: z.array(cuotaSchema).optional(),
});
export type Fila = z.infer<typeof filaSchema>;
export const previewSchema = z.object({
  plan: z.array(
    z.object({ numero: z.number(), fecha: z.string(), monto: z.string(), saldo: z.string() }),
  ),
  calculo: calculoSchema.nullable(),
});
export type Preview = z.infer<typeof previewSchema>;
const qs = (q: Record<string, string>) =>
  new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '')).toString();
export const listar = (tipo: Tipo, q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(
    `/novedades/${tipo}?${qs(q)}`,
    z.object({
      registros: z.array(filaSchema),
      total: z.number(),
      pagina: z.number(),
      limite: z.number(),
    }),
    { signal },
  );
export const detalle = (tipo: Tipo, id: number, signal?: AbortSignal) =>
  solicitar(`/novedades/${tipo}/${id}`, filaSchema, { signal });
export const guardar = (tipo: Tipo, body: unknown, id?: number) =>
  solicitar(`/novedades/${tipo}${id ? `/${id}` : ''}`, filaSchema, {
    method: id ? 'PATCH' : 'POST',
    body,
    timeoutMs: 60000,
  });
export const previsualizar = (tipo: Tipo, body: unknown) =>
  solicitar(`/novedades/${tipo}/previsualizar`, previewSchema, { method: 'POST', body });
export const anular = (tipo: Tipo, id: number, motivo: string) =>
  solicitar(`/novedades/${tipo}/${id}/anular`, filaSchema, {
    method: 'POST',
    body: { motivo, confirmado: true },
  });
export const exportar = (tipo: Tipo, q: Record<string, string>) =>
  solicitar(`/novedades/${tipo}/exportar?${qs(q)}`, z.string(), { timeoutMs: 60000 });
export const reglas = (signal?: AbortSignal) =>
  solicitar('/novedades/reglas', z.object({ hoy: z.string() }), { signal });
export const opciones = (
  ref: string,
  buscar: string,
  pagina: number,
  seleccionado: string,
  signal?: AbortSignal,
) =>
  solicitar(
    `/novedades/opciones/${ref}?${qs({ buscar, pagina: String(pagina), seleccionado })}`,
    z.array(z.object({ value: z.string(), label: z.string() })),
    { signal },
  );
export const adjunto = (id: number) =>
  solicitar(
    `/novedades/ausencias/${id}/adjunto`,
    z.object({ nombre: z.string(), tipo: z.string(), base64: z.string() }),
  );
const rango = z.object({ inicio: z.string(), fin: z.string() });
const restriccionesSchema = z.object({
  empleado: z
    .object({
      nombre: z.string(),
      inicio: z.string(),
      fin: z.string().nullable(),
      estado: z.string(),
    })
    .optional(),
  rangos: z.array(rango),
  cierres: z.array(rango),
});
export type Restricciones = z.infer<typeof restriccionesSchema>;
export const restricciones = (id: string, excluir: string, signal?: AbortSignal) =>
  solicitar(`/novedades/restricciones/${id}?${qs({ excluir })}`, restriccionesSchema, { signal });
export async function leerAdjunto(f: File) {
  const buffer = new Uint8Array(await f.arrayBuffer());
  let texto = '';
  for (const byte of buffer) texto += String.fromCharCode(byte);
  return { nombre: f.name, tipo: f.type, base64: btoa(texto) };
}
export function descargarAdjunto(d: { nombre: string; tipo: string; base64: string }) {
  const b = Uint8Array.from(atob(d.base64), (v) => v.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([b], { type: d.tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = d.nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
