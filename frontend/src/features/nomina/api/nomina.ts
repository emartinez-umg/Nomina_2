import { z } from 'zod';
import { solicitar } from '../../../lib/http';
const totales = z.object({
  ingresos: z.string(),
  descuentos: z.string(),
  neto: z.string(),
  patronal: z.string(),
});
const fila = z.object({
  id: z.number(),
  idEmpleado: z.number(),
  empleado: z.string(),
  departamento: z.string(),
  inicio: z.string(),
  fin: z.string(),
  estado: z.string(),
  version: z.number(),
  ingresos: z.string(),
  descuentos: z.string(),
  neto: z.string(),
  patronal: z.string(),
  alertas: z.string().nullable(),
});
export type Fila = z.infer<typeof fila>;
const periodo = z.object({
  id: z.number(),
  inicio: z.string(),
  fin: z.string(),
  estado: z.enum(['ABIERTO', 'CALCULADO', 'REVISADO', 'APROBADO', 'CERRADO']),
  version: z.number(),
  empleados: z.number(),
  alertas: z.union([z.string(), z.array(z.string())]),
});
export type Periodo = z.infer<typeof periodo>;
const listado = z.object({
  registros: z.array(fila),
  total: z.number(),
  pagina: z.number(),
  limite: z.number(),
  totales,
});
const linea = z.object({
  descripcion: z.string(),
  monto: z.string(),
  base: z.string(),
  cantidad: z.string(),
  tasa: z.string().nullable(),
  concepto: z.object({
    codigo: z.string(),
    naturaleza: z.string(),
    igss: z.number(),
    isr: z.number(),
    prestaciones: z.number(),
  }),
});
const detalleSchema = z.object({
  id: z.number(),
  inicio: z.string(),
  fin: z.string(),
  estado: z.string(),
  version: z.number(),
  empleado: z.string(),
  resultado: totales.extend({
    dias: z.string(),
    salario: z.string(),
    baseIgss: z.string(),
    lineas: z.array(linea),
    alertas: z.array(z.string()),
    isr: z.object({
      renta: z.string(),
      imponible: z.string(),
      personal: z.string(),
      acreditadas: z.string(),
      igss: z.string(),
      anual: z.string(),
      retenido: z.string(),
      restantes: z.number(),
      retencion: z.string(),
      exceso: z.string(),
      futuro: z.string(),
    }),
  }),
});
export type Detalle = z.infer<typeof detalleSchema>;
export function query(q: Record<string, string>) {
  return new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
}
export const periodos = (q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(
    `/nomina/periodos?${query(q)}`,
    z.object({
      registros: z.array(periodo),
      total: z.number(),
      pagina: z.number(),
      limite: z.number(),
    }),
    { signal },
  );
export const obtenerPeriodo = (id: number, signal?: AbortSignal) =>
  solicitar(`/nomina/periodos/${id}`, periodo, { signal });
export const crear = (fecha: string) =>
  solicitar('/nomina/periodos', z.object({ id: z.number() }), { method: 'POST', body: { fecha } });
export const accion = (id: number, version: number, accion: string, motivo: string) =>
  solicitar(
    `/nomina/periodos/${id}/${accion}`,
    z.object({
      id: z.number(),
      estado: z.string(),
      version: z.number(),
      alertas: z.array(z.string()),
    }),
    { method: 'POST', body: { version, confirmado: true, motivo }, timeoutMs: 120000 },
  );
export const listar = (
  q: Record<string, string>,
  propio: boolean,
  id?: number,
  signal?: AbortSignal,
) =>
  solicitar(
    `/nomina/${propio ? 'boletas' : id ? `periodos/${id}/planilla` : 'historial'}?${query(q)}`,
    listado,
    { signal },
  );
export const detalle = (id: number, signal?: AbortSignal) =>
  solicitar(`/nomina/boletas/${id}`, detalleSchema, { signal });
const archivo = z.object({ nombre: z.string(), tipo: z.string(), base64: z.string() });
export const boleta = (id: number) =>
  solicitar(`/nomina/boletas/${id}/pdf`, archivo, { timeoutMs: 120000 });
export const exportar = (q: Record<string, string>, formato: string, id?: number) =>
  solicitar(`/nomina/${id ? `periodos/${id}/` : ''}exportar/${formato}?${query(q)}`, archivo, {
    timeoutMs: 120000,
  });
export const igss = (anio: string, mes: string) =>
  solicitar(`/nomina/igss/exportar?${query({ anio, mes })}`, archivo, { timeoutMs: 120000 });
export function descargar(d: z.infer<typeof archivo>, preview = false) {
  const bytes = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0)),
    url = URL.createObjectURL(new Blob([bytes], { type: d.tipo }));
  if (preview) window.open(url, '_blank', 'noopener');
  else {
    const a = document.createElement('a');
    a.href = url;
    a.download = d.nombre;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export const alertasDe = (p: Periodo) =>
  typeof p.alertas === 'string' ? (JSON.parse(p.alertas) as string[]) : p.alertas;
export const tipos = () =>
  solicitar(
    '/nomina/isr/tipos',
    z.array(z.object({ id: z.number(), codigo: z.string(), nombre: z.string() })),
  );
export const fiscal = (id: string, anio: string) =>
  solicitar(
    `/nomina/isr/empleados/${id}?anio=${anio}`,
    z.object({
      aperturas: z.array(
        z.object({
          fecha: z.string(),
          renta: z.string(),
          igss: z.string(),
          isr: z.string(),
          motivo: z.string(),
        }),
      ),
      deducciones: z.array(
        z.object({
          tipo: z.string(),
          fecha: z.string(),
          monto: z.string(),
          referencia: z.string(),
        }),
      ),
    }),
  );
export const guardarFiscal = (tipo: string, body: unknown) =>
  solicitar(`/nomina/isr/${tipo}`, z.object({ guardado: z.boolean() }), { method: 'POST', body });
export const formato = () =>
  solicitar(
    '/nomina/igss/formato',
    z.object({
      empresa: z.object({ id: z.number(), nombre: z.string(), nit: z.string() }).nullable(),
      formato: z.record(z.unknown()).nullable(),
      centros: z.array(
        z.object({ id: z.number(), nombre: z.string(), direccion: z.string().nullable() }),
      ),
    }),
  );
export const guardarFormato = (body: unknown) =>
  solicitar('/nomina/igss/formato', z.object({ guardado: z.boolean() }), { method: 'POST', body });
