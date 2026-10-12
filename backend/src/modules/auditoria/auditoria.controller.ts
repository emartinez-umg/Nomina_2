import type { RequestHandler } from 'express';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { auditoriaQuerySchema } from './auditoria.schemas.js';
import type { crearAuditoriaService } from './auditoria.service.js';

export function crearAuditoriaController(
  service: ReturnType<typeof crearAuditoriaService>,
): RequestHandler {
  return async (req, res) => {
    res.json(respuestaOk(await service.listar(auditoriaQuerySchema.parse(req.query))));
  };
}
