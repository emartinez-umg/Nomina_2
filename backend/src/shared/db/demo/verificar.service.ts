import type { Connection } from 'oracledb';
import { Decimal } from 'decimal.js';
import { verify } from 'argon2';
import { cargarDemo, opcionesDemo } from './service.js';
import { exigir, type Dataset } from './datos.js';
import * as repo from './verificar.repository.js';
import { preflight, propiedades, minimos, llave, contar } from './repository.js';
import * as empleados from '../../../modules/empleados/empleados.repository.js';
import {
  crearEmpleadoSchema,
  erroresFechas,
  fechaValida,
} from '../../../modules/empleados/empleados.schemas.js';
import {
  limitesHorario,
  detalle as detalleCatalogo,
} from '../../../modules/catalogos/catalogos.repository.js';
import { bloqueSchema } from '../../../modules/catalogos/catalogos.schemas.js';
import { analizarHorario } from '../../horarios/modelo.js';
import { zonaValida } from '../../../modules/ubicaciones/ubicaciones.schemas.js';
import { municipio } from '../../../modules/ubicaciones/ubicaciones.repository.js';
import * as vacaciones from '../../../modules/vacaciones/vacaciones.repository.js';
import { calcularSaldo } from '../../../modules/vacaciones/vacaciones.reglas.js';

