import { escribirCsv } from '../empleados/empleados.csv.js';
import { etiquetaEstado } from '../../shared/presentacion/estados.js';
import { createHash } from 'node:crypto';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import type { AlmacenPrivado } from '../../shared/archivos/almacen.js';
import { verificarArchivo, errorAlmacen } from '../../shared/archivos/almacen.js';
import { nombreArchivo } from '../../shared/utils/archivo.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import {
  ErrorConflicto,
  ErrorNoEncontrado,
  ErrorProhibido,
  ErrorValidacion,
} from '../../shared/errors/errors.js';
import { verificarPropiedad } from '../../shared/security/rbac.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { revalidarActor } from '../auth/auth.service.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { firmante, membrete } from '../empresa/empresa.service.js';
import { rellenarPlantilla } from '../solicitudes/solicitudes.pdf.js';
import { crearNovedadesService } from '../novedades/novedades.service.js';
import {
  actaSchema,
  accionActaSchema,
  plantillaActaSchema,
  validarFechaHecho,
  validarDiasSuspension,
  variablesActa,
} from '../../shared/actas/modelo.js';
import type { DatosActa } from '../../shared/actas/modelo.js';
import { queryActasSchema, cargaActaSchema } from './actas.schemas.js';
import type { QueryActas } from './actas.schemas.js';
import { actaPdf } from './actas.pdf.js';
import * as repo from './actas.repository.js';
const administrar = (a: Autenticacion) => {
  if (!['RH', 'ADMIN'].includes(a.rol)) throw new ErrorProhibido();
};
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const errorCampo = (campo: string, mensaje: string): never => {
  throw new ErrorValidacion({ [campo]: [mensaje] });
};
const version = (a: repo.Acta, v: number | undefined) => {
  if (a.version !== v)
    throw new ErrorConflicto('El acta cambió. Actualiza antes de guardar o confirmar.');
};
export function crearActasService(db: BaseDatos, almacen: AlmacenPrivado) {
  const novedades = crearNovedadesService(db);
  const audit = (
    c: Connection,
    a: Autenticacion,
    ip: string,
    accion: string,
    id: number,
    antes?: unknown,
    despues?: unknown,
    motivo?: string,
  ) =>
    registrarAuditoria(c, {
      actor: { ...a, ip },
      entidad: 'ACTAS_ADMINISTRATIVAS',
      idEntidad: id,
      accion,
      antes,
      despues,
      ...(motivo ? { motivo } : {}),
    });
  const tx = <T>(a: Autenticacion, fn: (c: Connection, actor: Autenticacion) => Promise<T>) =>
    enTransaccion(db, async (c) => {
      await bloquearCatalogos(c, true);
      const actor = await revalidarActor(c, a);
      administrar(actor);
      return fn(c, actor);
    });
  async function acceso(c: Connection, a: Autenticacion, id: number, bloquear = false) {
    const d = await repo.acta(c, id);
    if (!d) throw new ErrorNoEncontrado();
    const e = await repo.empleado(c, d.idEmpleado, bloquear);
    if (!e) throw new ErrorNoEncontrado();
    verificarPropiedad(a, e.idUsuario);
    const actual = bloquear ? (await repo.acta(c, id, true))! : d;
    if (a.rol === 'EMPLEADO' && !actual.emitidaEn) throw new ErrorProhibido();
    return { d: actual, e };
  }
  async function reglas(c: Connection) {
    const r = await repo.reglas(c);
    if (
      !r.maxDias ||
      !Number.isInteger(r.maxDias) ||
      r.maxDias < 1 ||
      r.maxDias > 366 ||
      !r.maxMb ||
      !Number.isInteger(r.maxMb) ||
      r.maxMb > 50 ||
      r.maxMb < 1
    )
      throw new ErrorConflicto(
        'Configura ACTAS_MAX_DIAS_SUSPENSION (1–366 días) y EXPEDIENTE_MAX_MB (1–50) en Parámetros legales.',
      );
    return { ...r, maxDias: r.maxDias, maxMb: r.maxMb };
  }
  async function validar(c: Connection, d: DatosActa) {
    const e = await repo.empleado(c, d.idEmpleado, true);
    if (!e) errorCampo('idEmpleado', 'Selecciona un empleado existente.');
    const r = await reglas(c),
      t = (await repo.tipos(c)).find((x) => x.id === d.idTipo);
    if (!t) errorCampo('idTipo', 'Selecciona un tipo de acta activo.');
    const f = validarFechaHecho(d.fechaHecho, e!.ingreso, r.hoy);
    if (f) errorCampo('fechaHecho', f);
    const dias = validarDiasSuspension(d.diasSuspension, t!.suspension === 1, r.maxDias);
    if (dias) errorCampo('diasSuspension', dias);
    return { e: e!, r, t: t! };
  }
  return {
    reglas: (a: Autenticacion) =>
      db.conConexion(async (c) => {
        administrar(a);
        return { ...(await reglas(c)), tipos: await repo.tipos(c, false) };
      }),
    listar: (a: Autenticacion, ip: string, q: QueryActas) =>
      enTransaccion(db, async (c) => {
        const r = await repo.listar(c, q, a.rol === 'EMPLEADO' ? a.idUsuario : undefined);
        await audit(c, a, ip, 'LISTAR_ACTAS', 0, undefined, {
          filtros: q,
          propio: a.rol === 'EMPLEADO',
        });
        return r;
      }),
    exportar: (a: Autenticacion, ip: string, q: QueryActas) =>
      enTransaccion(db, async (c) => {
        const r = await repo.listar(
          c,
          { ...q, pagina: 1, limite: 100000 },
          a.rol === 'EMPLEADO' ? a.idUsuario : undefined,
        );
        if (r.total > 100000)
          throw new ErrorConflicto('Reduce los filtros para exportar hasta 100,000 actas.');
        await audit(c, a, ip, 'EXPORTAR_ACTAS', 0, undefined, { filtros: q, total: r.total });
        return escribirCsv([
          ['Código', 'Empleado', 'Departamento', 'Tipo', 'Fecha del hecho', 'Estado'],
          ...r.registros.map((d) => [
            d.codigo,
            d.empleado,
            d.departamento,
            d.tipo,
            d.fechaHecho.split('-').reverse().join('/'),
            etiquetaEstado(d.estado),
          ]),
        ]);
      }),
    antecedentes: (a: Autenticacion, ip: string, id: number, pagina: number) =>
      enTransaccion(db, async (c) => {
        administrar(a);
        const e = await repo.empleado(c, id);
        if (!e) throw new ErrorNoEncontrado();
        const r = await repo.listar(
          c,
          queryActasSchema.parse({ idEmpleado: id, pagina }),
          undefined,
          true,
        );
        await audit(c, a, ip, 'CONSULTAR_ANTECEDENTES_ACTAS', id);
        return { ...r, ingreso: e.ingreso };
      }),
    detalle: (a: Autenticacion, ip: string, id: number) =>
      enTransaccion(db, async (c) => {
        const { d } = await acceso(c, a, id);
        const adjuntos = (await repo.adjuntos(c, id)).map(({ clave: _, idActa: __, ...p }) => p);
        const historial = await repo.historial(c, id);
        await audit(c, a, ip, 'CONSULTAR_ACTA', id);
        return {
          ...d,
          testigos: d.testigos ?? '',
          descargos: d.descargos ?? '',
          adjuntos,
          historial:
            a.rol === 'EMPLEADO' ? historial.filter((x) => x.estado !== 'BORRADOR') : historial,
        };
      }),
    guardar: (a: Autenticacion, ip: string, raw: unknown, id?: number) =>
      tx(a, async (c, actor) => {
        const d = actaSchema.parse(raw),
          antes = id ? (await acceso(c, actor, id, true)).d : null;
        if (antes) {
          version(antes, d.version);
          if (antes.estado !== 'BORRADOR')
            throw new ErrorConflicto(
              'El acta emitida no se puede editar. Solo admite firma, negativa o anulación.',
            );
          if (d.idEmpleado !== antes.idEmpleado)
            errorCampo('idEmpleado', 'El empleado de un acta existente no se puede cambiar.');
        } else if (d.version) errorCampo('version', 'Un acta nueva no tiene versión anterior.');
        await validar(c, d);
        const actaId = await repo.guardar(c, d, actor.idUsuario, id);
        if (!antes) await repo.transicion(c, actaId, null, 'BORRADOR', actor.idUsuario);
        const despues = await repo.acta(c, actaId);
        await audit(c, actor, ip, antes ? 'EDITAR_ACTA' : 'CREAR_ACTA', actaId, antes, despues);
        return { id: actaId };
      }),
    accion: (a: Autenticacion, ip: string, id: number, raw: unknown) =>
      tx(a, async (c, actor) => {
        const q = accionActaSchema.parse(raw),
          { d, e } = await acceso(c, actor, id, true);
        version(d, q.version);
        if (q.accion === 'EMITIR') {
          if (d.estado !== 'BORRADOR')
            throw new ErrorConflicto('Solo se emiten actas en borrador.');
          await validar(c, d);
          const p = await repo.plantilla(c);
          if (!p) throw new ErrorConflicto('Configura la plantilla de actas antes de emitir.');
          const firma = await firmante(c, actor.idUsuario),
            empresa = await membrete(c);
          const datos = {
            codigo: d.codigo,
            nombre: e.nombre,
            tipo: d.tipo,
            fecha_hecho: d.fechaHecho.split('-').reverse().join('/'),
            lugar: d.lugar,
            descripcion: d.descripcion,
            testigos: d.testigos || 'Sin testigos declarados',
            norma: d.norma,
            medida: d.medida,
            dias_suspension: String(d.diasSuspension),
            descargos: d.descargos || 'Sin descargos registrados',
          };
          const bytes = await actaPdf(
            d.codigo,
            p.nombre,
            rellenarPlantilla(p.contenido, datos, variablesActa),
            empresa,
            firma,
          );
          let idAusencia: number | null = null;
          if (q.registrarAusencia) {
            if (!d.diasSuspension)
              errorCampo(
                'registrarAusencia',
                'Solo una suspensión puede crear una ausencia sin goce.',
              );
            const tipo = await repo.tipoAusencia(c);
            if (!tipo)
              throw new ErrorConflicto(
                'Configura un tipo de ausencia activo sin goce y justificada sin goce.',
              );
            if (q.fechaInicio! < d.fechaHecho)
              errorCampo('fechaInicio', 'La suspensión no puede comenzar antes del hecho.');
            const fin = new Date(q.fechaInicio! + 'T00:00:00Z');
            fin.setUTCDate(fin.getUTCDate() + d.diasSuspension - 1);
            const ausencia = await novedades.registrarAusenciaEnTransaccion(
              c,
              { ...actor, ip },
              {
                idEmpleado: d.idEmpleado,
                idTipo: tipo,
                fechaInicio: q.fechaInicio,
                fechaFin: fin.toISOString().slice(0, 10),
                estado: 'APROBADA',
                motivo: `Suspensión del acta ${d.codigo}`,
                confirmado: true,
              },
            );
            idAusencia = ausencia.id;
          }
          await repo.emitir(c, id, bytes, firma, p.id, idAusencia, hash(bytes));
          await repo.transicion(c, id, d.estado, 'EMITIDA', actor.idUsuario);
          if (e.idUsuario) await repo.notificar(c, id, e.idUsuario, actor.idUsuario);
          await audit(
            c,
            actor,
            ip,
            'EMITIR_ACTA',
            id,
            { estado: d.estado },
            { estado: 'EMITIDA', firma, plantilla: p.id, pdfHash: hash(bytes), idAusencia },
          );
        } else if (q.accion === 'NEGATIVA') {
          if (d.estado !== 'EMITIDA')
            throw new ErrorConflicto(
              'Registra la negativa únicamente sobre un acta emitida pendiente de firma.',
            );
          await repo.transicion(
            c,
            id,
            d.estado,
            'SE_NEGO_A_FIRMAR',
            actor.idUsuario,
            undefined,
            q.testigos,
          );
          await audit(
            c,
            actor,
            ip,
            'NEGATIVA_FIRMA_ACTA',
            id,
            { estado: d.estado },
            { estado: 'SE_NEGO_A_FIRMAR', testigos: q.testigos },
          );
        } else {
          if (d.estado === 'BORRADOR' || d.estado === 'ANULADA')
            throw new ErrorConflicto('Solo se anula un acta emitida, firmada o con negativa.');
          await repo.transicion(c, id, d.estado, 'ANULADA', actor.idUsuario, q.motivo);
          if (e.idUsuario) await repo.notificar(c, id, e.idUsuario, actor.idUsuario, true);
          await audit(
            c,
            actor,
            ip,
            'ANULAR_ACTA',
            id,
            { estado: d.estado },
            { estado: 'ANULADA', idAusencia: d.idAusencia },
            q.motivo,
          );
        }
        return { id };
      }),
    prepararCarga: (a: Autenticacion, id: number, raw: unknown) =>
      db.conConexion(async (c) => {
        administrar(a);
        const q = cargaActaSchema.parse(raw),
          { d } = await acceso(c, a, id);
        version(d, q.version);
        if (
          (q.clase === 'FIRMA' && d.estado !== 'EMITIDA') ||
          (q.clase === 'EVIDENCIA' && d.estado !== 'BORRADOR')
        )
          throw new ErrorConflicto(
            'Adjunta evidencias en borrador o el escaneo de firma en un acta emitida.',
          );
        return reglas(c);
      }),
    cargar: async (
      a: Autenticacion,
      ip: string,
      id: number,
      raw: unknown,
      nombre: string,
      tipo: string,
      bytes: Buffer,
    ) => {
      let clave: string | undefined;
      try {
        return await tx(a, async (c, actor) => {
          const q = cargaActaSchema.parse(raw),
            { d } = await acceso(c, actor, id, true);
          version(d, q.version);
          if (
            (q.clase === 'FIRMA' && d.estado !== 'EMITIDA') ||
            (q.clase === 'EVIDENCIA' && d.estado !== 'BORRADOR')
          )
            throw new ErrorConflicto(
              'El estado del acta ya no admite ese adjunto. Actualiza el detalle.',
            );
          if (
            !nombre ||
            nombre.length > 200 ||
            nombreArchivo(nombre) !== nombre ||
            /[\r\n]/.test(nombre)
          )
            errorCampo('archivo', 'Usa un nombre de archivo sin rutas y hasta 200 caracteres.');
          if ((await repo.adjuntos(c, id)).length >= (q.clase === 'EVIDENCIA' ? 19 : 20))
            throw new ErrorConflicto('El acta admite hasta 19 evidencias y un escaneo de firma.');
          const r = await reglas(c),
            v = verificarArchivo(bytes, nombre, tipo, r.maxMb * 1024 * 1024);
          clave = await almacen.guardar(bytes);
          await repo.guardarAdjunto(c, {
            idActa: id,
            clase: q.clase,
            nombre,
            clave,
            tipo: v.tipo,
            tamano: bytes.length,
            hash: v.hash,
            actor: actor.idUsuario,
          });
          await repo.transicion(
            c,
            id,
            d.estado,
            q.clase === 'FIRMA' ? 'FIRMADA' : 'BORRADOR',
            actor.idUsuario,
          );
          await audit(
            c,
            actor,
            ip,
            q.clase === 'FIRMA' ? 'FIRMAR_ACTA' : 'ADJUNTAR_ACTA',
            id,
            { estado: d.estado },
            {
              estado: q.clase === 'FIRMA' ? 'FIRMADA' : 'BORRADOR',
              clase: q.clase,
              hash: v.hash,
              tamano: bytes.length,
            },
          );
          return { id };
        });
      } catch (error) {
        if (clave)
          try {
            if (!(await db.conConexion((c) => repo.claveRegistrada(c, clave!))))
              await almacen.retirarNoConfirmado(clave);
          } catch {
            /* Conservar bytes ante commit incierto para conciliación de R3-11. */
          }
        throw errorAlmacen(error);
      }
    },
    archivo: (a: Autenticacion, ip: string, id: number, adjunto: boolean, vista: boolean) =>
      enTransaccion(db, async (c) => {
        const f = adjunto ? await repo.adjunto(c, id) : undefined;
        if (adjunto && !f) throw new ErrorNoEncontrado();
        const { d } = await acceso(c, a, f?.idActa ?? id, true);
        if (!f && !d.emitidaEn) throw new ErrorConflicto('Emite el acta para generar su PDF.');
        let bytes: Buffer, nombre: string, tipo: string;
        if (f) {
          bytes = await almacen.leer(f.clave, f.hash, f.tamano).catch((error) => {
            throw errorAlmacen(error);
          });
          nombre = f.nombre;
          tipo = f.tipo;
        } else {
          const p = await repo.pdf(c, id);
          if (!p.bytes || hash(p.bytes) !== p.hash)
            throw new ErrorConflicto(
              'El PDF no está disponible o su integridad cambió. Solicita restaurar el respaldo.',
            );
          bytes = p.bytes;
          nombre = `${d.codigo}.pdf`;
          tipo = 'application/pdf';
        }
        await audit(c, a, ip, vista ? 'VISUALIZAR_ACTA' : 'DESCARGAR_ACTA', d.id, undefined, {
          adjunto: f?.id ?? null,
        });
        return { bytes, nombre, tipo };
      }),
    plantilla: (a: Autenticacion, ip: string) =>
      enTransaccion(db, async (c) => {
        administrar(a);
        const p = await repo.plantilla(c);
        if (!p) throw new ErrorNoEncontrado();
        await audit(c, a, ip, 'CONSULTAR_PLANTILLA_ACTA', p.id);
        return { ...p, variables: variablesActa };
      }),
    guardarPlantilla: (a: Autenticacion, ip: string, raw: unknown) =>
      tx(a, async (c, actor) => {
        const q = plantillaActaSchema.parse(raw),
          p = await repo.plantilla(c);
        if (!p || q.version !== p.version)
          throw new ErrorConflicto('La plantilla cambió. Recarga y vuelve a revisar.');
        await repo.guardarPlantilla(c, q, actor.idUsuario);
        await audit(c, actor, ip, 'EDITAR_PLANTILLA_ACTA', p.id, p, q, q.motivo);
        return { id: p.id };
      }),
  };
}
