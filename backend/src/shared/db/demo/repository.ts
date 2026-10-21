import { createHash } from 'node:crypto';
import oracledb from 'oracledb';
import type { Connection, BindParameters } from 'oracledb';
import type { ActorAuditoria } from '../../../modules/auth/auth.types.js';
import { registrarAuditoria } from '../../../modules/auditoria/auditoria.service.js';
import { cargarMigraciones } from '../migraciones.archivos.js';
import { fileURLToPath } from 'node:url';
import { exigir } from './datos.js';
import type { Catalogo } from '../../../modules/catalogos/catalogos.definiciones.js';

export const tablas = {
  DEPARTAMENTOS: 'ID_DEPARTAMENTO',
  PUESTOS: 'ID_PUESTO',
  BANCOS: 'ID_BANCO',
  CENTROS_TRABAJO: 'ID_CENTRO_TRABAJO',
  HORARIOS: 'ID_HORARIO',
  HORARIO_BLOQUES: 'ID_HORARIO_BLOQUE',
  HORARIO_BLOQUE_DIAS: 'ID_HORARIO_BLOQUE_DIA',
  EMPLEADOS: 'ID_EMPLEADO',
  USUARIOS: 'ID_USUARIO',
  HISTORIAL_SALARIAL: 'ID_HISTORIAL_SALARIAL',
  ISR_APERTURAS: 'ID_ISR_APERTURA',
  EMPLEADO_HORARIO: 'ID_EMPLEADO_HORARIO',
  EMPLEADO_CONTACTOS_EMERGENCIA: 'ID_CONTACTO_EMERGENCIA',
  PARAMETROS_LEGALES: 'ID_PARAMETRO_LEGAL',
  PARQUEO_TARIFAS: 'ID_PARQUEO_TARIFA',
  SOLICITUDES: 'ID_SOLICITUD',
  SOLICITUD_HISTORIAL: 'ID_SOLICITUD_HISTORIAL',
  PARQUEO_SUSCRIPCIONES: 'ID_PARQUEO_SUSCRIPCION',
  NOTIFICACIONES: 'ID_NOTIFICACION',
  NOVEDADES_MENSUALES: 'ID_NOVEDAD_MENSUAL',
  AUSENCIAS: 'ID_AUSENCIA',
  DESCUENTOS_EMPLEADO: 'ID_DESCUENTO_EMPLEADO',
  DESCUENTOS_CUOTAS: 'ID_DESCUENTO_CUOTA',
  PRESTAMOS: 'ID_PRESTAMO',
} as const;
export type Tabla = keyof typeof tablas;
export interface Propiedad {
  tabla: Tabla;
  id: number;
  clave: string;
  huella: string;
}
export const llave = (tabla: string, id: number) => `${tabla}:${id}`;
export async function filas<T>(c: Connection, sql: string, binds: BindParameters = {}) {
  return (await c.execute<T>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows ?? [];
}
export async function escalar(c: Connection, sql: string, binds: BindParameters = {}) {
  return (await c.execute<[number]>(sql, binds)).rows?.[0]?.[0] ?? 0;
}
export function buscarCatalogo(c: Connection, cat: Catalogo, nombre: string) {
  return filas<{ ID: number; ACTIVO: number; DEPARTAMENTO: number | null }>(
    c,
    `SELECT ${cat.pk} ID,ACTIVO,${cat.slug === 'puestos' ? 'ID_DEPARTAMENTO' : 'NULL'} DEPARTAMENTO FROM ${cat.tabla} WHERE NOMBRE_NORMALIZADO=N2_NOMBRE_NORMALIZADO(:nombre)`,
    { nombre },
  );
}
export async function buscarUbicacion(c: Connection, departamento: string, mun: string) {
  return (
    await filas<{ ID: number; DEP: number }>(
      c,
      'SELECT M.ID_MUNICIPIO_GT ID,M.ID_DEPARTAMENTO_GT DEP FROM MUNICIPIOS_GT M JOIN DEPARTAMENTOS_GT D ON D.ID_DEPARTAMENTO_GT=M.ID_DEPARTAMENTO_GT WHERE M.CODIGO_INE=:mun AND D.CODIGO_INE=:departamento AND M.ACTIVO=1 AND D.ACTIVO=1',
      { departamento, mun },
    )
  )[0];
}
export function minimos(c: Connection, clave: string) {
  return filas<{
    ID: number;
    VALOR: string;
    UNIDAD: string;
    ACTIVO: number;
    DESDE: string;
    HASTA: string | null;
  }>(
    c,
    "SELECT ID_PARAMETRO_LEGAL ID,TO_CHAR(VALOR,'TM9','NLS_NUMERIC_CHARACTERS=''.,''') VALOR,UNIDAD,ACTIVO,TO_CHAR(VIGENTE_DESDE,'YYYY-MM-DD') DESDE,TO_CHAR(VIGENTE_HASTA,'YYYY-MM-DD') HASTA FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA=:clave",
    { clave },
  );
}
export function empleadoPorCorreo(c: Connection, correo: string) {
  return filas<{ ID: number; USUARIO: number | null }>(
    c,
    'SELECT ID_EMPLEADO ID,ID_USUARIO USUARIO FROM EMPLEADOS WHERE CORREO=:correo',
    { correo },
  );
}
export async function contrato(c: Connection, clave: string, nombre: string) {
  return (
    await filas<{ ID: number }>(
      c,
      'SELECT ID_TIPO_CONTRATO ID FROM TIPOS_CONTRATO WHERE (CODIGO_ANTERIOR=:clave OR NOMBRE_NORMALIZADO=N2_NOMBRE_NORMALIZADO(:nombre)) AND ACTIVO=1',
      { clave, nombre },
    )
  )[0];
}
export async function administrador(c: Connection) {
  return (
    await filas<{ ID: number; ROL: number }>(
      c,
      "SELECT U.ID_USUARIO ID,U.ID_ROL ROL FROM USUARIOS U JOIN ROLES R ON R.ID_ROL=U.ID_ROL WHERE U.ACTIVO=1 AND R.ACTIVO=1 AND R.CODIGO='ADMIN' ORDER BY U.ID_USUARIO FETCH FIRST 1 ROW ONLY",
    )
  )[0];
}
export function contar(c: Connection, tabla: Tabla) {
  return escalar(c, `SELECT COUNT(*) FROM ${tabla}`);
}
export function borrar(c: Connection, p: Propiedad) {
  return c.execute(`DELETE FROM ${p.tabla} WHERE ${tablas[p.tabla]}=:id`, { id: p.id });
}
export function dependientes(c: Connection, tabla: Tabla, id: number) {
  const condiciones: Partial<Record<Tabla, string>> = {
    HORARIO_BLOQUES: 'ID_HORARIO=:id',
    HORARIO_BLOQUE_DIAS:
      'ID_HORARIO_BLOQUE IN (SELECT ID_HORARIO_BLOQUE FROM HORARIO_BLOQUES WHERE ID_HORARIO=:id)',
    HISTORIAL_SALARIAL: 'ID_EMPLEADO=:id',
    EMPLEADO_HORARIO: 'ID_EMPLEADO=:id',
    EMPLEADO_CONTACTOS_EMERGENCIA: 'ID_EMPLEADO=:id',
    PRESTAMOS: 'ID_DESCUENTO_EMPLEADO=:id',
    DESCUENTOS_CUOTAS: 'ID_DESCUENTO_EMPLEADO=:id',
    NOVEDADES_MENSUALES: 'ID_AUSENCIA=:id',
    SOLICITUD_HISTORIAL: 'ID_SOLICITUD=:id',
    NOTIFICACIONES: 'ID_SOLICITUD=:id',
  };
  exigir(condiciones[tabla], 'Dependencia no permitida en el cargador.');
  return filas<{ ID: number }>(
    c,
    `SELECT ${tablas[tabla]} ID FROM ${tabla} WHERE ${condiciones[tabla]}`,
    { id },
  );
}
export async function tipoExtra(
  c: Connection,
  tabla: 'TIPOS_DESCUENTO' | 'TIPOS_AUSENCIA',
  clave: string,
) {
  const pk = tabla === 'TIPOS_DESCUENTO' ? 'ID_TIPO_DESCUENTO' : 'ID_TIPO_AUSENCIA';
  return (
    await filas<{ ID: number }>(
      c,
      `SELECT ${pk} ID FROM ${tabla} WHERE NVL(CODIGO_ANTERIOR,CODIGO)=:clave AND ACTIVO=1`,
      { clave },
    )
  )[0];
}
export function ajustarSalario(c: Connection, id: number, monto: string, actor: number) {
  return c.execute(
    "UPDATE HISTORIAL_SALARIAL SET SALARIO_BASE=TO_NUMBER(:monto,'9999999999D99','NLS_NUMERIC_CHARACTERS=''.,'''),MODIFICADO_POR=:actor WHERE ID_HISTORIAL_SALARIAL=:id",
    { id, monto, actor },
  );
}
export async function insertar(
  c: Connection,
  tabla: Tabla,
  columnas: Record<string, string | number | null>,
  fechas: string[] = [],
) {
  for (const col of Object.keys(columnas))
    exigir(/^[A-Z][A-Z0-9_]*$/.test(col), 'Columna inválida del cargador.');
  const nombres = Object.keys(columnas);
  const expresiones = nombres.map((col, i) =>
    fechas.includes(col)
      ? `TO_DATE(:v${i},'YYYY-MM-DD')`
      : ['VALOR', 'MONTO', 'CAPITAL', 'SALARIO_BASE'].includes(col)
        ? `TO_NUMBER(:v${i},'9999999999D99','NLS_NUMERIC_CHARACTERS=''.,''')`
        : `:v${i}`,
  );
  const binds: BindParameters = Object.fromEntries(
    Object.values(columnas).map((v, i) => [`v${i}`, v]),
  );
  binds.id = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
  const r = await c.execute<{ id: number[] }>(
    `INSERT INTO ${tabla}(${nombres.join(',')}) VALUES(${expresiones.join(',')}) RETURNING ${tablas[tabla]} INTO :id`,
    binds,
  );
  return r.outBinds!.id[0]!;
}
export async function huella(c: Connection, tabla: Tabla, id: number, bloquear = false) {
  const columnas = await filas<{ COLUMN_NAME: string; DATA_TYPE: string }>(
    c,
    'SELECT COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME=:tabla ORDER BY COLUMN_ID',
    { tabla },
  );
  const expresiones = columnas.map((col) =>
    col.DATA_TYPE === 'DATE'
      ? `TO_CHAR(${col.COLUMN_NAME},'YYYY-MM-DD"T"HH24:MI:SS') "${col.COLUMN_NAME}"`
      : col.COLUMN_NAME,
  );
  const row = (
    await filas<Record<string, unknown>>(
      c,
      `SELECT ${expresiones.join(',')} FROM ${tabla} WHERE ${tablas[tabla]}=:id${bloquear ? ' FOR UPDATE' : ''}`,
      { id },
    )
  )[0];
  if (!row) return null;
  for (const [key, value] of Object.entries(row))
    if (
      value &&
      typeof value === 'object' &&
      'getData' in value &&
      typeof value.getData === 'function'
    )
      row[key] = await value.getData();
  return createHash('sha256').update(JSON.stringify(row)).digest('hex');
}
export async function propiedades(c: Connection, conjunto: string) {
  const eventos = await filas<{
    ENTIDAD: string;
    ID_ENTIDAD: number;
    ACCION: string;
    DATOS: string;
  }>(
    c,
    `SELECT ENTIDAD,ID_ENTIDAD,ACCION,JSON_SERIALIZE(VALORES_NUEVOS RETURNING VARCHAR2(4000)) DATOS FROM BITACORA_AUDITORIA WHERE ACCION IN ('SEED_DEMO_CREAR','SEED_DEMO_ACTUALIZAR','SEED_DEMO_BORRAR') AND JSON_VALUE(VALORES_NUEVOS,'$.conjunto')=:conjunto ORDER BY ID_BITACORA_AUDITORIA`,
    { conjunto },
  );
  const resultado = new Map<string, Propiedad>();
  for (const e of eventos) {
    exigir(Object.hasOwn(tablas, e.ENTIDAD), 'La bitácora demo referencia una tabla no permitida.');
    const datos = JSON.parse(e.DATOS) as { clave: string; huella: string };
    if (e.ACCION === 'SEED_DEMO_BORRAR') resultado.delete(llave(e.ENTIDAD, e.ID_ENTIDAD));
    else
      resultado.set(llave(e.ENTIDAD, e.ID_ENTIDAD), {
        tabla: e.ENTIDAD as Tabla,
        id: e.ID_ENTIDAD,
        ...datos,
      });
  }
  return resultado;
}
export async function registrarPropiedad(
  c: Connection,
  actor: ActorAuditoria,
  conjunto: string,
  p: Omit<Propiedad, 'huella'>,
  actualizar = false,
) {
  const digest = await huella(c, p.tabla, p.id);
  exigir(digest, `No se encontró ${p.tabla} al registrar la propiedad demo.`);
  await registrarAuditoria(c, {
    actor,
    accion: actualizar ? 'SEED_DEMO_ACTUALIZAR' : 'SEED_DEMO_CREAR',
    entidad: p.tabla,
    idEntidad: p.id,
    despues: { conjunto, clave: p.clave, huella: digest },
    motivo: 'Registro de propiedad del conjunto demo, sin datos sensibles.',
  });
}
export async function preflight(c: Connection) {
  const requeridas: Record<string, string[]> = {
    VERSION_ESQUEMA: ['VERSION', 'ARCHIVO', 'CHECKSUM', 'ESTADO'],
    ROLES: ['ID_ROL', 'CODIGO', 'ACTIVO'],
    USUARIOS: [
      'ID_USUARIO',
      'ID_ROL',
      'USUARIO',
      'CORREO',
      'CONTRASENA_HASH',
      'CAMBIO_OBLIGATORIO',
      'ACTIVO',
    ],
    EMPLEADOS: [
      'ID_EMPLEADO',
      'ID_USUARIO',
      'CODIGO',
      'NOMBRES',
      'APELLIDOS',
      'DPI',
      'NIT',
      'AFILIACION_IGSS',
      'FECHA_NACIMIENTO',
      'SEXO',
      'ESTADO_CIVIL',
      'ID_DEPARTAMENTO_GT',
      'ID_MUNICIPIO_GT',
      'ZONA',
      'DIRECCION',
      'DIRECCION_COMPLETA',
      'TELEFONO',
      'CORREO',
      'ID_BANCO',
      'CUENTA_BANCARIA',
      'TIPO_CUENTA',
      'ID_DEPARTAMENTO',
      'ID_PUESTO',
      'ID_JEFATURA',
      'ID_TIPO_CONTRATO',
      'ID_CENTRO_TRABAJO',
      'FECHA_INGRESO',
      'FECHA_FIN_CONTRATO',
      'ESTADO',
    ],
    TIPOS_CONTRATO: [
      'ID_TIPO_CONTRATO',
      'CODIGO_ANTERIOR',
      'NOMBRE_NORMALIZADO',
      'REQUIERE_FECHA_FIN',
      'ACTIVO',
    ],
    TIPOS_AUSENCIA: [
      'ID_TIPO_AUSENCIA',
      'CODIGO_ANTERIOR',
      'EFECTO',
      'CATEGORIA_INASISTENCIA',
      'ACTIVO',
    ],
    TIPOS_DESCUENTO: ['ID_TIPO_DESCUENTO', 'CODIGO_ANTERIOR', 'ACTIVO'],
    DEPARTAMENTOS_GT: ['ID_DEPARTAMENTO_GT', 'CODIGO_INE', 'ACTIVO'],
    MUNICIPIOS_GT: ['ID_MUNICIPIO_GT', 'ID_DEPARTAMENTO_GT', 'CODIGO_INE', 'ACTIVO'],
    HORARIO_BLOQUES: [
      'ID_HORARIO_BLOQUE',
      'ID_HORARIO',
      'MINUTO_ENTRADA',
      'MINUTO_SALIDA',
      'CRUZA_MEDIANOCHE',
      'MINUTOS_DESCANSO',
    ],
    HORARIO_BLOQUE_DIAS: ['ID_HORARIO_BLOQUE_DIA', 'ID_HORARIO_BLOQUE', 'DIA_SEMANA'],
    CENTROS_TRABAJO: ['LOCALIDAD', 'ID_DEPARTAMENTO_GT', 'ID_MUNICIPIO_GT', 'DIRECCION'],
    PARAMETROS_LEGALES: [
      'CLAVE_INTERNA',
      'NOMBRE_NORMALIZADO',
      'VALOR',
      'UNIDAD',
      'VIGENTE_DESDE',
      'VIGENTE_HASTA',
      'FUNDAMENTO',
      'MOTIVO',
    ],
    HISTORIAL_SALARIAL: ['ID_EMPLEADO', 'SALARIO_BASE', 'VIGENTE_DESDE', 'VIGENTE_HASTA', 'MOTIVO'],
    ISR_APERTURAS: ['ID_EMPLEADO', 'ANIO', 'FECHA_CORTE', 'RENTA', 'IGSS', 'ISR', 'MOTIVO'],
    EMPLEADO_HORARIO: ['ID_EMPLEADO', 'ID_HORARIO', 'VIGENTE_DESDE', 'VIGENTE_HASTA', 'MOTIVO'],
    EMPLEADO_CONTACTOS_EMERGENCIA: ['ID_EMPLEADO', 'NOMBRE', 'PARENTESCO', 'TELEFONO', 'PRIORIDAD'],
    BITACORA_AUDITORIA: ['ACCION', 'ENTIDAD', 'ID_ENTIDAD', 'VALORES_NUEVOS'],
  };
  const columnas = await filas<{ TABLE_NAME: string; COLUMN_NAME: string }>(
    c,
    'SELECT TABLE_NAME,COLUMN_NAME FROM USER_TAB_COLUMNS',
  );
  for (const [tabla, campos] of Object.entries(requeridas))
    for (const campo of campos)
      exigir(
        columnas.some((r) => r.TABLE_NAME === tabla && r.COLUMN_NAME === campo),
        `Falta ${tabla}.${campo}. No se modificará el esquema.`,
      );
  for (const [tabla, pk] of Object.entries(tablas))
    exigir(
      columnas.some((r) => r.TABLE_NAME === tabla && r.COLUMN_NAME === pk),
      `Falta ${tabla}.${pk}.`,
    );
  const migraciones = await cargarMigraciones(
    fileURLToPath(new URL('../../../../../db/migrations', import.meta.url)),
  );
  const versiones = await filas<{
    VERSION: number;
    ARCHIVO: string;
    CHECKSUM: string;
    ESTADO: string;
  }>(c, 'SELECT VERSION,ARCHIVO,CHECKSUM,ESTADO FROM VERSION_ESQUEMA');
  exigir(
    versiones.length === migraciones.length &&
      migraciones.every((m) =>
        versiones.some(
          (v) =>
            v.VERSION === m.version &&
            v.ARCHIVO === m.archivo &&
            v.CHECKSUM.trim() === m.checksum &&
            v.ESTADO === 'APLICADA',
        ),
      ),
    'El esquema destino no coincide con las migraciones del proyecto. Aplica db:migrate por separado; --apply-schema solo sirve en un esquema vacío.',
  );
  const disponibles = await filas<{ TABLE_NAME: string }>(c, 'SELECT TABLE_NAME FROM USER_TABLES');
  for (const tabla of [
    ...Object.keys(tablas),
    'ROLES',
    'BITACORA_AUDITORIA',
    'TIPOS_CONTRATO',
    'PARENTESCOS',
    'DEPARTAMENTOS_GT',
    'MUNICIPIOS_GT',
    'CONFIG_CODIGOS',
    'REGISTRO_CODIGOS',
    'SECUENCIAS_CODIGOS',
  ])
    exigir(
      disponibles.some((t) => t.TABLE_NAME === tabla),
      `Falta la tabla ${tabla}. No se modificará el esquema.`,
    );
  exigir(
    (await escalar(c, "SELECT COUNT(*) FROM USER_OBJECTS WHERE STATUS<>'VALID'")) === 0,
    'Hay objetos Oracle inválidos; revisa el esquema antes de cargar.',
  );
  exigir(
    (await escalar(
      c,
      "SELECT COUNT(*) FROM USER_CONSTRAINTS WHERE STATUS<>'ENABLED' OR VALIDATED<>'VALIDATED'",
    )) === 0,
    'Hay restricciones Oracle deshabilitadas o sin validar.',
  );
  exigir(
    (await escalar(c, 'SELECT COUNT(*) FROM DEPARTAMENTOS_GT')) === 22 &&
      (await escalar(c, 'SELECT COUNT(*) FROM MUNICIPIOS_GT')) === 340,
    'Faltan las ubicaciones oficiales 22/340; ejecuta los seeds del proyecto.',
  );
}
export async function ordenarBorrado(
  c: Connection,
  propias: Map<string, Propiedad>,
  bloquear: boolean,
) {
  const relaciones = await filas<{
    NOMBRE: string;
    HIJA: string;
    COL_HIJA: string;
    PADRE: string;
    COL_PADRE: string;
  }>(
    c,
    `SELECT H.CONSTRAINT_NAME NOMBRE,H.TABLE_NAME HIJA,HC.COLUMN_NAME COL_HIJA,P.TABLE_NAME PADRE,PC.COLUMN_NAME COL_PADRE FROM USER_CONSTRAINTS H JOIN USER_CONSTRAINTS P ON P.CONSTRAINT_NAME=H.R_CONSTRAINT_NAME JOIN USER_CONS_COLUMNS HC ON HC.CONSTRAINT_NAME=H.CONSTRAINT_NAME JOIN USER_CONS_COLUMNS PC ON PC.CONSTRAINT_NAME=P.CONSTRAINT_NAME AND PC.POSITION=HC.POSITION WHERE H.CONSTRAINT_TYPE='R'`,
  );
  const identidades = new Map(
    (
      await filas<{ TABLE_NAME: string; COLUMN_NAME: string }>(
        c,
        'SELECT TABLE_NAME,COLUMN_NAME FROM USER_TAB_IDENTITY_COLS',
      )
    ).map((r) => [r.TABLE_NAME, r.COLUMN_NAME]),
  );
  const dependencias = new Map<string, Set<string>>();
  for (const [key, p] of propias) {
    const actual = await huella(c, p.tabla, p.id, bloquear);
    exigir(
      actual === p.huella,
      `${p.tabla}: el registro demo fue modificado o eliminado fuera del seed; se cancela el reset completo para conservarlo.`,
    );
    const hijos = new Set<string>();
    const procesadas = new Set<string>();
    for (const fk of relaciones.filter((r) => r.PADRE === p.tabla)) {
      if (procesadas.has(fk.NOMBRE)) continue;
      procesadas.add(fk.NOMBRE);
      const pares = relaciones.filter((r) => r.NOMBRE === fk.NOMBRE);
      for (const ident of [fk.HIJA, ...pares.flatMap((r) => [r.COL_HIJA, r.COL_PADRE])])
        exigir(/^[A-Z][A-Z0-9_]*$/.test(ident), 'Identificador de FK no permitido.');
      const pk = identidades.get(fk.HIJA);
      exigir(pk, 'La tabla dependiente no tiene identidad; se cancela el reset por seguridad.');
      const rows = await filas<{ ID: number }>(
        c,
        `SELECT C.${pk} ID FROM ${fk.HIJA} C JOIN ${p.tabla} P ON ${pares.map((r) => `C.${r.COL_HIJA}=P.${r.COL_PADRE}`).join(' AND ')} WHERE P.${tablas[p.tabla]}=:id`,
        { id: p.id },
      );
      for (const hijo of rows) {
        const clave = llave(fk.HIJA, hijo.ID);
        exigir(
          propias.has(clave),
          `${p.tabla}: existe una referencia ajena al seed desde ${fk.HIJA}; no se borrará ningún dato.`,
        );
        if (clave !== key) hijos.add(clave);
      }
    }
    dependencias.set(key, hijos);
  }
  const orden: Propiedad[] = [];
  while (dependencias.size) {
    const hojas = [...dependencias].filter(([, hijos]) => hijos.size === 0).map(([key]) => key);
    exigir(hojas.length, 'El reset encontró un ciclo; no se borrará ningún dato.');
    for (const key of hojas) {
      orden.push(propias.get(key)!);
      dependencias.delete(key);
    }
    for (const hijos of dependencias.values()) for (const key of hojas) hijos.delete(key);
  }
  return orden;
}
