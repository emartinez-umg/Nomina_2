import { rangoAniosSchema } from '../calendario/calendario.schemas.js';
import {
  remuneracionesSchema,
  inasistenciasSchema,
  vacacionesTableroSchema,
  celebracionesSchema,
} from './tableros.schemas.js';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { sinDatos } from '../auth/auth.schemas.js';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import type { crearTablerosService } from './tableros.service.js';
export function crearTablerosController(s: ReturnType<typeof crearTablerosService>) {
  return async (r: Request, res: Response) => {
    sinDatos.parse(r.query);
    const { rol } = z
      .object({ rol: z.enum(['rh', 'admin', 'empleado']) })
      .strict()
      .parse(r.params);
    res.json(respuestaOk(await s.consultar(autenticacionDe(r), rol)));
  };
}

export function crearEstadisticasController(s: ReturnType<typeof crearTablerosService>) {
  return {
    async anios(req: Request, res: Response) {
      const { fuente } = rangoAniosSchema.parse(req.query);
      res.set('Cache-Control', 'private, no-store');
      res.json(respuestaOk(await s.calendario.consultar(autenticacionDe(req), fuente)));
    },
    async remuneraciones(req: Request, res: Response) {
      res.json(
        respuestaOk(
          await s.estadisticas.remuneraciones(
            autenticacionDe(req),
            remuneracionesSchema.parse(req.query),
          ),
        ),
      );
    },
    async inasistencias(req: Request, res: Response) {
      res.json(
        respuestaOk(
          await s.estadisticas.inasistencias(
            autenticacionDe(req),
            inasistenciasSchema.parse(req.query),
          ),
        ),
      );
    },
    async vacaciones(req: Request, res: Response) {
      res.json(
        respuestaOk(
          await s.estadisticas.vacaciones(
            autenticacionDe(req),
            vacacionesTableroSchema.parse(req.query),
          ),
        ),
      );
    },
    async celebraciones(req: Request, res: Response) {
      celebracionesSchema.parse(req.query);
      res.json(respuestaOk(await s.estadisticas.celebraciones(autenticacionDe(req))));
    },
  };
}
