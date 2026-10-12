import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError, defaultErrorMap } from 'zod';
import { ErrorNegocio, ErrorValidacion } from '../errors/errors.js';
import type { RespuestaApi } from '../utils/respuesta.js';

export function manejarErrores(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    let normalizado = error;
    if (error instanceof ZodError) {
      const campos: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const campo = issue.path.join('.') || 'solicitud';
        const mensajePredeterminado = defaultErrorMap(issue, {
          data: undefined,
          defaultError: '',
        }).message;
        (campos[campo] ??= []).push(
          issue.message === mensajePredeterminado
            ? 'El valor no tiene el formato permitido. Revisa el tipo y los límites del campo.'
            : issue.message,
        );
      }
      normalizado = new ErrorValidacion(campos);
    } else if (error instanceof Error && 'type' in error) {
      if (error.type === 'entity.parse.failed') {
        normalizado = new ErrorNegocio('El cuerpo debe ser JSON válido.', 400, 'JSON_INVALIDO');
      } else if (error.type === 'entity.too.large') {
        normalizado = new ErrorNegocio(
          'La solicitud supera el tamaño permitido.',
          413,
          'CUERPO_GRANDE',
        );
      }
    }

    const esperado = normalizado instanceof ErrorNegocio ? normalizado : undefined;
    const estado = esperado?.estado ?? 500;
    if (estado >= 500) {
      logger.error({ err: normalizado, requestId: res.locals.requestId }, 'La petición falló');
    }
    const respuesta: RespuestaApi<never> = {
      ok: false,
      data: null,
      meta: { requestId: String(res.locals.requestId) },
      error: {
        codigo: esperado?.codigo ?? 'ERROR_INTERNO',
        mensaje: esperado
          ? esperado.message
          : 'Ocurrió un error interno. Intenta nuevamente en unos momentos.',
        ...(esperado?.campos ? { campos: esperado.campos } : {}),
      },
    };
    res.status(estado).json(respuesta);
  };
}
