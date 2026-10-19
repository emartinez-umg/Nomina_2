import { z } from 'zod';
import { guardarCsrf, solicitar } from '../../../lib/http';
import { activarBorradoresUsuario, limpiarBorradoresSesion } from '../../../lib/formDraft';
export const usuarioSchema = z.object({
  idUsuario: z.number().int(),
  usuario: z.string(),
  nombreMostrado: z.string().optional(),
  correo: z.string(),
  idRol: z.number().int(),
  rol: z.enum(['ADMIN', 'RH', 'EMPLEADO']),
  activo: z.boolean(),
  cambioObligatorio: z.boolean(),
});
export type Usuario = z.infer<typeof usuarioSchema>;
export type Rol = Usuario['rol'];
const accesoSchema = z.object({ usuario: usuarioSchema, csrfToken: z.string().min(1) });
export const consultarSesion = (signal?: AbortSignal) =>
  solicitar('/auth/sesion', usuarioSchema, { signal, notificarSesion: false });
export async function iniciarSesion(datos: { usuario: string; contrasena: string }) {
  // El token previo se renueva en cada intento, también después de una pestaña abierta más de 10 min.
  guardarCsrf();
  const resultado = await solicitar('/auth/login', accesoSchema, {
    method: 'POST',
    body: datos,
    notificarSesion: false,
  });
  guardarCsrf(resultado.csrfToken);
  activarBorradoresUsuario(resultado.usuario.idUsuario);
  return resultado.usuario;
}
export async function cambiarContrasena(datos: {
  contrasenaActual: string;
  contrasenaNueva: string;
}) {
  const resultado = await solicitar('/auth/cambiar-contrasena', accesoSchema, {
    method: 'POST',
    body: datos,
  });
  guardarCsrf(resultado.csrfToken);
  return resultado.usuario;
}
export async function cerrarSesion() {
  await solicitar('/auth/logout', z.object({ mensaje: z.string() }), { method: 'POST', body: {} });
  limpiarBorradoresSesion();
  guardarCsrf();
}
export const destinoRol = (rol: Rol) =>
  ({ ADMIN: '/admin', RH: '/rh', EMPLEADO: '/mis-gestiones' })[rol];
