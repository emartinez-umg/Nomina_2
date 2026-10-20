import { normalizarNombreCatalogo } from '../../shared/catalogos/nombre.js';
import { nombrePersonaSql } from '../../shared/utils/nombre.js';
import { distribucionHorarioSql } from '../../shared/horarios/horarios.repository.js';
import { normalizarBloques } from '../../shared/horarios/modelo.js';
import { horaTexto, minutos as minutoBloque } from '../../shared/horarios/modelo.js';
import type { BloqueHorario, LimitesHorario, Jornada } from '../../shared/horarios/modelo.js';
import oracledb from 'oracledb';
import type { Connection, BindParameter } from 'oracledb';
import type {
  Catalogo,
  CampoCatalogo,
  DatosCatalogo,
  FilaCatalogo,
} from './catalogos.definiciones.js';
import type { QueryCatalogo } from './catalogos.schemas.js';
type Binds = Record<string, BindParameter | string | number | null>;
const opciones = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const numero = (bind: string) =>
  `TO_NUMBER(:${bind}, '999999999999999999D999999', 'NLS_NUMERIC_CHARACTERS=''.,''')`;
const expresion = (f: CampoCatalogo, bind = f.nombre) =>
  f.tipo === 'fecha'
    ? `TO_DATE(:${bind},'YYYY-MM-DD')`
    : ['dinero', 'decimal'].includes(f.tipo)
      ? numero(bind)
      : `:${bind}`;
const seleccionar = (f: CampoCatalogo) =>
  `${f.tipo === 'fecha' ? `TO_CHAR(T.${f.columna},'YYYY-MM-DD')` : ['dinero', 'decimal'].includes(f.tipo) ? `TO_CHAR(T.${f.columna},'TM9','NLS_NUMERIC_CHARACTERS=''.,''')` : `T.${f.columna}`} "${f.nombre}"`;
// Identificadores y expresiones provienen exclusivamente del catálogo estático, nunca de la petición.

