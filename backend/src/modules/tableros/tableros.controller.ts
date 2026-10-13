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
