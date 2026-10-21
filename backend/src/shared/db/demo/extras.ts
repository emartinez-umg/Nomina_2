import type { CargaDemo } from './service.js';
import { exigir } from './datos.js';
import * as repo from './repository.js';
import * as empleados from '../../../modules/empleados/empleados.repository.js';
import * as novedades from '../../../modules/novedades/novedades.repository.js';
import * as mensualesRepo from '../../../modules/novedades/mensuales.repository.js';
import {
  guardarMensual,
  validarMes,
  desglosarAusencia,
} from '../../../modules/novedades/mensuales.service.js';
import { schemas } from '../../../modules/novedades/novedades.schemas.js';
import { amortizar, diasInclusivos } from '../../../modules/novedades/novedades.reglas.js';
import * as parqueo from '../../../modules/novedades/parqueo.repository.js';
import { aprobarParqueo } from '../../../modules/novedades/parqueo.service.js';
import { tarifaSchema, placaSchema } from '../../../modules/novedades/parqueo.schemas.js';
import * as solicitudes from '../../../modules/solicitudes/solicitudes.repository.js';
import * as nomina from '../../../modules/nomina/nomina.repository.js';
import { fiscalSchema } from '../../../modules/nomina/nomina.schemas.js';

export async function cargarExtras(carga: CargaDemo) {
  const { c, dataset, actor, opciones } = carga;
  const tipoActivo = async (tabla: 'TIPOS_DESCUENTO' | 'TIPOS_AUSENCIA', clave: string) => {
    const r = await repo.tipoExtra(c, tabla, clave);
    exigir(r, `Falta el tipo activo ${clave}.`);
    return r.ID;
  };
  for (const t of dataset.configuracion.tarifasParqueoDemo) {
    const vigentes = await parqueo.vigente(c, t.vehiculo, carga.hoy.slice(0, 7));
    exigir(vigentes.length <= 1, 'Hay tarifas de parqueo superpuestas en el destino.');
    if (vigentes.length) {
      carga.contar('PARQUEO_TARIFAS', 'reutilizados');
      continue;
    }
    exigir(
      !(await parqueo.tarifas(c)).some((f) => f.vehiculo === t.vehiculo),
      'Falta tarifa vigente pero hay historia operativa; configura una vigencia sin modificar el seed.',
    );
    exigir(
      !(await novedades.cerrados(c, t.vigenteDesde, '9999-12-31')),
      'La tarifa demo afectaría periodos cerrados.',
    );
    const datos = tarifaSchema.parse({
      vehiculo: t.vehiculo,
      monto: t.monto,
      mes: t.vigenteDesde.slice(0, 7),
      motivo: t.motivo,
      confirmado: true,
    });
    await carga.crear('PARQUEO_TARIFAS', t.vehiculo, () =>
      parqueo.guardarTarifa(c, datos, actor.idUsuario),
    );
  }
  for (const e of dataset.empleados) {
    const id = carga.empleados.get(e.clave)!;
    const extras = e.extras;
    if (!extras) continue;
    if (extras.aperturaFiscal) {
      const p = extras.aperturaFiscal,
        clave = `${e.clave}:apertura:${p.anio}`;
      const existentes = await nomina.fiscal(c, id, p.anio);
      exigir(
        !existentes.aperturas.length ||
          [...carga.propias.values()].some((r) => r.tabla === 'ISR_APERTURAS' && r.clave === clave),
        'Existe una apertura fiscal ajena al seed; no se reemplazará.',
      );
      const datos = fiscalSchema.parse({ ...p, idEmpleado: id, confirmado: true });
      exigir(
        datos.fecha >= e.fechaIngreso &&
          datos.fecha <= carga.hoy &&
          Number(datos.fecha.slice(0, 4)) === datos.anio,
        'La apertura demo debe pertenecer al año indicado y a la relación laboral.',
      );
      await carga.crear('ISR_APERTURAS', clave, () =>
        nomina.guardarFiscal(c, 'apertura', datos, actor.idUsuario),
      );
    }
    if (
      extras.historialSalarial &&
      !(opciones.dryRun && carga.nuevas.has(repo.llave('EMPLEADOS', id)))
    ) {
      const historia = await empleados.historial(c, id, 'salario');
      if (historia.length === 1) {
        const primero = historia[0]!,
          key = repo.llave('HISTORIAL_SALARIAL', primero.id),
          prop = carga.propias.get(key);
        exigir(
          prop && (await repo.huella(c, 'HISTORIAL_SALARIAL', primero.id)) === prop.huella,
          `No se puede ampliar el historial modificado de ${e.clave}.`,
        );
        exigir(
          !(await novedades.cerrados(c, e.fechaIngreso, '9999-12-31')),
          'El historial demo afectaría periodos cerrados.',
        );
        if (opciones.dryRun) {
          for (const cambio of extras.historialSalarial.slice(1)) {
            exigir(
              cambio.vigenteDesde <= carga.hoy,
              'La vigencia salarial demo no puede ser futura.',
            );
            carga.contar('HISTORIAL_SALARIAL', 'previstos');
          }
        } else {
          await repo.ajustarSalario(
            c,
            primero.id,
            extras.historialSalarial[0]!.salarioBase,
            actor.idUsuario,
          );
          for (const h of extras.historialSalarial.slice(1))
            await empleados.agregarHistorial(
              c,
              id,
              'salario',
              h.salarioBase,
              h.vigenteDesde,
              h.motivo,
              actor.idUsuario,
            );
          carga.actualizadas.add(key);
          await carga.rastrear('HISTORIAL_SALARIAL', id, e.clave);
        }
      }
    }
    for (const nov of extras.comisiones ?? []) {
      validarMes(nov.mes, carga.hoy);
      const r = schemas.comisiones.parse({ ...nov, idEmpleado: id });
      await carga.crear('NOVEDADES_MENSUALES', nov.referencia, () =>
        guardarMensual(c, actor, 'comisiones', r),
      );
    }
    for (const prestamo of [extras.prestamo, extras.anticipo].filter((p) => p !== undefined)) {
      const { tipoDescuento, ...entrada } = prestamo;
      const idTipo = await tipoActivo('TIPOS_DESCUENTO', tipoDescuento);
      const d = schemas.prestamos.parse({ ...entrada, idTipo, idEmpleado: id });
      exigir(
        d.fechaInicio >= carga.hoy &&
          d.fechaDesembolso >= e.fechaIngreso &&
          d.fechaDesembolso <= d.fechaInicio,
        'Las fechas del préstamo demo ya no son aplicables; actualiza el dataset.',
      );
      const plan = amortizar(d.monto, d.cuotas, d.fechaInicio);
      exigir(
        !(await novedades.cerrados(c, d.fechaInicio, plan.at(-1)!.fecha)),
        'El préstamo demo afecta un periodo cerrado.',
      );
      const acuerdo = await carga.crear('DESCUENTOS_EMPLEADO', d.referencia, async () => {
        const nuevo = await novedades.guardar(
          c,
          'prestamos',
          {
            ID_EMPLEADO: { valor: id },
            ID_TIPO_DESCUENTO: { valor: idTipo },
            MODALIDAD: { valor: 'CUOTAS' },
            MONTO_QUINCENA: { valor: plan[0]!.monto, tipo: 'numero' },
            MONTO_TOTAL: { valor: d.monto, tipo: 'numero' },
            SALDO: { valor: d.monto, tipo: 'numero' },
            NUMERO_CUOTAS: { valor: plan.length },
            FECHA_INICIO: { valor: d.fechaInicio, tipo: 'fecha' },
            FECHA_FIN: { valor: plan.at(-1)!.fecha, tipo: 'fecha' },
            ESTADO: { valor: 'VIGENTE' },
            MOTIVO: { valor: d.motivo },
          },
          actor.idUsuario,
        );
        await novedades.guardarPrestamo(c, nuevo, d, actor.idUsuario);
        await novedades.guardarCuotas(c, nuevo, id, plan, actor.idUsuario);
        return nuevo;
      });
      if (!opciones.dryRun && carga.nuevas.has(repo.llave('DESCUENTOS_EMPLEADO', acuerdo))) {
        await carga.rastrear('PRESTAMOS', acuerdo, d.referencia);
        await carga.rastrear('DESCUENTOS_CUOTAS', acuerdo, d.referencia);
      }
    }
    for (const [i, ausencia] of (extras.ausencias ?? []).entries()) {
      const { tipoAusencia, ...entrada } = ausencia;
      const idTipo = await tipoActivo('TIPOS_AUSENCIA', tipoAusencia);
      const d = schemas.ausencias.parse({ ...entrada, idEmpleado: id, idTipo, confirmado: true });
      exigir(
        d.fechaInicio >= e.fechaIngreso && d.fechaFin >= d.fechaInicio && d.fechaFin <= carga.hoy,
        'Fechas de ausencia demo inválidas.',
      );
      exigir(
        !(await novedades.cerrados(c, d.fechaInicio, d.fechaFin)),
        'La ausencia demo afecta un periodo cerrado.',
      );
      const clave = `${e.clave}:ausencia:${i}`;
      const previa = [...carga.propias.values()].some(
        (p) => p.tabla === 'AUSENCIAS' && p.clave === clave,
      );
      if (!previa && !opciones.dryRun)
        exigir(
          !(await novedades.traslape(c, id, d.fechaInicio, d.fechaFin)),
          'La ausencia demo se traslapa con otro registro.',
        );
      const registro = await carga.crear('AUSENCIAS', clave, async () => {
        const nuevo = await repo.insertar(
          c,
          'AUSENCIAS',
          {
            ID_EMPLEADO: id,
            ID_TIPO_AUSENCIA: idTipo,
            FECHA_INICIO: d.fechaInicio,
            FECHA_FIN: d.fechaFin,
            DIAS: diasInclusivos(d.fechaInicio, d.fechaFin),
            ESTADO: d.estado,
            MOTIVO: d.motivo,
            APROBADO_POR: actor.idUsuario,
            CREADO_POR: actor.idUsuario,
          },
          ['FECHA_INICIO', 'FECHA_FIN'],
        );
        const desglose = await desglosarAusencia(c, {
          idEmpleado: id,
          idTipo,
          fechaInicio: d.fechaInicio,
          fechaFin: d.fechaFin,
        });
        for (const mes of desglose.meses)
          await mensualesRepo.guardarAusenciaMes(
            c,
            { id: nuevo, empleado: id, ...mes, estado: d.estado, motivo: d.motivo },
            actor.idUsuario,
          );
        return nuevo;
      });
      if (!opciones.dryRun && carga.nuevas.has(repo.llave('AUSENCIAS', registro)))
        await carga.rastrear('NOVEDADES_MENSUALES', registro, clave);
    }
    if (extras.parqueo) {
      const p = extras.parqueo;
      placaSchema.parse(p.placa);
      if (p.mesInicio !== carga.hoy.slice(0, 7))
        carga.avisos.add(
          'El parqueo inicia en el mes real de aprobación, como exige la app; mesInicio del JSON es referencia histórica.',
        );
      const tipo = await solicitudes.tipo(c, 'PARQUEO');
      exigir(tipo, 'Falta el tipo de solicitud de parqueo.');
      const solicitud = await carga.crear('SOLICITUDES', `${e.clave}:parqueo`, async () => {
        const nuevo = await solicitudes.crear(
          c,
          id,
          tipo.id,
          p.motivo,
          null,
          actor.idUsuario,
          p.vehiculo,
          p.placa,
        );
        await solicitudes.registrarEstado(c, nuevo, null, 'EN_PROCESO', p.motivo, actor.idUsuario);
        return nuevo;
      });
      await carga.crear('PARQUEO_SUSCRIPCIONES', `${e.clave}:parqueo`, async () => {
        const sub = await aprobarParqueo(c, actor, id, solicitud, p.vehiculo, p.placa);
        await solicitudes.registrarEstado(
          c,
          solicitud,
          'EN_PROCESO',
          'APROBADA',
          p.motivo,
          actor.idUsuario,
        );
        const s = await solicitudes.solicitud(c, solicitud);
        exigir(s, 'Solicitud de parqueo no disponible.');
        await solicitudes.notificar(c, s, 'APROBADA', actor.idUsuario);
        return sub;
      });
      if (!opciones.dryRun && carga.nuevas.has(repo.llave('SOLICITUDES', solicitud))) {
        await carga.rastrear('SOLICITUD_HISTORIAL', solicitud, `${e.clave}:parqueo`);
        await carga.rastrear('NOTIFICACIONES', solicitud, `${e.clave}:parqueo`);
      }
    }
  }
}
