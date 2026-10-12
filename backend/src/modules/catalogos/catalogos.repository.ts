import oracledb from 'oracledb';
import type { Connection, BindParameter } from 'oracledb';
import type {
  Catalogo,
  CampoCatalogo,
  DatosCatalogo,
  DiaHorario,
  FilaCatalogo,
} from './catalogos.definiciones.js';
import type { QueryCatalogo } from './catalogos.schemas.js';
import { minutos } from './catalogos.schemas.js';
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

function etiquetas(cat: Catalogo) {
  return cat.campos
    .filter((f) => f.referencia)
    .map(
      (f) =>
        `,(SELECT ${f.referencia === 'departamentos' ? 'R.NOMBRE' : "R.NOMBRES||' '||R.APELLIDOS"} FROM ${f.referencia === 'departamentos' ? 'DEPARTAMENTOS' : 'EMPLEADOS'} R WHERE R.${f.referencia === 'departamentos' ? 'ID_DEPARTAMENTO' : 'ID_EMPLEADO'}=T.${f.columna}) "${f.nombre}Etiqueta"`,
    )
    .join('');
}
async function referencias(c: Connection, cat: Catalogo) {
  const r = await c.execute<{ TABLA: string; COLUMNA: string }>(
    `SELECT C.TABLE_NAME TABLA, CC.COLUMN_NAME COLUMNA FROM USER_CONSTRAINTS C JOIN USER_CONSTRAINTS P ON P.CONSTRAINT_NAME=C.R_CONSTRAINT_NAME JOIN USER_CONS_COLUMNS CC ON CC.CONSTRAINT_NAME=C.CONSTRAINT_NAME JOIN USER_CONS_COLUMNS PC ON PC.CONSTRAINT_NAME=P.CONSTRAINT_NAME AND PC.POSITION=CC.POSITION WHERE C.CONSTRAINT_TYPE='R' AND P.TABLE_NAME=:tabla AND PC.COLUMN_NAME=:pk`,
    { tabla: cat.tabla, pk: cat.pk },
    opciones,
  );
  return (r.rows ?? []).filter((r) => !(cat.slug === 'horarios' && r.TABLA === 'HORARIO_DIAS'));
}
async function usoSql(c: Connection, cat: Catalogo) {
  const refs = await referencias(c, cat);
  return refs.length
    ? `CASE WHEN ${refs.map((r) => `EXISTS (SELECT 1 FROM ${r.TABLA} R WHERE R.${r.COLUMNA}=T.${cat.pk})`).join(' OR ')} THEN 1 ELSE 0 END`
    : '0';
}
function convertir(row: Record<string, unknown>): FilaCatalogo {
  return { ...row, activo: row.activo === 1, enUso: row.enUso === 1 } as FilaCatalogo;
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
    const textos = cat.campos.filter((f) => ['texto', 'codigo', 'area', 'opcion'].includes(f.tipo));
    if (textos.length)
      agregar(
        `(${textos.map((f) => `INSTR(UPPER(T.${f.columna}),UPPER(:buscar))>0`).join(' OR ')})`,
        'buscar',
        q.buscar,
      );
  }
  if (q.activo !== undefined) agregar('T.ACTIVO=:activo', 'activo', Number(q.activo));
  for (const f of cat.campos) {
    for (const sufijo of ['', 'Min', 'Max']) {
      const key = f.nombre + sufijo;
      const v = q[key];
      if (v === undefined) continue;
      if (sufijo)
        agregar(`T.${f.columna} ${sufijo === 'Min' ? '>=' : '<='} ${expresion(f, key)}`, key, v);
      else if (['texto', 'codigo', 'area'].includes(f.tipo))
        agregar(`INSTR(UPPER(T.${f.columna}),UPPER(:${key}))>0`, key, v);
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
      filtros.push(`EXISTS (SELECT 1 FROM HORARIO_DIAS D WHERE ${condiciones.join(' AND ')})`);
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
    `SELECT T.${cat.pk} "id", T.ACTIVO "activo", ${await usoSql(c, cat)} "enUso",${cat.campos.map(seleccionar).join(',')}${etiquetas(cat)} FROM ${cat.tabla} T${where} ORDER BY T.${orden} ${dir},T.${cat.pk} ${dir} OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
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
    `SELECT T.${cat.pk} "id",T.ACTIVO "activo",${await usoSql(c, cat)} "enUso",${cat.campos.map(seleccionar).join(',')}${etiquetas(cat)} FROM ${cat.tabla} T WHERE T.${cat.pk}=:id`,
    { id },
    opciones,
  );
  if (!r.rows?.[0]) return null;
  const fila = convertir(r.rows[0]);
  if (cat.slug === 'horarios') {
    const dias = await c.execute<Record<string, number | null>>(
      'SELECT DIA_SEMANA,LABORABLE,MINUTO_ENTRADA,MINUTO_SALIDA,CRUZA_MEDIANOCHE,MINUTOS_DESCANSO FROM HORARIO_DIAS WHERE ID_HORARIO=:id AND ACTIVO=1 ORDER BY DIA_SEMANA',
      { id },
      opciones,
    );
    const hora = (m: number | null | undefined) =>
      m == null
        ? null
        : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    fila.dias = (dias.rows ?? []).map((d) => ({
      diaSemana: d.DIA_SEMANA!,
      laborable: d.LABORABLE === 1,
      entrada: hora(d.MINUTO_ENTRADA),
      salida: hora(d.MINUTO_SALIDA),
      cruzaMedianoche: d.CRUZA_MEDIANOCHE === 1,
      minutosDescanso: d.MINUTOS_DESCANSO!,
    }));
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
  const columnas = cat.campos.map((f) => f.columna);
  const valores = cat.campos.map((f) => expresion(f));
  const binds: Binds = { ...bindsCampos(cat, d), actor };
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
    // MERGE conserva identidades y auditoría de cada día al editar el patrón.
    for (const dia of d.dias as DiaHorario[])
      await c.execute(
        `MERGE INTO HORARIO_DIAS H USING (SELECT :id ID_HORARIO,:dia DIA_SEMANA FROM DUAL) S ON (H.ID_HORARIO=S.ID_HORARIO AND H.DIA_SEMANA=S.DIA_SEMANA) WHEN MATCHED THEN UPDATE SET LABORABLE=:laborable,MINUTO_ENTRADA=:entrada,MINUTO_SALIDA=:salida,CRUZA_MEDIANOCHE=:cruza,MINUTOS_DESCANSO=:descanso,MODIFICADO_POR=:actor WHEN NOT MATCHED THEN INSERT (ID_HORARIO,DIA_SEMANA,LABORABLE,MINUTO_ENTRADA,MINUTO_SALIDA,CRUZA_MEDIANOCHE,MINUTOS_DESCANSO,CREADO_POR) VALUES (:id,:dia,:laborable,:entrada,:salida,:cruza,:descanso,:actor)`,
        {
          id,
          dia: dia.diaSemana,
          laborable: Number(dia.laborable),
          entrada: dia.entrada ? minutos(dia.entrada) : null,
          salida: dia.salida ? minutos(dia.salida) : null,
          cruza: Number(dia.cruzaMedianoche),
          descanso: dia.minutosDescanso,
          actor,
        },
      );
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
  if (cat.slug === 'horarios')
    await c.execute('DELETE FROM HORARIO_DIAS WHERE ID_HORARIO=:id', { id });
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
  ref: 'departamentos' | 'empleados',
  id: number,
) {
  const r = await c.execute<{ DEPARTAMENTO: number }>(
    ref === 'departamentos'
      ? 'SELECT ID_DEPARTAMENTO DEPARTAMENTO FROM DEPARTAMENTOS WHERE ID_DEPARTAMENTO=:id AND ACTIVO=1'
      : "SELECT ID_DEPARTAMENTO DEPARTAMENTO FROM EMPLEADOS WHERE ID_EMPLEADO=:id AND ACTIVO=1 AND ESTADO='ACTIVO'",
    { id },
    opciones,
  );
  return r.rows?.[0];
}
export async function opcionesReferencia(
  c: Connection,
  ref: 'departamentos' | 'empleados',
  buscar: string,
  pagina: number,
) {
  const tabla = ref === 'departamentos' ? 'DEPARTAMENTOS' : 'EMPLEADOS';
  const pk = ref === 'departamentos' ? 'ID_DEPARTAMENTO' : 'ID_EMPLEADO';
  const label = ref === 'departamentos' ? 'NOMBRE' : "NOMBRES||' '||APELLIDOS";
  const r = await c.execute<{ value: string; label: string }>(
    `SELECT TO_CHAR(${pk}) "value",${label} "label" FROM ${tabla} WHERE ACTIVO=1 ${ref === 'empleados' ? "AND ESTADO='ACTIVO'" : ''} AND (:buscar IS NULL OR INSTR(UPPER(${label}),UPPER(:buscar))>0) ORDER BY ${label},${pk} OFFSET :offset ROWS FETCH NEXT 100 ROWS ONLY`,
    { buscar: buscar || null, offset: (pagina - 1) * 100 },
    opciones,
  );
  return r.rows ?? [];
}
export async function versiones(c: Connection, cat: Catalogo, d: DatosCatalogo, id: number) {
  const where =
    cat.slug === 'parametros-legales'
      ? 'T.CODIGO=:codigo'
      : `T.LIMITE_INFERIOR=${numero('inferior')}`;
  const r = await c.execute<Record<string, unknown>>(
    `SELECT T.${cat.pk} "id",T.ACTIVO "activo",0 "enUso",${cat.campos.map(seleccionar).join(',')}${etiquetas(cat)} FROM ${cat.tabla} T WHERE ${where} AND T.${cat.pk}<>:id`,
    {
      ...(cat.slug === 'parametros-legales'
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
