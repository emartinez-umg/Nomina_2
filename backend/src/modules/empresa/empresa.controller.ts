import type { Request, Response } from 'express';
import { z } from 'zod';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { empresaSchema } from './empresa.schemas.js';
import type { crearEmpresaService } from './empresa.service.js';
export function crearEmpresaController(s: ReturnType<typeof crearEmpresaService>) {
  const vacio = (r: Request) => {
    z.object({}).strict().parse(r.query);
  };
  return {
    consultar: async (r: Request, res: Response) => {
      vacio(r);
      res.set('Cache-Control', 'no-store').json(respuestaOk(await s.consultar()));
    },
    estado: async (r: Request, res: Response) => {
      vacio(r);
      res.set('Cache-Control', 'no-store').json(respuestaOk(await s.estado(r.autenticacion!)));
    },
    guardar: async (r: Request, res: Response) => {
      vacio(r);
      res
        .set('Cache-Control', 'no-store')
        .json(
          respuestaOk(await s.guardar(r.autenticacion!, r.ip ?? '', empresaSchema.parse(r.body))),
        );
    },
  };
}
