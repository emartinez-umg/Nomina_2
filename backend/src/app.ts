import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { Logger } from 'pino';
import { crearSaludRouter } from './modules/salud/salud.routes.js';
import type { SaludService } from './modules/salud/salud.types.js';
import { ErrorNoEncontrado } from './shared/errors/errors.js';
import { manejarErrores } from './shared/middleware/error-handler.js';
import { registrarPeticiones } from './shared/middleware/request-logger.js';
import { crearAuthRouter } from './modules/auth/auth.routes.js';
import type { AuthService, ConfigSeguridad } from './modules/auth/auth.service.js';
import { crearUsuariosRouter } from './modules/usuarios/usuarios.routes.js';
import type { crearUsuariosService } from './modules/usuarios/usuarios.service.js';
import { crearAuditoriaRouter } from './modules/auditoria/auditoria.routes.js';
import type { crearAuditoriaService } from './modules/auditoria/auditoria.service.js';
import { autenticar } from './shared/security/autenticar.js';
import { exigirCambioCompletado, permitirRoles } from './shared/security/rbac.js';
import { ErrorNoAutorizado } from './shared/errors/errors.js';

import { crearCatalogosRouter } from './modules/catalogos/catalogos.routes.js';
import type { crearCatalogosService } from './modules/catalogos/catalogos.service.js';

import { crearEmpleadosRouter } from './modules/empleados/empleados.routes.js';
import type { crearEmpleadosService } from './modules/empleados/empleados.service.js';
import { crearNovedadesRouter } from './modules/novedades/novedades.routes.js';
import type { crearNovedadesService } from './modules/novedades/novedades.service.js';

import { crearVacacionesRouter } from './modules/vacaciones/vacaciones.routes.js';
import type { crearVacacionesService } from './modules/vacaciones/vacaciones.service.js';

interface SeguridadApp {
  vacaciones?: ReturnType<typeof crearVacacionesService>;
  novedades?: ReturnType<typeof crearNovedadesService>;
  empleados?: ReturnType<typeof crearEmpleadosService>;
  catalogos?: ReturnType<typeof crearCatalogosService>;
  auth: AuthService;
  usuarios: ReturnType<typeof crearUsuariosService>;
  auditoria: ReturnType<typeof crearAuditoriaService>;
  config: ConfigSeguridad;
}

export function crearApp(service: SaludService, logger: Logger, seguridad?: SeguridadApp) {
  const app = express();
  app.disable('x-powered-by');
  if (seguridad?.config.TRUST_PROXY_CIDRS) {
    app.set(
      'trust proxy',
      seguridad.config.TRUST_PROXY_CIDRS.split(',').map((rango) => rango.trim()),
    );
  }
  app.use(helmet());
  app.use(registrarPeticiones(logger));
  app.use('/api/empleados/cargas', express.json({ limit: '2mb' }));
  app.use('/api/novedades/ausencias', express.json({ limit: '1500kb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api/salud', crearSaludRouter(service));
  if (seguridad) {
    app.use('/api/auth', crearAuthRouter(seguridad.auth, seguridad.config));
    app.use(
      '/api',
      autenticar(seguridad.auth),
      permitirRoles('ADMIN', 'RH', 'EMPLEADO'),
      exigirCambioCompletado,
    );
    if (seguridad.vacaciones)
      app.use('/api/vacaciones', crearVacacionesRouter(seguridad.vacaciones));
    if (seguridad.empleados) app.use('/api/empleados', crearEmpleadosRouter(seguridad.empleados));
    if (seguridad.novedades) app.use('/api/novedades', crearNovedadesRouter(seguridad.novedades));
    if (seguridad.catalogos) app.use('/api/catalogos', crearCatalogosRouter(seguridad.catalogos));
    app.use('/api/usuarios', crearUsuariosRouter(seguridad.usuarios));
    app.use('/api/auditoria', crearAuditoriaRouter(seguridad.auditoria));
  } else {
    app.use('/api', () => {
      throw new ErrorNoAutorizado();
    });
  }
  app.use(() => {
    throw new ErrorNoEncontrado();
  });
  app.use(manejarErrores(logger));
  return app;
}
