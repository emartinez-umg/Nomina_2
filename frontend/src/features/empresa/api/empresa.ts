import { z } from 'zod';
import { solicitar } from '../../../lib/http';
import { nitSchema, correoSchema, telefonoSchema } from '../../../lib/validadores';
export const formularioEmpresa = z.object({
  razonSocial: z.string().trim().min(1, 'Completa la razón social.').max(200),
  nombreComercial: z.string().trim().max(200),
  nit: nitSchema,
  direccion: z.string().trim().min(1, 'Completa la dirección fiscal.').max(500),
  telefono: telefonoSchema,
  correo: correoSchema,
  sitioWeb: z.union([
    z.literal(''),
    z
      .string()
      .max(300)
      .url('Ingresa una URL completa, por ejemplo https://empresa.com.')
      .refine((v) => /^https?:\/\//i.test(v), 'Usa http o https.'),
  ]),
});
export type FormularioEmpresa = z.infer<typeof formularioEmpresa>;
const logoSchema = z.object({ mime: z.literal('image/png'), base64: z.string() });
const empresaSchema = z.object({
  id: z.number(),
  version: z.number(),
  razonSocial: z.string(),
  nombreComercial: z.string().nullable(),
  nit: z.string(),
  direccion: z.string(),
  telefono: z.string().nullable(),
  correo: z.string().nullable(),
  sitioWeb: z.string().nullable(),
  logo: logoSchema.nullable(),
});
export type Empresa = z.infer<typeof empresaSchema>;
export const consultarEmpresa = (signal?: AbortSignal) =>
  solicitar('/empresa', empresaSchema.nullable(), { signal });
export const guardarEmpresa = (
  datos: FormularioEmpresa & { version: number; logo?: { mime: string; base64: string } | null },
) => solicitar('/empresa', empresaSchema, { method: 'PATCH', body: datos });
export const estadoEmpresa = (signal?: AbortSignal) =>
  solicitar(
    '/empresa/estado',
    z.object({
      configurada: z.boolean(),
      mensaje: z.string().nullable(),
      firmante: z.object({ nombre: z.string(), cargo: z.string() }).nullable(),
    }),
    { signal },
  );
export function validarArchivoLogo(f: File) {
  if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(f.type))
    return 'Selecciona un logo PNG, JPG o SVG.';
  if (!f.size || f.size > 2 * 1024 * 1024)
    return 'El logo debe tener contenido y pesar como máximo 2 MB.';
  return undefined;
}
export const leerLogo = (file: File) =>
  new Promise<{ mime: string; base64: string }>((resolve, reject) => {
    const error = validarArchivoLogo(file);
    if (error) {
      reject(new Error(error));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el logo. Selecciónalo otra vez.'));
    reader.onload = () =>
      resolve({ mime: file.type, base64: String(reader.result).split(',')[1]! });
    reader.readAsDataURL(file);
  });
