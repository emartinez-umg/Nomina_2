import { z } from 'zod';

const respuestaSaludSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    estado: z.literal('OK'),
    baseDatos: z.literal('CONECTADA'),
    modo: z.literal('thin'),
    fecha: z.string().datetime(),
  }),
});

const errorSchema = z.object({
  ok: z.literal(false),
  error: z.object({ codigo: z.string(), mensaje: z.string() }),
});

export type Salud = z.infer<typeof respuestaSaludSchema>['data'];

export async function consultarSalud(signal?: AbortSignal): Promise<Salud> {
  const controller = new AbortController();
  const cancelar = () => controller.abort();
  if (signal?.aborted) cancelar();
  signal?.addEventListener('abort', cancelar, { once: true });
  const limite = setTimeout(cancelar, 10000);
  try {
    const respuesta = await fetch('/api/salud', { signal: controller.signal });
    const cuerpo: unknown = await respuesta.json();
    if (!respuesta.ok) {
      const error = errorSchema.safeParse(cuerpo);
      throw new Error(
        error.success ? error.data.error.mensaje : 'El servicio no pudo completar la consulta.',
      );
    }
    const resultado = respuestaSaludSchema.safeParse(cuerpo);
    if (!resultado.success) throw new Error('El servicio devolvió una respuesta no válida.');
    return resultado.data.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('El servicio devolvió una respuesta no válida.');
    }
    if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
      throw new Error('No se pudo contactar al servicio. Revisa la conexión y vuelve a intentar.');
    }
    throw error;
  } finally {
    clearTimeout(limite);
    signal?.removeEventListener('abort', cancelar);
  }
}
