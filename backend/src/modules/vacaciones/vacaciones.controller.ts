import type { Request, Response } from 'express';
import { z } from 'zod';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { contextoDe } from '../auth/auth.controller.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import {
  cargaSchema,
  fechaSchema,
  querySchema,
  rangoSchema,
  resolverSchema,
} from './vacaciones.schemas.js';
import type { crearVacacionesService } from './vacaciones.service.js';
export function crearVacacionesController(s: ReturnType<typeof crearVacacionesService>) {
  const id = (req: Request) => z.object({ id: idSchema }).strict().parse(req.params).id;
  const auth = (req: Request) => autenticacionDe(req),
    ip = (req: Request) => contextoDe(req).ip;
  const responder = (res: Response, d: unknown, status = 200) =>
    res.status(status).json(respuestaOk(d));
  return {
    saldo: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, await s.saldo(auth(req), ip(req), req.params.id ? id(req) : undefined));
    },
    calendario: async (req: Request, res: Response) => {
      const d = rangoSchema.parse(req.query);
      responder(
        res,
        await s.calendario(
          auth(req),
          ip(req),
          d.inicio,
          d.fin,
          req.params.id ? id(req) : undefined,
        ),
      );
    },
    preview: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, await s.previsualizar(auth(req), ip(req), rangoSchema.parse(req.body)));
    },
    solicitar: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, await s.solicitar(auth(req), ip(req), rangoSchema.parse(req.body)), 201);
    },
    listar: async (req: Request, res: Response) =>
      responder(res, await s.listar(auth(req), ip(req), querySchema.parse(req.query))),
    exportar: async (req: Request, res: Response) =>
      responder(res, await s.exportar(auth(req), querySchema.parse(req.query))),
    resolver: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, await s.resolver(auth(req), ip(req), id(req), resolverSchema.parse(req.body)));
    },
    cargar: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, await s.cargar(auth(req), ip(req), id(req), cargaSchema.parse(req.body)), 201);
    },
    opciones: async (req: Request, res: Response) => {
      const q = z
        .object({
          buscar: z.string().max(150).default(''),
          pagina: z.coerce.number().int().min(1).max(100000).default(1),
          seleccionado: idSchema.optional(),
        })
        .strict()
        .parse(req.query);
      responder(res, await s.opciones(q.buscar, q.pagina, q.seleccionado));
    },
    notificaciones: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, await s.notificaciones(auth(req)));
    },
    leer: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      sinDatos.parse(req.body);
      responder(res, await s.leerNotificacion(auth(req), ip(req), id(req)));
    },
    finiquito: async (req: Request, res: Response) => {
      const q = z.object({ corte: fechaSchema }).strict().parse(req.query);
      responder(res, await s.finiquito(auth(req), ip(req), id(req), q.corte));
    },
  };
}
