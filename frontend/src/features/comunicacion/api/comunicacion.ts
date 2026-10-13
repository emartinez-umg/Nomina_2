import { z } from 'zod';
import { fechaValida } from '../../../lib/validadores';
import { solicitar } from '../../../lib/http';
export type Tipo = 'anuncios' | 'eventos';
export const filaSchema = z.object({
  id: z.number(),
  titulo: z.string(),
  contenido: z.string(),
  inicio: z.string(),
  fin: z.string(),
  lugar: z.string(),
  paraTodos: z.number(),
  activo: z.number(),
  version: z.number(),
});
export const destinatarioSchema = z.object({
  tipo: z.enum(['DEPARTAMENTO', 'PUESTO', 'JEFATURA']),
  id: z.number().int().positive(),
  nombre: z.string().optional(),
});
export type Fila = z.infer<typeof filaSchema>;
export const listadoSchema = z.object({
  registros: z.array(filaSchema),
  total: z.number(),
  pagina: z.number(),
  limite: z.number(),
});
export const qs = (q: Record<string, string>) =>
  new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '')).toString();
export const listar = (tipo: Tipo, q: Record<string, string>, signal?: AbortSignal) =>
  solicitar(`/comunicacion/${tipo}?${qs(q)}`, listadoSchema, { signal });
export const detalle = (tipo: Tipo, id: number, signal?: AbortSignal) =>
  solicitar(
    `/comunicacion/${tipo}/${id}`,
    filaSchema.extend({ destinatarios: z.array(destinatarioSchema) }),
    { signal },
  );
export const guardar = (tipo: Tipo, body: unknown, id?: number) =>
  solicitar(`/comunicacion/${tipo}${id ? `/${id}` : ''}`, z.object({ id: z.number() }), {
    method: id ? 'PATCH' : 'POST',
    body,
  });
export const eliminar = (tipo: Tipo, id: number, body: unknown) =>
  solicitar(`/comunicacion/${tipo}/${id}`, z.object({ id: z.number() }), {
    method: 'DELETE',
    body,
  });
export const exportar = (tipo: Tipo, q: Record<string, string>) =>
  solicitar(`/comunicacion/${tipo}/exportar?${qs(q)}`, z.string());
export function formularioSchema(tipo: Tipo, ahora: string) {
  return z
    .object({
      titulo: z.string().trim().min(3, 'Escribe al menos tres caracteres.').max(200),
      contenido: z.string().trim().min(3, 'Explica la publicación.').max(10000),
      inicio: z.string().min(10, 'Selecciona el inicio.'),
      fin: z.string().min(10, 'Selecciona el fin.'),
      lugar: z.string().trim().max(250),
      paraTodos: z.boolean(),
      destinatarios: z.array(destinatarioSchema),
      version: z.number(),
    })
    .superRefine((d, ctx) => {
      for (const key of ['inicio', 'fin'] as const) {
        const v = d[key];
        if (
          !fechaValida(v.slice(0, 10)) ||
          (tipo === 'eventos' && !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v))
        )
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Ingresa una fecha y hora válidas.',
          });
      }
      if (
        d.destinatarios.length > 100 ||
        new Set(d.destinatarios.map((v) => `${v.tipo}:${v.id}`)).size !== d.destinatarios.length
      )
        ctx.addIssue({
          code: 'custom',
          path: ['destinatarios'],
          message: 'Usa hasta 100 grupos distintos.',
        });
      if (d.fin < d.inicio)
        ctx.addIssue({
          code: 'custom',
          path: ['fin'],
          message: 'El fin debe ser igual o posterior al inicio.',
        });
      if (tipo === 'eventos' && d.inicio <= ahora.slice(0, 16))
        ctx.addIssue({
          code: 'custom',
          path: ['inicio'],
          message: 'Selecciona una fecha y hora futuras en Guatemala.',
        });
      if (tipo === 'eventos' && !d.lugar)
        ctx.addIssue({
          code: 'custom',
          path: ['lugar'],
          message: 'Indica dónde se realizará la actividad.',
        });
      if (tipo === 'anuncios' && d.fin < ahora.slice(0, 10))
        ctx.addIssue({
          code: 'custom',
          path: ['fin'],
          message: 'La vigencia debe terminar hoy o después.',
        });
      if (!d.paraTodos && !d.destinatarios.length)
        ctx.addIssue({
          code: 'custom',
          path: ['destinatarios'],
          message: 'Agrega al menos un grupo destinatario.',
        });
    });
}
export type Formulario = z.infer<ReturnType<typeof formularioSchema>>;
export const horaGuatemala = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date())
    .replace(' ', 'T');
export const fechaHora = (s: string) =>
  `${s.slice(0, 10).split('-').reverse().join('/')}${s.includes('T') ? ` · ${s.slice(11, 16)}` : ''}`;
