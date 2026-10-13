import { z } from 'zod';
import { solicitar } from '../../../lib/http';
import { listadoSchema } from '../../comunicacion/api/comunicacion';
export const auditoriaFila = z.object({
  id: z.number(),
  idUsuario: z.number().nullable(),
  rol: z.string().nullable(),
  accion: z.string(),
  entidad: z.string(),
  idEntidad: z.number().nullable(),
  antes: z.unknown(),
  despues: z.unknown(),
  motivo: z.string().nullable(),
  ip: z.string().nullable(),
  fecha: z.string(),
});
export type AuditoriaFila = z.infer<typeof auditoriaFila>;
const periodo = z.object({
  id: z.number(),
  inicio: z.string(),
  fin: z.string(),
  estado: z.string(),
  version: z.number(),
  bruto: z.string().nullable(),
  neto: z.string().nullable(),
  costoPatronal: z.string().nullable(),
  empleados: z.number(),
});
export const rhSchema = z.object({
  rol: z.literal('RH'),
  ahora: z.string(),
  indicadores: z.object({
    activos: z.number(),
    altas: z.number(),
    bajas: z.number(),
    solicitudes: z.number(),
    vacaciones: z.number(),
  }),
  periodo: periodo.nullable(),
  departamentos: z.array(z.object({ nombre: z.string(), cantidad: z.number() })),
  evolucion: z.array(periodo),
  celebraciones: z.array(
    z.object({
      id: z.number(),
      nombre: z.string(),
      tipo: z.string(),
      fecha: z.string(),
      anios: z.number(),
    }),
  ),
  alertas: z.array(
    z.object({ id: z.number(), tipo: z.string(), mensaje: z.string(), fecha: z.string() }),
  ),
});
export const empleadoSchema = z.object({
  rol: z.literal('EMPLEADO'),
  ahora: z.string(),
  nombre: z.string(),
  saldo: z.object({ disponible: z.string().nullable(), mensaje: z.string().nullable() }),
  ultimaBoleta: z
    .object({
      id: z.number(),
      inicio: z.string(),
      fin: z.string(),
      bruto: z.string(),
      neto: z.string(),
    })
    .nullable(),
  anuncios: listadoSchema,
  eventos: listadoSchema,
});
export const adminSchema = z.object({
  rol: z.literal('ADMIN'),
  ahora: z.string(),
  usuarios: z.array(z.object({ rol: z.string(), total: z.number(), activos: z.number() })),
  sesiones: z.array(
    z.object({
      id: z.number(),
      usuario: z.string(),
      rol: z.string(),
      fecha: z.string(),
      vigente: z.number(),
    }),
  ),
  sistema: z.object({
    version: z.number().nullable(),
    migracionesPendientes: z.number(),
    sesionesActivas: z.number(),
    objetosInvalidos: z.number(),
    baseDatos: z.string(),
    modo: z.string(),
  }),
  bitacora: z.array(auditoriaFila),
});
export const consultar = (rol: 'ADMIN' | 'RH' | 'EMPLEADO', signal?: AbortSignal) =>
  solicitar(
    `/tableros/${rol === 'RH' ? 'rh' : rol.toLowerCase()}`,
    z.discriminatedUnion('rol', [rhSchema, empleadoSchema, adminSchema]),
    { signal },
  );
