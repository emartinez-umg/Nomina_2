import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type { ActorAuditoria } from '../auth/auth.types.js';
import type { AuditoriaQuery } from './auditoria.schemas.js';

export interface RegistroAuditoria {
  actor: ActorAuditoria | null;
  accion: string;
  entidad: string;
  idEntidad: number | null;
  antes?: unknown;
  despues?: unknown;
  motivo?: string;
  ip?: string;
}
export async function insertarAuditoria(c: Connection, registro: RegistroAuditoria) {
  await c.execute(
    `INSERT INTO BITACORA_AUDITORIA
    (ID_USUARIO, ID_ROL, ROL_CODIGO, ACCION, ENTIDAD, ID_ENTIDAD,
     VALORES_ANTERIORES, VALORES_NUEVOS, MOTIVO, IP, CREADO_POR)
    VALUES (:usuario, :rol, :codigo, :accion, :entidad, :id, :antes, :despues, :motivo, :ip, :usuario)`,
    {
      usuario: registro.actor?.idUsuario ?? null,
      rol: registro.actor?.idRol ?? null,
      codigo: registro.actor?.rol ?? null,
      accion: registro.accion,
      entidad: registro.entidad,
      id: registro.idEntidad,
      antes: {
        val: registro.antes === undefined ? null : JSON.stringify(registro.antes),
        type: oracledb.CLOB,
      },
      despues: {
        val: registro.despues === undefined ? null : JSON.stringify(registro.despues),
        type: oracledb.CLOB,
      },
      motivo: registro.motivo ?? null,
      ip: registro.actor?.ip ?? registro.ip ?? null,
    },
  );
}
export async function listarAuditoria(c: Connection, q: AuditoriaQuery) {
  const filtros = {
    usuario: q.usuario ?? null,
    rol: q.rol ?? null,
    idEntidad: q.idEntidad ?? null,
    ip: q.ip ?? null,
    entidad: q.entidad ?? null,
    accion: q.accion ?? null,
    desde: q.desde ?? null,
    hasta: q.hasta ?? null,
  };
  const total = await c.execute<{ TOTAL: number }>(
    `SELECT COUNT(*) TOTAL FROM BITACORA_AUDITORIA
    WHERE (:usuario IS NULL OR ID_USUARIO = :usuario) AND (:entidad IS NULL OR ENTIDAD = :entidad)
    AND (:rol IS NULL OR ROL_CODIGO=:rol) AND (:idEntidad IS NULL OR ID_ENTIDAD=:idEntidad) AND (:ip IS NULL OR IP=:ip) AND (:accion IS NULL OR ACCION = :accion) AND (:desde IS NULL OR FECHA >= TO_DATE(:desde, 'YYYY-MM-DD'))
    AND (:hasta IS NULL OR FECHA < TO_DATE(:hasta, 'YYYY-MM-DD') + 1)`,
    filtros,
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const filas = await c.execute(
    `SELECT ID_BITACORA_AUDITORIA "id", ID_USUARIO "idUsuario",
    ROL_CODIGO "rol", ACCION "accion", ENTIDAD "entidad", ID_ENTIDAD "idEntidad",
    VALORES_ANTERIORES "antes", VALORES_NUEVOS "despues", MOTIVO "motivo", IP "ip",
    TO_CHAR(FECHA, 'YYYY-MM-DD"T"HH24:MI:SS') || '-06:00' "fecha" FROM BITACORA_AUDITORIA
    WHERE (:usuario IS NULL OR ID_USUARIO = :usuario) AND (:entidad IS NULL OR ENTIDAD = :entidad)
    AND (:rol IS NULL OR ROL_CODIGO=:rol) AND (:idEntidad IS NULL OR ID_ENTIDAD=:idEntidad) AND (:ip IS NULL OR IP=:ip) AND (:accion IS NULL OR ACCION = :accion) AND (:desde IS NULL OR FECHA >= TO_DATE(:desde, 'YYYY-MM-DD'))
    AND (:hasta IS NULL OR FECHA < TO_DATE(:hasta, 'YYYY-MM-DD') + 1)
    ORDER BY CASE WHEN :orden = 'fecha' AND :direccion = 'asc' THEN FECHA END ASC,
      CASE WHEN :orden = 'fecha' AND :direccion = 'desc' THEN FECHA END DESC,
      CASE WHEN :direccion = 'asc' THEN ID_BITACORA_AUDITORIA END ASC,
      CASE WHEN :direccion = 'desc' THEN ID_BITACORA_AUDITORIA END DESC
    OFFSET :inicio ROWS FETCH NEXT :limite ROWS ONLY`,
    {
      ...filtros,
      orden: q.ordenarPor,
      direccion: q.direccion,
      inicio: (q.pagina - 1) * q.limite,
      limite: q.limite,
    },
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo: { antes: { type: oracledb.STRING }, despues: { type: oracledb.STRING } },
    },
  );
  const registros = (
    (filas.rows as {
      id: number;
      idUsuario: number | null;
      rol: string | null;
      accion: string;
      entidad: string;
      idEntidad: number | null;
      motivo: string | null;
      ip: string | null;
      fecha: string;
      antes: string | null;
      despues: string | null;
    }[]) ?? []
  ).map((fila) => ({
    ...fila,
    antes: fila.antes ? (JSON.parse(fila.antes) as unknown) : null,
    despues: fila.despues ? (JSON.parse(fila.despues) as unknown) : null,
  }));
  return { registros, total: total.rows?.[0]?.TOTAL ?? 0, pagina: q.pagina, limite: q.limite };
}
