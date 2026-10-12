import { z } from 'zod';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
const errorSchema = z.object({
  error: z.object({
    codigo: z.string(),
    mensaje: z.string(),
    campos: z.record(z.array(z.string())).optional(),
  }),
});
export class ErrorApi extends Error {
  constructor(
    public estado: number,
    public codigo: string,
    mensaje: string,
    public campos?: Record<string, string[]>,
  ) {
    super(mensaje);
  }
}
let csrf: string | undefined;
let recuperando: Promise<void> | undefined;
export const guardarCsrf = (token?: string) => {
  csrf = token;
};
async function recuperarCsrf() {
  if (!recuperando)
    recuperando = (async () => {
      const r = await solicitar('/auth/csrf', z.object({ csrfToken: z.string().min(1) }), {
        notificarSesion: true,
      });
      csrf = r.csrfToken;
    })().finally(() => {
      recuperando = undefined;
    });
  await recuperando;
}
interface Opciones {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal | undefined;
  notificarSesion?: boolean;
}
export async function solicitar<T>(
  ruta: string,
  schema: z.ZodType<T>,
  opciones: Opciones = {},
): Promise<T> {
  const method = opciones.method ?? 'GET';
  if (method !== 'GET' && !csrf) await recuperarCsrf();
  const controller = new AbortController();
  const cancelar = () => controller.abort();
  if (opciones.signal?.aborted) cancelar();
  opciones.signal?.addEventListener('abort', cancelar, { once: true });
  const timer = setTimeout(cancelar, 15000);
  try {
    const response = await fetch(`/api${ruta}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(method !== 'GET'
          ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ?? '' }
          : {}),
      },
      ...(opciones.body !== undefined ? { body: JSON.stringify(opciones.body) } : {}),
    });
    const cuerpo: unknown = await response.json();
    if (!response.ok) {
      const parseado = errorSchema.safeParse(cuerpo);
      const error = parseado.success
        ? new ErrorApi(
            response.status,
            parseado.data.error.codigo,
            parseado.data.error.mensaje,
            parseado.data.error.campos,
          )
        : new ErrorApi(
            response.status,
            'ERROR_HTTP',
            'No se pudo completar la solicitud. Intenta de nuevo.',
          );
      if (error.codigo === 'CSRF_INVALIDO') guardarCsrf();
      if (
        opciones.notificarSesion !== false &&
        (response.status === 401 || (ruta === '/auth/csrf' && error.codigo === 'CSRF_INVALIDO')) &&
        error.codigo !== 'CREDENCIALES_INVALIDAS'
      ) {
        guardarCsrf();
        window.dispatchEvent(new Event('nomina2:sesion-expirada'));
      }
      if (error.codigo === 'CAMBIO_CONTRASENA_OBLIGATORIO')
        window.dispatchEvent(new Event('nomina2:cambio-obligatorio'));
      throw error;
    }
    const resultado = z.object({ ok: z.literal(true), data: schema }).safeParse(cuerpo);
    if (!resultado.success)
      throw new ErrorApi(
        502,
        'RESPUESTA_INVALIDA',
        'El servidor devolvió una respuesta no válida. Intenta de nuevo.',
      );
    return resultado.data.data as T;
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new ErrorApi(
        502,
        'RESPUESTA_INVALIDA',
        'El servidor devolvió una respuesta no válida. Intenta de nuevo.',
      );
    if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError'))
      throw new ErrorApi(
        0,
        'SIN_CONEXION',
        'No se pudo contactar al servidor. Revisa tu conexión y vuelve a intentar.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
    opciones.signal?.removeEventListener('abort', cancelar);
  }
}
// Lista explícita: no se permite al servidor seleccionar campos ajenos al formulario.
export function mapearErrores<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  campos: Path<T>[],
) {
  if (error instanceof ErrorApi && [400, 409, 422].includes(error.estado)) {
    for (const campo of campos) {
      const mensajes = error.campos?.[campo];
      if (mensajes?.length) setError(campo, { type: 'server', message: mensajes.join(' ') });
    }
  }
}
