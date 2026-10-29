import type { Request, Response } from 'express';
import { z } from 'zod';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { contextoDe } from '../auth/auth.controller.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { saldosQuerySchema } from '../vacaciones/vacaciones.saldos.schemas.js';
import { cambiosPermisosSchema, equipoQuerySchema } from './equipo.schemas.js';
import type { crearEquipoService } from './equipo.service.js';
const idDe = (req: Request) => z.object({ id: idSchema }).strict().parse(req.params).id;
const consultaSaldos = saldosQuerySchema.extend({ alcance: z.literal('equipo').default('equipo') });
export function crearEquipoController(s: ReturnType<typeof crearEquipoService>) {
  return {
    async resumen(req: Request, res: Response) {
      sinDatos.parse(req.query);
      res.json(respuestaOk(await s.resumen(autenticacionDe(req))));
    },
    async listar(req: Request, res: Response) {
      res.json(
        respuestaOk(await s.listar(autenticacionDe(req), equipoQuerySchema.parse(req.query))),
      );
    },
    async opciones(req: Request, res: Response) {
      const q = z
        .object({ vista: z.enum(['personas', 'vacaciones']) })
        .strict()
        .parse(req.query);
      res.json(
        respuestaOk(
          await s.opciones(
            autenticacionDe(req),
            q.vista === 'personas' ? 'VER_EQUIPO' : 'VER_VACACIONES_EQUIPO',
          ),
        ),
      );
    },
    async saldos(req: Request, res: Response) {
      res.json(
        respuestaOk(await s.saldos.listar(autenticacionDe(req), consultaSaldos.parse(req.query))),
      );
    },
    async exportar(req: Request, res: Response) {
      const { formato } = z
        .object({ formato: z.enum(['csv', 'excel']) })
        .strict()
        .parse(req.params);
      res.json(
        respuestaOk(
          await s.saldos.exportar(autenticacionDe(req), consultaSaldos.parse(req.query), formato),
        ),
      );
    },
    async permisos(req: Request, res: Response) {
      sinDatos.parse(req.query);
      res.json(respuestaOk(await s.permisos(autenticacionDe(req), idDe(req))));
    },
    async guardar(req: Request, res: Response) {
      sinDatos.parse(req.query);
      res.json(
        respuestaOk(
          await s.guardarPermisos(
            autenticacionDe(req),
            contextoDe(req).ip,
            idDe(req),
            cambiosPermisosSchema.parse(req.body),
          ),
        ),
      );
    },
  };
}
