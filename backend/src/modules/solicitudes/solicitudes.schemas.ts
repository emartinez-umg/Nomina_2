import { z } from 'zod';
import { crearEmpleadoSchema, fecha, dinero } from '../empleados/empleados.schemas.js';
export const tipos = [
  'CONSTANCIA_LABORAL',
  'CERTIFICADO_IGSS',
  'CONSTANCIA_INTECAP',
  'GAFETE',
  'PARQUEO',
  'ACTUALIZACION_DATOS',
] as const;
export const tipoSchema = z.enum(tipos);
export const estados = z.enum(['EN_PROCESO', 'APROBADA', 'RECHAZADA', 'ENTREGADA', 'CANCELADA']);
const expediente = crearEmpleadoSchema.innerType();
export const contactoSchema = expediente
  .pick({
    telefono: true,
    correo: true,
    contactoNombre: true,
    contactoParentesco: true,
    contactoTelefono: true,
  })
  .extend({
    direccion: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .regex(/^\P{Cc}*$/u, 'No uses caracteres de control.'),
  });
export const criticosSchema = expediente.pick({
  nombres: true,
  apellidos: true,
  dpi: true,
  nit: true,
  estadoCivil: true,
});
export const crearSchema = z
  .object({
    tipo: tipoSchema,
    observaciones: z.string().trim().max(1000).default(''),
    datos: criticosSchema.optional(),
    confirmado: z.literal(true),
  })
  .strict()
  .superRefine((d, c) => {
    if ((d.tipo === 'ACTUALIZACION_DATOS') !== !!d.datos)
      c.addIssue({
        code: 'custom',
        path: ['datos'],
        message: 'Completa los datos críticos únicamente para la gestión de actualización.',
      });
  });
export const resolverSchema = z
  .object({
    estado: z.enum(['APROBADA', 'RECHAZADA']),
    motivo: z.string().trim().max(500).default(''),
    parqueo: z.object({ monto: dinero, fechaInicio: fecha }).strict().optional(),
    confirmado: z.literal(true),
  })
  .strict()
  .superRefine((d, c) => {
    if (d.estado === 'RECHAZADA' && d.motivo.length < 5)
      c.addIssue({
        code: 'custom',
        path: ['motivo'],
        message: 'Explica por qué se rechaza y cómo corregirlo (mínimo 5 caracteres).',
      });
    if (d.estado === 'RECHAZADA' && d.parqueo)
      c.addIssue({
        code: 'custom',
        path: ['parqueo'],
        message: 'Un rechazo no debe crear un descuento.',
      });
  });
export const confirmarSchema = z.object({ confirmado: z.literal(true) }).strict();
export const entregarSchema = confirmarSchema
  .extend({
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export const variables = [
  'nombre',
  'dpi',
  'nit',
  'puesto',
  'departamento',
  'fecha_ingreso',
  'salario',
  'afiliacion_igss',
  'empresa',
  'nit_empresa',
  'direccion_empresa',
  'firmante_nombre',
  'firmante_cargo',
  'fecha_emision',
] as const;
export const plantillaSchema = z
  .object({
    contenido: z
      .string()
      .trim()
      .min(20, 'Escribe al menos 20 caracteres.')
      .max(20000)
      .refine(
        (s) => [...s].every((c) => c === '\n' || c === '\t' || c.charCodeAt(0) >= 32),
        'No uses caracteres de control.',
      ),
    version: z.number().int().positive(),
    motivo: z.string().trim().min(5).max(500),
    confirmado: z.literal(true),
  })
  .strict()
  .superRefine((d, c) => {
    const resto = d.contenido.replace(/\{\{([a-z_]+)\}\}/g, (_, v: string) =>
      variables.includes(v as (typeof variables)[number]) ? '' : '{{}}',
    );
    if (/[{}]/.test(resto))
      c.addIssue({
        code: 'custom',
        path: ['contenido'],
        message: 'Usa únicamente variables permitidas con el formato {{nombre}}.',
      });
  });
export const querySchema = z
  .object({
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
    tipo: tipoSchema.optional(),
    estado: estados.optional(),
    idEmpleado: z.coerce.number().int().positive().optional(),
    buscar: z.string().trim().max(200).optional(),
    desde: fecha.optional(),
    hasta: fecha.optional(),
    ordenarPor: z.enum(['id', 'codigo', 'empleado', 'tipo', 'estado', 'fecha']).default('fecha'),
    direccion: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .superRefine((d, c) => {
    if (d.desde && d.hasta && d.hasta < d.desde)
      c.addIssue({
        code: 'custom',
        path: ['hasta'],
        message: 'El fin debe ser igual o posterior al inicio.',
      });
  });
export type Query = z.infer<typeof querySchema>;
export type Criticos = z.infer<typeof criticosSchema>;
export type Contacto = z.infer<typeof contactoSchema>;
