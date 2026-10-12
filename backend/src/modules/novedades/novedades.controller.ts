import type { Request, Response } from 'express';
import { z } from 'zod';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { contextoDe } from '../auth/auth.controller.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { schemas, tipoSchema, querySchema, accionSchema } from './novedades.schemas.js';
import type { crearNovedadesService } from './novedades.service.js';
const params = z.object({ tipo: tipoSchema, id: idSchema.optional() }).strict();
export function crearNovedadesController(s: ReturnType<typeof crearNovedadesService>) {
  const responder = (res: Response, d: unknown, status = 200) =>
    res.status(status).json(respuestaOk(d));
  return {
    restricciones: async (req: Request, res: Response) => {
      const { id } = z.object({ id: idSchema }).strict().parse(req.params);
      const { excluir } = z.object({ excluir: idSchema.optional() }).strict().parse(req.query);
      responder(res, await s.restricciones(id, excluir ?? 0));
    },
    reglas: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, await s.reglas());
    },
    opciones: async (req: Request, res: Response) => {
      const { ref } = z
        .object({ ref: z.enum(['empleados', 'descuentos', 'prestamos', 'ausencias', 'periodos']) })
        .strict()
        .parse(req.params);
      const q = z
        .object({
          buscar: z.string().max(150).default(''),
          pagina: z.coerce.number().int().min(1).max(1000000).default(1),
          seleccionado: idSchema.optional(),
        })
        .strict()
        .parse(req.query);
      responder(res, await s.opciones(ref, q.buscar, q.pagina, q.seleccionado));
    },
    listar: async (req: Request, res: Response) => {
      const { tipo } = params.parse(req.params);
      responder(res, await s.listar(tipo, querySchema.parse(req.query)));
    },
    exportar: async (req: Request, res: Response) => {
      const { tipo } = params.parse(req.params);
      responder(res, await s.exportar(tipo, querySchema.parse(req.query)));
    },
    detalle: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      const { tipo, id } = params.parse(req.params);
      responder(res, await s.detalle(tipo, id!));
    },
    guardar: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      const { tipo, id } = params.parse(req.params);
      const d = schemas[tipo].parse(req.body);
      responder(
        res,
        await (id
          ? s.editar(autenticacionDe(req), contextoDe(req).ip, tipo, id, d)
          : s.crear(autenticacionDe(req), contextoDe(req).ip, tipo, d)),
        id ? 200 : 201,
      );
    },
    anular: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      const { tipo, id } = params.parse(req.params);
      const d = accionSchema.parse(req.body);
      responder(res, await s.anular(autenticacionDe(req), contextoDe(req).ip, tipo, id!, d.motivo));
    },
    adjunto: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      const { id } = z.object({ id: idSchema }).strict().parse(req.params);
      responder(res, await s.adjunto(id));
    },
    preview: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      const { tipo } = params.parse(req.params);
      responder(
        res,
        await s.previsualizar(
          autenticacionDe(req),
          contextoDe(req).ip,
          tipo,
          schemas[tipo].parse(req.body),
        ),
      );
    },
  };
}
