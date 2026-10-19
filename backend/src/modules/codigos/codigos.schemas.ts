import { z } from 'zod';
export const entidades = [
  'departamentos',
  'puestos',
  'jefaturas',
  'horarios',
  'centros-trabajo',
  'tipos-contrato',
  'tipos-descuento',
  'tipos-ausencia',
  'tipos-solicitud',
  'bancos',
  'conceptos',
  'tipos-deduccion-isr',
  'feriados',
  'parametros-legales',
  'empleados',
  'solicitudes',
  'prestamos',
  'descuentos',
  'eventos',
  'anuncios',
] as const;
export const vistaPreviaSchema = z
  .object({
    entidad: z.enum(entidades),
    palabra: z.string().trim().max(200).optional(),
    idDepartamento: z.coerce.number().int().positive().safe().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.entidad === 'empleados' && !d.idDepartamento)
      ctx.addIssue({
        code: 'custom',
        path: ['idDepartamento'],
        message: 'Selecciona el departamento para ver el código.',
      });
  });
export type VistaPrevia = z.infer<typeof vistaPreviaSchema>;
