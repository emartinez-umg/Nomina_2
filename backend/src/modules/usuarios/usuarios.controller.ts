import type { Request, Response } from 'express';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { contextoDe } from '../auth/auth.controller.js';
import {
  cambiarRolSchema,
  crearUsuarioSchema,
  estadoSchema,
  restablecerSchema,
  usuarioIdSchema,
  usuariosQuerySchema,
} from './usuarios.schemas.js';
import type { crearUsuariosService } from './usuarios.service.js';

export function crearUsuariosController(service: ReturnType<typeof crearUsuariosService>) {
  return {
    async crear(req: Request, res: Response) {
      sinDatos.parse(req.query);
      const datos = crearUsuarioSchema.parse(req.body);
      res
        .status(201)
        .json(respuestaOk(await service.crear(autenticacionDe(req), contextoDe(req).ip, datos)));
    },
    async listar(req: Request, res: Response) {
      res.json(respuestaOk(await service.listar(usuariosQuerySchema.parse(req.query))));
    },
    async estado(req: Request, res: Response) {
      sinDatos.parse(req.query);
      const { id } = usuarioIdSchema.parse(req.params);
      const datos = estadoSchema.parse(req.body);
      res.json(
        respuestaOk(
          await service.modificar(autenticacionDe(req), id, contextoDe(req).ip, datos.motivo, {
            activo: datos.activo,
          }),
        ),
      );
    },
    async rol(req: Request, res: Response) {
      sinDatos.parse(req.query);
      const { id } = usuarioIdSchema.parse(req.params);
      const datos = cambiarRolSchema.parse(req.body);
      res.json(
        respuestaOk(
          await service.modificar(autenticacionDe(req), id, contextoDe(req).ip, datos.motivo, {
            rol: datos.rol,
          }),
        ),
      );
    },
    async restablecer(req: Request, res: Response) {
      sinDatos.parse(req.query);
      const { id } = usuarioIdSchema.parse(req.params);
      const datos = restablecerSchema.parse(req.body);
      res.json(
        respuestaOk(
          await service.modificar(autenticacionDe(req), id, contextoDe(req).ip, datos.motivo, {
            restablecer: true,
          }),
        ),
      );
    },
  };
}
