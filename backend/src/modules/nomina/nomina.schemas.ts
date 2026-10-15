import { z } from 'zod';
import { nitValido } from '../empleados/empleados.schemas.js';
import { fechaSchema } from '../vacaciones/vacaciones.schemas.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
const entero = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
export const monto = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Ingresa un monto positivo con hasta dos decimales.');
export const crearSchema = z
  .object({
    fecha: fechaSchema.refine(
      (v) => v >= '2000-01-01',
      'Selecciona una quincena desde el año 2000.',
    ),
  })
  .strict();
export const accionSchema = z
  .object({
    version: entero(0, 99999),
    confirmado: z.literal(true),
    motivo: z.string().trim().max(500).default(''),
  })
  .strict();
export const querySchema = z
  .object({
    pagina: entero(1, 100000).default(1),
    limite: entero(1, 100).default(10),
    anio: entero(2000, 9999).optional(),
    mes: entero(1, 12).optional(),
    estado: z.enum(['ABIERTO', 'CALCULADO', 'REVISADO', 'APROBADO', 'CERRADO']).optional(),
    buscar: z.string().trim().max(150).optional(),
    idEmpleado: idSchema.optional(),
    idDepartamento: idSchema.optional(),
    alertas: z.enum(['1', '0']).optional(),
    tipoPago: z.enum(['ANTICIPO', 'PAGO', 'BONO_14', 'AGUINALDO']).optional(),
    ordenarPor: z
      .enum(['inicio', 'empleado', 'ingresos', 'descuentos', 'neto', 'estado'])
      .default('inicio'),
    direccion: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
export type Query = z.infer<typeof querySchema>;
export const fiscalSchema = z
  .object({
    idEmpleado: idSchema,
    anio: entero(2000, 9999),
    fecha: fechaSchema,
    monto,
    igss: monto.default('0'),
    isr: monto.default('0'),
    motivo: z.string().trim().min(10).max(500),
    confirmado: z.literal(true),
  })
  .strict();
export const deduccionSchema = z
  .object({
    idEmpleado: idSchema,
    idTipo: idSchema,
    anio: entero(2000, 9999),
    fecha: fechaSchema,
    monto,
    referencia: z.string().trim().min(3).max(100),
    motivo: z.string().trim().min(10).max(500),
    confirmado: z.literal(true),
  })
  .strict()
  .refine((d) => Number(d.fecha.slice(0, 4)) === d.anio, {
    path: ['fecha'],
    message: 'El comprobante debe pertenecer al año fiscal.',
  });
const texto = z
  .string()
  .trim()
  .max(200)
  .regex(/^[^|\r\n]*$/, 'No se permiten barras verticales ni saltos de línea.');
export const formatoSchema = z
  .object({
    version: z.enum(['2.2.0']),
    patrono: z.string().regex(/^\d{1,10}$/),
    pruebas: z.enum(['0', '1']),
    nombre: texto.min(1),
    nit: texto
      .min(1)
      .max(20, 'El NIT patronal admite hasta 20 caracteres.')
      .refine(nitValido, 'Revisa el verificador del NIT patronal.'),
    direccion: texto.min(1),
    correo: z.string().email().max(100),
    centros: z
      .array(
        z
          .object({
            id: idSchema,
            codigo: z.string().regex(/^\d{1,5}$/),
            nombre: texto.min(1),
            direccion: texto.min(1),
            zona: z.string().regex(/^\d{0,2}$/),
            telefono: z.string().regex(/^(?:\d{8})?$/, 'Ingresa ocho dígitos o deja vacío.'),
            fax: z.string().regex(/^(?:\d{8})?$/, 'Ingresa ocho dígitos o deja vacío.'),
            contacto: texto,
            correo: z.union([
              z.literal(''),
              z.string().email('Ingresa un correo válido.').max(100),
            ]),
            departamento: z.string().regex(/^\d{1,2}$/),
            municipio: z.string().regex(/^\d{1,2}$/),
            actividad: z.string().regex(/^\d{6}$/),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    tipos: z
      .array(
        z
          .object({
            codigo: z.string().regex(/^\d{1,3}$/),
            nombre: texto.min(1),
            afiliado: z.enum(['C', 'S']),
            periodo: z.literal('M'),
            departamento: z.string().regex(/^\d{1,2}$/),
            actividad: z.string().regex(/^\d{6}$/),
            clase: z.literal('N'),
            tiempo: z.enum(['TC', 'TP']),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    empleados: z
      .array(
        z
          .object({
            id: idSchema,
            tipo: z.string().regex(/^\d{1,3}$/),
            ocupacion: z.string().regex(/^\d{1,4}$/),
            condicion: z.enum(['P', 'T']),
            salario: z.string().regex(/^[1-9]$/),
            primerNombre: texto
              .min(1)
              .max(60, 'Usa hasta 60 caracteres para este nombre o apellido.'),
            otrosNombres: texto.max(100, 'Usa hasta 100 caracteres para este nombre o apellido.'),
            primerApellido: texto
              .min(1)
              .max(60, 'Usa hasta 60 caracteres para este nombre o apellido.'),
            segundoApellido: texto.max(60, 'Usa hasta 60 caracteres para este nombre o apellido.'),
            apellidoCasada: texto.max(60, 'Usa hasta 60 caracteres para este nombre o apellido.'),
          })
          .strict(),
      )
      .max(5000),
  })
  .strict();
export type FormatoIgss = z.infer<typeof formatoSchema>;
export const guardarFormatoSchema = z
  .object({
    formato: formatoSchema,
    confirmado: z.literal(true),
    motivo: z.string().trim().min(10).max(500),
  })
  .strict();
