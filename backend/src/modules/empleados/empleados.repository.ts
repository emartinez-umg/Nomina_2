import oracledb from 'oracledb';
import type { Connection } from 'oracledb';
import type {
  DatosEmpleado,
  EditarEmpleado,
  QueryEmpleados,
  ReglasEmpleado,
} from './empleados.schemas.js';
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
export const sqlDinero = (key: string) =>
  `TO_NUMBER(:${key},'9999999999D99','NLS_NUMERIC_CHARACTERS=''.,''')`;
const hoy = "TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE))";
const fecha = (col: string) => `TO_CHAR(${col},'YYYY-MM-DD')`;
const monto = (col: string) => `TO_CHAR(${col},'FM9999999990D00','NLS_NUMERIC_CHARACTERS=''.,''')`;
const campos = {
  codigo: 'CODIGO',
  nombres: 'NOMBRES',
  apellidos: 'APELLIDOS',
  dpi: 'DPI',
  nit: 'NIT',
  afiliacionIgss: 'AFILIACION_IGSS',
  fechaNacimiento: 'FECHA_NACIMIENTO',
  sexo: 'SEXO',
  estadoCivil: 'ESTADO_CIVIL',
  direccion: 'DIRECCION',
  telefono: 'TELEFONO',
  correo: 'CORREO',
  idDepartamento: 'ID_DEPARTAMENTO',
  idPuesto: 'ID_PUESTO',
  idJefatura: 'ID_JEFATURA',
  idTipoContrato: 'ID_TIPO_CONTRATO',
  idCentroTrabajo: 'ID_CENTRO_TRABAJO',
  fechaIngreso: 'FECHA_INGRESO',
  fechaFinContrato: 'FECHA_FIN_CONTRATO',
  idBanco: 'ID_BANCO',
  cuentaBancaria: 'CUENTA_BANCARIA',
  tipoCuenta: 'TIPO_CUENTA',
  estado: 'ESTADO',
} as const;
export type Empleado = Omit<DatosEmpleado, 'generarUsuario' | 'estado'> & {
  estado: 'ACTIVO' | 'SUSPENDIDO' | 'EGRESADO';
  id: number;
  idUsuario: number | null;
  usuario: string | null;
  departamento: string;
  puesto: string;
  fechaEgreso: string | null;
  motivoEgreso: string | null;
  activo: boolean;
};
const salarioSql = `(SELECT S.SALARIO_BASE FROM HISTORIAL_SALARIAL S WHERE S.ID_EMPLEADO=E.ID_EMPLEADO AND S.ACTIVO=1 AND S.VIGENTE_DESDE<=GREATEST(${hoy},E.FECHA_INGRESO) AND (S.VIGENTE_HASTA IS NULL OR S.VIGENTE_HASTA>=GREATEST(${hoy},E.FECHA_INGRESO)) ORDER BY S.VIGENTE_DESDE DESC FETCH FIRST 1 ROW ONLY)`;
const base = `SELECT E.*, D.NOMBRE DEPARTAMENTO,P.NOMBRE PUESTO,${salarioSql} SALARIO FROM EMPLEADOS E JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO JOIN PUESTOS P ON P.ID_PUESTO=E.ID_PUESTO`;
export async function reglas(c: Connection): Promise<ReglasEmpleado> {
  const r = await c.execute<{ hoy: string; min: number; max: number; ultimoCierre: string | null }>(
    `SELECT ${fecha(hoy)} "hoy",(SELECT VALOR FROM PARAMETROS_LEGALES WHERE CODIGO='EMPLEADO_EDAD_MINIMA' AND ACTIVO=1 AND VIGENTE_DESDE<=${hoy} AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=${hoy}) ORDER BY VIGENTE_DESDE DESC FETCH FIRST 1 ROW ONLY) "min",(SELECT VALOR FROM PARAMETROS_LEGALES WHERE CODIGO='EMPLEADO_EDAD_MAXIMA' AND ACTIVO=1 AND VIGENTE_DESDE<=${hoy} AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=${hoy}) ORDER BY VIGENTE_DESDE DESC FETCH FIRST 1 ROW ONLY) "max",(SELECT ${fecha('MAX(FECHA_FIN)')} FROM PERIODOS_NOMINA WHERE ESTADO='CERRADO') "ultimoCierre" FROM DUAL`,
    {},
    opts,
  );
  const d = r.rows![0]!;
  return { hoy: d.hoy, edadMinima: d.min, edadMaxima: d.max, ultimoCierre: d.ultimoCierre };
}
export async function salarioMinimo(c: Connection, desde: string) {
  const r = await c.execute<{ valor: string }>(
    `SELECT ${monto('VALOR')} "valor" FROM PARAMETROS_LEGALES WHERE CODIGO='SALARIO_MINIMO_MENSUAL' AND UNIDAD='QUETZALES' AND ACTIVO=1 AND VIGENTE_DESDE<=TO_DATE(:desde,'YYYY-MM-DD') AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TO_DATE(:desde,'YYYY-MM-DD')) ORDER BY VIGENTE_DESDE DESC FETCH FIRST 1 ROW ONLY`,
    { desde },
    opts,
  );
  return r.rows?.[0]?.valor ?? null;
}
export async function listar(c: Connection, q: QueryEmpleados) {
  const binds: Record<string, string | number> = {};
  const where: string[] = [];
  const add = (key: string, v: string | number | undefined, sql: string) => {
    if (v !== undefined && v !== '') {
      binds[key] = v;
      where.push(sql);
    }
  };
  add('nombre', q.nombre, "INSTR(UPPER(E.NOMBRES||' '||E.APELLIDOS),UPPER(:nombre))>0");
  add('dpi', q.dpi, 'INSTR(E.DPI,:dpi)>0');
  add('nit', q.nit, 'INSTR(E.NIT,:nit)>0');
  for (const key of [
    'idDepartamento',
    'idPuesto',
    'idJefatura',
    'idTipoContrato',
    'estado',
  ] as const)
    add(key, q[key], `E.${campos[key]}=:${key}`);
  add('ingresoDesde', q.ingresoDesde, "E.FECHA_INGRESO>=TO_DATE(:ingresoDesde,'YYYY-MM-DD')");
  add('ingresoHasta', q.ingresoHasta, "E.FECHA_INGRESO<=TO_DATE(:ingresoHasta,'YYYY-MM-DD')");
  add('salarioMin', q.salarioMin, `SALARIO>=${sqlDinero('salarioMin')}`);
  add('salarioMax', q.salarioMax, `SALARIO<=${sqlDinero('salarioMax')}`);
  const from = `FROM (${base}) E ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  const total = await c.execute<{ TOTAL: number }>(`SELECT COUNT(*) TOTAL ${from}`, binds, opts);
  const orden = {
    id: 'ID_EMPLEADO',
    codigo: 'CODIGO',
    nombre: 'NOMBRES',
    departamento: 'DEPARTAMENTO',
    puesto: 'PUESTO',
    fechaIngreso: 'FECHA_INGRESO',
    salarioBase: 'SALARIO',
    estado: 'ESTADO',
  }[q.ordenarPor];
  const dir = q.direccion === 'asc' ? 'ASC' : 'DESC';
  const r = await c.execute<Record<string, unknown>>(
    `SELECT E.ID_EMPLEADO "id",E.CODIGO "codigo",E.NOMBRES||' '||E.APELLIDOS "nombre",'*********'||SUBSTR(E.DPI,-4) "dpi",'****-'||SUBSTR(E.NIT,-1) "nit",E.DEPARTAMENTO "departamento",E.PUESTO "puesto",${fecha('E.FECHA_INGRESO')} "fechaIngreso",${monto('E.SALARIO')} "salarioBase",E.ESTADO "estado" ${from} ORDER BY E.${orden} ${dir},E.ID_EMPLEADO ${dir} OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
    { ...binds, offset: (q.pagina - 1) * q.limite, limite: q.limite },
    opts,
  );
  return {
    registros: r.rows ?? [],
    total: total.rows![0]!.TOTAL,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function detalle(c: Connection, id: number): Promise<Empleado | null> {
  const selection = Object.entries(campos)
    .map(([key, col]) => `${key.startsWith('fecha') ? fecha('E.' + col) : 'E.' + col} "${key}"`)
    .join(',');
  const r = await c.execute<Empleado>(
    `SELECT E.ID_EMPLEADO "id",E.ID_USUARIO "idUsuario",E.ACTIVO "activo",${selection},${fecha('E.FECHA_EGRESO')} "fechaEgreso",E.MOTIVO_EGRESO "motivoEgreso",D.NOMBRE "departamento",P.NOMBRE "puesto",U.USUARIO "usuario",${monto(salarioSql)} "salarioBase",(SELECT H.ID_HORARIO FROM EMPLEADO_HORARIO H WHERE H.ID_EMPLEADO=E.ID_EMPLEADO AND H.ACTIVO=1 AND H.VIGENTE_DESDE<=GREATEST(${hoy},E.FECHA_INGRESO) AND (H.VIGENTE_HASTA IS NULL OR H.VIGENTE_HASTA>=GREATEST(${hoy},E.FECHA_INGRESO)) ORDER BY H.VIGENTE_DESDE DESC FETCH FIRST 1 ROW ONLY) "idHorario",(SELECT NOMBRE FROM JEFATURAS WHERE ID_JEFATURA=E.ID_JEFATURA) "idJefaturaEtiqueta",(SELECT NOMBRE FROM TIPOS_CONTRATO WHERE ID_TIPO_CONTRATO=E.ID_TIPO_CONTRATO) "idTipoContratoEtiqueta",(SELECT NOMBRE FROM CENTROS_TRABAJO WHERE ID_CENTRO_TRABAJO=E.ID_CENTRO_TRABAJO) "idCentroTrabajoEtiqueta",(SELECT NOMBRE FROM BANCOS WHERE ID_BANCO=E.ID_BANCO) "idBancoEtiqueta",(SELECT H.NOMBRE FROM HORARIOS H JOIN EMPLEADO_HORARIO A ON A.ID_HORARIO=H.ID_HORARIO WHERE A.ID_EMPLEADO=E.ID_EMPLEADO AND A.ACTIVO=1 AND A.VIGENTE_DESDE<=GREATEST(${hoy},E.FECHA_INGRESO) AND (A.VIGENTE_HASTA IS NULL OR A.VIGENTE_HASTA>=GREATEST(${hoy},E.FECHA_INGRESO)) ORDER BY A.VIGENTE_DESDE DESC FETCH FIRST 1 ROW ONLY) "idHorarioEtiqueta",C.NOMBRE "contactoNombre",C.PARENTESCO "contactoParentesco",C.TELEFONO "contactoTelefono" FROM EMPLEADOS E JOIN DEPARTAMENTOS D ON D.ID_DEPARTAMENTO=E.ID_DEPARTAMENTO JOIN PUESTOS P ON P.ID_PUESTO=E.ID_PUESTO LEFT JOIN USUARIOS U ON U.ID_USUARIO=E.ID_USUARIO LEFT JOIN EMPLEADO_CONTACTOS_EMERGENCIA C ON C.ID_EMPLEADO=E.ID_EMPLEADO AND C.PRIORIDAD=1 AND C.ACTIVO=1 WHERE E.ID_EMPLEADO=:id`,
    { id },
    opts,
  );
  const d = r.rows?.[0];
  return d ? { ...d, activo: Number(d.activo) === 1 } : null;
}
export const referencias = {
  idDepartamento: ['DEPARTAMENTOS', 'ID_DEPARTAMENTO'],
  idPuesto: ['PUESTOS', 'ID_PUESTO'],
  idJefatura: ['JEFATURAS', 'ID_JEFATURA'],
  idTipoContrato: ['TIPOS_CONTRATO', 'ID_TIPO_CONTRATO'],
  idCentroTrabajo: ['CENTROS_TRABAJO', 'ID_CENTRO_TRABAJO'],
  idHorario: ['HORARIOS', 'ID_HORARIO'],
  idBanco: ['BANCOS', 'ID_BANCO'],
} as const;
export async function referencia(c: Connection, key: keyof typeof referencias, id: number) {
  const [tabla, pk] = referencias[key];
  const dep = key === 'idPuesto' || key === 'idJefatura';
  const r = await c.execute<{ activo: number; departamento: number | null }>(
    `SELECT ACTIVO "activo",${dep ? 'ID_DEPARTAMENTO' : 'NULL'} "departamento" FROM ${tabla} WHERE ${pk}=:id`,
    { id },
    opts,
  );
  return r.rows?.[0];
}
export async function opciones(
  c: Connection,
  key: keyof typeof referencias,
  buscar: string,
  pagina: number,
  seleccionado?: number,
  departamento?: number,
) {
  const [tabla, pk] = referencias[key];
  const dep = key === 'idPuesto' || key === 'idJefatura';
  const r = await c.execute<{ value: string; label: string }>(
    `SELECT TO_CHAR(${pk}) "value",NOMBRE||CASE WHEN ACTIVO=0 THEN ' (inactivo)' ELSE '' END "label" FROM ${tabla} WHERE ((ACTIVO=1 AND (:buscar IS NULL OR INSTR(UPPER(NOMBRE),UPPER(:buscar))>0) ${dep ? 'AND (:departamento IS NULL OR ID_DEPARTAMENTO=:departamento)' : ''}) OR ${pk}=:seleccionado) ORDER BY NOMBRE,${pk} OFFSET :offset ROWS FETCH NEXT 100 ROWS ONLY`,
    {
      buscar: buscar || null,
      seleccionado: seleccionado ?? null,
      offset: (pagina - 1) * 100,
      ...(dep ? { departamento: departamento ?? null } : {}),
    },
    opts,
  );
  return r.rows ?? [];
}
export const unicos = {
  codigo: 'CODIGO',
  dpi: 'DPI',
  nit: 'NIT',
  afiliacionIgss: 'AFILIACION_IGSS',
  correo: 'CORREO',
} as const;
export async function duplicados(c: Connection, d: DatosEmpleado | EditarEmpleado, id = 0) {
  const errores: Record<string, string[]> = {};
  for (const [key, col] of Object.entries(unicos)) {
    const v = d[key as keyof typeof unicos];
    if (!v) continue;
    const r = await c.execute(`SELECT 1 FROM EMPLEADOS WHERE ${col}=:valor AND ID_EMPLEADO<>:id`, {
      valor: v,
      id,
    });
    if (r.rows?.length)
      errores[key] = [
        'Este dato ya está registrado en otro empleado. Revisa el expediente existente.',
      ];
  }
  if ('generarUsuario' in d && d.generarUsuario) {
    const r = await c.execute('SELECT 1 FROM USUARIOS WHERE CORREO=:correo', { correo: d.correo });
    if (r.rows?.length)
      errores.correo = ['El correo ya pertenece a un usuario. Ingresa otro correo.'];
  }
  return errores;
}
export async function guardar(
  c: Connection,
  d: DatosEmpleado | EditarEmpleado,
  actor: number,
  id?: number,
  idUsuario?: number,
) {
  const entries = Object.entries(campos),
    binds: Record<string, string | number | null | oracledb.BindParameter> = { actor };
  for (const [key] of entries) binds[key] = d[key as keyof typeof campos];
  const exp = (key: string) =>
    key.startsWith('fecha') ? `TO_DATE(:${key},'YYYY-MM-DD')` : `:${key}`;
  if (id) {
    binds.id = id;
    await c.execute(
      `UPDATE EMPLEADOS SET ${entries.map(([key, col]) => `${col}=${exp(key)}`).join(',')},MODIFICADO_POR=:actor WHERE ID_EMPLEADO=:id`,
      binds,
    );
  } else {
    binds.usuario = idUsuario ?? null;
    binds.id = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
    const r = await c.execute<{ id: number[] }>(
      `INSERT INTO EMPLEADOS (${entries.map(([, col]) => col).join(',')},ID_USUARIO,CREADO_POR) VALUES (${entries.map(([key]) => exp(key)).join(',')},:usuario,:actor) RETURNING ID_EMPLEADO INTO :id`,
      binds,
    );
    id = r.outBinds!.id[0]!;
  }
  await c.execute(
    `MERGE INTO EMPLEADO_CONTACTOS_EMERGENCIA C USING (SELECT :id ID_EMPLEADO FROM DUAL) S ON (C.ID_EMPLEADO=S.ID_EMPLEADO AND C.PRIORIDAD=1) WHEN MATCHED THEN UPDATE SET NOMBRE=:nombre,PARENTESCO=:parentesco,TELEFONO=:telefono,MODIFICADO_POR=:actor,ACTIVO=1 WHEN NOT MATCHED THEN INSERT (ID_EMPLEADO,NOMBRE,PARENTESCO,TELEFONO,PRIORIDAD,CREADO_POR) VALUES (:id,:nombre,:parentesco,:telefono,1,:actor)`,
    {
      id,
      nombre: d.contactoNombre,
      parentesco: d.contactoParentesco,
      telefono: d.contactoTelefono,
      actor,
    },
  );
  return id;
}
export async function historial(c: Connection, id: number, tipo: 'salario' | 'horario') {
  const tabla = tipo === 'salario' ? 'HISTORIAL_SALARIAL' : 'EMPLEADO_HORARIO';
  const r = await c.execute<{ id: number; desde: string; hasta: string | null }>(
    `SELECT ${tipo === 'salario' ? 'ID_HISTORIAL_SALARIAL' : 'ID_EMPLEADO_HORARIO'} "id",${fecha('VIGENTE_DESDE')} "desde",${fecha('VIGENTE_HASTA')} "hasta" FROM ${tabla} WHERE ID_EMPLEADO=:id AND ACTIVO=1 ORDER BY VIGENTE_DESDE DESC`,
    { id },
    opts,
  );
  return r.rows ?? [];
}
export async function agregarHistorial(
  c: Connection,
  id: number,
  tipo: 'salario' | 'horario',
  valor: string | number,
  desde: string,
  motivo: string,
  actor: number,
) {
  const tabla = tipo === 'salario' ? 'HISTORIAL_SALARIAL' : 'EMPLEADO_HORARIO',
    col = tipo === 'salario' ? 'SALARIO_BASE' : 'ID_HORARIO';
  await c.execute(
    `UPDATE ${tabla} SET VIGENTE_HASTA=TO_DATE(:desde,'YYYY-MM-DD')-1,MODIFICADO_POR=:actor WHERE ID_EMPLEADO=:id AND ACTIVO=1 AND VIGENTE_HASTA IS NULL`,
    { desde, actor, id },
  );
  await c.execute(
    `INSERT INTO ${tabla} (ID_EMPLEADO,${col},VIGENTE_DESDE,MOTIVO,CREADO_POR) VALUES (:id,${tipo === 'salario' ? sqlDinero('valor') : ':valor'},TO_DATE(:desde,'YYYY-MM-DD'),:motivo,:actor)`,
    { id, valor, desde, motivo, actor },
  );
}
export async function baja(
  c: Connection,
  id: number,
  desde: string,
  motivo: string,
  actor: number,
) {
  await c.execute(
    "UPDATE EMPLEADOS SET ESTADO='EGRESADO',ACTIVO=0,FECHA_EGRESO=TO_DATE(:desde,'YYYY-MM-DD'),MOTIVO_EGRESO=:motivo,MODIFICADO_POR=:actor WHERE ID_EMPLEADO=:id",
    { id, desde, motivo, actor },
  );
}
export async function pestana(c: Connection, id: number, tipo: string, pagina: number) {
  const consultas: Record<string, string> = {
    salario: `SELECT ${fecha('H.VIGENTE_DESDE')} "Desde",${fecha('H.VIGENTE_HASTA')} "Hasta",${monto('H.SALARIO_BASE')} "Salario mensual",H.MOTIVO "Motivo",U.USUARIO "Registrado por" FROM HISTORIAL_SALARIAL H LEFT JOIN USUARIOS U ON U.ID_USUARIO=H.CREADO_POR WHERE H.ID_EMPLEADO=:id AND H.ACTIVO=1 ORDER BY H.VIGENTE_DESDE DESC`,
    descuentos: `SELECT T.NOMBRE "Tipo",D.MODALIDAD "Modalidad",${monto('D.MONTO_QUINCENA')} "Monto por quincena",${monto('D.SALDO')} "Saldo",D.ESTADO "Estado" FROM DESCUENTOS_EMPLEADO D JOIN TIPOS_DESCUENTO T ON T.ID_TIPO_DESCUENTO=D.ID_TIPO_DESCUENTO WHERE D.ID_EMPLEADO=:id AND D.ACTIVO=1 ORDER BY D.ID_DESCUENTO_EMPLEADO DESC`,
    vacaciones: `SELECT ${fecha('FECHA')} "Fecha",TIPO "Tipo",TO_CHAR(DIAS,'TM9') "Días",MOTIVO "Motivo" FROM VACACIONES_MOVIMIENTOS WHERE ID_EMPLEADO=:id AND ACTIVO=1 ORDER BY FECHA DESC,ID_VACACIONES_MOVIMIENTO DESC`,
    documentos: `SELECT NOMBRE_ARCHIVO "Documento",ESTADO "Estado",${fecha('FECHA_CREACION')} "Creado",${fecha('ENTREGADO_EN')} "Entregado" FROM DOCUMENTOS_GENERADOS WHERE ID_EMPLEADO=:id AND ACTIVO=1 ORDER BY ID_DOCUMENTO_GENERADO DESC`,
    historial: `SELECT ${fecha('B.FECHA')} "Fecha",B.ACCION "Acción",B.MOTIVO "Motivo",U.USUARIO "Usuario" FROM BITACORA_AUDITORIA B LEFT JOIN USUARIOS U ON U.ID_USUARIO=B.ID_USUARIO WHERE B.ENTIDAD='EMPLEADOS' AND B.ID_ENTIDAD=:id ORDER BY B.ID_BITACORA_AUDITORIA DESC`,
  };
  const sql = consultas[tipo]!;
  const n = await c.execute<{ N: number }>(`SELECT COUNT(*) N FROM (${sql})`, { id }, opts);
  const r = await c.execute<Record<string, string | null>>(
    `${sql} OFFSET :offset ROWS FETCH NEXT 50 ROWS ONLY`,
    { id, offset: (pagina - 1) * 50 },
    opts,
  );
  return { registros: r.rows ?? [], total: n.rows![0]!.N, pagina, limite: 50 };
}
export async function crearCarga(
  c: Connection,
  usuario: number,
  nombre: string,
  hash: Buffer,
  filas: { numero: number; datos: unknown; errores: Record<string, string[]> }[],
) {
  const r = await c.execute<{ id: number[] }>(
    "INSERT INTO CARGAS_MASIVAS (ID_USUARIO,NOMBRE_ARCHIVO,SHA256,MODALIDAD,ESTADO,TOTAL_FILAS,FILAS_VALIDAS,CREADO_POR) VALUES (:usuario,:nombre,:hash,'TODO_O_NADA','VALIDADA',:total,:validas,:usuario) RETURNING ID_CARGA_MASIVA INTO :id",
    {
      usuario,
      nombre,
      hash,
      total: filas.length,
      validas: filas.filter((f) => !Object.keys(f.errores).length).length,
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
  );
  const id = r.outBinds!.id[0]!;
  for (const f of filas)
    await c.execute(
      'INSERT INTO CARGA_MASIVA_FILAS (ID_CARGA_MASIVA,NUMERO_FILA,DATOS,ERRORES,ESTADO,CREADO_POR) VALUES (:id,:numero,:datos,:errores,:estado,:usuario)',
      {
        id,
        numero: f.numero,
        datos: JSON.stringify(f.datos),
        errores: JSON.stringify(f.errores),
        estado: Object.keys(f.errores).length ? 'INVALIDA' : 'VALIDA',
        usuario,
      },
    );
  return id;
}
export async function carga(c: Connection, id: number) {
  const r = await c.execute<{ id: number; idUsuario: number; estado: string }>(
    `SELECT ID_CARGA_MASIVA "id",ID_USUARIO "idUsuario",ESTADO "estado" FROM CARGAS_MASIVAS WHERE ID_CARGA_MASIVA=:id`,
    { id },
    opts,
  );
  return r.rows?.[0];
}
export async function filasCarga(c: Connection, id: number) {
  const r = await c.execute<{
    numero: number;
    datos: string;
    errores: string;
    idEmpleado: number | null;
    estado: string;
    usuario: string | null;
  }>(
    `SELECT F.NUMERO_FILA "numero",F.DATOS "datos",F.ERRORES "errores",F.ID_EMPLEADO "idEmpleado",F.ESTADO "estado",U.USUARIO "usuario" FROM CARGA_MASIVA_FILAS F LEFT JOIN EMPLEADOS E ON E.ID_EMPLEADO=F.ID_EMPLEADO LEFT JOIN USUARIOS U ON U.ID_USUARIO=E.ID_USUARIO WHERE F.ID_CARGA_MASIVA=:id ORDER BY F.NUMERO_FILA`,
    { id },
    {
      ...opts,
      fetchInfo: { datos: { type: oracledb.STRING }, errores: { type: oracledb.STRING } },
    },
  );
  return (r.rows ?? []).map((f) => ({
    ...f,
    datos: JSON.parse(f.datos) as Record<string, unknown>,
    errores: JSON.parse(f.errores) as Record<string, string[]>,
  }));
}
export async function actualizarFila(
  c: Connection,
  id: number,
  numero: number,
  errores: Record<string, string[]>,
  actor: number,
  idEmpleado?: number,
) {
  await c.execute(
    'UPDATE CARGA_MASIVA_FILAS SET ERRORES=:errores,ESTADO=:estado,ID_EMPLEADO=:empleado,MODIFICADO_POR=:actor WHERE ID_CARGA_MASIVA=:id AND NUMERO_FILA=:numero',
    {
      id,
      numero,
      errores: JSON.stringify(errores),
      estado: idEmpleado ? 'IMPORTADA' : 'INVALIDA',
      empleado: idEmpleado ?? null,
      actor,
    },
  );
}
export async function terminarCarga(
  c: Connection,
  id: number,
  modalidad: string,
  importadas: number,
  actor: number,
) {
  await c.execute(
    `UPDATE CARGAS_MASIVAS SET MODALIDAD=:modalidad,ESTADO='IMPORTADA',FILAS_VALIDAS=:importadas,FILAS_IMPORTADAS=:importadas,CONFIRMADA_EN=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),MODIFICADO_POR=:actor WHERE ID_CARGA_MASIVA=:id`,
    { id, modalidad, importadas, actor },
  );
}
