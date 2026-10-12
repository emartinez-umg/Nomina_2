export type RespuestaApi<T> = {
  ok: boolean;
  data: T | null;
  meta?: { requestId: string };
  error?: { codigo: string; mensaje: string; campos?: Record<string, string[]> };
};

export function respuestaOk<T>(data: T): RespuestaApi<T> {
  return { ok: true, data };
}
