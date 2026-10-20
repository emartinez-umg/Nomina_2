import { nitValido } from './empleados.schemas.js';
import {
  normalizarNit,
  grupoParcial,
  camposSalariales,
} from '../../shared/empleados/validadores.js';
import { nombrePersona } from '../../shared/utils/nombre.js';
import { membrete } from '../empresa/empresa.service.js';
import { credencialesTemporalesPdf } from '../../shared/pdf/credenciales.js';
import { municipio } from '../ubicaciones/ubicaciones.repository.js';
import { zonaValida } from '../ubicaciones/ubicaciones.schemas.js';
import { buscarUsuario, cambiarCredencial } from '../auth/auth.repository.js';
import {
  generarContrasenaTemporal,
  hashearContrasena,
} from '../../shared/security/credenciales.js';
import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import type { Connection } from 'oracledb';
import type { z } from 'zod';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import {
  ErrorConflicto,
  ErrorNegocio,
  ErrorNoEncontrado,
  ErrorProhibido,
} from '../../shared/errors/errors.js';
import type { Autenticacion, ActorAuditoria } from '../auth/auth.types.js';
import { revalidarActor } from '../auth/auth.service.js';
import { revocarSesiones } from '../auth/auth.repository.js';
import { crearUsuarioInterno } from '../usuarios/usuarios.service.js';
import { cambiarEstado, bloquearAdministracion } from '../usuarios/usuarios.repository.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { crearEmpleadoSchema, erroresFechas } from './empleados.schemas.js';
import type {
  DatosEmpleado,
  EditarEmpleado,
  QueryEmpleados,
  salarioSchema,
  bajaSchema,
  ReglasEmpleado,
} from './empleados.schemas.js';
import { leerCsv, escribirCsv } from './empleados.csv.js';
import * as repo from './empleados.repository.js';
const rechazar = (campos: Record<string, string[]>, estado = 422): never => {
  throw new ErrorNegocio(
    'Revisa los campos indicados antes de continuar.',
    estado,
    estado === 409 ? 'CONFLICTO' : 'VALIDACION',
    campos,
  );
};
export function crearEmpleadosService(db: BaseDatos) {
  async function tx<T>(
    auth: Autenticacion,
    ip: string,
    fn: (c: Connection, actor: ActorAuditoria) => Promise<T>,
  ) {
    try {
      return await enTransaccion(db, async (c) => {
        await bloquearCatalogos(c, true);
        const actor = await revalidarActor(c, auth);
        if (!['RH', 'ADMIN'].includes(actor.rol)) throw new ErrorProhibido();
        return fn(c, { ...actor, ip });
      });
    } catch (e) {
      if (e && typeof e === 'object' && 'errorNum' in e) {
        if (e.errorNum === 1)
          throw new ErrorConflicto(
            'Uno de los datos únicos ya está registrado. Recarga y revisa código, DPI, NIT, IGSS y correo.',
          );
        if (e.errorNum === 2291)
          throw new ErrorConflicto(
            'Una referencia dejó de estar disponible. Recarga los catálogos.',
          );
      }
      throw e;
    }
  }
  async function buscar(c: Connection, id: number) {
    const d = await repo.detalle(c, id);
    if (!d) throw new ErrorNoEncontrado();
    return d;
  }
  async function reglas(c: Connection) {
    const r = await repo.reglas(c);
    if (
      !Number.isInteger(r.edadMinima) ||
      !Number.isInteger(r.edadMaxima) ||
      r.edadMinima < 1 ||
      r.edadMaxima < r.edadMinima
    )
      throw new ErrorConflicto(
        'Configura las edades mínima y máxima vigentes en Parámetros legales.',
      );
    return r;
  }
  async function validar(
    c: Connection,
    d: DatosEmpleado | EditarEmpleado,
    r: ReglasEmpleado,
    antes?: repo.Empleado,
  ) {
    const errores = { ...erroresFechas(d, r), ...(await repo.duplicados(c, d, antes?.id)) };
    if (r.validarDigitoNit && !nitValido(d.nit))
      errores.nit = ['El dígito verificador del NIT no coincide. Revisa el número.'];
    if (
      grupoParcial(
        {
          ...d,
          salarioBase:
            'salarioBase' in d ? (d.salarioBase ?? antes?.salarioBase) : antes?.salarioBase,
        },
        camposSalariales,
      )
    )
      for (const key of camposSalariales)
        if (!(key === 'salarioBase' ? (d.salarioBase ?? antes?.salarioBase) : d[key]))
          errores[key] = ['Completa salario, banco, cuenta y tipo, o deja el paso vacío.'];
    for (const key of Object.keys(repo.referencias) as (keyof typeof repo.referencias)[]) {
      const value = d[key];
      if (value === null) continue;
      const ref = await repo.referencia(c, key, value);
      if (!ref || (!ref.activo && antes?.[key] !== value))
        errores[key] = ['Selecciona un registro activo de la lista.'];
      if (key === 'idTipoContrato' && ref) {
        if (ref.requiereFechaFin && (!d.fechaFinContrato || d.fechaFinContrato <= d.fechaIngreso))
          errores.fechaFinContrato = ['Este contrato exige una fecha de fin posterior al ingreso.'];
        if (!ref.requiereFechaFin && d.fechaFinContrato)
          errores.fechaFinContrato = [
            'El contrato indefinido no tiene fecha de fin. Deja el campo vacío.',
          ];
      }
      if (ref?.departamento && ref.departamento !== d.idDepartamento)
        errores[key] = ['La selección debe pertenecer al departamento del empleado.'];
    }
    const lugar = await municipio(c, d.idMunicipioGt);
    if (!lugar || lugar.idDepartamentoGt !== d.idDepartamentoGt)
      errores.idMunicipioGt = ['Selecciona un municipio activo del departamento elegido.'];
    if (lugar && !zonaValida(lugar.codigo, d.zona))
      errores.zona = ['Selecciona una zona del 1 al 25 para el municipio de Guatemala.'];
    if (
      d.contactoParentesco &&
      antes?.contactoParentesco !== d.contactoParentesco &&
      !(await repo.parentescos(c)).some((p) => p.value === d.contactoParentesco)
    )
      errores.contactoParentesco = ['Selecciona un parentesco del catálogo.'];
    if (Object.keys(errores).length) rechazar(errores, 409);
    return `${d.direccion}${d.zona ? ', zona ' + d.zona : ''}, ${lugar!.nombre}, ${lugar!.departamento}`;
  }
  async function advertencias(c: Connection, salario: string | null, desde: string) {
    if (!salario)
      return [
        'Perfil incompleto: falta salario base. Se excluye de la simulación de planilla hasta registrar una vigencia salarial.',
      ];
    const minimo = await repo.salarioMinimo(c, desde);
    return minimo
      ? new Decimal(salario).lt(minimo)
        ? [
            `El salario Q ${salario} es menor al mínimo parametrizado de Q ${minimo}. Verifica la categoría legal aplicable.`,
          ]
        : []
      : [
          'No hay salario mínimo mensual parametrizado para esta fecha. RRHH debe configurar SALARIO_MINIMO_MENSUAL (QUETZALES).',
        ];
  }
  const audit = (
    c: Connection,
    actor: ActorAuditoria,
    id: number,
    accion: string,
    antes: unknown,
    despues: unknown,
    motivo: string,
  ) =>
    registrarAuditoria(c, {
      actor,
      accion,
      entidad: 'EMPLEADOS',
      idEntidad: id,
      antes,
      despues,
      motivo,
    });
  async function alta(c: Connection, actor: ActorAuditoria, d: DatosEmpleado) {
    const direccion = await validar(c, d, await reglas(c));
    const id = await repo.guardar(c, d, actor.idUsuario, undefined, undefined, direccion);
    const credenciales = await crearUsuarioInterno(c, actor, {
      nombre: d.nombres.split(' ')[0]!,
      apellido: d.apellidos.split(' ')[0]!,
      correo: d.correo,
      rol: 'EMPLEADO',
    });
    await repo.vincularUsuario(c, id, credenciales.idUsuario, actor.idUsuario);
    if (d.salarioBase)
      await repo.agregarHistorial(
        c,
        id,
        'salario',
        d.salarioBase,
        d.fechaIngreso,
        'Salario inicial al contratar',
        actor.idUsuario,
      );
    await repo.agregarHistorial(
      c,
      id,
      'horario',
      d.idHorario,
      d.fechaIngreso,
      'Horario inicial al contratar',
      actor.idUsuario,
    );
    const empleado = await buscar(c, id);
    await audit(c, actor, id, 'CREAR_EMPLEADO', null, empleado, 'Alta de empleado');
    return {
      empleado,
      credenciales: { ...credenciales, nombre: `${d.nombres} ${d.apellidos}` },
      advertencias: await advertencias(c, d.salarioBase, d.fechaIngreso),
    };
  }
  async function validarHistorial(
    c: Connection,
    id: number,
    tipo: 'salario' | 'horario',
    desde: string,
    ingreso: string,
    r: ReglasEmpleado,
  ) {
    const key = tipo === 'salario' ? 'fechaEfectiva' : 'fechaHorario';
    if (desde < ingreso)
      rechazar({ [key]: ['La fecha efectiva no puede ser anterior al ingreso.'] });
    if (r.ultimoCierre && desde <= r.ultimoCierre)
      rechazar({
        [key]: [
          `La fecha afectaría periodos cerrados hasta ${r.ultimoCierre}. Selecciona una fecha posterior.`,
        ],
      });
    const h = await repo.historial(c, id, tipo);
    if (h[0] && desde <= h[0].desde)
      rechazar({
        [key]: [
          'La nueva vigencia debe ser posterior al último cambio registrado, incluidos los programados.',
        ],
      });
  }
  async function revisarFilas(
    c: Connection,
    filas: { numero: number; datos: Record<string, unknown>; errores: Record<string, string[]> }[],
    r: ReglasEmpleado,
  ) {
    const claveUnica = (key: string, v: unknown) =>
      typeof v === 'string'
        ? key === 'correo'
          ? v.trim().toLowerCase()
          : key === 'nit'
            ? normalizarNit(v)
            : v
        : v;
    const conteos: Record<string, Map<unknown, number>> = {};
    for (const key of Object.keys(repo.unicos)) {
      const mapa = new Map<unknown, number>();
      for (const f of filas) {
        const v = claveUnica(key, f.datos[key]);
        if (v) mapa.set(v, (mapa.get(v) ?? 0) + 1);
      }
      conteos[key] = mapa;
    }
    const salida = [];
    for (const f of filas) {
      const errores: Record<string, string[]> = f.errores.csv ? { csv: f.errores.csv } : {};
      const datos = { ...f.datos };
      if ('codigoHorario' in datos) {
        datos.idHorario = await repo.horarioPorCodigo(c, String(datos.codigoHorario));
        delete datos.codigoHorario;
      }
      const p = crearEmpleadoSchema.safeParse(datos);
      if (!p.success)
        for (const issue of p.error.issues)
          (errores[
            issue.path.join('.') === 'idHorario' && 'codigoHorario' in f.datos
              ? 'codigoHorario'
              : issue.path.join('.')
          ] ??= []).push(
            issue.path.join('.') === 'idHorario' && 'codigoHorario' in f.datos
              ? 'El código de horario no existe o está inactivo. Consulta Organización → Horarios.'
              : issue.message,
          );
      else
        try {
          await validar(c, p.data, r);
        } catch (e) {
          if (e instanceof ErrorNegocio && e.campos) Object.assign(errores, e.campos);
          else throw e;
        }
      for (const [key, mapa] of Object.entries(conteos))
        if ((mapa.get(claveUnica(key, f.datos[key])) ?? 0) > 1)
          errores[key] = [
            'Este dato está repetido dentro del archivo. Corrige todas sus apariciones.',
          ];
      salida.push({
        ...f,
        datos: 'codigoHorario' in f.datos ? f.datos : p.success ? p.data : f.datos,
        errores,
        advertencias: p.success
          ? await advertencias(c, p.data.salarioBase, p.data.fechaIngreso)
          : [],
      });
    }
    return salida;
  }
  const publicas = (filas: Awaited<ReturnType<typeof revisarFilas>>) =>
    filas.map((f) => ({
      numero: f.numero,
      nombre: nombrePersona(String(f.datos.nombres ?? ''), String(f.datos.apellidos ?? '')),
      errores: f.errores,
      advertencias: f.advertencias,
    }));
  async function autorizarCarga(c: Connection, id: number, actor: number) {
    const carga = await repo.carga(c, id);
    if (!carga) throw new ErrorNoEncontrado();
    if (carga.idUsuario !== actor)
      throw new ErrorProhibido('Solo quien creó la carga puede consultarla o confirmarla.');
    return carga;
  }
  return {
    parentescos: () => db.conConexion(repo.parentescos),
    restablecer: (auth: Autenticacion, ip: string, id: number, motivo: string) =>
      tx(auth, ip, async (c, actor) => {
        const e = await buscar(c, id);
        await bloquearAdministracion(c);
        const u = e.idUsuario ? await buscarUsuario(c, { id: e.idUsuario }) : null;
        if (!u || u.rol !== 'EMPLEADO' || !u.activo || e.estado === 'EGRESADO')
          throw new ErrorConflicto(
            'Solo puedes restablecer el acceso activo de un empleado. Las cuentas RH/ADMIN se administran en Usuarios.',
          );
        const empresa = await membrete(c);
        const contrasenaTemporal = generarContrasenaTemporal();
        await cambiarCredencial(
          c,
          u.idUsuario,
          await hashearContrasena(contrasenaTemporal),
          true,
          actor.idUsuario,
        );
        await revocarSesiones(c, u.idUsuario, actor.idUsuario);
        await registrarAuditoria(c, {
          actor,
          accion: 'RESTABLECER_CONTRASENA',
          entidad: 'USUARIOS',
          idEntidad: u.idUsuario,
          motivo,
          despues: { cambioObligatorio: true },
        });
        const credenciales = {
          idUsuario: u.idUsuario,
          nombre: `${e.nombres} ${e.apellidos}`,
          usuario: u.usuario,
          contrasenaTemporal,
        };
        const pdf = await credencialesTemporalesPdf(empresa, [credenciales]);
        return { credenciales, pdfCredenciales: pdf.toString('base64') };
      }),
    reglas: (desde?: string) =>
      db.conConexion(async (c) => {
        const r = await reglas(c);
        return { ...r, salarioMinimo: await repo.salarioMinimo(c, desde ?? r.hoy) };
      }),
    opciones: (
      key: keyof typeof repo.referencias,
      buscar: string,
      pagina: number,
      seleccionado?: number,
      departamento?: number,
    ) => db.conConexion((c) => repo.opciones(c, key, buscar, pagina, seleccionado, departamento)),
    listar: (q: QueryEmpleados) => db.conConexion((c) => repo.listar(c, q)),
    exportar: (q: QueryEmpleados) =>
      db.conConexion(async (c) => {
        const filas: unknown[][] = [
          [
            'Código',
            'Nombre',
            'DPI (protegido)',
            'NIT (protegido)',
            'Departamento',
            'Puesto',
            'Ingreso',
            'Salario mensual',
            'Estado',
            'Perfil',
            'Datos pendientes',
          ],
        ];
        let pagina = 1;
        do {
          const r = await repo.listar(c, { ...q, pagina, limite: 100 });
          for (const d of r.registros)
            filas.push([
              d.codigo,
              d.nombre,
              d.dpi,
              d.nit,
              d.departamento,
              d.puesto,
              d.fechaIngreso,
              d.salarioBase,
              d.estado,
              d.perfilIncompleto ? 'Perfil incompleto' : 'Completo',
              (d.faltantes as string[]).join(', '),
            ]);
          if (pagina * 100 >= r.total) break;
          pagina++;
        } while (pagina <= 1000);
        if (pagina > 1000)
          throw new ErrorConflicto(
            'La consulta supera 100,000 empleados. Reduce los filtros para exportar.',
          );
        return escribirCsv(filas);
      }),
    detalle: (id: number) => db.conConexion((c) => buscar(c, id)),
    pestana: (id: number, tipo: string, pagina: number) =>
      db.conConexion(async (c) => {
        await buscar(c, id);
        return repo.pestana(c, id, tipo, pagina);
      }),
    crear: (auth: Autenticacion, ip: string, d: DatosEmpleado) =>
      tx(auth, ip, async (c, actor) => {
        const empresa = await membrete(c);
        const a = await alta(c, actor, d);
        const pdf = await credencialesTemporalesPdf(empresa, [a.credenciales]);
        return { ...a, pdfCredenciales: pdf.toString('base64') };
      }),
    editar: (auth: Autenticacion, ip: string, id: number, d: EditarEmpleado) =>
      tx(auth, ip, async (c, actor) => {
        const antes = await buscar(c, id);
        if (antes.estado === 'EGRESADO')
          throw new ErrorConflicto(
            'El empleado está egresado. Su expediente se conserva para consulta.',
          );
        const r = await reglas(c);
        const direccion = await validar(c, d, r, antes);
        if (antes.fechaIngreso !== d.fechaIngreso)
          rechazar({
            fechaIngreso: [
              'El ingreso tiene historial salarial y horario. Se conserva la fecha original.',
            ],
          });
        if (
          r.ultimoCierre &&
          antes.fechaIngreso <= r.ultimoCierre &&
          [
            'idDepartamento',
            'idPuesto',
            'idJefatura',
            'idCentroTrabajo',
            'idTipoContrato',
            'estado',
          ].some((k) => antes[k as keyof typeof antes] !== d[k as keyof typeof d])
        )
          throw new ErrorConflicto(
            'El empleado tiene periodos cerrados. Conserva su asignación laboral histórica.',
          );
        if (antes.idHorario !== d.idHorario) {
          if (!d.fechaHorario)
            rechazar({ fechaHorario: ['Indica la fecha efectiva del nuevo horario.'] });
          await validarHistorial(c, id, 'horario', d.fechaHorario!, d.fechaIngreso, r);
          await repo.agregarHistorial(
            c,
            id,
            'horario',
            d.idHorario,
            d.fechaHorario!,
            d.motivo,
            actor.idUsuario,
          );
        }
        if (d.salarioBase) {
          const historia = await repo.historial(c, id, 'salario');
          if (historia.length)
            rechazar({
              salarioBase: ['Utiliza Cambiar salario en la ficha para conservar las vigencias.'],
            });
          if (r.ultimoCierre && d.fechaIngreso <= r.ultimoCierre)
            rechazar({
              salarioBase: [
                'El ingreso afecta un periodo cerrado. Registra el salario inicial desde Cambiar salario en la ficha, con una fecha posterior al último cierre.',
              ],
            });
          await validarHistorial(c, id, 'salario', d.fechaIngreso, d.fechaIngreso, r);
          await repo.agregarHistorial(
            c,
            id,
            'salario',
            d.salarioBase,
            d.fechaIngreso,
            d.motivo,
            actor.idUsuario,
          );
        }
        await repo.guardar(c, d, actor.idUsuario, id, undefined, direccion);
        const despues = await buscar(c, id);
        await audit(c, actor, id, 'EDITAR_EMPLEADO', antes, despues, d.motivo);
        return despues;
      }),
    salario: (auth: Autenticacion, ip: string, id: number, d: z.infer<typeof salarioSchema>) =>
      tx(auth, ip, async (c, actor) => {
        const antes = await buscar(c, id);
        if (antes.estado === 'EGRESADO')
          throw new ErrorConflicto('No se puede cambiar el salario de un empleado egresado.');
        await validarHistorial(
          c,
          id,
          'salario',
          d.fechaEfectiva,
          antes.fechaIngreso,
          await reglas(c),
        );
        await repo.agregarHistorial(
          c,
          id,
          'salario',
          d.salarioBase,
          d.fechaEfectiva,
          d.motivo,
          actor.idUsuario,
        );
        await audit(
          c,
          actor,
          id,
          'CAMBIAR_SALARIO',
          { salarioBase: antes.salarioBase },
          d,
          d.motivo,
        );
        return {
          empleado: await buscar(c, id),
          advertencias: await advertencias(c, d.salarioBase, d.fechaEfectiva),
        };
      }),
    baja: (auth: Autenticacion, ip: string, id: number, d: z.infer<typeof bajaSchema>) =>
      tx(auth, ip, async (c, actor) => {
        const antes = await buscar(c, id);
        if (antes.estado === 'EGRESADO') throw new ErrorConflicto('El empleado ya está egresado.');
        if (d.fechaEgreso < antes.fechaIngreso)
          rechazar({ fechaEgreso: ['El egreso no puede ser anterior al ingreso.'] });
        const r = await reglas(c);
        if (r.ultimoCierre && d.fechaEgreso <= r.ultimoCierre)
          rechazar({
            fechaEgreso: [
              'El egreso afectaría periodos cerrados. Selecciona una fecha posterior al último cierre.',
            ],
          });
        await repo.baja(c, id, d.fechaEgreso, d.motivo, actor.idUsuario);
        if (antes.idUsuario) {
          await bloquearAdministracion(c);
          await cambiarEstado(c, antes.idUsuario, false, actor.idUsuario);
          await revocarSesiones(c, antes.idUsuario, actor.idUsuario);
          await registrarAuditoria(c, {
            actor,
            accion: 'DESACTIVAR_USUARIO',
            entidad: 'USUARIOS',
            idEntidad: antes.idUsuario,
            despues: { activo: false },
            motivo: d.motivo,
          });
        }
        const despues = await buscar(c, id);
        await audit(c, actor, id, 'BAJA_EMPLEADO', antes, despues, d.motivo);
        return despues;
      }),
    previsualizar: (auth: Autenticacion, ip: string, nombre: string, csv: string) =>
      tx(auth, ip, async (c, actor) => {
        const filas = await revisarFilas(c, leerCsv(csv), await reglas(c));
        const id = await repo.crearCarga(
          c,
          actor.idUsuario,
          nombre,
          createHash('sha256').update(csv).digest(),
          filas,
        );
        await registrarAuditoria(c, {
          actor,
          accion: 'VALIDAR_CARGA',
          entidad: 'CARGAS_MASIVAS',
          idEntidad: id,
          despues: { total: filas.length },
        });
        return { id, filas: publicas(filas) };
      }),
    confirmar: (
      auth: Autenticacion,
      ip: string,
      id: number,
      modalidad: 'TODO_O_NADA' | 'SOLO_VALIDAS',
    ) =>
      tx(auth, ip, async (c, actor) => {
        const carga = await autorizarCarga(c, id, actor.idUsuario);
        if (carga.estado !== 'VALIDADA')
          throw new ErrorConflicto('Esta carga ya fue importada. No puede confirmarse nuevamente.');
        const filas = await revisarFilas(
          c,
          (await repo.filasCarga(c, id)).map((f) => ({
            ...f,
            errores: f.errores.csv ? { csv: f.errores.csv } : {},
          })),
          await reglas(c),
        );
        if (modalidad === 'TODO_O_NADA' && filas.some((f) => Object.keys(f.errores).length))
          throw new ErrorNegocio(
            'La carga contiene errores o los datos cambiaron. Vuelve a validar el archivo antes de importar todo.',
            409,
            'CARGA_INVALIDA',
          );
        if (!filas.some((f) => !Object.keys(f.errores).length))
          throw new ErrorConflicto('No hay filas válidas para importar. Corrige el archivo.');
        const empresa = await membrete(c);
        const credenciales = [];
        let importadas = 0;
        for (const f of filas) {
          if (Object.keys(f.errores).length) {
            await repo.actualizarFila(c, id, f.numero, f.errores, actor.idUsuario);
            continue;
          }
          const datos = { ...f.datos };
          if ('codigoHorario' in datos) {
            datos.idHorario = await repo.horarioPorCodigo(c, String(datos.codigoHorario));
            delete datos.codigoHorario;
          }
          const a = await alta(c, actor, crearEmpleadoSchema.parse(datos));
          importadas++;
          await repo.actualizarFila(c, id, f.numero, {}, actor.idUsuario, a.empleado.id);
          if (a.credenciales) credenciales.push({ numero: f.numero, ...a.credenciales });
        }
        await repo.terminarCarga(c, id, modalidad, importadas, actor.idUsuario);
        await registrarAuditoria(c, {
          actor,
          accion: 'IMPORTAR_EMPLEADOS',
          entidad: 'CARGAS_MASIVAS',
          idEntidad: id,
          despues: { importadas, modalidad },
        });
        const pdf = await credencialesTemporalesPdf(empresa, credenciales);
        return { id, importadas, credenciales, pdfCredenciales: pdf.toString('base64') };
      }),
    reporte: (id: number, actor: number) =>
      db.conConexion(async (c) => {
        await autorizarCarga(c, id, actor);
        const filas = await repo.filasCarga(c, id);
        return escribirCsv([
          ['Fila', 'Nombre', 'Estado', 'ID empleado', 'Código', 'Usuario', 'Errores'],
          ...filas.map((f) => [
            f.numero,
            `${String(f.datos.nombres ?? '')} ${String(f.datos.apellidos ?? '')}`,
            f.estado,
            f.idEmpleado,
            f.codigo,
            f.usuario,
            Object.entries(f.errores)
              .map(([k, v]) => `${k}: ${v.join(' ')}`)
              .join(' | '),
          ]),
        ]);
      }),
  };
}
