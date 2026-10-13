import { crearVacacionesService } from './modules/vacaciones/vacaciones.service.js';
import { once } from 'node:events';
import { crearApp } from './app.js';
import { config } from './config/env.js';
import { crearLogger } from './config/logger.js';
import { crearSaludRepository } from './modules/salud/salud.repository.js';
import { crearSaludService } from './modules/salud/salud.service.js';
import { crearBaseDatos } from './shared/db/pool.js';
import type { BaseDatos } from './shared/db/pool.js';
import { crearAuthService } from './modules/auth/auth.service.js';
import { crearUsuariosService } from './modules/usuarios/usuarios.service.js';
import { crearAuditoriaService } from './modules/auditoria/auditoria.service.js';

import { crearCatalogosService } from './modules/catalogos/catalogos.service.js';

import { crearEmpleadosService } from './modules/empleados/empleados.service.js';
import { crearNovedadesService } from './modules/novedades/novedades.service.js';

const logger = crearLogger(config.LOG_LEVEL);
let db: BaseDatos | undefined;

try {
  const baseDatos = await crearBaseDatos(config);
  db = baseDatos;
  const service = crearSaludService(crearSaludRepository(baseDatos), logger);
  await service.consultar();
  const auth = await crearAuthService(baseDatos, config);
  const server = crearApp(service, logger, {
    auth,
    empleados: crearEmpleadosService(baseDatos),
    novedades: crearNovedadesService(baseDatos),
    vacaciones: crearVacacionesService(baseDatos),
    catalogos: crearCatalogosService(baseDatos),
    usuarios: crearUsuariosService(baseDatos),
    auditoria: crearAuditoriaService(baseDatos),
    config,
  }).listen(config.PORT, config.HOST);
  await once(server, 'listening');
  logger.info({ puerto: config.PORT, modoOracle: 'thin' }, 'API de nomina2 lista');

  let cerrando = false;
  const cerrar = () => {
    if (cerrando) return;
    cerrando = true;
    const limite = setTimeout(() => {
      logger.fatal('Se agotó el tiempo de cierre ordenado');
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS).unref();
    server.close(() => {
      void baseDatos
        .cerrar()
        .then(() => {
          clearTimeout(limite);
          logger.info('API y pool de Oracle cerrados');
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, 'Falló el cierre del pool');
          process.exitCode = 1;
        });
    });
  };
  process.on('SIGTERM', cerrar);
  process.on('SIGINT', cerrar);
} catch (error) {
  logger.fatal({ err: error }, 'No se pudo iniciar la API');
  await db?.cerrar();
  process.exitCode = 1;
}
