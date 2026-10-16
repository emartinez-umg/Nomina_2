import { crearEmpresaRouter } from './modules/empresa/empresa.routes.js';
import type { crearEmpresaService } from './modules/empresa/empresa.service.js';
import { crearCodigosRouter } from './modules/codigos/codigos.routes.js';
import { crearUbicacionesRouter } from './modules/ubicaciones/ubicaciones.routes.js';
import type { crearUbicacionesService } from './modules/ubicaciones/ubicaciones.service.js';
import type { crearCodigosService } from './modules/codigos/codigos.service.js';
import { crearComunicacionRouter } from './modules/comunicacion/comunicacion.routes.js';
import type { crearComunicacionService } from './modules/comunicacion/comunicacion.service.js';
import { crearTablerosRouter } from './modules/tableros/tableros.routes.js';
import type { crearTablerosService } from './modules/tableros/tableros.service.js';
import { crearPrestacionesRouter } from './modules/prestaciones/prestaciones.routes.js';
import {
  crearSolicitudesRouter,
  crearNotificacionesRouter,
} from './modules/solicitudes/solicitudes.routes.js';
import type { crearSolicitudesService } from './modules/solicitudes/solicitudes.service.js';
import type { crearPrestacionesService } from './modules/prestaciones/prestaciones.service.js';
import { crearNominaRouter } from './modules/nomina/nomina.routes.js';
import type { crearNominaService } from './modules/nomina/nomina.service.js';
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
  empresa?: ReturnType<typeof crearEmpresaService>;
  ubicaciones?: ReturnType<typeof crearUbicacionesService>;
  codigos?: ReturnType<typeof crearCodigosService>;
  comunicacion?: ReturnType<typeof crearComunicacionService>;
  tableros?: ReturnType<typeof crearTablerosService>;
  solicitudes?: ReturnType<typeof crearSolicitudesService>;
  prestaciones?: ReturnType<typeof crearPrestacionesService>;
  nomina?: ReturnType<typeof crearNominaService>;
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
  app.use('/api/empresa', express.json({ limit: '3mb' }));
  app.use('/api/nomina/igss/formato', express.json({ limit: '4mb' }));
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
    if (seguridad.empresa) app.use('/api/empresa', crearEmpresaRouter(seguridad.empresa));
    if (seguridad.codigos) app.use('/api/codigos', crearCodigosRouter(seguridad.codigos));
    if (seguridad.ubicaciones)
      app.use('/api/ubicaciones', crearUbicacionesRouter(seguridad.ubicaciones));
    if (seguridad.comunicacion)
      app.use('/api/comunicacion', crearComunicacionRouter(seguridad.comunicacion));
    if (seguridad.tableros) app.use('/api/tableros', crearTablerosRouter(seguridad.tableros));
    if (seguridad.prestaciones)
      app.use('/api/prestaciones', crearPrestacionesRouter(seguridad.prestaciones));
    if (seguridad.solicitudes) {
      app.use('/api/solicitudes', crearSolicitudesRouter(seguridad.solicitudes));
      app.use('/api/notificaciones', crearNotificacionesRouter(seguridad.solicitudes));
    }
    if (seguridad.nomina) app.use('/api/nomina', crearNominaRouter(seguridad.nomina));
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
