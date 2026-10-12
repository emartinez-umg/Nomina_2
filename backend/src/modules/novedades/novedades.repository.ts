import oracledb from 'oracledb';
import type { Connection, BindParameters, BindParameter, Lob } from 'oracledb';
import type { Datos, Tipo, Query } from './novedades.schemas.js';
import type { amortizar } from './novedades.reglas.js';
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
type Binds = Record<string, string | number | null | Buffer | BindParameter>;
export const numero = (key: string) =>
  `TO_NUMBER(:${key},'999999999999999999D999999','NLS_NUMERIC_CHARACTERS=''.,''')`;
const fecha = (key: string) => `TO_DATE(:${key},'YYYY-MM-DD')`;
const textoNumero = (col: string) => `TO_CHAR(${col},'TM9','NLS_NUMERIC_CHARACTERS=''.,''')`;
export const tablas = {
  descuentos: ['DESCUENTOS_EMPLEADO', 'ID_DESCUENTO_EMPLEADO'],
  prestamos: ['DESCUENTOS_EMPLEADO', 'ID_DESCUENTO_EMPLEADO'],
  comisiones: ['COMISIONES', 'ID_COMISION'],
  'horas-extra': ['HORAS_EXTRA', 'ID_HORA_EXTRA'],
  ausencias: ['AUSENCIAS', 'ID_AUSENCIA'],
} as const;
export const esDescuento = (tipo: Tipo) => tipo === 'descuentos' || tipo === 'prestamos';
export interface Fila {
  id: number;
  idEmpleado: number;
  empleado: string;
  activo: number;
  bloqueada: number;
  fechaInicio: string;
  fechaFin: string | null;
  estado: string;
  motivo: string;
  monto: string | null;
  saldo: string | null;
  montoQuincena?: string;
  cuotas?: number | null;
  idTipo?: number;
  tipoNombre?: string;
  modalidad?: 'FIJO' | 'CUOTAS' | 'UNICO';
  fecha?: string;
  fechaDesembolso?: string;
  referencia?: string;
  horas?: string;
  jornada?: string;
  efecto?: string;
  dias?: number;
  soporteNombre?: string | null;
  soporteTipo?: string | null;
  idPeriodo?: number;
}
function config(tipo: Tipo) {
  const desc = esDescuento(tipo);
  const inicio =
    desc || tipo === 'ausencias'
      ? 'T.FECHA_INICIO'
      : tipo === 'comisiones'
        ? 'P.FECHA_INICIO'
        : 'T.FECHA';
  const fin = desc
    ? "NVL(T.FECHA_FIN,DATE '9999-12-31')"
    : tipo === 'ausencias'
      ? 'T.FECHA_FIN'
      : tipo === 'comisiones'
        ? 'P.FECHA_FIN'
        : 'T.FECHA';
  const estado =
    desc || tipo !== 'comisiones'
      ? 'T.ESTADO'
      : "CASE WHEN T.ACTIVO=1 THEN 'ACTIVA' ELSE 'INACTIVA' END";
  const monto = desc
    ? 'NVL(T.MONTO_TOTAL,T.MONTO_QUINCENA)'
    : tipo === 'comisiones'
      ? 'T.MONTO'
      : 'NULL';
  const uso = desc
    ? 'EXISTS (SELECT 1 FROM DESCUENTOS_APLICACIONES A WHERE A.ID_DESCUENTO_EMPLEADO=T.ID_DESCUENTO_EMPLEADO) OR EXISTS (SELECT 1 FROM DESCUENTOS_CUOTAS C WHERE C.ID_DESCUENTO_EMPLEADO=T.ID_DESCUENTO_EMPLEADO AND C.MONTO_PAGADO>0)'
    : `EXISTS (SELECT 1 FROM NOMINA_DETALLE N WHERE N.${tipo === 'comisiones' ? 'ID_COMISION' : tipo === 'horas-extra' ? 'ID_HORA_EXTRA' : 'ID_AUSENCIA'}=T.${tablas[tipo][1]})`;
  const bloqueada = `CASE WHEN EXISTS (SELECT 1 FROM PERIODOS_NOMINA C WHERE C.ESTADO='CERRADO' AND C.FECHA_INICIO<=${fin} AND C.FECHA_FIN>=${inicio}) OR ${uso} THEN 1 ELSE 0 END`;
  return {
    inicio,
    fin,
    estado,
    monto,
    bloqueada,
    from: `${tablas[tipo][0]} T JOIN EMPLEADOS E ON E.ID_EMPLEADO=T.ID_EMPLEADO ${desc ? `JOIN TIPOS_DESCUENTO D ON D.ID_TIPO_DESCUENTO=T.ID_TIPO_DESCUENTO ${tipo === 'prestamos' ? 'JOIN PRESTAMOS L ON L.ID_DESCUENTO_EMPLEADO=T.ID_DESCUENTO_EMPLEADO' : ''}` : tipo === 'ausencias' ? 'JOIN TIPOS_AUSENCIA D ON D.ID_TIPO_AUSENCIA=T.ID_TIPO_AUSENCIA' : 'JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=T.ID_PERIODO_NOMINA'}`,
    condicion:
      tipo === 'descuentos'
        ? 'NOT EXISTS (SELECT 1 FROM PRESTAMOS L WHERE L.ID_DESCUENTO_EMPLEADO=T.ID_DESCUENTO_EMPLEADO)'
        : '1=1',
  };
}
function select(tipo: Tipo) {
  const x = config(tipo),
    desc = esDescuento(tipo);
  return `T.${tablas[tipo][1]} "id",T.ID_EMPLEADO "idEmpleado",E.CODIGO||' · '||E.NOMBRES||' '||E.APELLIDOS "empleado",T.ACTIVO "activo",${x.bloqueada} "bloqueada",TO_CHAR(${x.inicio},'YYYY-MM-DD') "fechaInicio",TO_CHAR(${x.fin},'YYYY-MM-DD') "fechaFin",${x.estado} "estado",${textoNumero(x.monto)} "monto",${desc ? textoNumero('T.SALDO') : 'NULL'} "saldo",T.${tipo === 'comisiones' ? 'DESCRIPCION' : 'MOTIVO'} "motivo"${desc ? `,T.ID_TIPO_DESCUENTO "idTipo",D.NOMBRE "tipoNombre",T.MODALIDAD "modalidad",T.NUMERO_CUOTAS "cuotas",${textoNumero('T.MONTO_QUINCENA')} "montoQuincena"` : ''}${tipo === 'prestamos' ? ',TO_CHAR(L.FECHA_DESEMBOLSO,\'YYYY-MM-DD\') "fechaDesembolso",L.REFERENCIA "referencia"' : ''}${tipo === 'comisiones' ? ',T.REFERENCIA "referencia",T.ID_PERIODO_NOMINA "idPeriodo"' : ''}${tipo === 'horas-extra' ? `,TO_CHAR(T.FECHA,'YYYY-MM-DD') "fecha",T.ID_PERIODO_NOMINA "idPeriodo",${textoNumero('T.HORAS')} "horas",T.JORNADA "jornada"` : ''}${tipo === 'ausencias' ? ',T.ID_TIPO_AUSENCIA "idTipo",D.NOMBRE "tipoNombre",D.EFECTO "efecto",T.DIAS "dias",T.SOPORTE_NOMBRE "soporteNombre",T.SOPORTE_TIPO "soporteTipo"' : ''}`;
}
export async function listar(c: Connection, tipo: Tipo, q: Query) {
  const x = config(tipo),
    desc = esDescuento(tipo),
    condiciones = [x.condicion],
    binds: Binds = {};
  const add = (sql: string, key: string, value: string | number) => {
    condiciones.push(sql);
    binds[key] = value;
  };
  if (q.buscar)
    add(
      `(INSTR(UPPER(E.CODIGO||' '||E.NOMBRES||' '||E.APELLIDOS||' '||T.${tipo === 'comisiones' ? 'DESCRIPCION' : 'MOTIVO'}),UPPER(:buscar))>0)`,
      'buscar',
      q.buscar,
    );
  if (q.idEmpleado) add('T.ID_EMPLEADO=:idEmpleado', 'idEmpleado', q.idEmpleado);
  if (q.idTipo && (desc || tipo === 'ausencias'))
    add(`T.${desc ? 'ID_TIPO_DESCUENTO' : 'ID_TIPO_AUSENCIA'}=:idTipo`, 'idTipo', q.idTipo);
  if (q.idPeriodo && !desc && tipo !== 'ausencias')
    add('T.ID_PERIODO_NOMINA=:idPeriodo', 'idPeriodo', q.idPeriodo);
  if (q.desde) add(`${x.fin}>=${fecha('desde')}`, 'desde', q.desde);
  if (q.hasta) add(`${x.inicio}<=${fecha('hasta')}`, 'hasta', q.hasta);
  if (q.estado) add(`${x.estado}=:estado`, 'estado', q.estado);
  if (q.modalidad && desc) add('T.MODALIDAD=:modalidad', 'modalidad', q.modalidad);
  if (q.jornada && tipo === 'horas-extra') add('T.JORNADA=:jornada', 'jornada', q.jornada);
  if (q.efecto && tipo === 'ausencias') add('D.EFECTO=:efecto', 'efecto', q.efecto);
  const campos = {
    monto: x.monto,
    saldo: desc ? 'T.SALDO' : 'NULL',
    horas: tipo === 'horas-extra' ? 'T.HORAS' : 'NULL',
    cuotas: desc ? 'T.NUMERO_CUOTAS' : 'NULL',
  };
  for (const key of ['monto', 'saldo', 'horas', 'cuotas'] as const)
    for (const suf of ['Min', 'Max'] as const) {
      const k = `${key}${suf}` as const,
        v = q[k];
      if (v !== undefined) add(`${campos[key]}${suf === 'Min' ? '>=' : '<='}${numero(k)}`, k, v);
    }
  const where = ` WHERE ${condiciones.join(' AND ')}`;
  const total = await c.execute<{ TOTAL: number }>(
    `SELECT COUNT(*) TOTAL FROM ${x.from}${where}`,
    binds,
    opts,
  );
  const orden = {
    id: `T.${tablas[tipo][1]}`,
    empleado: 'E.NOMBRES',
    fechaInicio: x.inicio,
    monto: x.monto,
    estado: x.estado,
    saldo: desc ? 'T.SALDO' : `T.${tablas[tipo][1]}`,
  }[q.ordenarPor];
  const dir = q.direccion === 'asc' ? 'ASC' : 'DESC';
  const r = await c.execute<Fila>(
    `SELECT ${select(tipo)} FROM ${x.from}${where} ORDER BY ${orden} ${dir},T.${tablas[tipo][1]} ${dir} OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
    { ...binds, offset: (q.pagina - 1) * q.limite, limite: q.limite },
    opts,
  );
  return {
    registros: r.rows ?? [],
    total: total.rows?.[0]?.TOTAL ?? 0,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function detalle(c: Connection, tipo: Tipo, id: number) {
  const x = config(tipo);
  return (
    await c.execute<Fila>(
      `SELECT ${select(tipo)} FROM ${x.from} WHERE T.${tablas[tipo][1]}=:id AND ${x.condicion}`,
      { id },
      opts,
    )
  ).rows?.[0];
}
export async function cuotas(c: Connection, id: number) {
  return (
    (
      await c.execute<{
        id: number;
        numero: number;
        fecha: string;
        monto: string;
        pagado: string;
        estado: string;
      }>(
        `SELECT ID_DESCUENTO_CUOTA "id",NUMERO_CUOTA "numero",TO_CHAR(FECHA_VENCIMIENTO,'YYYY-MM-DD') "fecha",${textoNumero('MONTO')} "monto",${textoNumero('MONTO_PAGADO')} "pagado",ESTADO "estado" FROM DESCUENTOS_CUOTAS WHERE ID_DESCUENTO_EMPLEADO=:id ORDER BY NUMERO_CUOTA`,
        { id },
        opts,
      )
    ).rows ?? []
  );
}
export async function cerrados(c: Connection, inicio: string, fin: string) {
  return !!(
    await c.execute(
      `SELECT 1 FROM PERIODOS_NOMINA WHERE ESTADO='CERRADO' AND FECHA_INICIO<=${fecha('fin')} AND FECHA_FIN>=${fecha('inicio')}`,
      { inicio, fin },
    )
  ).rows?.length;
}
export async function empleado(c: Connection, id: number) {
  return (
    await c.execute<{ nombre: string; inicio: string; fin: string | null; estado: string }>(
      'SELECT CODIGO||\' · \'||NOMBRES||\' \'||APELLIDOS "nombre",TO_CHAR(FECHA_INGRESO,\'YYYY-MM-DD\') "inicio",TO_CHAR(FECHA_EGRESO,\'YYYY-MM-DD\') "fin",ESTADO "estado" FROM EMPLEADOS WHERE ID_EMPLEADO=:id AND ACTIVO=1',
      { id },
      opts,
    )
  ).rows?.[0];
}
export async function tipoReferencia(c: Connection, tipo: Tipo, id: number) {
  return (
    await c.execute<{ codigo: string; efecto?: string }>(
      `SELECT CODIGO "codigo"${tipo === 'ausencias' ? ',EFECTO "efecto"' : ''} FROM ${tipo === 'ausencias' ? 'TIPOS_AUSENCIA' : 'TIPOS_DESCUENTO'} WHERE ${tipo === 'ausencias' ? 'ID_TIPO_AUSENCIA' : 'ID_TIPO_DESCUENTO'}=:id AND ACTIVO=1`,
      { id },
      opts,
    )
  ).rows?.[0];
}
export async function traslape(
  c: Connection,
  empleado: number,
  inicio: string,
  fin: string,
  id = 0,
) {
  const binds = { empleado, inicio, fin, id };
  const a = await c.execute(
    `SELECT 1 FROM AUSENCIAS WHERE ID_EMPLEADO=:empleado AND ID_AUSENCIA<>:id AND ACTIVO=1 AND ESTADO<>'RECHAZADA' AND FECHA_INICIO<=${fecha('fin')} AND FECHA_FIN>=${fecha('inicio')}`,
    binds,
  );
  const v = await c.execute(
    `SELECT 1 FROM VACACIONES_SOLICITUDES WHERE ID_EMPLEADO=:empleado AND ACTIVO=1 AND ESTADO IN ('EN_PROCESO','APROBADA','TOMADA') AND FECHA_INICIO<=${fecha('fin')} AND FECHA_FIN>=${fecha('inicio')}`,
    { empleado, inicio, fin },
  );
  return !!(a.rows?.length || v.rows?.length);
}
export async function periodo(
  c: Connection,
  q: { inicio: string; fin: string; numero: number },
  actor: number,
) {
  await c.execute(
    `MERGE INTO PERIODOS_NOMINA P USING (SELECT ${fecha('inicio')} INICIO FROM DUAL) S ON (P.FECHA_INICIO=S.INICIO) WHEN NOT MATCHED THEN INSERT (FECHA_INICIO,FECHA_FIN,QUINCENA,CREADO_POR) VALUES (S.INICIO,${fecha('fin')},:numero,:actor)`,
    { ...q, actor },
  );
  return (
    await c.execute<{ ID: number }>(
      'SELECT ID_PERIODO_NOMINA ID FROM PERIODOS_NOMINA WHERE FECHA_INICIO=' + fecha('inicio'),
      { inicio: q.inicio },
      opts,
    )
  ).rows![0]!.ID;
}
export async function parametrosHora(
  c: Connection,
  idEmpleado: number,
  desde: string,
  jornada: string,
) {
  const salario = (
    await c.execute<{ VALOR: string }>(
      `SELECT ${textoNumero('SALARIO_BASE')} VALOR FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:idEmpleado AND ACTIVO=1 AND VIGENTE_DESDE<=${fecha('desde')} AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=${fecha('desde')})`,
      { idEmpleado, desde },
      opts,
    )
  ).rows?.[0]?.VALOR;
  const r = await c.execute<{ CODIGO: string; VALOR: string; UNIDAD: string }>(
    `SELECT CODIGO,${textoNumero('VALOR')} VALOR,UNIDAD FROM PARAMETROS_LEGALES WHERE ACTIVO=1 AND CODIGO IN ('SALARIO_DIAS_MES','HORAS_EXTRA_RECARGO_PORCENTAJE',:jornada) AND VIGENTE_DESDE<=${fecha('desde')} AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=${fecha('desde')})`,
    { desde, jornada: `JORNADA_${jornada}_HORAS` },
    opts,
  );
  return { salario, parametros: r.rows ?? [] };
}
export async function guardar(
  c: Connection,
  tipo: Tipo,
  campos: Record<string, { valor: string | number | null; tipo?: 'fecha' | 'numero' }>,
  actor: number,
  id?: number,
) {
  const binds: Binds = { actor };
  const entries = Object.entries(campos);
  const valores = entries.map(([, v], i) => {
    const key = `v${i}`;
    binds[key] = v.valor;
    return v.tipo === 'fecha' ? fecha(key) : v.tipo === 'numero' ? numero(key) : `:${key}`;
  });
  if (id) {
    await c.execute(
      `UPDATE ${tablas[tipo][0]} SET ${entries.map(([col], i) => `${col}=${valores[i]}`).join(',')},MODIFICADO_POR=:actor WHERE ${tablas[tipo][1]}=:id`,
      { ...binds, id },
    );
    return id;
  }
  const r = await c.execute<{ id: number[] }>(
    `INSERT INTO ${tablas[tipo][0]} (${entries.map(([col]) => col).join(',')},CREADO_POR) VALUES (${valores.join(',')},:actor) RETURNING ${tablas[tipo][1]} INTO :id`,
    { ...binds, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
  );
  return r.outBinds!.id[0]!;
}
export async function guardarPrestamo(c: Connection, id: number, d: Datos, actor: number) {
  await c.execute(
    `MERGE INTO PRESTAMOS P USING (SELECT :id ID FROM DUAL) S ON (P.ID_DESCUENTO_EMPLEADO=S.ID) WHEN MATCHED THEN UPDATE SET CAPITAL=${numero('monto')},FECHA_DESEMBOLSO=${fecha('fecha')},REFERENCIA=:referencia,MODIFICADO_POR=:actor WHEN NOT MATCHED THEN INSERT (ID_DESCUENTO_EMPLEADO,ID_EMPLEADO,CAPITAL,FECHA_DESEMBOLSO,REFERENCIA,CREADO_POR) VALUES (:id,:empleado,${numero('monto')},${fecha('fecha')},:referencia,:actor)`,
    {
      id,
      empleado: d.idEmpleado,
      monto: d.monto!,
      fecha: d.fechaDesembolso!,
      referencia: d.referencia!,
      actor,
    },
  );
}
export async function guardarCuotas(
  c: Connection,
  id: number,
  empleado: number,
  plan: ReturnType<typeof amortizar>,
  actor: number,
) {
  // Solo se regenera un calendario nunca aplicado; el servicio protege el historial consumido.
  await c.execute('DELETE FROM DESCUENTOS_CUOTAS WHERE ID_DESCUENTO_EMPLEADO=:id', { id });
  for (const f of plan)
    await c.execute(
      `INSERT INTO DESCUENTOS_CUOTAS (ID_DESCUENTO_EMPLEADO,ID_EMPLEADO,NUMERO_CUOTA,FECHA_VENCIMIENTO,MONTO,CREADO_POR) VALUES (:id,:empleado,:numero,${fecha('fecha')},${numero('monto')},:actor)`,
      { id, empleado, numero: f.numero, fecha: f.fecha, monto: f.monto, actor },
    );
}
export async function guardarAdjunto(
  c: Connection,
  id: number,
  adjunto: Datos['adjunto'],
  actor: number,
) {
  if (adjunto === undefined) return;
  await c.execute(
    'UPDATE AUSENCIAS SET SOPORTE=:contenido,SOPORTE_NOMBRE=:nombre,SOPORTE_TIPO=:tipo,MODIFICADO_POR=:actor WHERE ID_AUSENCIA=:id',
    {
      id,
      actor,
      contenido: adjunto ? Buffer.from(adjunto.base64, 'base64') : null,
      nombre: adjunto?.nombre ?? null,
      tipo: adjunto?.tipo ?? null,
    },
  );
}
export async function adjunto(c: Connection, id: number) {
  const r = (
    await c.execute<{ contenido: Lob | null; nombre: string; tipo: string }>(
      'SELECT SOPORTE "contenido",SOPORTE_NOMBRE "nombre",SOPORTE_TIPO "tipo" FROM AUSENCIAS WHERE ID_AUSENCIA=:id',
      { id },
      opts,
    )
  ).rows?.[0];
  if (!r?.contenido) return null;
  const contenido = (await r.contenido.getData()) as Buffer;
  return { nombre: r.nombre, tipo: r.tipo, base64: contenido.toString('base64') };
}
export async function anular(c: Connection, tipo: Tipo, id: number, actor: number) {
  await c.execute(
    `UPDATE ${tablas[tipo][0]} SET ACTIVO=0${esDescuento(tipo) ? ",ESTADO='CANCELADO'" : ''},MODIFICADO_POR=:actor WHERE ${tablas[tipo][1]}=:id`,
    { id, actor },
  );
  if (tipo === 'prestamos')
    await c.execute(
      'UPDATE PRESTAMOS SET ACTIVO=0,MODIFICADO_POR=:actor WHERE ID_DESCUENTO_EMPLEADO=:id',
      { id, actor },
    );
  if (esDescuento(tipo))
    await c.execute(
      "UPDATE DESCUENTOS_CUOTAS SET ESTADO='CANCELADA',MODIFICADO_POR=:actor WHERE ID_DESCUENTO_EMPLEADO=:id",
      { id, actor },
    );
}
export async function opciones(
  c: Connection,
  ref: 'empleados' | 'descuentos' | 'prestamos' | 'ausencias' | 'periodos',
  buscar: string,
  pagina: number,
  seleccionado?: number,
) {
  const def =
    ref === 'empleados'
      ? ['EMPLEADOS', 'ID_EMPLEADO', "CODIGO||' · '||NOMBRES||' '||APELLIDOS", "ESTADO='ACTIVO'"]
      : ref === 'periodos'
        ? [
            'PERIODOS_NOMINA',
            'ID_PERIODO_NOMINA',
            "TO_CHAR(FECHA_INICIO,'DD/MM/YYYY')||' – '||TO_CHAR(FECHA_FIN,'DD/MM/YYYY')||' · '||ESTADO",
            '1=1',
          ]
        : [
            ref === 'ausencias' ? 'TIPOS_AUSENCIA' : 'TIPOS_DESCUENTO',
            ref === 'ausencias' ? 'ID_TIPO_AUSENCIA' : 'ID_TIPO_DESCUENTO',
            ref === 'ausencias' ? "NOMBRE||' · '||EFECTO" : 'NOMBRE',
            ref === 'prestamos'
              ? "CODIGO IN ('PRESTAMO','ANTICIPO')"
              : ref === 'descuentos'
                ? "CODIGO NOT IN ('PRESTAMO','ANTICIPO')"
                : '1=1',
          ];
  return (
    (
      await c.execute<{ value: string; label: string }>(
        `SELECT TO_CHAR(${def[1]}) "value",${def[2]} "label" FROM ${def[0]} WHERE ((ACTIVO=1 AND ${def[3]}) OR ${def[1]}=:seleccionado) AND (:buscar IS NULL OR INSTR(UPPER(${def[2]}),UPPER(:buscar))>0) ORDER BY ${def[2]},${def[1]} OFFSET :offset ROWS FETCH NEXT 100 ROWS ONLY`,
        { seleccionado: seleccionado ?? null, buscar: buscar || null, offset: (pagina - 1) * 100 },
        opts,
      )
    ).rows ?? []
  );
}
export async function hoy(c: Connection) {
  return (
    await c.execute<{ HOY: string }>(
      "SELECT TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala','YYYY-MM-DD') HOY FROM DUAL",
      {},
      opts,
    )
  ).rows![0]!.HOY;
}
export async function restricciones(c: Connection, id: number, excluir: number) {
  const rangos =
    (
      await c.execute<{ inicio: string; fin: string }>(
        `SELECT TO_CHAR(FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(FECHA_FIN,'YYYY-MM-DD') "fin" FROM AUSENCIAS WHERE ID_EMPLEADO=:id AND ID_AUSENCIA<>:excluir AND ACTIVO=1 AND ESTADO<>'RECHAZADA' UNION ALL SELECT TO_CHAR(FECHA_INICIO,'YYYY-MM-DD'),TO_CHAR(FECHA_FIN,'YYYY-MM-DD') FROM VACACIONES_SOLICITUDES WHERE ID_EMPLEADO=:id AND ACTIVO=1 AND ESTADO IN ('EN_PROCESO','APROBADA','TOMADA')`,
        { id, excluir },
        opts,
      )
    ).rows ?? [];
  const cierres =
    (
      await c.execute<{ inicio: string; fin: string }>(
        "SELECT TO_CHAR(FECHA_INICIO,'YYYY-MM-DD') \"inicio\",TO_CHAR(FECHA_FIN,'YYYY-MM-DD') \"fin\" FROM PERIODOS_NOMINA WHERE ESTADO='CERRADO'",
        {},
        opts,
      )
    ).rows ?? [];
  return { empleado: await empleado(c, id), rangos, cierres };
}

// Primitivas para que Fase 8 aplique cuotas dentro de la transacción de nómina.
export async function contextoCobro(c: Connection, idCuota: number, idNomina: number) {
  return (
    await c.execute<{
      id: number;
      empleado: number;
      periodo: number;
      saldo: string;
      pendiente: string;
      inicio: string;
      fin: string;
      estado: string;
      vigente: string;
    }>(
      `SELECT D.ID_DESCUENTO_EMPLEADO "id",D.ID_EMPLEADO "empleado",N.ID_PERIODO_NOMINA "periodo",${textoNumero('D.SALDO')} "saldo",${textoNumero('C.MONTO-C.MONTO_PAGADO')} "pendiente",TO_CHAR(P.FECHA_INICIO,'YYYY-MM-DD') "inicio",TO_CHAR(P.FECHA_FIN,'YYYY-MM-DD') "fin",P.ESTADO "estado",D.ESTADO "vigente" FROM DESCUENTOS_CUOTAS C JOIN DESCUENTOS_EMPLEADO D ON D.ID_DESCUENTO_EMPLEADO=C.ID_DESCUENTO_EMPLEADO JOIN NOMINA_EMPLEADO N ON N.ID_EMPLEADO=D.ID_EMPLEADO JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA WHERE C.ID_DESCUENTO_CUOTA=:idCuota AND N.ID_NOMINA_EMPLEADO=:idNomina AND C.ACTIVO=1 AND D.ACTIVO=1 AND C.ESTADO IN ('PENDIENTE','PARCIAL') AND C.FECHA_VENCIMIENTO BETWEEN P.FECHA_INICIO AND P.FECHA_FIN`,
      { idCuota, idNomina },
      opts,
    )
  ).rows?.[0];
}
export async function cobrar(
  c: Connection,
  p: { id: number; empleado: number; periodo: number; saldo: string; fin: string },
  idCuota: number,
  idNomina: number,
  monto: string,
  saldo: string,
  estado: string,
  actor: number,
) {
  const binds: BindParameters = {
    id: p.id,
    empleado: p.empleado,
    periodo: p.periodo,
    saldoAnterior: p.saldo,
    saldo,
    monto,
    idCuota,
    idNomina,
  };
  await c.execute(
    `INSERT INTO DESCUENTOS_APLICACIONES (ID_NOMINA_EMPLEADO,ID_EMPLEADO,ID_PERIODO_NOMINA,ID_DESCUENTO_EMPLEADO,ID_DESCUENTO_CUOTA,MONTO,SALDO_ANTERIOR,SALDO_NUEVO,CREADO_POR) VALUES (:idNomina,:empleado,:periodo,:id,:idCuota,${numero('monto')},${numero('saldoAnterior')},${numero('saldo')},:actor)`,
    { ...binds, actor },
  );
  await c.execute(
    `UPDATE DESCUENTOS_CUOTAS SET MONTO_PAGADO=MONTO_PAGADO+${numero('monto')},ESTADO=CASE WHEN MONTO_PAGADO+${numero('monto')}=MONTO THEN 'PAGADA' ELSE 'PARCIAL' END,FECHA_PAGO=${fecha('fin')},ID_PERIODO_NOMINA=:periodo,MODIFICADO_POR=:actor WHERE ID_DESCUENTO_CUOTA=:idCuota`,
    { monto, fin: p.fin, periodo: p.periodo, actor, idCuota },
  );
  await c.execute(
    `UPDATE DESCUENTOS_EMPLEADO SET SALDO=${numero('saldo')},ESTADO=:estado,MODIFICADO_POR=:actor WHERE ID_DESCUENTO_EMPLEADO=:id`,
    { saldo, estado, actor, id: p.id },
  );
}
