import express, { Router } from 'express';
import { z } from 'zod';
import { autenticacionDe, permitirRoles } from '../../shared/security/rbac.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import { ErrorNegocio } from '../../shared/errors/errors.js';
import { crearActasController } from './actas.controller.js';
import type { crearActasService } from './actas.service.js';
export function crearActasRouter(s: ReturnType<typeof crearActasService>) {
  const r = Router(),
    c = crearActasController(s),
    gestionar = permitirRoles('RH', 'ADMIN');
  r.get('/', c.listar);
  r.get('/exportar', c.exportar);
  r.get('/reglas', gestionar, c.reglas);
  r.get('/plantilla', gestionar, c.plantilla);
  r.patch('/plantilla', gestionar, c.guardarPlantilla);
  r.get('/antecedentes/:id', gestionar, c.antecedentes);
  r.get('/adjuntos/:id', c.archivo(true));
  r.get('/:id/pdf', c.archivo());
  r.get('/:id', c.detalle);
  r.post('/', gestionar, c.guardar);
  r.patch('/:id', gestionar, c.guardar);
  r.post('/:id/estado', gestionar, c.accion);
  r.post(
    '/:id/adjuntos',
    gestionar,
    async (req, res, next) => {
      const id = z.object({ id: idSchema }).strict().parse(req.params).id;
      const reglas = await s.prepararCarga(autenticacionDe(req), id, req.query);
      if (req.get('Content-Encoding') && req.get('Content-Encoding') !== 'identity')
        throw new ErrorNegocio(
          'Envía el archivo original, sin comprimir.',
          415,
          'CODIFICACION_ARCHIVO',
        );
      if (!['application/pdf', 'image/png', 'image/jpeg'].includes(req.get('Content-Type') ?? ''))
        throw new ErrorNegocio('Solo se aceptan archivos PDF, JPG y PNG.', 415, 'TIPO_ARCHIVO');
      express.raw({ type: () => true, limit: reglas.maxMb * 1024 * 1024, inflate: false })(
        req,
        res,
        next,
      );
    },
    c.cargar,
  );
  return r;
}
