import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { Config } from '../../config/env.schema.js';

export interface BaseDatos {
  conConexion<T>(operacion: (conexion: Connection) => Promise<T>): Promise<T>;
  cerrar(): Promise<void>;
}

export async function crearBaseDatos(config: Config): Promise<BaseDatos> {
  if (!oracledb.thin) throw new Error('nomina2 requiere node-oracledb en modo thin.');
  const pool = await oracledb.createPool({
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    connectString: config.DB_CONNECT_STRING,
    poolMin: config.DB_POOL_MIN,
    poolMax: config.DB_POOL_MAX,
    poolIncrement: config.DB_POOL_INCREMENT,
    poolTimeout: config.DB_POOL_TIMEOUT_SECONDS,
    queueTimeout: config.DB_QUEUE_TIMEOUT_MS,
    connectTimeout: config.DB_CONNECT_TIMEOUT_SECONDS,
    poolPingTimeout: config.DB_CALL_TIMEOUT_MS,
  });
  return {
    async conConexion<T>(operacion: (conexion: Connection) => Promise<T>): Promise<T> {
      const conexion = await pool.getConnection();
      conexion.callTimeout = config.DB_CALL_TIMEOUT_MS;
      try {
        return await operacion(conexion);
      } finally {
        await conexion.close();
      }
    },
    async cerrar() {
      await pool.close(5);
    },
  };
}
