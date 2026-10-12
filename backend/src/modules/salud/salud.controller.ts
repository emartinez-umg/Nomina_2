import type { RequestHandler } from 'express';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { consultaSaludSchema } from './salud.schemas.js';
import type { SaludService } from './salud.types.js';

export function crearSaludController(service: SaludService): RequestHandler {
  return async (req, res) => {
    consultaSaludSchema.parse(req.query);
    res.status(200).json(respuestaOk(await service.consultar()));
  };
}
