import type { Connection } from 'oracledb';

export function crearSeedsRepository(conexion: Connection) {
  return {
    async ejecutar(sql: string) {
      await conexion.execute(sql);
    },
    async buscarAdmin(usuario: string) {
      const resultado = await conexion.execute<[number, string]>(
        `SELECT U.ID_USUARIO, R.CODIGO FROM USUARIOS U
         JOIN ROLES R ON R.ID_ROL = U.ID_ROL WHERE U.USUARIO = :usuario FOR UPDATE OF U.ID_ROL`,
        { usuario },
      );
      return resultado.rows?.[0];
    },
    async crearAdmin(usuario: string, correo: string, hash: string) {
      await conexion.execute(
        `INSERT INTO USUARIOS (ID_ROL, USUARIO, CORREO, CONTRASENA_HASH, CAMBIO_OBLIGATORIO)
         SELECT ID_ROL, :usuario, :correo, :hash, 1 FROM ROLES WHERE CODIGO = 'ADMIN'`,
        { usuario, correo, hash },
      );
      await conexion.execute(
        `INSERT INTO BITACORA_AUDITORIA
         (ID_USUARIO, ID_ROL, ROL_CODIGO, ACCION, ENTIDAD, ID_ENTIDAD, MOTIVO)
         SELECT ID_USUARIO, ID_ROL, 'ADMIN', 'INSTALACION_ADMIN', 'USUARIOS', ID_USUARIO,
         'Creación inicial mediante variables de entorno; cambio obligatorio de contraseña.'
         FROM USUARIOS WHERE USUARIO = :usuario`,
        { usuario },
      );
    },
    confirmar: () => conexion.commit(),
    revertir: () => conexion.rollback(),
  };
}

export type SeedsRepository = ReturnType<typeof crearSeedsRepository>;
