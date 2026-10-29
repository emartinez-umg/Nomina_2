import { z } from 'zod';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
const errorSchema = z.object({
  error: z.object({
    codigo: z.string(),
    mensaje: z.string(),
    campos: z.record(z.array(z.string())).optional(),
    duplicado: z.object({ id: z.number(), activo: z.boolean() }).optional(),
  }),
});
export class ErrorApi extends Error {
  constructor(
    public estado: number,
    public codigo: string,
    mensaje: string,
    public campos?: Record<string, string[]>,
    public duplicado?: { id: number; activo: boolean },
  ) {
    super(mensaje);
  }
}
let csrf: string | undefined;
let generacionSesion = 0;
let recuperando: Promise<void> | undefined;
export const guardarCsrf = (token?: string) => {
  csrf = token;
  generacionSesion++;
};
async function recuperarCsrf(notificarSesion = true) {
  if (!recuperando)
    recuperando = (async () => {
      const obtener = () =>
        solicitar('/auth/csrf', z.object({ csrfToken: z.string().min(1) }), {
          notificarSesion,
        });
      let r;
      try {
        r = await obtener();
      } catch (error) {
        // El servidor acaba de retirar las cookies vencidas. Solo el prelogin puede
        // obtener ahora un token anónimo; nunca se repite la escritura de credenciales.
        if (
          notificarSesion ||
          !(error instanceof ErrorApi) ||
          !(error.estado === 401 || error.codigo === 'CSRF_INVALIDO')
        )
          throw error;
        r = await obtener();
      }
      csrf = r.csrfToken;
    })().finally(() => {
      recuperando = undefined;
    });
  await recuperando;
}
interface Opciones {
  archivo?: boolean;
  timeoutMs?: number;
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
  if (method !== 'GET' && !csrf) await recuperarCsrf(opciones.notificarSesion !== false);
  const generacion = generacionSesion;
  const controller = new AbortController();
  const cancelar = () => controller.abort();
  if (opciones.signal?.aborted) cancelar();
  opciones.signal?.addEventListener('abort', cancelar, { once: true });
  const timer = setTimeout(cancelar, opciones.timeoutMs ?? 15000);
  try {
    const response = await fetch(`/api${ruta}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: opciones.archivo
          ? 'application/pdf, application/zip, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json;q=0.5'
          : 'application/json',
        ...(method !== 'GET'
          ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ?? '' }
          : {}),
      },
      ...(opciones.body !== undefined ? { body: JSON.stringify(opciones.body) } : {}),
    });
    let cuerpo: unknown;
    if (
      opciones.archivo &&
      response.ok &&
      !response.headers.get('Content-Type')?.includes('application/json')
    ) {
      const disposicion = response.headers.get('Content-Disposition') ?? '';
      const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposicion)?.[1];
      const nombre = utf8 ? decodeURIComponent(utf8) : /filename="([^"]+)"/i.exec(disposicion)?.[1];
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binario = '';
      for (let i = 0; i < bytes.length; i += 32768)
        binario += String.fromCharCode(...bytes.subarray(i, i + 32768));
      cuerpo = {
        ok: true,
        data: {
          nombre: nombre ?? 'descarga.pdf',
          tipo: response.headers.get('Content-Type')?.split(';')[0],
          base64: btoa(binario),
        },
      };
    } else cuerpo = await response.json();
    if (controller.signal.aborted) throw new DOMException('Solicitud cancelada', 'AbortError');
    if (!response.ok) {
      const parseado = errorSchema.safeParse(cuerpo);
      const error = parseado.success
        ? new ErrorApi(
            response.status,
            parseado.data.error.codigo,
            parseado.data.error.mensaje,
            parseado.data.error.campos,
            parseado.data.error.duplicado,
          )
        : new ErrorApi(
            response.status,
            'ERROR_HTTP',
            'No se pudo completar la solicitud. Intenta de nuevo.',
          );
      const sesionVigente = generacion === generacionSesion;
      if (error.codigo === 'CSRF_INVALIDO' && sesionVigente) guardarCsrf();
      if (
        sesionVigente &&
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

// XHR permite informar los bytes transferidos; comparte sesión/CSRF con las demás mutaciones.
export async function enviarArchivo<T>(
  ruta: string,
  archivo: File,
  schema: z.ZodType<T>,
  progreso: (porcentaje: number) => void,
): Promise<T> {
  if (!csrf) await recuperarCsrf();
  const generacion = generacionSesion;
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${ruta}`);
    xhr.withCredentials = true;
    xhr.timeout = 120000;
    xhr.setRequestHeader('X-CSRF-Token', csrf ?? '');
    xhr.setRequestHeader('Content-Type', archivo.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Nombre-Archivo', encodeURIComponent(archivo.name));
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progreso(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = xhr.ontimeout = () =>
      reject(
        new ErrorApi(
          0,
          'SIN_CONEXION',
          'No se pudo cargar el archivo. Revisa tu conexión y vuelve a intentar.',
        ),
      );
    xhr.onload = () => {
      let cuerpo: unknown;
      try {
        cuerpo = JSON.parse(xhr.responseText);
      } catch {
        reject(
          new ErrorApi(
            xhr.status,
            'RESPUESTA_INVALIDA',
            'No se pudo cargar el archivo. Revisa el tamaño y vuelve a intentar.',
          ),
        );
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const r = errorSchema.safeParse(cuerpo);
        const e = r.success
          ? new ErrorApi(xhr.status, r.data.error.codigo, r.data.error.mensaje, r.data.error.campos)
          : new ErrorApi(xhr.status, 'ERROR_HTTP', 'No se pudo cargar el archivo.');
        if (generacion === generacionSesion && e.codigo === 'CSRF_INVALIDO') guardarCsrf();
        if (generacion === generacionSesion && xhr.status === 401) {
          guardarCsrf();
          window.dispatchEvent(new Event('nomina2:sesion-expirada'));
        }
        if (e.codigo === 'CAMBIO_CONTRASENA_OBLIGATORIO')
          window.dispatchEvent(new Event('nomina2:cambio-obligatorio'));
        reject(e);
        return;
      }
      const r = z.object({ ok: z.literal(true), data: schema }).safeParse(cuerpo);
      if (r.success) resolve(r.data.data as T);
      else
        reject(
          new ErrorApi(
            502,
            'RESPUESTA_INVALIDA',
            'El servidor devolvió una respuesta inválida. Actualiza el expediente.',
          ),
        );
    };
    xhr.send(archivo);
  });
}
