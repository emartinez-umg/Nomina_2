import type { Request, Response } from 'express';
import { z } from 'zod';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { contextoDe } from '../auth/auth.controller.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { contentDisposition } from '../../shared/utils/archivo.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { ErrorValidacion } from '../../shared/errors/errors.js';
import { queryActasSchema } from './actas.schemas.js';
import type { crearActasService } from './actas.service.js';
const idDe = (r: Request) => z.object({ id: idSchema }).strict().parse(r.params).id;
export function crearActasController(s: ReturnType<typeof crearActasService>) {
  const ok = (res: Response, data: unknown, status = 200) =>
    res.set('Cache-Control', 'private, no-store').status(status).json(respuestaOk(data));
  return {
    exportar: async (req: Request, res: Response) => {
      const csv = await s.exportar(
        autenticacionDe(req),
        contextoDe(req).ip,
        queryActasSchema.parse(req.query),
      );
      res
        .set({
          'Cache-Control': 'private, no-store',
          'Content-Disposition': contentDisposition('actas.csv'),
          'Content-Type': 'text/csv; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        })
        .send(csv);
    },
    reglas: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      ok(res, await s.reglas(autenticacionDe(req)));
    },
    listar: async (req: Request, res: Response) =>
      ok(
        res,
        await s.listar(autenticacionDe(req), contextoDe(req).ip, queryActasSchema.parse(req.query)),
      ),
    detalle: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      ok(res, await s.detalle(autenticacionDe(req), contextoDe(req).ip, idDe(req)));
    },
    antecedentes: async (req: Request, res: Response) => {
      const q = z
        .object({ pagina: z.coerce.number().int().min(1).max(1000000).default(1) })
        .strict()
        .parse(req.query);
      ok(res, await s.antecedentes(autenticacionDe(req), contextoDe(req).ip, idDe(req), q.pagina));
    },
    guardar: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      ok(
        res,
        await s.guardar(
          autenticacionDe(req),
          contextoDe(req).ip,
          req.body,
          req.method === 'POST' ? undefined : idDe(req),
        ),
        req.method === 'POST' ? 201 : 200,
      );
    },
    accion: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      ok(res, await s.accion(autenticacionDe(req), contextoDe(req).ip, idDe(req), req.body));
    },
    plantilla: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      ok(res, await s.plantilla(autenticacionDe(req), contextoDe(req).ip));
    },
    guardarPlantilla: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      ok(res, await s.guardarPlantilla(autenticacionDe(req), contextoDe(req).ip, req.body));
    },
    cargar: async (req: Request, res: Response) => {
      let nombre: string;
      try {
        nombre = decodeURIComponent(req.get('X-Nombre-Archivo') ?? '');
      } catch {
        throw new ErrorValidacion({ archivo: ['El nombre del archivo es inválido.'] });
      }
      if (!Buffer.isBuffer(req.body))
        throw new ErrorValidacion({ archivo: ['Envía el archivo como contenido binario.'] });
      ok(
        res,
        await s.cargar(
          autenticacionDe(req),
          contextoDe(req).ip,
          idDe(req),
          req.query,
          nombre,
          req.get('Content-Type') ?? '',
          req.body,
        ),
        201,
      );
    },
    archivo:
      (adjunto = false) =>
      async (req: Request, res: Response) => {
        const q = z
          .object({ vista: z.enum(['1']).optional() })
          .strict()
          .parse(req.query);
        const d = await s.archivo(
          autenticacionDe(req),
          contextoDe(req).ip,
          idDe(req),
          adjunto,
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
  };
}