export interface OpcionesVerificacion {
  remoto: boolean;
  idempotencia: boolean;
  extras: boolean;
}
export function opcionesVerificacion(args: string[]): OpcionesVerificacion {
  for (const a of args)
    exigir(
      ['--remote', '--check-idempotency', '--with-extras'].includes(a),
      'Opciones admitidas: --remote, --check-idempotency y --with-extras.',
    );
  return {
    remoto: args.includes('--remote'),
    idempotencia: args.includes('--check-idempotency'),
    extras: args.includes('--with-extras'),
  };
}
export interface Comprobacion {
  codigo: string;
  estado: 'OK' | 'ERROR' | 'NO_APLICA' | 'NO_EJECUTADA';
  mensaje: string;
  claves?: string[];
}
export interface InformeVerificacion {
  ok: boolean;
  conjunto: string;
  fecha: string;
  conteos: Record<string, { esperados: number; encontrados: number; total: number }>;
  comprobaciones: Comprobacion[];
}
export function registrar(
  informe: InformeVerificacion,
  codigo: string,
  ok: boolean,
  mensaje: string,
  claves: string[] = [],
) {
  informe.comprobaciones.push({
    codigo,
    estado: ok ? 'OK' : 'ERROR',
    mensaje,
    ...(claves.length ? { claves } : {}),
  });
  if (!ok) informe.ok = false;
}
// Solo permite lecturas y los bloqueos del cargador. Un intento de DML falla antes de llegar a Oracle.
export function conexionSinEscrituras(c: Connection): Connection {
  return new Proxy(c, {
    get(target, prop) {
      if (prop === 'execute')
        return (...args: unknown[]) => {
          exigir(
            typeof args[0] === 'string' && /^\s*(SELECT\b|LOCK TABLE\b)/i.test(args[0]),
            'La repetición intentó escribir: el conjunto no es idempotente en su estado actual.',
          );
          return Reflect.apply(target.execute, target, args);
        };
      if (['executeMany', 'commit', 'rollback', 'createLob', 'enqueue'].includes(String(prop)))
        return () => {
          throw new Error('La repetición intentó modificar la conexión o sus datos.');
        };
      const valor = Reflect.get(target, prop, target);
      return typeof valor === 'function' ? valor.bind(target) : valor;
    },
  });
}
export async function verificarIntegridad(
  c: Connection,
  d: Dataset,
  op: OpcionesVerificacion,
  contrasena = '',
): Promise<InformeVerificacion> {
  await preflight(c);
  const reglas = await empleados.reglas(c),
    limites = await limitesHorario(c);
  const informe: InformeVerificacion = {
    ok: true,
    conjunto: d.configuracion.conjunto,
    fecha: reglas.hoy,
    conteos: {},
    comprobaciones: [],
  };
  const anotar = (codigo: string, ok: boolean, mensaje: string, claves: string[] = []) =>
    registrar(informe, codigo, ok, mensaje, claves);
  const cobertura = await repo.cobertura(c, d);
  for (const grupo of cobertura) {
    const faltantes = grupo.registros.filter((r) => !r.ID || r.ACTIVO !== 1).map((r) => r.CLAVE);
    informe.conteos[grupo.tabla] = {
      esperados: grupo.esperados,
      encontrados: grupo.registros.filter((r) => r.ID && r.ACTIVO === 1).length,
      total: grupo.total,
    };
    anotar(
      `COBERTURA_${grupo.tabla}`,
      !faltantes.length,
      'Claves naturales del conjunto presentes y activas.',
      faltantes,
    );
    if (grupo.coleccion === 'horarios') {
      const invalidos = [];
      for (const r of grupo.registros.filter((r) => r.ID)) {
        const h = await detalleCatalogo(c, grupo.catalogo, r.ID!);
        const bloques = bloqueSchema.array().safeParse(h?.bloques);
        const analisis = bloques.success
          ? analizarHorario(bloques.data, limites ?? undefined)
          : null;
        if (!limites || !analisis || analisis.errores.length || analisis.jornada !== h?.jornada)
          invalidos.push(r.CLAVE);
      }
      anotar(
        'HORARIOS_LEGALES',
        !invalidos.length && Boolean(limites),
        'Bloques válidos y límites consultados en el destino.',
        invalidos,
      );
    }
  }
  const duplicados = await repo.duplicados(c);
  anotar(
    'UNICIDAD_GLOBAL',
    Object.values(duplicados).every((n) => n === 0),
    'DPI, NIT, IGSS, usuario y correo sin duplicados en sus tablas.',
  );
  const propias = await propiedades(c, d.configuracion.conjunto);
  const filas = await repo.empleadosVerificacion(c, d);
  const encontrados = filas.filter((e) => e.ID !== null);
  informe.conteos.EMPLEADOS = {
    esperados: d.empleados.length,
    encontrados: encontrados.length,
    total: await contar(c, 'EMPLEADOS'),
  };
  informe.conteos.USUARIOS = {
    esperados: d.empleados.length,
    encontrados: new Set(encontrados.filter((e) => e.USUARIO_ID !== null).map((e) => e.USUARIO_ID))
      .size,
    total: await contar(c, 'USUARIOS'),
  };
  anotar(
    'COBERTURA_EMPLEADOS',
    encontrados.length === d.empleados.length && encontrados.length >= 32,
    'Todos los empleados de la fuente están presentes.',
    filas.filter((e) => !e.ID).map((e) => e.CLAVE),
  );
  const vigentes = (await minimos(c, 'SALARIO_MINIMO_MENSUAL')).filter(
    (v) => v.ACTIVO === 1 && v.DESDE <= reglas.hoy && (!v.HASTA || v.HASTA >= reglas.hoy),
  );
  anotar(
    'MINIMO_CONFIGURADO',
    vigentes.length === 1 && vigentes[0]?.UNIDAD === 'QUETZALES',
    'Una vigencia mensual aplicable del mínimo en quetzales.',
  );
  const errores = new Map<string, string[]>();
  const fallo = (codigo: string, clave: string) => {
    const lista = errores.get(codigo) ?? [];
    lista.push(clave);
    errores.set(codigo, lista);
  };
  const parametrosVacaciones = await vacaciones.parametros(c);
  const parentescos = new Set((await empleados.parentescos(c)).map((p) => p.value));
  const clavesFormulario = Object.keys(crearEmpleadoSchema.innerType().shape);
  const puestosOcupados = new Set<number>();
  let temporales = 0,
    cambiadas = 0;
  for (const r of encontrados) {
    const fuente = d.empleados.find((e) => e.clave === r.CLAVE)!;
    const e = await empleados.detalle(c, r.ID!);
    if (!e) {
      fallo('REFERENCIAS', r.CLAVE);
      continue;
    }
    puestosOcupados.add(e.idPuesto);
    const datos = Object.fromEntries(clavesFormulario.map((k) => [k, e[k as keyof typeof e]]));
    if (
      !crearEmpleadoSchema.safeParse(datos).success ||
      e.perfilIncompleto ||
      !e.afiliacionIgss ||
      !parentescos.has(e.contactoParentesco ?? '') ||
      !e.activo ||
      e.estado !== 'ACTIVO'
    )
      fallo('FORMULARIO_COMPLETO', r.CLAVE);
    if (!/^\d{13}$/.test(e.dpi)) fallo('FORMATO_DPI', r.CLAVE);
    if (
      !fechaValida(e.fechaNacimiento) ||
      !fechaValida(e.fechaIngreso) ||
      Object.keys(erroresFechas(e, reglas)).length ||
      e.fechaNacimiento >= e.fechaIngreso ||
      e.fechaIngreso > reglas.hoy ||
      e.fechaEgreso
    )
      fallo('FECHAS', r.CLAVE);
    if (
      r.REQUIERE_FIN === null ||
      Boolean(e.fechaFinContrato) !== Boolean(r.REQUIERE_FIN) ||
      (e.fechaFinContrato &&
        (!fechaValida(e.fechaFinContrato) ||
          e.fechaFinContrato <= e.fechaIngreso ||
          e.fechaFinContrato <= reglas.hoy))
    )
      fallo('CONTRATOS', r.CLAVE);
    for (const campo of Object.keys(
      empleados.referencias,
    ) as (keyof typeof empleados.referencias)[]) {
      if (campo === 'idJefatura') continue;
      const valor = e[campo];
      const referencia = valor ? await empleados.referencia(c, campo, valor) : null;
      if (
        !referencia?.activo ||
        (referencia.departamento && referencia.departamento !== e.idDepartamento)
      )
        fallo('REFERENCIAS', r.CLAVE);
    }
    const ubicacion = await municipio(c, e.idMunicipioGt);
    if (r.UBICACION !== 1 || !ubicacion || !zonaValida(ubicacion.codigo, e.zona))
      fallo('UBICACION', r.CLAVE);
    if (
      r.SALARIOS !== 1 ||
      !e.salarioBase ||
      vigentes.length !== 1 ||
      !new Decimal(e.salarioBase).gte(vigentes[0]!.VALOR)
    )
      fallo('SALARIOS', r.CLAVE);
    if (r.HORARIOS !== 1 || !e.idHorario) fallo('ASIGNACION_HORARIO', r.CLAVE);
    if (e.idJefatura !== null) fallo('SIN_JEFATURAS', r.CLAVE);
    const numero = e.codigo.match(/^EMP_[A-Z0-9]+_(\d{4,})$/)?.[1];
    if (
      !numero ||
      r.CODIGO_RESERVADO !== 1 ||
      r.CONTADOR === null ||
      new Decimal(r.CONTADOR).lt(numero)
    )
      fallo('CODIGOS_CONTADORES', r.CLAVE);
    if (
      !propias.has(llave('EMPLEADOS', r.ID!)) ||
      !r.USUARIO_ID ||
      !propias.has(llave('USUARIOS', r.USUARIO_ID))
    )
      fallo('PROPIEDAD_DEMO', r.CLAVE);
    if (
      !r.USUARIO ||
      !/^[a-z][a-z0-9]*\.[a-z0-9]+$/.test(r.USUARIO) ||
      r.ROL !== fuente.rol ||
      r.USUARIO_ACTIVO !== 1 ||
      r.CORREO_USUARIO !== e.correo ||
      !r.HASH?.startsWith('$argon2id$')
    )
      fallo('USUARIOS', r.CLAVE);
    if (r.CAMBIO === 1) {
      temporales++;
      if (contrasena) {
        let coincide = false;
        try {
          coincide = Boolean(r.HASH && (await verify(r.HASH, contrasena)));
        } catch {
          /* El reporte no expone el hash inválido. */
        }
        if (!coincide) fallo('CLAVE_TEMPORAL', r.CLAVE);
      }
    } else if (r.CAMBIO === 0) cambiadas++;
    else fallo('USUARIOS', r.CLAVE);
    try {
      calcularSaldo(
        e.fechaIngreso,
        reglas.hoy,
        parametrosVacaciones,
        await vacaciones.movimientos(c, r.ID!),
      );
      if (!(await vacaciones.horarios(c, r.ID!)).length) fallo('VACACIONES', r.CLAVE);
    } catch {
      fallo('VACACIONES', r.CLAVE);
    }
    if (op.extras) {
      const estado = await repo.estadoExtras(c, r.ID!),
        x = fuente.extras;
      if (x?.aperturaFiscal) {
        const a = x.aperturaFiscal;
        if (
          (await repo.aperturaVerificacion(c, r.ID!, a.anio, a.fecha)) !== 1 ||
          ![...propias.values()].some(
            (p) => p.tabla === 'ISR_APERTURAS' && p.clave === `${r.CLAVE}:apertura:${a.anio}`,
          )
        )
          fallo('EXTRAS', r.CLAVE);
      }
      if (
        (x?.historialSalarial && estado.HISTORIAL_SALARIAL! < x.historialSalarial.length) ||
        (x?.aperturaFiscal && estado.ISR_APERTURAS! < 1) ||
        (x?.parqueo && estado.PARQUEO_SUSCRIPCIONES! < 1) ||
        estado.PRESTAMOS! < Number(Boolean(x?.prestamo)) + Number(Boolean(x?.anticipo)) ||
        estado.AUSENCIAS! < (x?.ausencias?.length ?? 0) ||
        estado.NOVEDADES_MENSUALES! < (x?.comisiones?.length ?? 0) + (x?.ausencias?.length ?? 0)
      )
        fallo('EXTRAS', r.CLAVE);
    }
  }
  const mensajes: Record<string, string> = {
    FORMULARIO_COMPLETO: 'Campos del formulario, banco, contacto y perfil completos.',
    FORMATO_DPI: 'DPI con exactamente 13 dígitos.',
    FECHAS: 'Nacimiento, edad, ingreso y egreso coherentes; sin altas futuras.',
    CONTRATOS: 'Indefinidos sin fecha fin; temporales con fin posterior al ingreso y futuro.',
    REFERENCIAS: 'Puesto, departamento, centro, contrato, banco y horario activos y coherentes.',
    UBICACION: 'Departamento/municipio oficiales y zona válida.',
    SALARIOS: 'Una vigencia salarial actual y salario mayor o igual al mínimo configurado.',
    ASIGNACION_HORARIO: 'Una asignación de horario vigente por empleado.',
    SIN_JEFATURAS: 'Jefaturas vacías conforme a la decisión aprobada.',
    CODIGOS_CONTADORES: 'Códigos automáticos reservados y contador por departamento suficiente.',
    PROPIEDAD_DEMO: 'Empleados y usuarios pertenecen al seed según la bitácora.',
    USUARIOS: 'Usuarios vinculados, roles y hashes Argon2id válidos.',
    VACACIONES: 'Saldo y calendario de vacaciones calculables para todos los demo.',
  };
  if (contrasena)
    mensajes.CLAVE_TEMPORAL =
      'La contraseña de entorno coincide con las cuentas que aún requieren cambio.';
  if (op.extras)
    mensajes.EXTRAS =
      'Historiales, parqueos, préstamos, ausencias, comisiones y aperturas fiscales ficticias presentes.';
  for (const [codigo, mensaje] of Object.entries(mensajes))
    anotar(codigo, !errores.has(codigo), mensaje, [...new Set(errores.get(codigo) ?? [])]);
  const puestos = cobertura.find((g) => g.coleccion === 'puestos')!;
  anotar(
    'PUESTOS_CUBIERTOS',
    puestos.registros.every((p) => p.ID && puestosOcupados.has(p.ID)),
    'Cada uno de los 30 puestos tiene al menos un empleado demo.',
  );
  informe.comprobaciones.push({
    codigo: 'CICLOS_JERARQUIA',
    estado: 'NO_APLICA',
    mensaje: 'No se crean jefaturas ni relaciones de jefe inmediato, por instrucción del usuario.',
  });
  informe.comprobaciones.push({
    codigo: 'CAMBIO_CONTRASENA',
    estado: 'OK',
    mensaje: `Cuentas temporales: ${temporales}; contraseña ya cambiada: ${cambiadas}. No se restableció ninguna.`,
  });
  if (!contrasena)
    informe.comprobaciones.push({
      codigo: 'CLAVE_TEMPORAL',
      estado: 'NO_EJECUTADA',
      mensaje: 'No se proporcionó SEED_DEFAULT_PASSWORD; no se intentó autenticar.',
    });
  return informe;
}

