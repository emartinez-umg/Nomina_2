import { membrete, firmante } from '../empresa/empresa.service.js';
import { obtenerEmpresa } from '../empresa/empresa.repository.js';
import { createHash } from 'node:crypto';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import {
  ErrorConflicto,
  ErrorNoEncontrado,
  ErrorProhibido,
  ErrorNegocio,
} from '../../shared/errors/errors.js';
import { verificarPropiedad } from '../../shared/security/rbac.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { revalidarActor } from '../auth/auth.service.js';
import type { ActorAuditoria, Autenticacion } from '../auth/auth.types.js';
import { propio, notificaciones, leerNotificacion } from '../vacaciones/vacaciones.repository.js';
import { hoy } from '../novedades/novedades.repository.js';
import { aprobarParqueo } from '../novedades/parqueo.service.js';
import { salario } from '../prestaciones/prestaciones.repository.js';
import { escribirCsv } from '../empleados/empleados.csv.js';
import { Decimal } from 'decimal.js';
import {
  confirmarSchema,
  crearSchema,
  resolverSchema,
  entregarSchema,
  contactoSchema,
  criticosSchema,
  plantillaSchema,
  variables,
  tipos,
} from './solicitudes.schemas.js';
import type { Query } from './solicitudes.schemas.js';
import { rellenarPlantilla, solicitudPdf } from './solicitudes.pdf.js';
import * as repo from './solicitudes.repository.js';
export function validarTransicion(actual: string, siguiente: string) {
  if (!(
    (actual === 'EN_PROCESO' && ['APROBADA', 'RECHAZADA'].includes(siguiente)) ||
    (actual === 'APROBADA' && siguiente === 'ENTREGADA')
  ))
    throw new ErrorConflicto(
      'La solicitud ya cambió de estado o la transición no está permitida. Recarga el detalle.',
    );
}
const rh = (a: ActorAuditoria) => {
  if (!['ADMIN', 'RH'].includes(a.rol)) throw new ErrorProhibido();
};
const soloEmpleado = (a: ActorAuditoria) => {
  if (a.rol !== 'EMPLEADO') throw new ErrorProhibido();
};
const audit = (
  c: Connection,
  a: ActorAuditoria,
  id: number,
  accion: string,
  antes: unknown,
  despues: unknown,
  entidad = 'SOLICITUDES',
) => registrarAuditoria(c, { actor: a, accion, entidad, idEntidad: id, antes, despues });
export function crearSolicitudesService(db: BaseDatos) {
  async function tx<T>(
    auth: Autenticacion,
    ip: string,
    fn: (c: Connection, a: ActorAuditoria) => Promise<T>,
  ) {
    try {
      return await enTransaccion(db, async (c) => {
        await bloquearCatalogos(c, true);
        const a = await revalidarActor(c, auth);
        return fn(c, { ...a, ip });
      });
    } catch (e) {
      if (e && typeof e === 'object' && 'errorNum' in e && e.errorNum === 1) {
        const mensaje =
          'El DPI, NIT o correo ya está registrado, o la operación ya se realizó. Revisa los datos y recarga la bandeja.';
        throw new ErrorNegocio(mensaje, 409, 'CONFLICTO', {
          dpi: [mensaje],
          nit: [mensaje],
          correo: [mensaje],
        });
      }
      throw e;
    }
  }
  async function miEmpleado(c: Connection, a: ActorAuditoria) {
    soloEmpleado(a);
    const id = await propio(c, a.idUsuario);
    const e = id ? await repo.empleado(c, id) : undefined;
    if (!e)
      throw new ErrorConflicto(
        'Tu usuario no tiene un expediente vinculado. Solicita a RRHH que lo revise.',
      );
    return e;
  }
  async function obtener(c: Connection, a: ActorAuditoria, id: number) {
    const s = await repo.solicitud(c, id);
    if (!s || !tipos.includes(s.tipo as (typeof tipos)[number])) throw new ErrorNoEncontrado();
    verificarPropiedad(a, s.usuario);
    return s;
  }
  async function pdf(c: Connection, s: repo.Solicitud, e: repo.Empleado, a: ActorAuditoria) {
    const p = (await repo.plantillas(c)).find((p) => p.tipo === s.tipo);
    if (!p) throw new ErrorConflicto('Falta una plantilla vigente para este tipo de documento.');
    await membrete(c);
    const empresa = (await obtenerEmpresa(c))!;
    const firma = await firmante(c, a.idUsuario);
    if (!empresa)
      throw new ErrorConflicto('Completa los datos reales de empresa antes de generar documentos.');
    const fecha = await hoy(c),
      base = await salario(c, e.id, fecha);
    const datos: Record<string, string | null> = {
      empresa: empresa.razonSocial,
      nit_empresa: empresa.nit,
      direccion_empresa: empresa.direccion,
      firmante_nombre: firma.nombre,
      firmante_cargo: firma.cargo,
      nombre: `${e.nombres} ${e.apellidos}`,
      dpi: e.dpi,
      nit: e.nit,
      puesto: e.puesto,
      departamento: e.departamento,
      fecha_ingreso: e.ingreso.split('-').reverse().join('/'),
      salario: base
        ? `Q ${new Decimal(base).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
        : null,
      afiliacion_igss: e.afiliacionIgss,
      fecha_emision: fecha.split('-').reverse().join('/'),
    };
    const texto = rellenarPlantilla(p.contenido, datos);
    await repo.guardarPdf(
      c,
      s,
      p,
      datos,
      await solicitudPdf(p.nombre, texto, s.id, empresa, firma),
      a.idUsuario,
      firma,
      empresa.version,
    );
  }
  return {
    listar: (auth: Autenticacion, ip: string, q: Query) =>
      tx(auth, ip, (c, a) => repo.listar(c, q, a.rol === 'EMPLEADO' ? a.idUsuario : null)),
    detalle: (auth: Autenticacion, ip: string, id: number) =>
      tx(auth, ip, async (c, a) => {
        const s = await obtener(c, a, id);
        return {
          ...s,
          requiereReemision: s.generaPdf ? !(await repo.documento(c, id))?.versionMembrete : false,
          datos: s.datos ? (JSON.parse(s.datos) as unknown) : null,
          historial: await repo.historial(c, id),
        };
      }),
    solicitar: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const d = crearSchema.parse(raw),
          e = await miEmpleado(c, a),
          fecha = await hoy(c);
        if (e.estado !== 'ACTIVO' || e.ingreso > fecha || (e.egreso && e.egreso < fecha))
          throw new ErrorConflicto('La solicitud requiere una relación laboral activa.');
        const t = await repo.tipo(c, d.tipo);
        if (!t) throw new ErrorConflicto('El tipo de solicitud no está activo.');
        if (await repo.pendiente(c, e.id, t.id))
          throw new ErrorConflicto(
            'Ya tienes una solicitud de este tipo en proceso. Consulta su historial.',
          );
        const datos = d.datos
          ? { anterior: criticosSchema.parse(eCriticos(e)), nuevo: d.datos }
          : null;
        if (datos && JSON.stringify(datos.anterior) === JSON.stringify(datos.nuevo))
          throw new ErrorConflicto('No hay cambios en los datos críticos.');
        const id = await repo.crear(
          c,
          e.id,
          t.id,
          d.observaciones,
          datos,
          a.idUsuario,
          d.vehiculo,
          d.placa,
        );
        await repo.registrarEstado(c, id, null, 'EN_PROCESO', d.observaciones, a.idUsuario);
        const s = (await repo.solicitud(c, id))!;
        await repo.notificar(c, s, 'EN_PROCESO', a.idUsuario);
        await audit(c, a, id, 'CREAR_SOLICITUD', null, { tipo: d.tipo, idEmpleado: e.id });
        return { id };
      }),
    resolver: (auth: Autenticacion, ip: string, id: number, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        rh(a);
        const d = resolverSchema.parse(raw),
          s = await obtener(c, a, id);
        validarTransicion(s.estado, d.estado);
        if (d.estado === 'APROBADA') {
          const e = await repo.empleado(c, s.idEmpleado);
          if (!e || e.estado !== 'ACTIVO')
            throw new ErrorConflicto('El empleado ya no está activo. Revisa el expediente.');
          if (s.tipo === 'PARQUEO') {
            await aprobarParqueo(c, a, e.id, id, s.vehiculo, s.placa);
          }
          if (s.tipo === 'ACTUALIZACION_DATOS') {
            const propuesto = JSON.parse(s.datos!) as { anterior: unknown; nuevo: unknown };
            const antes = criticosSchema.parse(propuesto.anterior),
              nuevo = criticosSchema.parse(propuesto.nuevo);
            if (JSON.stringify(antes) !== JSON.stringify(eCriticos(e)))
              throw new ErrorConflicto(
                'Los datos originales cambiaron. Rechaza esta solicitud y pide una nueva con el expediente actual.',
              );
            await repo.actualizarCriticos(c, e.id, nuevo, a.idUsuario);
            await audit(c, a, e.id, 'APROBAR_DATOS_CRITICOS', antes, nuevo, 'EMPLEADOS');
          }
          if (s.generaPdf) await pdf(c, s, e, a);
        }
        await repo.registrarEstado(c, id, s.estado, d.estado, d.motivo, a.idUsuario);
        await repo.notificar(c, (await repo.solicitud(c, id))!, d.estado, a.idUsuario);
        await audit(
          c,
          a,
          id,
          `SOLICITUD_${d.estado}`,
          { estado: s.estado },
          { estado: d.estado, motivo: d.motivo, vehiculo: s.vehiculo },
        );
        return { id };
      }),
    reemitir: (auth: Autenticacion, ip: string, id: number, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        rh(a);
        confirmarSchema.parse(raw);
        const s = await obtener(c, a, id);
        if (!s.generaPdf || !['APROBADA', 'ENTREGADA'].includes(s.estado))
          throw new ErrorConflicto('Solo se reemiten documentos aprobados o entregados.');
        const previo = await repo.documento(c, id);
        if (!previo || previo.versionMembrete)
          throw new ErrorConflicto('El documento ya tiene membrete. Conserva la versión emitida.');
        const e = await repo.empleado(c, s.idEmpleado);
        if (!e) throw new ErrorNoEncontrado();
        await repo.archivarPdf(c, id, a.idUsuario);
        await pdf(c, s, e, a);
        await repo.registrarEstado(
          c,
          id,
          s.estado,
          'APROBADA',
          'Reemisión con membrete y nueva aprobación de RRHH',
          a.idUsuario,
          true,
        );
        await audit(
          c,
          a,
          id,
          'REEMITIR_DOCUMENTO',
          { documento: previo.id },
          { estado: 'APROBADA', aprobadoPor: a.idUsuario },
        );
        return { id };
      }),
    entregar: (auth: Autenticacion, ip: string, id: number, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        rh(a);
        const d = entregarSchema.parse(raw),
          s = await obtener(c, a, id);
        validarTransicion(s.estado, 'ENTREGADA');
        if (s.generaPdf) {
          const doc = await repo.documento(c, id);
          if (!doc?.versionMembrete)
            throw new ErrorConflicto(
              'El documento anterior requiere reemisión con membrete desde el detalle.',
            );
          if (!doc || doc.sha256.toString('hex') !== d.sha256)
            throw new ErrorConflicto(
              'Revisa la vista previa vigente antes de enviar el documento.',
            );
          await repo.entregarPdf(c, id, a.idUsuario);
        }
        await repo.registrarEstado(
          c,
          id,
          s.estado,
          'ENTREGADA',
          'Entrega confirmada por RRHH',
          a.idUsuario,
        );
        await repo.notificar(c, s, 'ENTREGADA', a.idUsuario);
        await audit(
          c,
          a,
          id,
          'ENTREGAR_SOLICITUD',
          { estado: s.estado },
          { estado: 'ENTREGADA', sha256: d.sha256 },
        );
        return { id };
      }),
    documento: (auth: Autenticacion, ip: string, id: number) =>
      tx(auth, ip, async (c, a) => {
        const s = await obtener(c, a, id);
        if (a.rol === 'EMPLEADO' && s.estado !== 'ENTREGADA')
          throw new ErrorProhibido('El documento estará disponible cuando RRHH lo entregue.');
        const doc = await repo.documento(c, id);
        if (!doc?.pdf) throw new ErrorNoEncontrado();
        if (!doc.versionMembrete)
          throw new ErrorConflicto(
            'Este documento histórico fue emitido sin el membrete actual. Solicita a RRHH reemitirlo desde el detalle.',
          );
        const hash = createHash('sha256').update(doc.pdf).digest('hex');
        if (hash !== doc.sha256.toString('hex'))
          throw new ErrorConflicto(
            'El archivo no supera la verificación de integridad. Contacta a administración.',
          );
        await audit(c, a, id, 'CONSULTAR_DOCUMENTO', null, { sha256: hash, bytes: doc.pdf.length });
        return {
          nombre: doc.nombre,
          mime: 'application/pdf',
          base64: doc.pdf.toString('base64'),
          sha256: hash,
        };
      }),
    misDatos: (auth: Autenticacion, ip: string) =>
      tx(auth, ip, async (c, a) => {
        const e = await miEmpleado(c, a);
        return {
          criticos: eCriticos(e),
          contacto: {
            telefono: e.telefono,
            direccion: e.direccion,
            correo: e.correo,
            contactoNombre: e.contactoNombre ?? '',
            contactoParentesco: e.contactoParentesco ?? '',
            contactoTelefono: e.contactoTelefono ?? '',
          },
        };
      }),
    contacto: (auth: Autenticacion, ip: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        const d = contactoSchema.parse(raw),
          e = await miEmpleado(c, a);
        await repo.actualizarContacto(c, e.id, d, a.idUsuario);
        await audit(c, a, e.id, 'ACTUALIZAR_CONTACTO_PROPIO', e, d, 'EMPLEADOS');
        return { actualizado: true };
      }),
    plantillas: (auth: Autenticacion, ip: string) =>
      tx(auth, ip, async (c, a) => {
        rh(a);
        return { registros: await repo.plantillas(c), variables };
      }),
    plantilla: (auth: Autenticacion, ip: string, tipo: string, raw: unknown) =>
      tx(auth, ip, async (c, a) => {
        rh(a);
        const d = plantillaSchema.parse(raw),
          p = (await repo.plantillas(c)).find((p) => p.tipo === tipo);
        if (!p) throw new ErrorNoEncontrado();
        if (p.version !== d.version)
          throw new ErrorConflicto('La plantilla cambió. Recarga antes de editar.');
        await repo.versionar(c, p, d.contenido, a.idUsuario, variables);
        await audit(
          c,
          a,
          p.id,
          'VERSIONAR_PLANTILLA',
          { version: p.version, contenido: p.contenido },
          { version: p.version + 1, contenido: d.contenido, motivo: d.motivo },
          'PLANTILLAS_DOCUMENTO',
        );
        return { actualizado: true };
      }),
    notificaciones: (auth: Autenticacion, ip: string) =>
      tx(auth, ip, (c, a) => notificaciones(c, a.idUsuario)),
    leer: (auth: Autenticacion, ip: string, id: number) =>
      tx(auth, ip, async (c, a) => {
        await leerNotificacion(c, a.idUsuario, id);
        return { leida: true };
      }),
    exportar: (auth: Autenticacion, ip: string, q: Query) =>
      tx(auth, ip, async (c, a) => {
        const filas: unknown[][] = [
          ['Solicitud', 'Empleado', 'Tipo', 'Estado', 'Fecha', 'Motivo de rechazo'],
        ];
        for (let pagina = 1; pagina <= 100; pagina++) {
          const r = await repo.listar(
            c,
            { ...q, pagina, limite: 100 },
            a.rol === 'EMPLEADO' ? a.idUsuario : null,
          );
          if (r.total > 10000)
            throw new ErrorConflicto('Reduce los filtros para exportar hasta 10,000 solicitudes.');
          filas.push(
            ...r.registros.map((s) => [
              s.codigo,
              s.empleado,
              s.nombreTipo,
              s.estado,
              s.fecha,
              s.motivo,
            ]),
          );
          if (pagina * 100 >= r.total) break;
        }
        return escribirCsv(filas);
      }),
  };
}
function eCriticos(e: repo.Empleado) {
  return {
    nombres: e.nombres,
    apellidos: e.apellidos,
    dpi: e.dpi,
    nit: e.nit,
    estadoCivil: e.estadoCivil,
  };
}
