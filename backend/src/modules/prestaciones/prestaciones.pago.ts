import type { Connection } from 'oracledb';
import type { ActorAuditoria } from '../auth/auth.types.js';
import { guardarFirma } from '../empresa/empresa.repository.js';
import type { FirmaDocumento } from '../../shared/pdf/documento.js';
import type { EntradaPago, ResultadoPago } from '../nomina/pago.calculo.js';
import { vigente } from '../nomina/nomina.calculo.js';
import { valor } from './prestaciones.calculo.js';
import * as repo from './prestaciones.repository.js';
import * as nomina from '../nomina/nomina.repository.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';

export function resultadoPrestacion(e: EntradaPago): ResultadoPago {
  const v = e.prestacion!,
    l = v.componentes[0]!;
  const salario = vigente(e.salarios, l.fin, 'salario');
  return {
    tipoPago: e.tipoPago,
    mes: e.mes,
    devengado: v.total,
    anticipo: '0.00',
    dias: '0',
    salario: salario.monto,
    idSalario: salario.id,
    ingresos: v.total,
    descuentos: '0.00',
    neto: v.total,
    patronal: '0.00',
    baseIgss: '0.00',
    alertas: [],
    parametros: e.parametros,
    componentes: v.componentes,
    lineas: [
      {
        concepto: {
          ...vigente(
            e.conceptos.filter((c) => c.codigo === e.tipoPago),
            l.fin,
            e.tipoPago,
          ),
          igss: 0,
          isr: 0,
          prestaciones: 0,
        },
        descripcion: `${e.tipoPago.replace('_', ' ')} · ${l.formula}`,
        base: l.promedio,
        cantidad: l.tiempo,
        tasa: valor(
          e.parametros,
          e.tipoPago === 'BONO_14' ? 'BONO14_PORCENTAJE' : 'AGUINALDO_PORCENTAJE',
          l.fin,
          'PORCENTAJE',
        ).toString(),
        monto: v.total,
        fecha: l.fin,
      },
    ],
    isr: {
      anio: Number(e.mes.slice(0, 4)),
      renta: v.gravado,
      personal: '0.00',
      acreditadas: '0.00',
      igss: '0.00',
      imponible: v.gravado,
      anual: '0.00',
      retenido: '0.00',
      restantes: 0,
      retencion: '0.00',
      exceso: '0.00',
      futuro: '0.00',
      tramos: [],
      deducciones: [],
    },
  };
}
export async function registrarPrestacionPagada(
  c: Connection,
  e: EntradaPago,
  idNomina: number,
  fechaPago: string,
  a: ActorAuditoria,
  firma: FirmaDocumento,
) {
  const v = e.prestacion!,
    l = v.componentes[0]!;
  const id = await repo.guardar(
    c,
    {
      idEmpleado: e.empleado.id,
      tipo: e.tipoPago,
      inicio: v.inicio,
      fin: v.fin,
      promedio: l.promedio,
      tiempo: l.tiempo,
      total: v.total,
      hash: v.hash,
      snapshot: {
        ...v,
        versionMotor: 'v1-11',
        seleccion: { tipo: e.tipoPago, anio: Number(e.mes.slice(0, 4)), idEmpleado: e.empleado.id },
        empresa: await nomina.empresa(c),
      },
      motivo: 'Revisión y confirmación de prestaciones en Simular pago',
      componentes: v.componentes,
    },
    a.idUsuario,
  );
  await guardarFirma(c, 'PRESTACIONES', id, firma);
  await repo.estado(c, id, 'APROBADA', a.idUsuario);
  await repo.estado(c, id, 'PAGADA', a.idUsuario, fechaPago, `BOLETA-${idNomina}`);
  await repo.vincularBoleta(c, id, idNomina);
  await registrarAuditoria(c, {
    actor: a,
    accion: 'PAGAR_PRESTACION',
    entidad: 'PRESTACIONES',
    idEntidad: id,
    despues: { idNomina, fechaPago, total: v.total, hash: v.hash },
    motivo: 'Confirmación del cálculo automático A12',
  });
}
