import type { Connection } from 'oracledb';
import type { Migracion } from './migraciones.archivos.js';

export type VersionAplicada = [version: number, archivo: string, checksum: string, estado: string];

export interface MigracionesRepository {
  preparar(): Promise<void>;
  listar(): Promise<VersionAplicada[]>;
  iniciar(migracion: Migracion): Promise<void>;
  ejecutar(sql: string): Promise<void>;
  completar(version: number): Promise<void>;
  fallar(version: number): Promise<void>;
}

export function crearMigracionesRepository(conexion: Connection): MigracionesRepository {
  return {
    async preparar() {
      await conexion.execute(`
        BEGIN
          EXECUTE IMMEDIATE 'CREATE TABLE VERSION_ESQUEMA (
            ID_VERSION_ESQUEMA NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            VERSION NUMBER(6) NOT NULL UNIQUE,
            ARCHIVO VARCHAR2(200) NOT NULL,
            CHECKSUM CHAR(64) NOT NULL,
            ESTADO VARCHAR2(10) NOT NULL CHECK (ESTADO IN (''APLICANDO'', ''APLICADA'', ''FALLIDA'')),
            FECHA_CREACION TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
            FECHA_APLICACION TIMESTAMP WITH TIME ZONE
          )';
        EXCEPTION
          WHEN OTHERS THEN
            IF SQLCODE != -955 THEN RAISE; END IF;
        END;`);
    },
    async listar() {
      const resultado = await conexion.execute<VersionAplicada>(
        'SELECT VERSION, ARCHIVO, CHECKSUM, ESTADO FROM VERSION_ESQUEMA ORDER BY VERSION',
      );
      return resultado.rows ?? [];
    },
    async iniciar(migracion) {
      // El registro previo evita repetir automáticamente un DDL parcialmente aplicado.
      await conexion.execute(
        `INSERT INTO VERSION_ESQUEMA (VERSION, ARCHIVO, CHECKSUM, ESTADO)
         VALUES (:version, :archivo, :checksum, 'APLICANDO')`,
        { version: migracion.version, archivo: migracion.archivo, checksum: migracion.checksum },
        { autoCommit: true },
      );
    },
    async ejecutar(sql) {
      await conexion.execute(sql);
    },
    async completar(version) {
      await conexion.execute(
        `UPDATE VERSION_ESQUEMA SET ESTADO = 'APLICADA', FECHA_APLICACION = SYSTIMESTAMP
         WHERE VERSION = :version`,
        { version },
        { autoCommit: true },
      );
    },
    async fallar(version) {
      await conexion.rollback();
      await conexion.execute(
        "UPDATE VERSION_ESQUEMA SET ESTADO = 'FALLIDA' WHERE VERSION = :version",
        { version },
        { autoCommit: true },
      );
    },
  };
}
