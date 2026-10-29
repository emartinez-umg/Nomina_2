import express, { Router } from 'express';
import { z } from 'zod';
import { ErrorNegocio } from '../../shared/errors/errors.js';
import { cargaExpedienteSchema } from './expedientes.schemas.js';
import { autenticacionDe, permitirRoles } from '../../shared/security/rbac.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { crearExpedientesController } from './expedientes.controller.js';
import type { crearExpedientesService } from './expedientes.service.js';
export function crearExpedientesRouter(s: ReturnType<typeof crearExpedientesService>) {
  const r = Router(),
    c = crearExpedientesController(s);
  r.get('/mio', permitirRoles('EMPLEADO'), c.propio);
  r.get('/empleados/:id', c.listar);
  r.post(
    '/empleados/:id',
    permitirRoles('ADMIN', 'RH'),
    async (req, res, next) => {
      const id = z.object({ id: idSchema }).strict().parse(req.params).id;
      cargaExpedienteSchema.parse(req.query);
      if (req.get('Content-Encoding') && req.get('Content-Encoding') !== 'identity')
        throw new ErrorNegocio(
          'Envía el archivo original, sin comprimir.',
          415,
          'CODIFICACION_ARCHIVO',
        );
      if (!['application/pdf', 'image/png', 'image/jpeg'].includes(req.get('Content-Type') ?? ''))
        throw new ErrorNegocio('Solo se aceptan archivos PDF, JPG y PNG.', 415, 'TIPO_ARCHIVO');
      const reglas = await s.prepararCarga(autenticacionDe(req), id);
      express.raw({ type: () => true, limit: reglas.maxMb * 1024 * 1024, inflate: false })(
        req,
        res,
        next,
      );
    },
    c.cargar,
  );
  r.get('/documentos/:id', c.archivo);
  r.post('/documentos/:id/baja', permitirRoles('ADMIN', 'RH'), c.baja);
  r.patch('/tipos/:id', permitirRoles('ADMIN', 'RH'), c.tipo);
  return r;
}
