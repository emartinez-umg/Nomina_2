import { z } from 'zod';
import type { Request, Response } from 'express';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { contextoDe } from '../auth/auth.controller.js';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { querySchema, constanciaSchema } from './prestaciones.schemas.js';
import type { crearPrestacionesService } from './prestaciones.service.js';
export function crearPrestacionesController(s: ReturnType<typeof crearPrestacionesService>) {
  const id = (r: Request) => z.object({ id: idSchema }).strict().parse(r.params).id;
  const ok = (res: Response, d: unknown, status = 200) => res.status(status).json(respuestaOk(d));
  return {
    listar: async (r: Request, res: Response) =>
      ok(res, await s.listar(querySchema.parse(r.query))),
    detalle: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.detalle(id(r)));
    },
    operar:
      (op: 'previsualizar' | 'calcular' | 'simular' | 'liquidar') =>
      async (r: Request, res: Response) => {
        sinDatos.parse(r.query);
        ok(
          res,
          await s[op](autenticacionDe(r), contextoDe(r).ip, r.body),
          op === 'calcular' || op === 'liquidar' ? 201 : 200,
        );
      },
    accion: (op: string) => async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.accion(autenticacionDe(r), contextoDe(r).ip, id(r), op, r.body));
    },
    pdf: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.pdf(autenticacionDe(r), contextoDe(r).ip, id(r)));
    },
    exportar: async (r: Request, res: Response) =>
      ok(res, await s.exportar(querySchema.parse(r.query))),
    constancia: async (r: Request, res: Response) =>
      ok(
        res,
        await s.constancia(autenticacionDe(r), contextoDe(r).ip, constanciaSchema.parse(r.query)),
      ),
  };
}
