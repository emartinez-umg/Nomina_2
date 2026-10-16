import type { Request, Response } from 'express';
import type { crearCodigosService } from './codigos.service.js';
import { vistaPreviaSchema } from './codigos.schemas.js';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { ErrorProhibido } from '../../shared/errors/errors.js';
import { respuestaOk } from '../../shared/utils/respuesta.js';
export function crearCodigosController(service: ReturnType<typeof crearCodigosService>) {
  return {
    async vistaPrevia(req: Request, res: Response) {
      const q = vistaPreviaSchema.parse(req.query);
      if (autenticacionDe(req).rol === 'EMPLEADO' && q.entidad !== 'solicitudes')
        throw new ErrorProhibido();
      res.setHeader('Cache-Control', 'no-store');
      res.json(respuestaOk(await service.vistaPrevia(q)));
    },
  };
}
