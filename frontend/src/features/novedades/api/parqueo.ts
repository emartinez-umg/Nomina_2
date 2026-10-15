import { z } from 'zod';
import { solicitar } from '../../../lib/http';
export const tarifa = z.object({
  id: z.number(),
  vehiculo: z.string(),
  monto: z.string(),
  desde: z.string(),
  hasta: z.string().nullable(),
});
export const tarifas = (signal?: AbortSignal) =>
  solicitar('/novedades/parqueo/tarifas', z.array(tarifa), { signal });
export const guardarTarifa = (body: unknown) =>
  solicitar('/novedades/parqueo/tarifas', z.array(tarifa), { method: 'POST', body });
export const suscripcion = z.object({
  id: z.number(),
  idEmpleado: z.number(),
  empleado: z.string(),
  vehiculo: z.string().nullable(),
  placa: z.string().nullable(),
  inicio: z.string(),
  fin: z.string().nullable(),
  estado: z.string(),
  bajaSolicitada: z.number(),
  montoAnterior: z.string().nullable(),
  idPago: z.number().nullable(),
  estadoAplicacion: z.string(),
  tarifa: z.string().nullable(),
  bloqueada: z.number(),
  gestionBloqueada: z.number(),
  completarBloqueado: z.number(),
});
export type Suscripcion = z.infer<typeof suscripcion>;
export const listarParqueo = (q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(
    `/novedades/parqueo?${new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString()}`,
    z.object({
      registros: z.array(suscripcion),
      total: z.number(),
      pagina: z.number(),
      limite: z.number(),
    }),
    { signal },
  );
export const cambiarParqueo = (id: number, body: unknown) =>
  solicitar(`/novedades/parqueo/${id}/cambiar`, suscripcion, { method: 'POST', body });
const novedad = z.object({
  advertencia: z.string().nullable().optional(),
  id: z.number().nullable(),
  idEmpleado: z.number(),
  tipo: z.string(),
  mes: z.string(),
  cantidad: z.string(),
  monto: z.string().nullable(),
  autorizacion: z.string(),
  idSuscripcion: z.number().nullable(),
  descripcion: z.string(),
});
const resumen = z.object({
  id: z.number(),
  empleado: z.string(),
  idDepartamento: z.number(),
  departamento: z.string(),
  novedades: z.array(novedad),
  pendientes: z.number(),
  retroactivas: z.number(),
  alertas: z.number(),
});
export const pendientes = (q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(
    `/novedades/pendientes?${new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString()}`,
    z.object({
      registros: z.array(resumen),
      total: z.number(),
      pagina: z.number(),
      limite: z.number(),
      departamentos: z.array(
        z.object({
          departamento: z.string(),
          empleados: z.number(),
          pendientes: z.number(),
          alertas: z.number(),
        }),
      ),
    }),
    { signal },
  );
export type Resumen = z.infer<typeof resumen>;

export const exportarParqueo = (q: Record<string, string>) =>
  solicitar(
    `/novedades/parqueo/exportar?${new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString()}`,
    z.string(),
  );

export const exportarPendientes = (q: Record<string, string>) =>
  solicitar(
    `/novedades/pendientes/exportar?${new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString()}`,
    z.string(),
  );
