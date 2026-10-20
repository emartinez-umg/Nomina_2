import type { Request, Response } from 'express';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { departamentosQuery, municipiosQuery } from './ubicaciones.schemas.js';
import type { crearUbicacionesService } from './ubicaciones.service.js';

export function crearUbicacionesController(service: ReturnType<typeof crearUbicacionesService>) {
  return {
    async departamentos(req: Request, res: Response) {
      const q = departamentosQuery.parse(req.query);
      res.json(respuestaOk(await service.departamentos(q.buscar)));
    },
    async municipios(req: Request, res: Response) {
      const q = municipiosQuery.parse(req.query);
      res.json(respuestaOk(await service.municipios(q.buscar, q.idDepartamentoGt)));
    },
  };
}
