import { z } from 'zod';
import type { Request, Response } from 'express';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import type { crearComisionesService } from './comisiones.service.js';
import {
  comisionesAniosSchema,
  comisionesQuerySchema,
  comisionesListaSchema,
  comisionesHistorialSchema,
  vendedorParamsSchema,
} from './comisiones.schemas.js';

export function crearComisionesController(s: ReturnType<typeof crearComisionesService>) {
  const general =
    (metodo: 'resumen' | 'tendencia' | 'opciones') => async (req: Request, res: Response) => {
      res.json(
        respuestaOk(await s[metodo](autenticacionDe(req), comisionesQuerySchema.parse(req.query))),
      );
    };
  const lista = (metodo: 'ranking' | 'tabla') => async (req: Request, res: Response) => {
    res.json(
      respuestaOk(await s[metodo](autenticacionDe(req), comisionesListaSchema.parse(req.query))),
    );
  };
  return {
    resumen: general('resumen'),
    tendencia: general('tendencia'),
    opciones: general('opciones'),
    ranking: lista('ranking'),
    tabla: lista('tabla'),
    async historial(req: Request, res: Response) {
      const { id } = vendedorParamsSchema.parse(req.params);
      res.json(
        respuestaOk(
          await s.historial(autenticacionDe(req), id, comisionesHistorialSchema.parse(req.query)),
        ),
      );
    },
    async exportar(req: Request, res: Response) {
      res.json(
        respuestaOk(
          await s.exportar(
            autenticacionDe(req),
            comisionesQuerySchema.parse(req.query),
            z.enum(['csv', 'excel']).parse(req.params.formato),
          ),
        ),
      );
    },
    async anios(req: Request, res: Response) {
      comisionesAniosSchema.parse(req.query);
      res.json(respuestaOk(await s.anios(autenticacionDe(req))));
    },
  };
}
