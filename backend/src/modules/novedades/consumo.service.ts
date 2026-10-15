import type { Connection } from 'oracledb';
import type { ActorAuditoria } from '../auth/auth.types.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { ErrorConflicto, ErrorProhibido } from '../../shared/errors/errors.js';
import { pendientes } from './pendientes.repository.js';
import { filas, n } from './mensuales.repository.js';
import { rangoMes } from './mensuales.service.js';
import { cerrados } from './novedades.repository.js';
// Primitiva para V1-10: el servicio de pago controla la transacción, sin endpoint de aplicación manual.
export async function aplicarNovedades(
  c: Connection,
  a: ActorAuditoria,
  idPago: number,
  ids: number[],
) {
  if (!['ADMIN', 'RH'].includes(a.rol)) throw new ErrorProhibido();
  await bloquearCatalogos(c, true);
  const pago = (
    await filas<{ empleado: number; mes: string; estado: string }>(
      c,
      'SELECT N.ID_EMPLEADO "empleado",TO_CHAR(P.FECHA_INICIO,\'YYYY-MM\') "mes",P.ESTADO "estado" FROM NOMINA_EMPLEADO N JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA WHERE N.ID_NOMINA_EMPLEADO=:id',
      { id: idPago },
    )
  )[0];
  if (!pago || pago.estado === 'CERRADO')
    throw new ErrorConflicto('El pago no existe o su periodo está cerrado.');
  if (new Set(ids).size !== ids.length)
    throw new ErrorConflicto('No repitas novedades en el pago.');
  for (const id of ids) {
    const d = (
      await filas<{
        empleado: number;
        mes: string;
        estado: string;
        autorizacion: string;
        activo: number;
        monto: string | null;
      }>(
        c,
        'SELECT ID_EMPLEADO "empleado",TO_CHAR(MES,\'YYYY-MM\') "mes",ESTADO "estado",AUTORIZACION "autorizacion",ACTIVO "activo",TO_CHAR(MONTO) "monto" FROM NOVEDADES_MENSUALES WHERE ID_NOVEDAD_MENSUAL=:id FOR UPDATE',
        { id },
      )
    )[0];
    if (d && d.monto === null) {
      const ready = (await prepararNovedadesParaPago(c, pago.mes, pago.empleado)).find(
        (n) => n.id === id,
      );
      if (ready?.monto !== null && ready?.monto !== undefined) {
        await c.execute(
          `UPDATE NOVEDADES_MENSUALES SET MONTO=${n('monto')} WHERE ID_NOVEDAD_MENSUAL=:id`,
          { id, monto: ready.monto },
        );
        d.monto = ready.monto;
      }
    }
    if (
      !d ||
      d.empleado !== pago.empleado ||
      d.mes > pago.mes ||
      d.estado !== 'PENDIENTE' ||
      d.autorizacion !== 'APROBADA' ||
      !d.activo ||
      d.monto === null
    )
      throw new ErrorConflicto(
        'La novedad no está lista, pertenece a otro empleado/mes o ya fue aplicada.',
      );
    const r = rangoMes(d.mes);
    if (await cerrados(c, r.inicio, r.fin))
      throw new ErrorConflicto('La novedad pertenece a un mes cerrado.');
    await c.execute(
      "UPDATE NOVEDADES_MENSUALES SET ESTADO='APLICADA',ID_NOMINA_EMPLEADO=:pago,MODIFICADO_POR=:actor WHERE ID_NOVEDAD_MENSUAL=:id",
      { id, pago: idPago, actor: a.idUsuario },
    );
    await registrarAuditoria(c, {
      actor: a,
      accion: 'APLICAR_NOVEDAD',
      entidad: 'NOVEDADES_MENSUALES',
      idEntidad: id,
      antes: d,
      despues: { estado: 'APLICADA', idPago },
      motivo: 'Aplicación transaccional desde pago',
    });
  }
}
export async function materializarParqueo(
  c: Connection,
  a: ActorAuditoria,
  mes: string,
  idEmpleado: number,
) {
  if (!['ADMIN', 'RH'].includes(a.rol)) throw new ErrorProhibido();
  await bloquearCatalogos(c, true);
  const proyeccion = (await pendientes(c, mes, idEmpleado)).filter(
    (d) => d.tipo === 'PARQUEO' && d.id === null,
  );
  for (const d of proyeccion) {
    if (d.monto === null)
      throw new ErrorConflicto(`Completa vehículo y tarifa de parqueo para ${d.mes}.`);
    await c.execute(
      `INSERT INTO NOVEDADES_MENSUALES(ID_EMPLEADO,TIPO,MES,CANTIDAD,MONTO,DESCRIPCION,ID_PARQUEO_SUSCRIPCION,CREADO_POR) VALUES(:empleado,'PARQUEO',TO_DATE(:mes||'-01','YYYY-MM-DD'),1,${n('monto')},:descripcion,:suscripcion,:actor)`,
      {
        empleado: idEmpleado,
        mes: d.mes,
        monto: d.monto,
        descripcion: d.descripcion,
        suscripcion: d.idSuscripcion,
        actor: a.idUsuario,
      },
    );
  }
  return (await pendientes(c, mes, idEmpleado)).filter((d) => d.tipo === 'PARQUEO');
}

// Valora históricos que v0 guardaba sin monto, sin escribir durante consultas ni simulaciones.
export async function prepararNovedadesParaPago(c: Connection, mes: string, idEmpleado?: number) {
  const items = await pendientes(c, mes, idEmpleado);
  const { valorarMes } = await import('./mensuales.service.js');
  return Promise.all(
    items.map(async (d) => {
      if (d.tipo === 'HORAS_EXTRA' && d.monto === null) {
        try {
          const v = await valorarMes(c, {
            idEmpleado: d.idEmpleado,
            mes: d.mes,
            horas: d.cantidad,
            ...(d.id ? { id: d.id } : {}),
          });
          return { ...d, monto: v.calculo.monto, advertencia: v.advertencia };
        } catch (e) {
          if (e instanceof ErrorConflicto) return { ...d, advertencia: e.message };
          throw e;
        }
      }
      return { ...d, advertencia: null };
    }),
  );
}
