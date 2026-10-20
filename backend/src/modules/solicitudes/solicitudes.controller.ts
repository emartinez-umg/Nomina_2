import { confirmarSchema } from './solicitudes.schemas.js';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { contextoDe } from '../auth/auth.controller.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import {
  querySchema,
  crearSchema,
  resolverSchema,
  entregarSchema,
  contactoSchema,
  plantillaSchema,
  tipoSchema,
} from './solicitudes.schemas.js';
import type { crearSolicitudesService } from './solicitudes.service.js';
export function crearSolicitudesController(s: ReturnType<typeof crearSolicitudesService>) {
  const id = (r: Request) => z.object({ id: idSchema }).strict().parse(r.params).id;
  const auth = autenticacionDe,
    ip = (r: Request) => contextoDe(r).ip;
  const ok = (r: Response, d: unknown, status = 200) => r.status(status).json(respuestaOk(d));
  const vacio = (r: Request) => sinDatos.parse(r.query);
  return {
    listar: async (r: Request, res: Response) =>
      ok(res, await s.listar(auth(r), ip(r), querySchema.parse(r.query))),
    detalle: async (r: Request, res: Response) => {
      vacio(r);
      ok(res, await s.detalle(auth(r), ip(r), id(r)));
    },
    crear: async (r: Request, res: Response) => {
      vacio(r);
      ok(res, await s.solicitar(auth(r), ip(r), crearSchema.parse(r.body)), 201);
    },
    resolver: async (r: Request, res: Response) => {
      vacio(r);
      ok(res, await s.resolver(auth(r), ip(r), id(r), resolverSchema.parse(r.body)));
    },
    reemitir: async (r: Request, res: Response) => {
      vacio(r);
      ok(res, await s.reemitir(auth(r), ip(r), id(r), confirmarSchema.parse(r.body)));
    },
    entregar: async (r: Request, res: Response) => {
      vacio(r);
      ok(res, await s.entregar(auth(r), ip(r), id(r), entregarSchema.parse(r.body)));
    },
    documento: async (r: Request, res: Response) => {
      vacio(r);
      ok(res, await s.documento(auth(r), ip(r), id(r)));
    },
    misDatos: async (r: Request, res: Response) => {
      vacio(r);
      ok(res, await s.misDatos(auth(r), ip(r)));
    },
    contacto: async (r: Request, res: Response) => {
      vacio(r);
      ok(res, await s.contacto(auth(r), ip(r), contactoSchema.parse(r.body)));
    },
    plantillas: async (r: Request, res: Response) => {
      vacio(r);
      ok(res, await s.plantillas(auth(r), ip(r)));
    },
    plantilla: async (r: Request, res: Response) => {
      vacio(r);
      const { tipo } = z.object({ tipo: tipoSchema }).strict().parse(r.params);
      ok(res, await s.plantilla(auth(r), ip(r), tipo, plantillaSchema.parse(r.body)));
    },
    notificaciones: async (r: Request, res: Response) => {
      vacio(r);
      ok(res, await s.notificaciones(auth(r), ip(r)));
    },
    leer: async (r: Request, res: Response) => {
      vacio(r);
      sinDatos.parse(r.body);
      ok(res, await s.leer(auth(r), ip(r), id(r)));
    },
    borrarNotificacion: async (r: Request, res: Response) => {
      vacio(r);
      sinDatos.parse(r.body ?? {});
      ok(res, await s.borrarNotificaciones(auth(r), ip(r), id(r)));
    },
    borrarNotificaciones: async (r: Request, res: Response) => {
      vacio(r);
      z.object({ confirmado: z.literal(true) })
        .strict()
        .parse(r.body);
      ok(res, await s.borrarNotificaciones(auth(r), ip(r)));
    },
    exportar: async (r: Request, res: Response) =>
      ok(res, await s.exportar(auth(r), ip(r), querySchema.parse(r.query))),
  };
}
