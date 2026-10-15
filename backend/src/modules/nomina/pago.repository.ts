import { ErrorConflicto } from '../../shared/errors/errors.js';
import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import { filas, num } from '../novedades/mensuales.repository.js';
import { prepararNovedadesParaPago } from '../novedades/consumo.service.js';
import type { Pendiente } from '../novedades/pendientes.repository.js';
import type { Periodo } from './nomina.types.js';
import type { TipoPago } from './pago.calculo.js';
export async function periodoMes(c: Connection, mes: string, tipo: TipoPago) {
  return (
    await filas<Periodo>(
      c,
      `SELECT ID_PERIODO_NOMINA "id",TO_CHAR(FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(FECHA_FIN,'YYYY-MM-DD') "fin",ESTADO "estado",MOTOR "motor",VERSION_CALCULO "version",DBMS_LOB.SUBSTR(ALERTAS,4000,1) "alertas",HASH_FUENTES "hash" FROM PERIODOS_NOMINA WHERE FECHA_INICIO=TO_DATE(:mes||:dia,'YYYY-MM-DD') AND ACTIVO=1`,
      { mes, dia: tipo === 'ANTICIPO' ? '-01' : '-16' },
    )
  )[0];
}
export async function pagosMes(c: Connection, mes: string) {
  return filas<{ empleado: number; tipo: TipoPago; nomina: number; neto: string }>(
    c,
    `SELECT PN.ID_EMPLEADO "empleado",PN.TIPO_PAGO "tipo",PN.ID_NOMINA_EMPLEADO "nomina",${num('N.NETO')} "neto" FROM PAGOS_NOMINA PN JOIN NOMINA_EMPLEADO N ON N.ID_NOMINA_EMPLEADO=PN.ID_NOMINA_EMPLEADO WHERE PN.MES=TO_DATE(:mes||'-01','YYYY-MM-DD') AND PN.ESTADO='PAGADO' ORDER BY PN.ID_EMPLEADO,PN.TIPO_PAGO`,
    { mes },
  );
}
export async function novedades(c: Connection, mes: string, id: number) {
  const pendientes = await prepararNovedadesParaPago(c, mes, id);
  const anticipadas = await filas<Pendiente>(
    c,
    `SELECT M.ID_NOVEDAD_MENSUAL "id",M.ID_EMPLEADO "idEmpleado",M.TIPO "tipo",TO_CHAR(M.MES,'YYYY-MM') "mes",${num('M.CANTIDAD')} "cantidad",${num('M.MONTO')} "monto",M.AUTORIZACION "autorizacion",M.ID_PARQUEO_SUSCRIPCION "idSuscripcion",M.DESCRIPCION "descripcion" FROM NOVEDADES_MENSUALES M JOIN PAGOS_NOMINA PN ON PN.ID_NOMINA_EMPLEADO=M.ID_NOMINA_EMPLEADO WHERE M.ID_EMPLEADO=:id AND PN.MES=TO_DATE(:mes||'-01','YYYY-MM-DD') AND PN.TIPO_PAGO='ANTICIPO' AND PN.ESTADO='PAGADO' AND M.ESTADO='APLICADA' ORDER BY M.ID_NOVEDAD_MENSUAL`,
    { id, mes },
  );
  return [...pendientes, ...anticipadas.map((n) => ({ ...n, advertencia: null }))].sort(
    (a, b) => (a.id ?? 0) - (b.id ?? 0) || a.mes.localeCompare(b.mes),
  );
}
export async function siguienteVersion(c: Connection, periodo: number, empleado: number) {
  return (
    await filas<{ v: number }>(
      c,
      'SELECT NVL(MAX(VERSION_CALCULO),0)+1 "v" FROM NOMINA_EMPLEADO WHERE ID_PERIODO_NOMINA=:periodo AND ID_EMPLEADO=:empleado',
      { periodo, empleado },
    )
  )[0]!.v;
}
export async function registrarPago(
  c: Connection,
  id: number,
  empleado: number,
  mes: string,
  tipo: TipoPago,
  actor: number,
) {
  const r = await c.execute(
    `MERGE INTO PAGOS_NOMINA P USING(SELECT :empleado ID_EMPLEADO,TO_DATE(:mes||'-01','YYYY-MM-DD') MES,:tipo TIPO_PAGO FROM DUAL) O ON(P.ID_EMPLEADO=O.ID_EMPLEADO AND P.MES=O.MES AND P.TIPO_PAGO=O.TIPO_PAGO) WHEN MATCHED THEN UPDATE SET P.ID_NOMINA_EMPLEADO=:id,P.ESTADO='PAGADO',P.MODIFICADO_POR=:actor,P.FECHA_MODIFICACION=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE) WHERE P.ESTADO='REVERTIDO' WHEN NOT MATCHED THEN INSERT(ID_EMPLEADO,MES,TIPO_PAGO,ID_NOMINA_EMPLEADO,CREADO_POR) VALUES(:empleado,TO_DATE(:mes||'-01','YYYY-MM-DD'),:tipo,:id,:actor)`,
    { id, empleado, mes, tipo, actor },
  );
  if (r.rowsAffected !== 1)
    throw new ErrorConflicto(
      'El empleado ya tiene este pago registrado; no se permite pagarlo dos veces.',
    );
}
export async function archivarBoleta(
  c: Connection,
  id: number,
  pdf: Buffer,
  hash: string,
  actor: number,
) {
  await c.execute(
    'INSERT INTO BOLETAS_PAGO(ID_NOMINA_EMPLEADO,CONTENIDO_PDF,SHA256,CREADO_POR) VALUES(:id,:pdf,:hash,:actor)',
    { id, pdf: { val: pdf, type: oracledb.BLOB }, hash, actor },
  );
}
export async function boletaArchivada(c: Connection, id: number) {
  const r = await c.execute<{ pdf: Buffer }>(
    'SELECT CONTENIDO_PDF "pdf" FROM BOLETAS_PAGO WHERE ID_NOMINA_EMPLEADO=:id',
    { id },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { pdf: { type: oracledb.BUFFER } } },
  );
  return r.rows?.[0]?.pdf;
}
export async function notificar(
  c: Connection,
  id: number,
  usuario: number,
  actor: number,
  reversion = false,
) {
  await c.execute(
    `INSERT INTO NOTIFICACIONES(ID_USUARIO,TIPO,TITULO,MENSAJE,CLAVE_EVENTO,CREADO_POR) VALUES(:usuario,'DOCUMENTO_ENTREGADO',:titulo,:mensaje,:clave,:actor)`,
    {
      usuario,
      actor,
      titulo: reversion ? 'Pago revertido' : 'Nueva boleta de pago',
      mensaje: reversion
        ? 'ADMIN revirtió el pago. Consulta a RRHH.'
        : `Tu boleta ${id} está disponible en Mis gestiones → Boletas (/mis-gestiones/boletas).`,
      clave: `NOMINA:${id}:${reversion ? 'REVERSO' : 'PAGO'}`,
    },
  );
}
export async function pagoPorNomina(c: Connection, id: number) {
  return (
    await filas<{
      id: number;
      empleado: number;
      mes: string;
      tipo: TipoPago;
      estado: string;
      periodo: number;
    }>(
      c,
      `SELECT PN.ID_PAGO_NOMINA "id",PN.ID_EMPLEADO "empleado",TO_CHAR(PN.MES,'YYYY-MM') "mes",PN.TIPO_PAGO "tipo",PN.ESTADO "estado",N.ID_PERIODO_NOMINA "periodo" FROM PAGOS_NOMINA PN JOIN NOMINA_EMPLEADO N ON N.ID_NOMINA_EMPLEADO=PN.ID_NOMINA_EMPLEADO WHERE PN.ID_NOMINA_EMPLEADO=:id FOR UPDATE`,
      { id },
    )
  )[0];
}
export async function dependenciaPosterior(
  c: Connection,
  empleado: number,
  mes: string,
  tipo: TipoPago,
) {
  return (
    (
      await filas(
        c,
        `SELECT 1 FROM PAGOS_NOMINA WHERE ID_EMPLEADO=:empleado AND ESTADO='PAGADO' AND (MES>TO_DATE(:mes||'-01','YYYY-MM-DD') OR (MES=TO_DATE(:mes||'-01','YYYY-MM-DD') AND TIPO_PAGO='PAGO' AND :tipo='ANTICIPO'))`,
        { empleado, mes, tipo },
      )
    ).length > 0
  );
}
export async function revertir(c: Connection, id: number, actor: number, motivo: string) {
  await c.execute(
    "UPDATE NOVEDADES_MENSUALES SET ESTADO='PENDIENTE',ID_NOMINA_EMPLEADO=NULL,MODIFICADO_POR=:actor WHERE ID_NOMINA_EMPLEADO=:id",
    { id, actor },
  );
  await c.execute(
    "UPDATE PAGOS_NOMINA SET ESTADO='REVERTIDO',MOTIVO_REVERSION=:motivo,REVERTIDO_POR=:actor,REVERTIDO_EN=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),MODIFICADO_POR=:actor WHERE ID_NOMINA_EMPLEADO=:id",
    { id, actor, motivo },
  );
}
export async function actualizarValorAplicado(
  c: Connection,
  id: number,
  monto: string,
  actor: number,
) {
  await c.execute(
    "UPDATE NOVEDADES_MENSUALES SET MONTO=TO_NUMBER(:monto,'999999999999999999D999999','NLS_NUMERIC_CHARACTERS=''.,'''),MODIFICADO_POR=:actor WHERE ID_NOVEDAD_MENSUAL=:id AND ESTADO='PENDIENTE'",
    { id, monto, actor },
  );
}