const referenciasGt = {
  'departamentos-gt': ['DEPARTAMENTOS_GT', 'ID_DEPARTAMENTO_GT'],
  'municipios-gt': ['MUNICIPIOS_GT', 'ID_MUNICIPIO_GT'],
} as const;
function etiquetas(cat: Catalogo) {
  return (
    cat.campos
      .filter((f) => f.referencia)
      .map((f) => {
        const gt =
          f.referencia === 'departamentos-gt' || f.referencia === 'municipios-gt'
            ? referenciasGt[f.referencia]
            : null;
        const tabla = gt?.[0] ?? (f.referencia === 'departamentos' ? 'DEPARTAMENTOS' : 'EMPLEADOS');
        const pk =
          gt?.[1] ?? (f.referencia === 'departamentos' ? 'ID_DEPARTAMENTO' : 'ID_EMPLEADO');
        const label =
          f.referencia === 'empleados' ? nombrePersonaSql('R.NOMBRES', 'R.APELLIDOS') : 'R.NOMBRE';
        return `,(SELECT ${label} FROM ${tabla} R WHERE R.${pk}=T.${f.columna}) "${f.nombre}Etiqueta"`;
      })
      .join('') +
    (cat.slug === 'tipos-ausencia'
      ? `,CASE T.CATEGORIA_INASISTENCIA WHEN 'IGSS_JUSTIFICADA' THEN 'verde' WHEN 'JUSTIFICADA_CON_GOCE' THEN 'amarillo' WHEN 'JUSTIFICADA_SIN_GOCE' THEN 'naranja' ELSE 'rojo' END "colorInasistencia"`
      : '') +
    (cat.slug === 'centros-trabajo'
      ? `,T.LOCALIDAD_ANTERIOR "localidadAnterior",T.LOCALIDAD "localidad",T.ID_MUNICIPIO_GT_PROPUESTO "idMunicipioGtPropuesto",
    (SELECT ID_DEPARTAMENTO_GT FROM MUNICIPIOS_GT WHERE ID_MUNICIPIO_GT=T.ID_MUNICIPIO_GT_PROPUESTO) "idDepartamentoGtPropuesto",
    (SELECT M.NOMBRE||', '||D.NOMBRE FROM MUNICIPIOS_GT M JOIN DEPARTAMENTOS_GT D ON D.ID_DEPARTAMENTO_GT=M.ID_DEPARTAMENTO_GT WHERE M.ID_MUNICIPIO_GT=T.ID_MUNICIPIO_GT_PROPUESTO) "ubicacionPropuesta"`
      : '')
  );
}
async function referencias(c: Connection, cat: Catalogo) {
  const r = await c.execute<{ TABLA: string; COLUMNA: string }>(
    `SELECT C.TABLE_NAME TABLA, CC.COLUMN_NAME COLUMNA FROM USER_CONSTRAINTS C JOIN USER_CONSTRAINTS P ON P.CONSTRAINT_NAME=C.R_CONSTRAINT_NAME JOIN USER_CONS_COLUMNS CC ON CC.CONSTRAINT_NAME=C.CONSTRAINT_NAME JOIN USER_CONS_COLUMNS PC ON PC.CONSTRAINT_NAME=P.CONSTRAINT_NAME AND PC.POSITION=CC.POSITION WHERE C.CONSTRAINT_TYPE='R' AND P.TABLE_NAME=:tabla AND PC.COLUMN_NAME=:pk`,
    { tabla: cat.tabla, pk: cat.pk },
    opciones,
  );
  return (r.rows ?? []).filter(
    (r) => !(cat.slug === 'horarios' && ['HORARIO_DIAS', 'HORARIO_BLOQUES'].includes(r.TABLA)),
  );
}
async function usoSql(c: Connection, cat: Catalogo) {
  const refs = await referencias(c, cat);
  const tablas = new Map<string, string[]>();
  for (const ref of refs) tablas.set(ref.TABLA, [...(tablas.get(ref.TABLA) ?? []), ref.COLUMNA]);
  const cuentas = [...tablas].map(
    ([tabla, columnas]) =>
      `(SELECT COUNT(*) FROM ${tabla} R WHERE ${columnas.map((col) => `R.${col}=T.${cat.pk}`).join(' OR ')})`,
  );
  // El modelo histórico guarda el parentesco como texto, sin FK.
  if (cat.slug === 'parentescos')
    cuentas.push(
      '(SELECT COUNT(*) FROM EMPLEADO_CONTACTOS_EMERGENCIA R WHERE N2_NOMBRE_NORMALIZADO(R.PARENTESCO)=T.NOMBRE_NORMALIZADO)',
    );
  if (cat.slug === 'parametros-legales')
    cuentas.push(
      '(SELECT COUNT(*) FROM TIPOS_DEDUCCION_ISR R WHERE R.CODIGO_PARAMETRO_TOPE=T.CLAVE_INTERNA)',
    );
  return cuentas.length ? cuentas.join('+') : '0';
}
function convertir(row: Record<string, unknown>): FilaCatalogo {
  const usos = Number(row.usos ?? 0);
  return { ...row, activo: row.activo === 1, usos, enUso: usos > 0 } as FilaCatalogo;
}
export async function duplicado(
  c: Connection,
  cat: Catalogo,
  nombre: string,
  id: number,
  d: DatosCatalogo,
) {
  if (!cat.campos.some((f) => f.nombre === 'nombre') || cat.slug === 'empresa') return null;
  const version =
    cat.slug === 'parametros-legales' && id > 0
      ? ' AND CLAVE_INTERNA<>:identidad'
      : cat.slug === 'conceptos' && d.codigo
        ? ' AND CODIGO<>:identidad'
        : '';
  const r = await c.execute<{ id: number; nombre: string; activo: number }>(
    `SELECT ${cat.pk} "id",NOMBRE "nombre",ACTIVO "activo" FROM ${cat.tabla} WHERE NOMBRE_NORMALIZADO=:nombre AND ${cat.pk}<>:id${version} ORDER BY FECHA_CREACION,${cat.pk} FETCH FIRST 1 ROW ONLY`,
    {
      nombre: normalizarNombreCatalogo(nombre),
      id,
      ...(version
        ? { identidad: String(cat.slug === 'parametros-legales' ? d.claveInterna : d.codigo) }
        : {}),
    },
    opciones,
  );
  return r.rows?.[0] ?? null;
}
export async function historial(c: Connection, cat: Catalogo, id: number) {
  const r = await c.execute<{ id: number; accion: string; fecha: string; motivo: string | null }>(
    `SELECT ID_BITACORA_AUDITORIA "id",ACCION "accion",TO_CHAR(FECHA_CREACION,'DD/MM/YYYY HH24:MI') "fecha",MOTIVO "motivo" FROM BITACORA_AUDITORIA WHERE ENTIDAD=:entidad AND ID_ENTIDAD=:id ORDER BY ID_BITACORA_AUDITORIA DESC FETCH FIRST 100 ROWS ONLY`,
    { entidad: cat.tabla, id },
    opciones,
  );
  return r.rows ?? [];
}
export async function bloquearCatalogos(c: Connection, legal: boolean) {
  // Mismo orden que administración de usuarios; serializa cambios y comprobaciones de vigencia.
  await c.execute("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN' FOR UPDATE");
  if (legal) await c.execute('LOCK TABLE PERIODOS_NOMINA IN SHARE MODE');
}
export async function listar(c: Connection, cat: Catalogo, q: QueryCatalogo) {
  const binds: Binds = {};
  const filtros: string[] = [];
  const agregar = (sql: string, key: string, value: unknown) => {
    filtros.push(sql);
    binds[key] = value as string | number | null;
  };
  if (q.buscar) {
    const textos = cat.campos.filter((f) =>
      [
        'texto',
        'codigo',
        'codigo-postal',
        'codigo-iso',
        'area',
        'opcion',
        'nit',
        'correo',
        'telefono',
        'nombre',
      ].includes(f.tipo),
    );
    if (textos.length)
      agregar(
        `(${textos.map((f) => `INSTR(UPPER(${f.tipo === 'codigo' ? "T.CODIGO||' '||T.CODIGO_ANTERIOR" : `T.${f.columna}`}),UPPER(:buscar))>0`).join(' OR ')})`,
        'buscar',
        q.buscar,
      );
  }
  if (q.activo !== undefined) agregar('T.ACTIVO=:activo', 'activo', Number(q.activo));
  for (const f of cat.campos) {
    for (const sufijo of ['', 'Min', 'Max']) {
      const key = (f.nombre === 'direccion' ? 'direccionTexto' : f.nombre) + sufijo;
      const v = q[key];
      if (v === undefined) continue;
      if (sufijo)
        agregar(`T.${f.columna} ${sufijo === 'Min' ? '>=' : '<='} ${expresion(f, key)}`, key, v);
      else if (
        [
          'texto',
          'codigo',
          'codigo-postal',
          'codigo-iso',
          'area',
          'nit',
          'correo',
          'telefono',
          'nombre',
        ].includes(f.tipo)
      )
        agregar(
          `INSTR(UPPER(${f.tipo === 'codigo' ? "T.CODIGO||' '||T.CODIGO_ANTERIOR" : `T.${f.columna}`}),UPPER(:${key}))>0`,
          key,
          v,
        );
      else agregar(`T.${f.columna}=:${key}`, key, f.tipo === 'booleano' ? Number(v) : v);
    }
  }
  if (q.anio !== undefined)
    agregar(
      "T.FECHA>=TO_DATE(:anio||'-01-01','YYYY-MM-DD') AND T.FECHA<ADD_MONTHS(TO_DATE(:anio||'-01-01','YYYY-MM-DD'),12)",
      'anio',
      String(q.anio),
    );
  if (cat.slug === 'horarios') {
    const condiciones = [
      'D.ID_HORARIO=T.ID_HORARIO',
      q.laborable !== undefined ? 'D.LABORABLE=:laborable' : 'D.LABORABLE=1',
      'D.ACTIVO=1',
    ];
    if (q.laborable !== undefined) binds.laborable = Number(q.laborable);
    for (const [key, sql] of Object.entries({
      diaSemana: 'D.DIA_SEMANA=:diaSemana',
      entradaMin: 'D.MINUTO_ENTRADA>=:entradaMin',
      entradaMax: 'D.MINUTO_ENTRADA<=:entradaMax',
      salidaMin: 'D.MINUTO_SALIDA>=:salidaMin',
      descansoMin: 'D.MINUTOS_DESCANSO>=:descansoMin',
      descansoMax: 'D.MINUTOS_DESCANSO<=:descansoMax',
      cruzaMedianoche: 'D.CRUZA_MEDIANOCHE=:cruzaMedianoche',
      salidaMax: 'D.MINUTO_SALIDA<=:salidaMax',
      horasMin: `(D.MINUTO_SALIDA+D.CRUZA_MEDIANOCHE*1440-D.MINUTO_ENTRADA-D.MINUTOS_DESCANSO)/60>=${numero('horasMin')}`,
      horasMax: `(D.MINUTO_SALIDA+D.CRUZA_MEDIANOCHE*1440-D.MINUTO_ENTRADA-D.MINUTOS_DESCANSO)/60<=${numero('horasMax')}`,
    }))
      if (q[key] !== undefined) {
        condiciones.push(sql);
        binds[key] = q[key]!;
      }
    if (condiciones.length > 3 || q.laborable !== undefined)
      filtros.push(
        `EXISTS (SELECT 1 FROM (${distribucionHorarioSql}) D WHERE ${condiciones.join(' AND ')})`,
      );
  }
  const where = filtros.length ? ` WHERE ${filtros.join(' AND ')}` : '';
  const total = await c.execute<{ TOTAL: number }>(
    `SELECT COUNT(*) TOTAL FROM ${cat.tabla} T${where}`,
    binds,
    opciones,
  );
  const orden =
    q.ordenarPor === 'id'
      ? cat.pk
      : q.ordenarPor === 'activo'
        ? 'ACTIVO'
        : cat.campos.find((f) => f.nombre === q.ordenarPor)!.columna;
  const dir = q.direccion === 'asc' ? 'ASC' : 'DESC';
  const r = await c.execute<Record<string, unknown>>(
    `SELECT T.${cat.pk} "id", T.ACTIVO "activo", ${await usoSql(c, cat)} "usos",${cat.campos.some((f) => f.tipo === 'codigo') ? `T.CODIGO_ANTERIOR "codigoAnterior",${cat.slug === 'parametros-legales' ? 'T.CLAVE_INTERNA "claveInterna",' : ''}` : ''}${cat.campos.map(seleccionar).join(',')}${etiquetas(cat)} FROM ${cat.tabla} T${where} ORDER BY T.${orden} ${dir},T.${cat.pk} ${dir} OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
    { ...binds, offset: (q.pagina - 1) * q.limite, limite: q.limite },
    opciones,
  );
  return {
    registros: (r.rows ?? []).map(convertir),
    total: total.rows?.[0]?.TOTAL ?? 0,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function detalle(c: Connection, cat: Catalogo, id: number) {
  const r = await c.execute<Record<string, unknown>>(
    `SELECT T.${cat.pk} "id",T.ACTIVO "activo",${await usoSql(c, cat)} "usos",${cat.campos.some((f) => f.tipo === 'codigo') ? `T.CODIGO_ANTERIOR "codigoAnterior",${cat.slug === 'parametros-legales' ? 'T.CLAVE_INTERNA "claveInterna",' : ''}` : ''}${cat.campos.map(seleccionar).join(',')}${etiquetas(cat)} FROM ${cat.tabla} T WHERE T.${cat.pk}=:id`,
    { id },
    opciones,
  );
  if (!r.rows?.[0]) return null;
  const fila = convertir(r.rows[0]);
  if (cat.slug === 'horarios') {
    fila.bloques = await bloquesHorario(c, id);
  }
  return fila;
}
function bindsCampos(cat: Catalogo, d: DatosCatalogo): Binds {
  return Object.fromEntries(
    cat.campos.map((f) => [
      f.nombre,
      f.tipo === 'booleano' ? Number(d[f.nombre]) : (d[f.nombre] ?? null),
    ]),
  ) as Binds;
}
export async function guardar(
  c: Connection,
  cat: Catalogo,
  d: DatosCatalogo,
  actor: number,
  id?: number,
) {
  const campos = cat.campos.filter(
    (f) =>
      f.tipo !== 'codigo' ||
      (['parametros-legales', 'conceptos'].includes(cat.slug) && !id && d.codigo),
  );
  const columnas = campos.map((f) => f.columna);
  const valores = campos.map((f) => expresion(f));
  const binds: Binds = { ...bindsCampos({ ...cat, campos }, d), actor };
  if (cat.slug === 'centros-trabajo') {
    columnas.push('LOCALIDAD');
    valores.push(':localidad');
    binds.localidad = String(d.localidad);
  }
  if (cat.slug === 'parametros-legales') {
    columnas.push('CLAVE_INTERNA');
    valores.push(':claveInterna');
    binds.claveInterna = String(d.claveInterna);
  }
  if (cat.legal) {
    columnas.push('MOTIVO');
    valores.push(':motivo');
    binds.motivo = d.motivo as string;
  }
  if (id !== undefined) {
    binds.id = id;
    await c.execute(
      `UPDATE ${cat.tabla} SET ${columnas.map((v, i) => `${v}=${valores[i]}`).join(',')},MODIFICADO_POR=:actor WHERE ${cat.pk}=:id`,
      binds,
    );
  } else {
    binds.id = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
    const r = await c.execute<{ id: number[] }>(
      `INSERT INTO ${cat.tabla} (${columnas.join(',')},CREADO_POR) VALUES (${valores.join(',')},:actor) RETURNING ${cat.pk} INTO :id`,
      binds,
    );
    id = r.outBinds!.id[0]!;
  }
  if (cat.slug === 'horarios') {
    // Los patrones asignados son inmutables; una edición de metadatos no reemplaza sus bloques.
    const actuales = await bloquesHorario(c, id);
    if (
      JSON.stringify(normalizarBloques(actuales)) !==
      JSON.stringify(normalizarBloques(d.bloques as BloqueHorario[]))
    ) {
      await borrarBloques(c, id);
      for (const b of d.bloques as BloqueHorario[]) {
        const r = await c.execute<{ bloque: number[] }>(
          'INSERT INTO HORARIO_BLOQUES(ID_HORARIO,MINUTO_ENTRADA,MINUTO_SALIDA,CRUZA_MEDIANOCHE,MINUTOS_DESCANSO,CREADO_POR) VALUES(:id,:entrada,:salida,:cruza,:descanso,:actor) RETURNING ID_HORARIO_BLOQUE INTO :bloque',
          {
            id,
            entrada: minutoBloque(b.entrada),
            salida: minutoBloque(b.salida),
            cruza: Number(b.cruzaMedianoche),
            descanso: b.minutosDescanso,
            actor,
            bloque: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          },
        );
        for (const dia of b.dias)
          await c.execute(
            'INSERT INTO HORARIO_BLOQUE_DIAS(ID_HORARIO_BLOQUE,DIA_SEMANA,CREADO_POR) VALUES(:bloque,:dia,:actor)',
            { bloque: r.outBinds!.bloque[0]!, dia, actor },
          );
      }
    }
  }
  return id;
}
export async function cambiarEstado(
  c: Connection,
  cat: Catalogo,
  id: number,
  activo: boolean,
  actor: number,
) {
  await c.execute(
    `UPDATE ${cat.tabla} SET ACTIVO=:activo,MODIFICADO_POR=:actor WHERE ${cat.pk}=:id`,
    { id, activo: Number(activo), actor },
  );
}
export async function eliminar(c: Connection, cat: Catalogo, id: number) {
  if (cat.slug === 'horarios') {
    await borrarBloques(c, id);
    await c.execute('DELETE FROM HORARIO_DIAS WHERE ID_HORARIO=:id', { id });
  }
  await c.execute(`DELETE FROM ${cat.tabla} WHERE ${cat.pk}=:id`, { id });
}
export async function cerrarVigencia(
  c: Connection,
  cat: Catalogo,
  id: number,
  desde: string,
  actor: number,
) {
  await c.execute(
    `UPDATE ${cat.tabla} SET VIGENTE_HASTA=LEAST(NVL(VIGENTE_HASTA,TO_DATE(:desde,'YYYY-MM-DD')-1),TO_DATE(:desde,'YYYY-MM-DD')-1),MODIFICADO_POR=:actor WHERE ${cat.pk}=:id`,
    { id, desde, actor },
  );
}
export async function ultimoCierre(c: Connection) {
  const r = await c.execute<{ FIN: string | null }>(
    "SELECT TO_CHAR(MAX(FECHA_FIN),'YYYY-MM-DD') FIN FROM PERIODOS_NOMINA WHERE ESTADO='CERRADO'",
    {},
    opciones,
  );
  return r.rows?.[0]?.FIN ?? null;
}
export async function referenciaActiva(
  c: Connection,
  ref: NonNullable<CampoCatalogo['referencia']>,
  id: number,
  historica = false,
) {
  const r = await c.execute<{ DEPARTAMENTO: number }>(
    ref === 'departamentos-gt' || ref === 'municipios-gt'
      ? `SELECT ${ref === 'municipios-gt' ? 'ID_DEPARTAMENTO_GT' : referenciasGt[ref][1]} DEPARTAMENTO FROM ${referenciasGt[ref][0]} WHERE ${referenciasGt[ref][1]}=:id AND (:historica=1 OR ACTIVO=1)`
      : ref === 'departamentos'
        ? 'SELECT ID_DEPARTAMENTO DEPARTAMENTO FROM DEPARTAMENTOS WHERE ID_DEPARTAMENTO=:id AND (:historica=1 OR ACTIVO=1)'
        : "SELECT ID_DEPARTAMENTO DEPARTAMENTO FROM EMPLEADOS WHERE ID_EMPLEADO=:id AND (:historica=1 OR (ACTIVO=1 AND ESTADO='ACTIVO'))",
    { id, historica: Number(historica) },
    opciones,
  );
  return r.rows?.[0];
}
export async function opcionesReferencia(
  c: Connection,
  ref: NonNullable<CampoCatalogo['referencia']>,
  buscar: string,
  pagina: number,
) {
  const gt = ref === 'departamentos-gt' || ref === 'municipios-gt' ? referenciasGt[ref] : null;
  const tabla = gt?.[0] ?? (ref === 'departamentos' ? 'DEPARTAMENTOS' : 'EMPLEADOS');
  const pk = gt?.[1] ?? (ref === 'departamentos' ? 'ID_DEPARTAMENTO' : 'ID_EMPLEADO');
  const label = ref === 'empleados' ? nombrePersonaSql('NOMBRES', 'APELLIDOS') : 'NOMBRE';
  const busqueda = ref === 'empleados' ? "NOMBRES||' '||APELLIDOS" : label;
  const r = await c.execute<{ value: string; label: string }>(
    `SELECT TO_CHAR(${pk}) "value",${label} "label" FROM ${tabla} WHERE ACTIVO=1 ${ref === 'empleados' ? "AND ESTADO='ACTIVO'" : ''} AND (:buscar IS NULL OR INSTR(UPPER(${label}),UPPER(:buscar))>0 OR INSTR(UPPER(${busqueda}),UPPER(:buscar))>0) ORDER BY ${label},${pk} OFFSET :offset ROWS FETCH NEXT 100 ROWS ONLY`,
    { buscar: buscar || null, offset: (pagina - 1) * 100 },
    opciones,
  );
  return r.rows ?? [];
}
export async function versiones(c: Connection, cat: Catalogo, d: DatosCatalogo, id: number) {
  const where =
    cat.slug === 'parametros-legales'
      ? 'T.CLAVE_INTERNA=:claveInterna'
      : cat.slug === 'conceptos'
        ? 'T.CODIGO=:codigo'
        : `T.LIMITE_INFERIOR=${numero('inferior')}`;
  const r = await c.execute<Record<string, unknown>>(
    `SELECT T.${cat.pk} "id",T.ACTIVO "activo",0 "usos",${cat.campos.some((f) => f.tipo === 'codigo') ? `T.CODIGO_ANTERIOR "codigoAnterior",${cat.slug === 'parametros-legales' ? 'T.CLAVE_INTERNA "claveInterna",' : ''}` : ''}${cat.campos.map(seleccionar).join(',')}${etiquetas(cat)} FROM ${cat.tabla} T WHERE ${where} AND T.${cat.pk}<>:id`,
    {
      ...(cat.slug === 'parametros-legales'
        ? { claveInterna: d.claveInterna as string }
        : cat.slug === 'conceptos'
          ? { codigo: d.codigo as string }
          : { inferior: d.limiteInferior as string }),
      id,
    },
    opciones,
  );
  return (r.rows ?? []).map(convertir);
}
export async function conflictosTramos(c: Connection, d: DatosCatalogo, id: number) {
  const r = await c.execute(
    `SELECT ID_TRAMO_ISR FROM TRAMOS_ISR WHERE ACTIVO=1 AND ID_TRAMO_ISR<>:id AND VIGENTE_DESDE<=NVL(TO_DATE(:hasta,'YYYY-MM-DD'),DATE '9999-12-31') AND NVL(VIGENTE_HASTA,DATE '9999-12-31')>=TO_DATE(:desde,'YYYY-MM-DD') AND (:superior IS NULL OR LIMITE_INFERIOR<${numero('superior')}) AND (LIMITE_SUPERIOR IS NULL OR LIMITE_SUPERIOR>${numero('inferior')})`,
    {
      id,
      hasta: d.vigenteHasta as string | null,
      desde: d.vigenteDesde as string,
      inferior: d.limiteInferior as string,
      superior: d.limiteSuperior as string | null,
    },
  );
  return !!r.rows?.length;
}
export async function conflictoFeriado(c: Connection, d: DatosCatalogo, id: number) {
  const r = await c.execute(
    "SELECT ID_FERIADO FROM FERIADOS WHERE ACTIVO=1 AND ID_FERIADO<>:id AND FECHA=TO_DATE(:fecha,'YYYY-MM-DD') AND (LOCALIDAD=:localidad OR LOCALIDAD='*' OR :localidad='*') AND MINUTO_INICIO<:fin AND MINUTO_FIN>:inicio",
    {
      id,
      fecha: d.fecha as string,
      localidad: d.localidad as string,
      inicio: d.minutoInicio as number,
      fin: d.minutoFin as number,
    },
  );
  return !!r.rows?.length;
}

export async function bloquesHorario(c: Connection, id: number): Promise<BloqueHorario[]> {
  const r = await c.execute<{
    id: number;
    dia: number;
    entrada: number;
    salida: number;
    cruza: number;
    descanso: number;
  }>(
    'SELECT B.ID_HORARIO_BLOQUE "id",D.DIA_SEMANA "dia",B.MINUTO_ENTRADA "entrada",B.MINUTO_SALIDA "salida",B.CRUZA_MEDIANOCHE "cruza",B.MINUTOS_DESCANSO "descanso" FROM HORARIO_BLOQUES B JOIN HORARIO_BLOQUE_DIAS D ON D.ID_HORARIO_BLOQUE=B.ID_HORARIO_BLOQUE WHERE B.ID_HORARIO=:id AND B.ACTIVO=1 AND D.ACTIVO=1 ORDER BY B.ID_HORARIO_BLOQUE,D.DIA_SEMANA',
    { id },
    opciones,
  );
  const mapa = new Map<number, BloqueHorario>();
  for (const f of r.rows ?? []) {
    if (!mapa.has(f.id))
      mapa.set(f.id, {
        dias: [],
        entrada: horaTexto(f.entrada),
        salida: horaTexto(f.salida),
        cruzaMedianoche: f.cruza === 1,
        minutosDescanso: f.descanso,
      });
    mapa.get(f.id)!.dias.push(f.dia);
  }
  return [...mapa.values()];
}
async function borrarBloques(c: Connection, id: number) {
  await c.execute(
    'DELETE FROM HORARIO_BLOQUE_DIAS WHERE ID_HORARIO_BLOQUE IN (SELECT ID_HORARIO_BLOQUE FROM HORARIO_BLOQUES WHERE ID_HORARIO=:id)',
    { id },
  );
  await c.execute('DELETE FROM HORARIO_BLOQUES WHERE ID_HORARIO=:id', { id });
}
export async function limitesHorario(c: Connection): Promise<LimitesHorario | null> {
  const r = await c.execute<{ clave: string; valor: number }>(
    `SELECT CLAVE_INTERNA "clave",VALOR "valor" FROM PARAMETROS_LEGALES WHERE ACTIVO=1 AND UNIDAD='HORAS' AND CLAVE_INTERNA LIKE 'JORNADA_%' AND VIGENTE_DESDE<=TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)) AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)))`,
    {},
    opciones,
  );
  const limites = {} as LimitesHorario;
  for (const tipo of ['DIURNA', 'MIXTA', 'NOCTURNA'] as Jornada[]) {
    const diario = (r.rows ?? []).filter((f) => f.clave === `JORNADA_${tipo}_HORAS`);
    const semanal = (r.rows ?? []).filter((f) => f.clave === `JORNADA_${tipo}_HORAS_SEMANA`);
    if (
      diario.length !== 1 ||
      semanal.length !== 1 ||
      diario[0]!.valor <= 0 ||
      semanal[0]!.valor <= 0
    )
      return null;
    limites[tipo] = { diarias: diario[0]!.valor, semanales: semanal[0]!.valor };
  }
  return limites;
}
