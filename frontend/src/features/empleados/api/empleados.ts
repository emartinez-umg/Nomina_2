import { z } from 'zod';
import { solicitar } from '../../../lib/http';
export const empleadoSchema = z
  .object({
    id: z.number(),
    codigo: z.string(),
    nombres: z.string(),
    apellidos: z.string(),
    estado: z.enum(['ACTIVO', 'SUSPENDIDO', 'EGRESADO']),
    idUsuario: z.number().nullable(),
    usuario: z.string().nullable(),
    activo: z.boolean(),
    perfilIncompleto: z.boolean(),
    faltantes: z.array(z.string()),
  })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]));
export type Empleado = z.infer<typeof empleadoSchema>;
const filaSchema = z.object({
  id: z.number(),
  codigo: z.string(),
  nombre: z.string(),
  perfilIncompleto: z.boolean(),
  faltantes: z.array(z.string()),
  dpi: z.string(),
  nit: z.string(),
  departamento: z.string(),
  puesto: z.string(),
  fechaIngreso: z.string(),
  salarioBase: z.string().nullable(),
  estado: z.string(),
});
export type Fila = z.infer<typeof filaSchema>;
const listadoSchema = z.object({
  registros: z.array(filaSchema),
  total: z.number(),
  pagina: z.number(),
  limite: z.number(),
});
const reglasSchema = z.object({
  hoy: z.string(),
  edadMinima: z.number(),
  edadMaxima: z.number(),
  ultimoCierre: z.string().nullable(),
  salarioMinimo: z.string().nullable(),
  validarDigitoNit: z.boolean().optional(),
});
export type Reglas = z.infer<typeof reglasSchema>;
export const reglas = (signal?: AbortSignal, fecha?: string) =>
  solicitar(`/empleados/reglas${fecha ? '?' + new URLSearchParams({ fecha }) : ''}`, reglasSchema, {
    signal,
  });
export const listar = (q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(`/empleados?${new URLSearchParams(q)}`, listadoSchema, { signal });
export const detalle = (id: number, signal?: AbortSignal) =>
  solicitar(`/empleados/${id}`, empleadoSchema, { signal });
export const opciones = (
  ref: string,
  buscar: string,
  pagina: number,
  seleccionado: string,
  departamento?: string,
  signal?: AbortSignal,
) =>
  solicitar(
    `/empleados/opciones/${ref}?${new URLSearchParams({ buscar, pagina: String(pagina), ...(seleccionado ? { seleccionado } : {}), ...(departamento ? { departamento } : {}) })}`,
    z.array(
      z.object({
        value: z.string(),
        label: z.string(),
        requiereFechaFin: z.number().nullable().optional(),
      }),
    ),
    { signal },
  );
const credencialSchema = z.object({
  nombre: z.string().optional(),
  idUsuario: z.number(),
  usuario: z.string(),
  contrasenaTemporal: z.string(),
});
export type Credencial = z.infer<typeof credencialSchema>;
export const crear = (body: unknown) =>
  solicitar(
    '/empleados',
    z.object({
      empleado: empleadoSchema,
      credenciales: credencialSchema,
      pdfCredenciales: z.string(),
      advertencias: z.array(z.string()),
    }),
    { method: 'POST', body },
  );
export const editar = (id: number, body: unknown) =>
  solicitar(`/empleados/${id}`, empleadoSchema, { method: 'PATCH', body });
export const salario = (id: number, body: unknown) =>
  solicitar(
    `/empleados/${id}/salario`,
    z.object({ empleado: empleadoSchema, advertencias: z.array(z.string()) }),
    { method: 'POST', body },
  );
export const baja = (id: number, body: unknown) =>
  solicitar(`/empleados/${id}/baja`, empleadoSchema, { method: 'POST', body });
const pestanaSchema = z.object({
  registros: z.array(z.record(z.string().nullable())),
  total: z.number(),
  pagina: z.number(),
  limite: z.number(),
});
export const pestana = (id: number, tipo: string, pagina: number, signal?: AbortSignal) =>
  solicitar(`/empleados/${id}/pestanas/${tipo}?pagina=${pagina}`, pestanaSchema, { signal });
export const exportar = (q: Record<string, string>) =>
  solicitar(`/empleados/exportar?${new URLSearchParams(q)}`, z.string());
export const plantilla = () => solicitar('/empleados/cargas/plantilla', z.string());
const previewSchema = z.object({
  id: z.number(),
  filas: z.array(
    z.object({
      numero: z.number(),
      nombre: z.string(),
      errores: z.record(z.array(z.string())),
      advertencias: z.array(z.string()),
    }),
  ),
});
export type Preview = z.infer<typeof previewSchema>;
export const previsualizar = (nombreArchivo: string, csv: string) =>
  solicitar('/empleados/cargas', previewSchema, {
    method: 'POST',
    body: { nombreArchivo, csv },
    timeoutMs: 120000,
  });
export const confirmar = (id: number, modalidad: string) =>
  solicitar(
    `/empleados/cargas/${id}/confirmar`,
    z.object({
      id: z.number(),
      importadas: z.number(),
      credenciales: z.array(credencialSchema.extend({ numero: z.number() })),
      pdfCredenciales: z.string(),
    }),
    { method: 'POST', body: { modalidad, confirmado: true }, timeoutMs: 120000 },
  );
export const reporte = (id: number) => solicitar(`/empleados/cargas/${id}/reporte`, z.string());
export function descargar(texto: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const parentescos = (signal?: AbortSignal) =>
  solicitar('/empleados/parentescos', z.array(z.object({ value: z.string(), label: z.string() })), {
    signal,
  });
export const restablecer = (id: number, motivo: string) =>
  solicitar(
    `/empleados/${id}/restablecer-contrasena`,
    z.object({ credenciales: credencialSchema, pdfCredenciales: z.string() }),
    { method: 'POST', body: { motivo } },
  );
