import { z } from 'zod';
const texto = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `Escribe al menos ${min} caracteres.`)
    .max(max, `Usa hasta ${max} caracteres.`)
    .refine(
      (v) =>
        [...v].every((c) => {
          const n = c.charCodeAt(0);
          return n === 9 || n === 10 || n === 13 || (n >= 32 && n !== 127);
        }),
      'Retira los caracteres de control.',
    );

const id = z.number().int().positive().safe();
export const fechaActa = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      v >= '1900-01-01' &&
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    'Selecciona una fecha válida desde 1900.',
  );
export const estadosActa = [
  'BORRADOR',
  'EMITIDA',
  'FIRMADA',
  'SE_NEGO_A_FIRMAR',
  'ANULADA',
] as const;
export const actaSchema = z
  .object({
    idEmpleado: id,
    idTipo: id,
    fechaHecho: fechaActa,
    lugar: texto(3, 200),
    descripcion: texto(30, 4000),
    testigos: texto(0, 1000),
    norma: texto(5, 1000),
    medida: texto(5, 1000),
    descargos: texto(0, 1000),
    diasSuspension: z.number().int().min(0).max(366),
    version: id.optional(),
  })
  .strict();
export type DatosActa = z.infer<typeof actaSchema>;
export const accionActaSchema = z
  .object({
    accion: z.enum(['EMITIR', 'NEGATIVA', 'ANULAR']),
    version: id,
    confirmado: z.literal(true),
    motivo: texto(5, 500).optional(),
    testigos: texto(5, 1000).optional(),
    registrarAusencia: z.boolean().default(false),
    fechaInicio: fechaActa.optional(),
  })
  .strict()
  .superRefine((d, c) => {
    if (d.accion === 'ANULAR' && !d.motivo)
      c.addIssue({
        code: 'custom',
        path: ['motivo'],
        message: 'Explica el motivo de la anulación (5–500 caracteres).',
      });
    if (d.accion === 'NEGATIVA' && !d.testigos)
      c.addIssue({
        code: 'custom',
        path: ['testigos'],
        message: 'Identifica a los testigos presentes en la negativa.',
      });
    if (d.registrarAusencia && (d.accion !== 'EMITIR' || !d.fechaInicio))
      c.addIssue({
        code: 'custom',
        path: ['fechaInicio'],
        message: 'Selecciona el inicio de la suspensión antes de emitir.',
      });
    if (d.accion !== 'ANULAR' && d.motivo)
      c.addIssue({
        code: 'custom',
        path: ['motivo'],
        message: 'El motivo corresponde a la anulación.',
      });
    if (d.accion !== 'NEGATIVA' && d.testigos)
      c.addIssue({
        code: 'custom',
        path: ['testigos'],
        message: 'Los testigos de negativa solo corresponden a esa acción.',
      });
    if (!d.registrarAusencia && d.fechaInicio)
      c.addIssue({
        code: 'custom',
        path: ['fechaInicio'],
        message: 'Confirma el registro de la ausencia para seleccionar fechas.',
      });
  });
export type AccionActa = z.infer<typeof accionActaSchema>;
export const variablesActa = [
  'codigo',
  'nombre',
  'tipo',
  'fecha_hecho',
  'lugar',
  'descripcion',
  'testigos',
  'norma',
  'medida',
  'dias_suspension',
  'descargos',
] as const;
export const plantillaActaSchema = z
  .object({
    version: id,
    nombre: texto(3, 150),
    contenido: texto(30, 12000),
    motivo: texto(5, 500),
    confirmado: z.literal(true),
  })
  .strict()
  .superRefine((d, c) => {
    const sinVariables = d.contenido.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) =>
      variablesActa.includes(key as (typeof variablesActa)[number]) ? '' : '{{invalida}}',
    );
    if (/[{}]/.test(sinVariables))
      c.addIssue({
        code: 'custom',
        path: ['contenido'],
        message: 'Usa únicamente las variables disponibles con el formato {{variable}}.',
      });
    for (const v of variablesActa)
      if (!d.contenido.includes(`{{${v}}}`))
        c.addIssue({
          code: 'custom',
          path: ['contenido'],
          message: `Conserva la variable {{${v}}} para no omitir datos del acta.`,
        });
  });
export function validarFechaHecho(fecha: string, ingreso: string, hoy: string) {
  return fecha < ingreso
    ? 'La fecha del hecho no puede ser anterior al ingreso del empleado.'
    : fecha > hoy
      ? 'La fecha del hecho no puede ser futura. Selecciona hoy o una fecha anterior.'
      : null;
}
export function validarDiasSuspension(dias: number, suspension: boolean, max: number) {
  return suspension
    ? dias < 1 || dias > max
      ? `Indica entre 1 y ${max} días de suspensión. Revisa la medida con RH.`
      : null
    : dias !== 0
      ? 'Solo el tipo suspensión admite días. Selecciona cero para este tipo.'
      : null;
}
