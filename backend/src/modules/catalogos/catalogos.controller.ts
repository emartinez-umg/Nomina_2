import type { Request, Response } from 'express';
import { z } from 'zod';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { ErrorNoEncontrado } from '../../shared/errors/errors.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { contextoDe } from '../auth/auth.controller.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { catalogos, obtenerCatalogo } from './catalogos.definiciones.js';
import {
  entradaSchema,
  querySchema,
  estadoCatalogoSchema,
  eliminarCatalogoSchema,
} from './catalogos.schemas.js';
import type { QueryCatalogo } from './catalogos.schemas.js';
import type { crearCatalogosService } from './catalogos.service.js';
const parametros = z.object({ catalogo: z.string().max(60), id: idSchema.optional() }).strict();
function contexto(req: Request) {
  const { catalogo: slug, id } = parametros.parse(req.params);
  const cat = obtenerCatalogo(slug);
  if (!cat) throw new ErrorNoEncontrado();
  return { cat, id };
}
export function crearCatalogosController(service: ReturnType<typeof crearCatalogosService>) {
  return {
    definiciones(req: Request, res: Response) {
      sinDatos.parse(req.query);
      res.json(
        respuestaOk(
          catalogos.map(({ slug, titulo, campos, legal }) => ({
            slug,
            titulo,
            campos: campos.map(({ columna: _columna, ...f }) => f),
            legal: !!legal,
          })),
        ),
      );
    },
    async restricciones(req: Request, res: Response) {
      sinDatos.parse(req.query);
      res.json(respuestaOk(await service.restricciones()));
    },
    async opciones(req: Request, res: Response) {
      const { referencia } = z
        .object({ referencia: z.enum(['departamentos', 'empleados']) })
        .strict()
        .parse(req.params);
      const q = z
        .object({
          buscar: z.string().trim().max(150).default(''),
          pagina: z.coerce.number().int().min(1).max(1000000).default(1),
        })
        .strict()
        .parse(req.query);
      res.json(respuestaOk(await service.opciones(referencia, q.buscar, q.pagina)));
    },
    async listar(req: Request, res: Response) {
      const { cat } = contexto(req);
      res.json(
        respuestaOk(await service.listar(cat, querySchema(cat).parse(req.query) as QueryCatalogo)),
      );
    },
    async detalle(req: Request, res: Response) {
      sinDatos.parse(req.query);
      const { cat, id } = contexto(req);
      res.json(respuestaOk(await service.detalle(cat, id!)));
    },
    async guardar(req: Request, res: Response) {
      sinDatos.parse(req.query);
      const { cat, id } = contexto(req);
      const d = entradaSchema(cat).parse(req.body);
      res
        .status(id ? 200 : 201)
        .json(
          respuestaOk(await service.guardar(autenticacionDe(req), contextoDe(req).ip, cat, d, id)),
        );
    },
    async estado(req: Request, res: Response) {
      sinDatos.parse(req.query);
      const { cat, id } = contexto(req);
      const d = estadoCatalogoSchema.parse(req.body);
      res.json(
        respuestaOk(
          await service.estado(
            autenticacionDe(req),
            contextoDe(req).ip,
            cat,
            id!,
            d.activo,
            d.motivo,
            d.confirmado,
          ),
        ),
      );
    },
    async eliminar(req: Request, res: Response) {
      sinDatos.parse(req.query);
      const { cat, id } = contexto(req);
      const d = eliminarCatalogoSchema.parse(req.body);
      res.json(
        respuestaOk(
          await service.eliminar(
            autenticacionDe(req),
            contextoDe(req).ip,
            cat,
            id!,
            d.motivo,
            d.fisica,
          ),
        ),
      );
    },
  };
}
