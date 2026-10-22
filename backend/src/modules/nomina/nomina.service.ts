import { nombrePersona } from '../../shared/utils/nombre.js';
import { conLecturaConsistente } from '../../shared/db/lectura.js';
import { zipSync } from 'fflate';
import { completarHistoria } from './nomina.historia.js';
export { completarHistoria } from './nomina.historia.js';
import { crearPagosService, accionPeriodoMensual } from './pago.service.js';
import { boletaArchivada } from './pago.repository.js';
import { membrete, firmante } from '../empresa/empresa.service.js';
import { guardarFirma, firmaBoleta } from '../empresa/empresa.repository.js';
import type { FirmaDocumento } from '../../shared/pdf/documento.js';
import { fuenteUtilizada } from '../prestaciones/prestaciones.repository.js';
import { createHash } from 'node:crypto';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import {
  ErrorConflicto,
  ErrorNegocio,
  ErrorNoEncontrado,
  ErrorProhibido,
} from '../../shared/errors/errors.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { revalidarActor } from '../auth/auth.service.js';
import type { ActorAuditoria, Autenticacion } from '../auth/auth.types.js';
import { registrarCobroCuota } from '../novedades/novedades.service.js';
import { quincena } from '../novedades/novedades.reglas.js';
import { calcularNomina, validarTransicion } from './nomina.calculo.js';
import type { Periodo } from './nomina.types.js';
import {
  accionSchema,
  fiscalSchema,
  deduccionSchema,
  formatoSchema,
  guardarFormatoSchema,
} from './nomina.schemas.js';
import type { Query } from './nomina.schemas.js';
import * as repo from './nomina.repository.js';
import * as exportar from './nomina.exportar.js';
const audit = (
  c: Connection,
  actor: ActorAuditoria,
  id: number,
  accion: string,
  antes: unknown,
  despues: unknown,
  motivo: string,
  entidad = 'PERIODOS_NOMINA',
) => registrarAuditoria(c, { actor, accion, entidad, idEntidad: id, antes, despues, motivo });
async function firmas(c: Connection, ns: { id: number; estado: string }[]) {
  const resultado = new Map<number, FirmaDocumento>();
  for (const n of ns) {
    const f = await firmaBoleta(c, n.id);
    if (f) resultado.set(n.id, f);
    else if (['APROBADO', 'CERRADO'].includes(n.estado))
      throw new ErrorConflicto(
        'La aprobación histórica carece de nombre y cargo verificables. Completa la ficha del aprobador y solicita a ADMIN revisar y reaprobar el periodo.',
      );
  }
  return resultado;
}
export function crearNominaService(db: BaseDatos) {
  const lectura = <T>(fn: (c: Connection) => Promise<T>) => conLecturaConsistente(db, fn);
  const tx = <T>(
    auth: Autenticacion,
    ip: string,
    fn: (c: Connection, a: ActorAuditoria) => Promise<T>,
  ) =>
    enTransaccion(db, async (c) => {
      await bloquearCatalogos(c, true);
      const a = await revalidarActor(c, auth);
      if (!['ADMIN', 'RH'].includes(a.rol)) throw new ErrorProhibido();
      try {
        return await fn(c, { ...a, ip });
      } catch (e) {
        if (e && typeof e === 'object' && 'errorNum' in e && e.errorNum === 1)
          throw new ErrorConflicto(
            'El periodo, apertura o referencia ya existe. Recarga antes de continuar.',
          );
        throw e;
      }
    });
  const buscar = async (c: Connection, id: number) => {
    const p = await repo.periodo(c, id);
    if (!p) throw new ErrorNoEncontrado();
    return p;
  };
  const cargar = async (c: Connection, p: Periodo) => {
    const entradas = await repo.fuentes(c, p);
    return { entradas, hash: createHash('sha256').update(JSON.stringify(entradas)).digest('hex') };
  };
  const detalle = async (c: Connection, auth: Autenticacion, id: number) => {
    const n = await repo.resultado(c, id);
    if (!n) throw new ErrorNoEncontrado();
    if (
      auth.rol === 'EMPLEADO' &&
      (n.usuario !== auth.idUsuario ||
        (n.estado !== 'CERRADO' && !n.pagado) ||
        n.version !== n.actual)
    )
      throw new ErrorProhibido(
        'Solo puedes consultar tus propias boletas pagadas o de periodos históricos cerrados.',
      );
    return n;
  };
  const todos = async (c: Connection, q: Query, periodo?: number) => {
    const r = await repo.listar(c, { ...q, pagina: 1, limite: 100 }, undefined, periodo),
      registros = [...r.registros];
    if (r.total > 10000)
      throw new ErrorConflicto('Reduce los filtros a un máximo de 10,000 boletas por exportación.');
    for (let pagina = 2; registros.length < r.total; pagina++)
      registros.push(
        ...(await repo.listar(c, { ...q, pagina, limite: 100 }, undefined, periodo)).registros,
      );
    return { ...r, registros };
  };
  return {
    ...crearPagosService(db),
    periodos: (q: Query) => lectura((c) => repo.periodos(c, q)),
    periodo: (id: number) =>
      lectura(async (c) => {
        const p = await buscar(c, id);
        return {
          ...p,
          alertas: JSON.parse(p.alertas) as string[],
          estimaciones: await repo.estimacionesPeriodo(c, id),
        };
      }),
    crear: (auth: Autenticacion, ip: string, fecha: string) =>
      tx(auth, ip, async (c, a) => {
        const q = quincena(fecha),
          id = await repo.crear(c, q.inicio, q.fin, q.numero, a.idUsuario);
        await audit(c, a, id, 'CREAR_PERIODO', null, q, 'Crear quincena');
        return { id };
      }),
    accion: (auth: Autenticacion, ip: string, id: number, accion: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const d = accionSchema.parse(raw),
          p = await buscar(c, id);
        if (d.version !== p.version)
          throw new ErrorConflicto(
            'La versión cambió. Recarga y revisa el nuevo cálculo antes de confirmar.',
          );
        if (p.motor === 'V1') return accionPeriodoMensual(c, p, accion, a, d.motivo);
        validarTransicion(p.estado, accion, a.rol, d.motivo);
        if (['calcular', 'reabrir', 'devolver'].includes(accion) && (await repo.posteriores(c, p)))
          throw new ErrorConflicto(
            'Hay periodos posteriores aprobados o cerrados. Revísalos en orden inverso antes de modificar esta quincena.',
          );
        if (['calcular', 'cerrar'].includes(accion) && (await repo.anteriores(c, p)))
          throw new ErrorConflicto(
            'Cierra primero los periodos anteriores del mismo año para mantener el ISR y los saldos acumulados.',
          );
        let hash = p.hash,
          version = p.version,
          alertas = JSON.parse(p.alertas) as string[],
          nuevo = p.estado;
        if (accion === 'calcular') {
          const f = await cargar(c, p);
          hash = f.hash;
          version++;
          alertas = [];
          if (!f.entradas.length)
            throw new ErrorConflicto('No hay empleados con relación laboral en esta quincena.');
          const empresa = await repo.empresa(c);
          for (const e of f.entradas) {
            try {
              const entrada = completarHistoria(e),
                r = calcularNomina(entrada);
              await repo.guardarResultado(
                c,
                { ...p, version },
                entrada,
                r,
                a.idUsuario,
                empresa
                  ? { nombre: empresa.nombre, nit: empresa.nit, direccion: empresa.direccion }
                  : null,
              );
              alertas.push(
                ...r.alertas
                  .filter((v) => !v.startsWith('ISR retenido en exceso'))
                  .map((v) => `${e.empleado.codigo}: ${v}`),
              );
            } catch (error) {
              if (!(error instanceof ErrorNegocio)) throw error;
              alertas.push(`${e.empleado.codigo}: ${error.message}`);
            }
          }
          nuevo = 'CALCULADO';
        } else if (accion === 'reabrir') {
          for (const n of await repo.resultados(c, p.id))
            if (await fuenteUtilizada(c, n.id))
              throw new ErrorConflicto(
                'Este cierre sustenta prestaciones. Anula los cálculos pendientes; los aprobados o pagados conservan la historia.',
              );
          await repo.revertir(c, p, a.idUsuario);
          nuevo = 'ABIERTO';
          hash = null;
          alertas = [];
        } else if (accion === 'devolver') {
          nuevo = 'CALCULADO';
        } else {
          if (alertas.length)
            throw new ErrorConflicto(
              'Resuelve las alertas y vuelve a calcular antes de revisar, aprobar o cerrar.',
            );
          const f = await cargar(c, p);
          if (f.hash !== p.hash)
            throw new ErrorConflicto(
              'Cambiaron los datos o las vigencias desde el cálculo. Recalcula y revisa de nuevo; si está aprobado, devuelve a revisión primero.',
            );
          const rs = await repo.resultados(c, id);
          if (!rs.length || rs.length !== f.entradas.length)
            throw new ErrorConflicto(
              'La planilla no contiene un resultado válido para cada empleado. Recalcula.',
            );
          if (accion === 'cerrar') {
            for (const n of rs) {
              const s = exportar.snapshot(n);
              for (const [i, l] of s.resultado.lineas.entries())
                if (l.descuento) {
                  const desc = l.descuento;
                  if (desc.cuota) await registrarCobroCuota(c, a, desc.cuota, n.id, l.monto);
                  else
                    await repo.aplicarFijo(c, p, n.idEmpleado, n.id, desc.id, l.monto, a.idUsuario);
                  await repo.vincularAplicacion(c, n.id, desc.id, desc.cuota, i + 1, a.idUsuario);
                }
            }
            await repo.marcarPago(c, p, a.idUsuario);
          }
          nuevo = accion === 'revisar' ? 'REVISADO' : accion === 'aprobar' ? 'APROBADO' : 'CERRADO';
        }
        if (accion === 'aprobar') {
          await membrete(c);
          await guardarFirma(c, 'PERIODOS_NOMINA', id, await firmante(c, a.idUsuario));
        }
        await repo.estado(c, id, nuevo, a.idUsuario, version, hash, alertas, d.motivo);
        await audit(
          c,
          a,
          id,
          accion.toUpperCase() + '_PERIODO',
          { estado: p.estado, version: p.version },
          { estado: nuevo, version, alertas },
          d.motivo || `Flujo de nómina: ${accion}`,
        );
        return { id, estado: nuevo, version, alertas };
      }),
    listar: (auth: Autenticacion, q: Query, id?: number) =>
      lectura((c) => repo.listar(c, q, auth.rol === 'EMPLEADO' ? auth.idUsuario : undefined, id)),
    detalle: (auth: Autenticacion, id: number) =>
      lectura(async (c) => {
        const n = await detalle(c, auth, id),
          s = exportar.snapshot(n);
        return {
          id: n.id,
          inicio: n.inicio,
          fin: n.fin,
          estado: n.estado,
          version: n.version,
          empleado: `${s.entrada.empleado.codigo} · ${nombrePersona(s.entrada.empleado.nombres, s.entrada.empleado.apellidos)}`,
          resultado: s.resultado,
        };
      }),
    boleta: (auth: Autenticacion, id: number) =>
      lectura(async (c) => {
        const n = await detalle(c, auth, id);
        const archivada = await boletaArchivada(c, id);
        if (archivada)
          return exportar.archivo(archivada, `boleta-${id}-v${n.version}.pdf`, 'application/pdf');
        return exportar.archivo(
          await exportar.boletasPdf([n], await membrete(c), await firmas(c, [n])),
          `boleta-${id}-v${n.version}.pdf`,
          'application/pdf',
        );
      }),
    exportar: (auth: Autenticacion, q: Query, formato: 'excel' | 'pdf' | 'boletas', id?: number) =>
      lectura(async (c) => {
        if (auth.rol === 'EMPLEADO') throw new ErrorProhibido();
        const r = await todos(c, q, id);
        if (!r.registros.length)
          throw new ErrorConflicto('No hay resultados para exportar con estos filtros.');
        if (formato === 'excel')
          return exportar.archivo(
            exportar.excel([
              [
                'Empleado',
                'Departamento',
                'Inicio',
                'Fin',
                'Estado',
                'Versión',
                'Ingresos Q',
                'Descuentos Q',
                'Neto Q',
                'Patronal Q',
              ],
              ...r.registros.map((f) => [
                f.empleado,
                f.departamento,
                f.inicio,
                f.fin,
                f.estado,
                f.version,
                f.ingresos,
                f.descuentos,
                f.neto,
                f.patronal,
              ]),
              [
                'TOTALES',
                '',
                '',
                '',
                '',
                '',
                r.totales.ingresos,
                r.totales.descuentos,
                r.totales.neto,
                r.totales.patronal,
              ],
            ]),
            'planilla.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          );
        if (formato === 'pdf')
          return exportar.archivo(
            await exportar.planillaPdf(r.registros, r.totales, await membrete(c), [
              ...(await firmas(c, r.registros)).values(),
            ]),
            'planilla.pdf',
            'application/pdf',
          );
        const ns: repo.Guardado[] = [];
        for (const f of r.registros) ns.push((await detalle(c, auth, f.id))!);
        if (ns.some((n) => 'tipoPago' in exportar.snapshot(n).resultado)) {
          const archivos: Record<string, Uint8Array> = {};
          for (const n of ns)
            archivos[
              `departamento-${exportar.snapshot(n).entrada.empleado.idDepartamento}/boleta-${n.id}.pdf`
            ] =
              (await boletaArchivada(c, n.id)) ??
              (await exportar.boletasPdf([n], await membrete(c), await firmas(c, [n])));
          return exportar.archivo(Buffer.from(zipSync(archivos)), 'boletas.zip', 'application/zip');
        }
        return exportar.archivo(
          await exportar.boletasPdf(ns, await membrete(c), await firmas(c, ns)),
          'boletas.pdf',
          'application/pdf',
        );
      }),
    tipos: () => lectura((c) => repo.tiposDeduccion(c)),
    fiscal: (id: number, anio: number) => lectura((c) => repo.fiscal(c, id, anio)),
    guardarFiscal: (
      auth: Autenticacion,
      ip: string,
      tipo: 'apertura' | 'deduccion',
      raw: unknown,
    ) =>
      tx(auth, ip, async (c, a) => {
        const d = tipo === 'apertura' ? fiscalSchema.parse(raw) : deduccionSchema.parse(raw);
        if (Number(d.fecha.slice(0, 4)) !== d.anio)
          throw new ErrorConflicto('La fecha debe pertenecer al año fiscal.');
        if (tipo === 'apertura' && quincena(d.fecha).fin !== d.fecha)
          throw new ErrorConflicto('La apertura debe cortar al final de una quincena.');
        if (!(await repo.existeEmpleado(c, d.idEmpleado))) throw new ErrorNoEncontrado();
        const idFiscal = await repo.guardarFiscal(c, tipo, d, a.idUsuario);
        await audit(
          c,
          a,
          idFiscal,
          'REGISTRAR_' + tipo.toUpperCase() + '_ISR',
          null,
          { ...d, confirmado: undefined },
          d.motivo,
          tipo === 'apertura' ? 'ISR_APERTURAS' : 'ISR_DEDUCCIONES_EMPLEADO',
        );
        return { guardado: true };
      }),
    formato: () =>
      lectura(async (c) => {
        const empresa = await repo.empresa(c);
        return {
          empresa: empresa ? { id: empresa.id, nombre: empresa.nombre, nit: empresa.nit } : null,
          centros: await repo.centros(c),
          formato: empresa?.formato ? formatoSchema.parse(JSON.parse(empresa.formato)) : null,
        };
      }),
    guardarFormato: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const d = guardarFormatoSchema.parse(raw),
          empresa = (await repo.empresa(c)) ?? (await repo.crearEmpresa(c, d.formato, a.idUsuario));
        const ids = (v: { id: number }[]) => new Set(v.map((v) => v.id)).size === v.length;
        if (
          !ids(d.formato.centros) ||
          !ids(d.formato.empleados) ||
          new Set(d.formato.tipos.map((v) => v.codigo)).size !== d.formato.tipos.length
        )
          throw new ErrorConflicto('Los centros, tipos y empleados del formato deben ser únicos.');
        await repo.guardarFormato(c, empresa.id, d.formato, a.idUsuario);
        await audit(
          c,
          a,
          empresa.id,
          'CONFIGURAR_FORMATO_IGSS',
          empresa.formato ? JSON.parse(empresa.formato) : null,
          d.formato,
          d.motivo,
          'CONFIGURACION_EMPRESA',
        );
        return { guardado: true };
      }),
    igss: (anio: number, mes: number) =>
      lectura(async (c) => {
        const q: Query = {
            pagina: 1,
            limite: 100,
            ordenarPor: 'inicio',
            direccion: 'asc',
            anio,
            mes,
          },
          ps = await repo.periodos(c, q);
        const mensual = ps.registros.some((p) => p.motor === 'V1');
        if (
          (!mensual && ps.total !== 2) ||
          (mensual && !ps.registros.some((p) => p.inicio.endsWith('-16'))) ||
          ps.registros.some((p) => p.estado !== 'CERRADO')
        )
          throw new ErrorConflicto(
            'Cierra el pago mensual y el anticipo, si existe, antes de exportar IGSS.',
          );
        const empresa = await repo.empresa(c);
        if (!empresa?.formato)
          throw new ErrorConflicto('Configura el formato IGSS patronal antes de exportar.');
        const ns: repo.Guardado[] = [];
        for (const p of ps.registros) ns.push(...(await repo.resultados(c, p.id)));
        return exportar.reporteIgss(
          ns,
          formatoSchema.parse(JSON.parse(empresa.formato)),
          anio,
          mes,
        );
      }),
  };
}
