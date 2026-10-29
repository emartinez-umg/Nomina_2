import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import {
  ErrorConflicto,
  ErrorNoEncontrado,
  ErrorProhibido,
  ErrorValidacion,
} from '../../shared/errors/errors.js';
import { verificarPropiedad } from '../../shared/security/rbac.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { nombreArchivo } from '../../shared/utils/archivo.js';
import { verificarArchivo, errorAlmacen } from '../../shared/archivos/almacen.js';
import type { AlmacenPrivado } from '../../shared/archivos/almacen.js';
import type { CargaExpediente } from './expedientes.schemas.js';
import * as repo from './expedientes.repository.js';

const administrar = (a: Autenticacion) => {
  if (!['RH', 'ADMIN'].includes(a.rol)) throw new ErrorProhibido();
};
const publico = (d: repo.DocumentoExpediente) => ({
  id: d.id,
  idTipo: d.idTipo,
  version: d.version,
  actual: d.actual === 1,
  activo: d.activo === 1,
  nombre: d.nombre,
  tipo: d.tipo,
  tamano: d.tamano,
  hash: d.hash,
  vencimiento: d.vencimiento,
  creado: d.creado,
  motivoBaja: d.motivoBaja,
  bajaEn: d.bajaEn,
});
export function estadoDocumento(
  d: { vencimiento: string | null },
  requiere: boolean,
  hoy: string,
  avisoDias: number,
) {
  if (!d.vencimiento) return requiere ? 'Falta vencimiento' : 'Vigente';
  if (d.vencimiento < hoy) return 'Vencido';
  const dias =
    (Date.parse(d.vencimiento + 'T00:00:00Z') - Date.parse(hoy + 'T00:00:00Z')) / 86400000;
  return dias <= avisoDias ? 'Por vencer' : 'Vigente';
}
export function crearExpedientesService(db: BaseDatos, almacen: AlmacenPrivado) {
  const acceso = async (c: Connection, a: Autenticacion, id: number, bloquear = false) => {
    const e = await repo.empleado(c, id, bloquear);
    if (!e) throw new ErrorNoEncontrado();
    verificarPropiedad(a, e.idUsuario);
    return e;
  };
  const reglas = async (c: Connection) => {
    const r = await repo.reglas(c);
    if (
      !r.maxMb ||
      !Number.isInteger(r.maxMb) ||
      r.maxMb < 1 ||
      r.maxMb > 50 ||
      r.avisoDias === undefined ||
      !Number.isInteger(r.avisoDias) ||
      r.avisoDias < 0 ||
      r.avisoDias > 365
    )
      throw new ErrorConflicto(
        'Configura EXPEDIENTE_MAX_MB (1–50) y EXPEDIENTE_AVISO_DIAS (0–365) en Parámetros legales.',
      );
    return { maxMb: r.maxMb, avisoDias: r.avisoDias, hoy: r.hoy };
  };
  const auditar = (
    c: Connection,
    a: Autenticacion,
    ip: string,
    accion: string,
    id: number,
    despues?: unknown,
    motivo?: string,
  ) =>
    registrarAuditoria(c, {
      actor: { ...a, ip },
      accion,
      entidad: 'EXPEDIENTE_DOCUMENTOS',
      idEntidad: id,
      despues,
      ...(motivo ? { motivo } : {}),
    });
  return {
    propio: (a: Autenticacion) =>
      db.conConexion(async (c) => {
        if (a.rol !== 'EMPLEADO') throw new ErrorProhibido();
        const id = await repo.propio(c, a.idUsuario);
        if (!id) throw new ErrorNoEncontrado();
        return { id };
      }),
    prepararCarga: (a: Autenticacion, id: number) =>
      db.conConexion(async (c) => {
        administrar(a);
        await acceso(c, a, id);
        return reglas(c);
      }),
    listar: (a: Autenticacion, ip: string, id: number, pagina = 1, tipo?: number) =>
      enTransaccion(db, async (c) => {
        await acceso(c, a, id);
        const r = await reglas(c),
          tipos = await repo.tipos(c),
          actuales = await repo.actuales(c, id),
          historia = await repo.listar(c, id, pagina, tipo);
        const vigentes = tipos.filter(
          (t) =>
            t.obligatorio === 1 &&
            actuales.some(
              (d) =>
                d.idTipo === t.id &&
                ['Vigente', 'Por vencer'].includes(
                  estadoDocumento(d, t.requiereVencimiento === 1, r.hoy, r.avisoDias),
                ),
            ),
        ).length;
        await auditar(c, a, ip, 'CONSULTAR_EXPEDIENTE', id);
        return {
          ...r,
          tipos: tipos.map((t) => ({
            ...t,
            obligatorio: t.obligatorio === 1,
            requiereVencimiento: t.requiereVencimiento === 1,
          })),
          completos: vigentes,
          requeridos: tipos.filter((t) => t.obligatorio === 1).length,
          actuales: actuales.map((d) => ({
            ...publico(d),
            estado: estadoDocumento(
              d,
              tipos.find((t) => t.id === d.idTipo)?.requiereVencimiento === 1,
              r.hoy,
              r.avisoDias,
            ),
          })),
          historial: {
            ...historia,
            registros: historia.registros.map((d) => ({
              ...publico(d),
              estado: estadoDocumento(
                d,
                tipos.find((t) => t.id === d.idTipo)?.requiereVencimiento === 1,
                r.hoy,
                r.avisoDias,
              ),
            })),
          },
        };
      }),
    cargar: async (
      a: Autenticacion,
      ip: string,
      id: number,
      q: CargaExpediente,
      nombre: string,
      declarado: string,
      bytes: Buffer,
    ) => {
      administrar(a);
      let clave: string | undefined;
      try {
        return await enTransaccion(db, async (c) => {
          await acceso(c, a, id, true);
          const r = await reglas(c),
            t = (await repo.tipos(c)).find((t) => t.id === q.tipo);
          if (!t) throw new ErrorValidacion({ tipo: ['Selecciona un tipo de documento activo.'] });
          const limpio = nombreArchivo(nombre);
          if (!limpio || limpio.length > 200 || limpio !== nombre || /[\r\n]/.test(nombre))
            throw new ErrorValidacion({
              archivo: [
                'Usa un nombre de archivo de hasta 200 caracteres, sin rutas ni caracteres especiales.',
              ],
            });
          if (t.requiereVencimiento === 1 && !q.vencimiento)
            throw new ErrorValidacion({
              vencimiento: ['Este tipo requiere una fecha de vencimiento.'],
            });
          const verificado = verificarArchivo(bytes, limpio, declarado, r.maxMb * 1024 * 1024);
          const actual = (await repo.actuales(c, id)).find((d) => d.idTipo === q.tipo);
          if ((actual?.id ?? undefined) !== q.anterior)
            throw new ErrorConflicto(
              'El expediente cambió. Actualiza la lista y selecciona Reemplazar sobre la versión actual.',
            );
          if (actual) await repo.superar(c, actual.id, a.idUsuario);
          clave = await almacen.guardar(bytes);
          const creado = await repo.insertar(c, {
            empleado: id,
            tipo: q.tipo,
            nombre: limpio,
            clave,
            contenido: verificado.tipo,
            tamano: bytes.length,
            hash: verificado.hash,
            vencimiento: q.vencimiento,
            usuario: a.idUsuario,
          });
          await auditar(c, a, ip, 'CARGAR_EXPEDIENTE', creado.id, {
            idEmpleado: id,
            idTipo: q.tipo,
            version: creado.version,
            reemplaza: actual?.id ?? null,
            hash: verificado.hash,
            tamano: bytes.length,
            vencimiento: q.vencimiento ?? null,
          });
          return creado;
        });
      } catch (error) {
        if (clave) {
          // Ante un resultado de commit incierto se conserva el archivo: nunca retirar bytes
          // que pudieran tener metadatos confirmados. La conciliación operativa es de solo lectura.
          try {
            const registrada = await db.conConexion((c) => repo.claveRegistrada(c, clave!));
            if (!registrada) await almacen.retirarNoConfirmado(clave);
          } catch {
            /* Conservar para conciliación si Oracle o el volumen no están disponibles. */
          }
        }
        throw errorAlmacen(error);
      }
    },
    archivo: (a: Autenticacion, ip: string, id: number, vista: boolean) =>
      enTransaccion(db, async (c) => {
        const d = await repo.documento(c, id);
        if (!d) throw new ErrorNoEncontrado();
        await acceso(c, a, d.idEmpleado, true);
        // Releer tras el bloqueo impide descargar simultáneamente una versión que acaba de darse de baja.
        const vigente = await repo.documento(c, id);
        if (!vigente || vigente.activo !== 1) throw new ErrorNoEncontrado();
        const bytes = await almacen
          .leer(vigente.clave, vigente.hash, vigente.tamano)
          .catch((error) => {
            throw errorAlmacen(error);
          });
        await auditar(c, a, ip, vista ? 'VISUALIZAR_EXPEDIENTE' : 'DESCARGAR_EXPEDIENTE', id, {
          idEmpleado: d.idEmpleado,
          version: d.version,
        });
        return { bytes, nombre: d.nombre, tipo: d.tipo };
      }),
    baja: (a: Autenticacion, ip: string, id: number, motivo: string) =>
      enTransaccion(db, async (c) => {
        administrar(a);
        const d = await repo.documento(c, id);
        if (!d) throw new ErrorNoEncontrado();
        await acceso(c, a, d.idEmpleado, true);
        const vigente = await repo.documento(c, id);
        if (!vigente || vigente.activo !== 1)
          throw new ErrorConflicto('Esta versión ya está dada de baja. Actualiza el expediente.');
        await repo.baja(c, id, a.idUsuario, motivo);
        await auditar(
          c,
          a,
          ip,
          'BAJA_EXPEDIENTE',
          id,
          { idEmpleado: d.idEmpleado, version: d.version },
          motivo,
        );
        return { id };
      }),
    editarTipo: (
      a: Autenticacion,
      ip: string,
      id: number,
      q: { obligatorio: boolean; requiereVencimiento: boolean; motivo: string },
    ) =>
      enTransaccion(db, async (c) => {
        administrar(a);
        const antes = (await repo.tipos(c)).find((t) => t.id === id);
        if (!antes) throw new ErrorNoEncontrado();
        await repo.editarTipo(c, id, q.obligatorio, q.requiereVencimiento, a.idUsuario);
        await registrarAuditoria(c, {
          actor: { ...a, ip },
          accion: 'CONFIGURAR_TIPO_EXPEDIENTE',
          entidad: 'TIPOS_DOCUMENTO_EXPEDIENTE',
          idEntidad: id,
          antes,
          despues: q,
          motivo: q.motivo,
        });
        return { id };
      }),
  };
}
