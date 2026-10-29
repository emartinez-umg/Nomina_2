import type { Request, Response } from 'express';
import { z } from 'zod';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { contextoDe } from '../auth/auth.controller.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { contentDisposition } from '../../shared/utils/archivo.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { ErrorValidacion } from '../../shared/errors/errors.js';
import {
  cargaExpedienteSchema,
  bajaExpedienteSchema,
  tipoExpedienteSchema,
} from './expedientes.schemas.js';
import type { crearExpedientesService } from './expedientes.service.js';
const idDe = (req: Request) => z.object({ id: idSchema }).strict().parse(req.params).id;
export function crearExpedientesController(s: ReturnType<typeof crearExpedientesService>) {
  const responder = (res: Response, data: unknown, status = 200) =>
    res.set('Cache-Control', 'private, no-store').status(status).json(respuestaOk(data));
  return {
    propio: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, await s.propio(autenticacionDe(req)));
    },
    listar: async (req: Request, res: Response) => {
      const q = z
        .object({
          pagina: z.coerce.number().int().min(1).max(1000000).default(1),
          tipo: idSchema.optional(),
        })
        .strict()
        .parse(req.query);
      responder(
        res,
        await s.listar(autenticacionDe(req), contextoDe(req).ip, idDe(req), q.pagina, q.tipo),
      );
    },
    cargar: async (req: Request, res: Response) => {
      const q = cargaExpedienteSchema.parse(req.query);
      let nombre: string;
      try {
        nombre = decodeURIComponent(req.get('X-Nombre-Archivo') ?? '');
      } catch {
        throw new ErrorValidacion({ archivo: ['El nombre del archivo es inválido.'] });
      }
      if (!Buffer.isBuffer(req.body))
        throw new ErrorValidacion({
          archivo: ['Envía el archivo PDF, JPG o PNG como contenido binario.'],
        });
      responder(
        res,
        await s.cargar(
          autenticacionDe(req),
          contextoDe(req).ip,
          idDe(req),
          q,
          nombre,
          req.get('Content-Type') ?? '',
          req.body,
        ),
        201,
      );
    },
    archivo: async (req: Request, res: Response) => {
      const q = z
        .object({ vista: z.enum(['1']).optional() })
        .strict()
        .parse(req.query);
      const d = await s.archivo(
        autenticacionDe(req),
        contextoDe(req).ip,
        idDe(req),
        q.vista === '1',
      );
      res
        .set({
          'Cache-Control': 'private, no-store',
          Pragma: 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': contentDisposition(d.nombre),
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Content-Type': d.tipo,
        })
        .send(d.bytes);
    },
    baja: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      const q = bajaExpedienteSchema.parse(req.body);
      responder(res, await s.baja(autenticacionDe(req), contextoDe(req).ip, idDe(req), q.motivo));
    },
    tipo: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      const q = tipoExpedienteSchema.parse(req.body);
      responder(res, await s.editarTipo(autenticacionDe(req), contextoDe(req).ip, idDe(req), q));
    },
  };
}
