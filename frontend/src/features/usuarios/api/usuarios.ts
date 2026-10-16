import { z } from 'zod';
import { solicitar } from '../../../lib/http';
const usuario = z.object({
  idUsuario: z.number(),
  usuario: z.string(),
  correo: z.string(),
  rol: z.enum(['ADMIN', 'RH', 'EMPLEADO']),
  activo: z.number(),
  cambioObligatorio: z.number(),
  ultimoAcceso: z.string().nullable(),
});
export type Usuario = z.infer<typeof usuario>;
export const listar = (q: Record<string, string>) =>
  solicitar(
    `/usuarios?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`,
    z.object({
      usuarios: z.array(usuario),
      total: z.number(),
      pagina: z.number(),
      limite: z.number(),
    }),
  );
export const crear = (body: unknown) =>
  solicitar(
    '/usuarios',
    z.object({ idUsuario: z.number(), usuario: z.string(), contrasenaTemporal: z.string() }),
    { method: 'POST', body },
  );
export const modificar = (id: number, accion: string, body: unknown) =>
  solicitar(
    `/usuarios/${id}/${accion}`,
    z.object({ contrasenaTemporal: z.string().optional() }).passthrough(),
    { method: accion === 'restablecer-contrasena' ? 'POST' : 'PATCH', body },
  );

export const vincularFicha = (id: number, idEmpleado: number, motivo: string) =>
  solicitar(`/usuarios/${id}/expediente`, z.object({ vinculado: z.boolean() }), {
    method: 'POST',
    body: { idEmpleado, motivo, confirmado: true },
  });
