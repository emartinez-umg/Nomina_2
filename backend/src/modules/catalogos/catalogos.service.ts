import { limpiarPalabra } from '../codigos/codigos.generador.js';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import {
  ErrorConflicto,
  ErrorNegocio,
  ErrorNoEncontrado,
  ErrorProhibido,
} from '../../shared/errors/errors.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { revalidarActor } from '../auth/auth.service.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import type { Catalogo, DatosCatalogo, FilaCatalogo } from './catalogos.definiciones.js';
import type { QueryCatalogo } from './catalogos.schemas.js';
import * as repository from './catalogos.repository.js';
const conflicto = (campo: string, mensaje: string): never => {
  throw new ErrorNegocio(mensaje, 409, 'CONFLICTO', { [campo]: [mensaje] });
};
const traslapa = (a: DatosCatalogo, b: DatosCatalogo) =>
  String(a.vigenteDesde) <= String(b.vigenteHasta ?? '9999-12-31') &&
  String(b.vigenteDesde) <= String(a.vigenteHasta ?? '9999-12-31');
export function crearCatalogosService(db: BaseDatos) {
  async function validar(
    c: Connection,
    cat: Catalogo,
    d: DatosCatalogo,
    id: number,
    antes: FilaCatalogo | null,
  ) {
    if (antes?.enUso && ['tipos-ausencia', 'tipos-descuento'].includes(cat.slug)) {
      if (antes.codigo !== d.codigo)
        conflicto(
          'codigo',
          'El tipo tiene novedades registradas. Conserva su código o crea otro tipo.',
        );
      if (cat.slug === 'tipos-ausencia' && antes.efecto !== d.efecto)
        conflicto(
          'efecto',
          'El efecto tiene novedades registradas. Crea otro tipo para conservar el historial.',
        );
    }
    for (const f of cat.campos.filter((f) => f.referencia)) {
      const valor = d[f.nombre];
      if (valor === null) continue;
      const ref = await repository.referenciaActiva(c, f.referencia!, Number(valor));
      if (!ref)
        conflicto(f.nombre, 'El registro seleccionado no existe o está inactivo. Selecciona otro.');
      if (f.referencia === 'empleados' && ref?.DEPARTAMENTO !== d.idDepartamento)
        conflicto(f.nombre, 'El jefe responsable debe pertenecer al departamento seleccionado.');
    }
    if (
      cat.slug === 'horarios' &&
      antes?.enUso &&
      JSON.stringify(antes.dias) !== JSON.stringify(d.dias)
    )
      conflicto(
        'dias',
        'Este horario tiene asignaciones. Crea otro patrón para conservar el historial de los empleados.',
      );
    if (cat.slug === 'horarios' && antes?.enUso && antes.jornada !== d.jornada)
      conflicto(
        'jornada',
        'Este horario tiene asignaciones. Crea otro patrón con la nueva jornada.',
      );
    if (cat.slug === 'feriados' && (await repository.conflictoFeriado(c, d, id)))
      conflicto(
        'fecha',
        'La franja coincide con otro feriado aplicable a la misma localidad. Revisa fecha, localidad y horas.',
      );
    if (cat.slug === 'parametros-legales') {
      const clave = String(d.claveInterna);
      const valor = Number(d.valor);
      const max = clave.endsWith('_DIA') ? 31 : clave.endsWith('_MES') ? 12 : null;
      if (max !== null && (!Number.isInteger(valor) || valor < 1 || valor > max))
        conflicto('valor', `Ingresa un entero entre 1 y ${max} para esta posición del calendario.`);
      if (/^JORNADA_.*_HORAS$/.test(clave) && (valor <= 0 || valor > 24))
        conflicto('valor', 'La duración de una jornada debe superar 0 y no exceder 24 horas.');
    }
    if (!cat.legal) return;
    const cierre = await repository.ultimoCierre(c);
    if (cierre && String(d.vigenteDesde) <= cierre)
      conflicto(
        'vigenteDesde',
        `La vigencia afectaría periodos cerrados hasta ${cierre}. Ingresa una fecha posterior.`,
      );
    if (antes) {
      if (
        cat.slug === 'parametros-legales' &&
        (antes.codigo !== d.codigo || antes.unidad !== d.unidad)
      )
        conflicto(
          'codigo',
          'Conserva el código y la unidad al editar. Crea un parámetro separado si cambia su significado.',
        );
      if (cat.slug === 'tramos-isr' && antes.limiteInferior !== d.limiteInferior)
        conflicto('limiteInferior', 'Conserva el límite inferior al versionar el tramo.');
      if (String(d.vigenteDesde) < String(antes.vigenteDesde))
        conflicto(
          'vigenteDesde',
          'La nueva vigencia no puede comenzar antes de la versión seleccionada.',
        );
      if (!antes.activo) conflicto('vigenteDesde', 'Selecciona una versión activa para editar.');
    }
    const versiones = await repository.versiones(c, cat, d, id);
    if (cat.slug === 'parametros-legales' && versiones.some((v) => v.unidad !== d.unidad))
      conflicto('unidad', 'Las versiones de un parámetro deben usar la misma unidad.');
    if (versiones.some((v) => v.activo && traslapa(v, d)))
      conflicto(
        'vigenteDesde',
        'La vigencia se traslapa con otra versión. Selecciona la versión más reciente y una fecha posterior.',
      );
  }
  async function transaccion<T>(
    auth: Autenticacion,
    cat: Catalogo,
    operacion: (c: Connection, actor: Awaited<ReturnType<typeof revalidarActor>>) => Promise<T>,
  ) {
    try {
      return await enTransaccion(db, async (c) => {
        await repository.bloquearCatalogos(c, !!cat.legal);
        const actor = await revalidarActor(c, auth);
        if (!['ADMIN', 'RH'].includes(actor.rol)) throw new ErrorProhibido();
        return operacion(c, actor);
      });
    } catch (error) {
      const n =
        error && typeof error === 'object' && 'errorNum' in error ? error.errorNum : undefined;
      if (n === 1)
        conflicto(
          cat.slug === 'empresa' ? 'nit' : cat.slug === 'tramos-isr' ? 'vigenteDesde' : 'codigo',
          'Ya existe un registro con esa clave o fecha. Revisa los datos.',
        );
      if (n === 2292)
        throw new ErrorConflicto(
          'El registro está en uso. Puedes desactivarlo para impedir nuevas asignaciones.',
        );
      if (n === 2291)
        throw new ErrorConflicto('La referencia dejó de estar disponible. Recarga los datos.');
      throw error;
    }
  }
  const buscar = async (c: Connection, cat: Catalogo, id: number) => {
    const row = await repository.detalle(c, cat, id);
    if (!row) throw new ErrorNoEncontrado();
    return row;
  };
  return {
    listar: (cat: Catalogo, q: QueryCatalogo) =>
      db.conConexion((c) => repository.listar(c, cat, q)),
    detalle: (cat: Catalogo, id: number) => db.conConexion((c) => buscar(c, cat, id)),
    opciones: (ref: 'departamentos' | 'empleados', buscar: string, pagina: number) =>
      db.conConexion((c) => repository.opcionesReferencia(c, ref, buscar, pagina)),
    restricciones: () =>
      db.conConexion(async (c) => ({ ultimoCierre: await repository.ultimoCierre(c) })),
    guardar: (auth: Autenticacion, ip: string, cat: Catalogo, d: DatosCatalogo, id?: number) =>
      transaccion(auth, cat, async (c, actor) => {
        const antes = id ? await buscar(c, cat, id) : null;
        d = {
          ...d,
          ...(cat.campos.some((f) => f.tipo === 'codigo') ? { codigo: antes?.codigo ?? null } : {}),
        };
        if (cat.slug === 'parametros-legales')
          d.claveInterna =
            antes?.claveInterna ?? limpiarPalabra(String(d.nombre)).replace(/ /g, '_');
        await validar(c, cat, d, id ?? 0, antes);
        let destino = id;
        if (cat.legal && antes && String(d.vigenteDesde) > String(antes.vigenteDesde)) {
          await repository.cerrarVigencia(c, cat, id!, String(d.vigenteDesde), actor.idUsuario);
          await registrarAuditoria(c, {
            actor: { ...actor, ip },
            accion: 'CERRAR_VIGENCIA',
            entidad: cat.tabla,
            idEntidad: id!,
            antes,
            despues: await buscar(c, cat, id!),
            motivo: String(d.motivo),
          });
          destino = undefined;
        } else if (cat.legal && antes?.enUso)
          conflicto(
            'vigenteDesde',
            'Esta versión ya está referenciada. Indica una nueva fecha de vigencia para conservarla.',
          );
        if (cat.slug === 'tramos-isr' && (await repository.conflictosTramos(c, d, destino ?? 0)))
          conflicto(
            'limiteSuperior',
            'El rango de renta se traslapa con otro tramo de la misma vigencia.',
          );
        const nuevoId = await repository.guardar(c, cat, d, actor.idUsuario, destino);
        const despues = await buscar(c, cat, nuevoId);
        await registrarAuditoria(c, {
          actor: { ...actor, ip },
          accion: destino ? 'EDITAR_CATALOGO' : antes ? 'VERSIONAR_CATALOGO' : 'CREAR_CATALOGO',
          entidad: cat.tabla,
          idEntidad: nuevoId,
          antes,
          despues,
          ...(typeof d.motivo === 'string' ? { motivo: d.motivo } : {}),
        });
        return despues;
      }),
    estado: (
      auth: Autenticacion,
      ip: string,
      cat: Catalogo,
      id: number,
      activo: boolean,
      motivo: string,
      confirmado?: true,
    ) =>
      transaccion(auth, cat, async (c, actor) => {
        const antes = await buscar(c, cat, id);
        if (antes.activo === activo) throw new ErrorConflicto('El registro ya tiene ese estado.');
        if (cat.legal) {
          if (!confirmado) conflicto('confirmado', 'Confirma la advertencia del cambio legal.');
          const cierre = await repository.ultimoCierre(c);
          if ((cierre && String(antes.vigenteDesde) <= cierre) || antes.enUso)
            conflicto(
              'vigenteDesde',
              'Esta versión conserva historia de nómina. Crea una nueva vigencia para cambiar su aplicación.',
            );
          if (activo) {
            await validar(c, cat, antes, id, null);
            if (cat.slug === 'tramos-isr' && (await repository.conflictosTramos(c, antes, id)))
              conflicto('limiteSuperior', 'La activación traslaparía otro tramo vigente.');
          }
        } else if (activo) await validar(c, cat, antes, id, null);
        await repository.cambiarEstado(c, cat, id, activo, actor.idUsuario);
        const despues = await buscar(c, cat, id);
        await registrarAuditoria(c, {
          actor: { ...actor, ip },
          accion: activo ? 'ACTIVAR_CATALOGO' : 'DESACTIVAR_CATALOGO',
          entidad: cat.tabla,
          idEntidad: id,
          antes,
          despues,
          motivo,
        });
        return despues;
      }),
    eliminar: (
      auth: Autenticacion,
      ip: string,
      cat: Catalogo,
      id: number,
      motivo: string,
      fisica: boolean,
    ) =>
      transaccion(auth, cat, async (c, actor) => {
        if (fisica && actor.rol !== 'ADMIN')
          throw new ErrorProhibido('Solo ADMIN puede eliminar físicamente.');
        const antes = await buscar(c, cat, id);
        if (antes.enUso)
          throw new ErrorNegocio(
            'El registro está en uso. Usa Desactivar para impedir nuevas asignaciones sin perder su historial.',
            409,
            'REGISTRO_EN_USO',
          );
        if (cat.legal) {
          const cierre = await repository.ultimoCierre(c);
          if (cierre && String(antes.vigenteDesde) <= cierre)
            conflicto('vigenteDesde', 'La versión afecta periodos cerrados y debe conservarse.');
        }
        if (fisica) await repository.eliminar(c, cat, id);
        else await repository.cambiarEstado(c, cat, id, false, actor.idUsuario);
        await registrarAuditoria(c, {
          actor: { ...actor, ip },
          accion: fisica ? 'ELIMINAR_CATALOGO' : 'BAJA_CATALOGO',
          entidad: cat.tabla,
          idEntidad: id,
          antes,
          despues: fisica ? null : { ...antes, activo: false },
          motivo,
        });
        return { id };
      }),
  };
}