export async function comprobarIdempotencia(
  c: Connection,
  d: Dataset,
  op: OpcionesVerificacion,
  contrasena: string,
  informe: InformeVerificacion,
) {
  if (!op.idempotencia) {
    informe.comprobaciones.push({
      codigo: 'IDEMPOTENCIA',
      estado: 'NO_EJECUTADA',
      mensaje:
        'Usa --check-idempotency para invocar dos veces el cargador real con barrera contra escrituras.',
    });
    return;
  }
  if (!informe.ok) {
    registrar(
      informe,
      'IDEMPOTENCIA',
      false,
      'No se repite una carga cuya integridad presenta errores.',
    );
    return;
  }
  try {
    const antes = await repo.capturaVerificacion(c, d.configuracion.conjunto);
    const segura = conexionSinEscrituras(c);
    for (let i = 0; i < 2; i++) {
      await cargarDemo(segura, d, opcionesDemo(op.extras ? ['--with-extras'] : []), contrasena);
      const despues = await repo.capturaVerificacion(c, d.configuracion.conjunto);
      exigir(
        JSON.stringify(antes) === JSON.stringify(despues),
        'Cambió el esquema durante la comprobación; revisa la idempotencia y los cambios concurrentes.',
      );
    }
    registrar(
      informe,
      'IDEMPOTENCIA',
      true,
      'Dos ejecuciones reales; cero DML y mismos conteos, datos, credenciales y contadores.',
    );
  } catch {
    registrar(
      informe,
      'IDEMPOTENCIA',
      false,
      'La repetición intentó escribir, falló una validación o cambió el esquema. Ningún DML del cargador fue autorizado.',
    );
  }
}
