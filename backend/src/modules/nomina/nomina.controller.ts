import type { Request, Response } from 'express';
import { z } from 'zod';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { contextoDe } from '../auth/auth.controller.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { crearSchema, querySchema } from './nomina.schemas.js';
import type { crearNominaService } from './nomina.service.js';
export function crearNominaController(s: ReturnType<typeof crearNominaService>) {
  const id = (r: Request) => z.object({ id: idSchema }).strict().parse(r.params).id;
  const auth = (r: Request) => autenticacionDe(r),
    ip = (r: Request) => contextoDe(r).ip;
  const ok = (r: Response, d: unknown, status = 200) => r.status(status).json(respuestaOk(d));
  return {
    periodos: async (r: Request, res: Response) =>
      ok(res, await s.periodos(querySchema.parse(r.query))),
    crear: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.crear(auth(r), ip(r), crearSchema.parse(r.body).fecha), 201);
    },
    periodo: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.periodo(id(r)));
    },
    accion: (accion: string) => async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.accion(auth(r), ip(r), id(r), accion, r.body));
    },
    listar: async (r: Request, res: Response) =>
      ok(res, await s.listar(auth(r), querySchema.parse(r.query), r.params.id ? id(r) : undefined)),
    detalle: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.detalle(auth(r), id(r)));
    },
    boleta: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.boleta(auth(r), id(r)));
    },
    exportar: (formato: 'excel' | 'pdf' | 'boletas') => async (r: Request, res: Response) =>
      ok(
        res,
        await s.exportar(
          auth(r),
          querySchema.parse(r.query),
          formato,
          r.params.id ? id(r) : undefined,
        ),
      ),
    tipos: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.tipos());
    },
    fiscal: async (r: Request, res: Response) => {
      const q = z
        .object({ anio: z.coerce.number().int().min(2000).max(9999) })
        .strict()
        .parse(r.query);
      ok(res, await s.fiscal(id(r), q.anio));
    },
    guardarFiscal: (tipo: 'apertura' | 'deduccion') => async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.guardarFiscal(auth(r), ip(r), tipo, r.body), 201);
    },
    formato: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.formato());
    },
    guardarFormato: async (r: Request, res: Response) => {
      sinDatos.parse(r.query);
      ok(res, await s.guardarFormato(auth(r), ip(r), r.body));
    },
    igss: async (r: Request, res: Response) => {
      const q = z
        .object({
          anio: z.coerce.number().int().min(2000).max(9999),
          mes: z.coerce.number().int().min(1).max(12),
        })
        .strict()
        .parse(r.query);
      ok(res, await s.igss(q.anio, q.mes));
    },
  };
}
