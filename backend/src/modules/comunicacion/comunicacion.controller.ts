import type { Request, Response } from 'express';
import { z } from 'zod';
import { tipoSchema, querySchema, datosSchema, borrarSchema } from './comunicacion.schemas.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { contextoDe } from '../auth/auth.controller.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import type { crearComunicacionService } from './comunicacion.service.js';
export function crearComunicacionController(s: ReturnType<typeof crearComunicacionService>) {
  const params = (r: Request) =>
    z.object({ tipo: tipoSchema, id: idSchema.optional() }).strict().parse(r.params);
  const ok = (r: Response, d: unknown, status = 200) => r.status(status).json(respuestaOk(d));
  return {
    listar: async (r: Request, res: Response) =>
      ok(res, await s.listar(autenticacionDe(r), params(r).tipo, querySchema.parse(r.query))),
    detalle: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      const p = params(r);
      ok(res, await s.detalle(autenticacionDe(r), p.tipo, p.id!));
    },
    guardar: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      const p = params(r);
      ok(
        res,
        await s.guardar(
          autenticacionDe(r),
          contextoDe(r).ip,
          p.tipo,
          datosSchema.parse(r.body),
          p.id,
        ),
        p.id ? 200 : 201,
      );
    },
    eliminar: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      const p = params(r);
      ok(
        res,
        await s.eliminar(
          autenticacionDe(r),
          contextoDe(r).ip,
          p.tipo,
          p.id!,
          borrarSchema.parse(r.body),
        ),
      );
    },
    exportar: async (r: Request, res: Response) =>
      ok(res, await s.exportar(autenticacionDe(r), params(r).tipo, querySchema.parse(r.query))),
  };
}
