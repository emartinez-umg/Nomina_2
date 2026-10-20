import { readFile, writeFile, chmod, rename, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import dotenv from 'dotenv';
import { cargarDataset, exigir, validarDataset, type Dataset } from './datos.js';
import { tablas, type Tabla } from './repository.js';
import { cargarMigraciones } from '../migraciones.archivos.js';
import {
  baseNombreUsuario,
  hashearContrasena,
  politicaContrasena,
} from '../../security/credenciales.js';
import { analizarHorario, jornadaBloque, minutos } from '../../horarios/modelo.js';
import { amortizar, diasInclusivos } from '../../../modules/novedades/novedades.reglas.js';

// Solo el generador escribe literales SQL. Los valores del bloque se enlazan con DBMS_SQL.
export const literalSql = (v: string) =>
  `'${v.replace(/'/g, "''").replace(/&/g, "'||CHR(38)||'")}'`;
const jsonSql = (v: unknown) => {
  const s = JSON.stringify(v);
  return (s.match(/[\s\S]{1,450}/g) ?? ['']).map((t) => `TO_CLOB(${literalSql(t)})`).join('||\n');
};
const ref = (clave: string) => ({ ref: clave });
const fecha = (v: string | null) => (v === null ? null : { fecha: v });
const clave = (t: Tabla, k: string) => `${t}:${k}`;
const hoySql = "TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE))";
const q = literalSql;

export async function generarSqlDemo(d: Dataset, contrasena: string, extras = false) {
  politicaContrasena.parse(contrasena);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(
    new Date(),
  );
  validarDataset(d, { hoy });
  const instrucciones: string[] = [];
  const agregar = (
    t: Tabla,
    k: string,
    valores: Record<string, unknown>,
    natural = '',
    padre = '',
  ) => {
    instrucciones.push(
      `guardar(${q(t)},${q(tablas[t])},${q(k)},${jsonSql(valores)},${q(natural)},${q(padre)});`,
    );
  };
  const comprobar = (sql: string, n: number, mensaje: string) =>
    instrucciones.push(`exigir(cantidad(${q(sql)})=${n},${q(mensaje)});`);
  const sinCierre = (desde: string, hasta: string) =>
    comprobar(
      `SELECT COUNT(*) FROM PERIODOS_NOMINA WHERE ESTADO='CERRADO' AND FECHA_INICIO<=${hasta} AND FECHA_FIN>=${desde}`,
      0,
      'El conjunto afectaría un periodo cerrado.',
    );
  const id = (t: Tabla, k: string) => `v_ids(${q(clave(t, k))})`;
  const minimo = d.configuracion.salarioMinimoDemo;
  instrucciones.push(
    `IF cantidad('SELECT COUNT(*) FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA=''SALARIO_MINIMO_MENSUAL''')=0 THEN`,
  );
  sinCierre("DATE '0001-01-01'", "DATE '9999-12-31'");
  agregar('PARAMETROS_LEGALES', 'minimo-salarial', {
    NOMBRE: minimo.nombre,
    CODIGO: minimo.claveInterna,
    CLAVE_INTERNA: minimo.claveInterna,
    VALOR: minimo.valor,
    UNIDAD: minimo.unidad,
    VIGENTE_DESDE: fecha(minimo.vigenteDesde),
    VIGENTE_HASTA: fecha(minimo.vigenteHasta),
    FUNDAMENTO: minimo.fundamento,
    MOTIVO: minimo.motivo,
  });
  instrucciones.push('END IF;');
  comprobar(
    `SELECT COUNT(*) FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA='SALARIO_MINIMO_MENSUAL' AND UNIDAD='QUETZALES' AND ACTIVO=1 AND VIGENTE_DESDE<=${hoySql} AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=${hoySql})`,
    1,
    'Configura una única vigencia del mínimo mensual en quetzales.',
  );
  for (const a of d.departamentos)
    agregar(
      'DEPARTAMENTOS',
      a.clave,
      { NOMBRE: a.nombre, DESCRIPCION: a.descripcion ?? null },
      'NOMBRE',
    );
  for (const a of d.bancos)
    agregar('BANCOS', a.clave, { NOMBRE: a.nombre, DESCRIPCION: a.descripcion ?? null }, 'NOMBRE');
  for (const a of d.puestos)
    agregar(
      'PUESTOS',
      a.clave,
      {
        NOMBRE: a.nombre,
        DESCRIPCION: null,
        ID_DEPARTAMENTO: ref(clave('DEPARTAMENTOS', a.departamento)),
        SALARIO_MINIMO: a.salarioMinimo,
        SALARIO_MAXIMO: a.salarioMaximo,
      },
      'NOMBRE',
    );
  for (const h of d.horarios) {
    const analisis = analizarHorario(h.bloques);
    for (const b of h.bloques) {
      const tipo = jornadaBloque(b);
      instrucciones.push(
        `exigir(parametro(${q(`JORNADA_${tipo}_HORAS`)})>=${Math.max(...analisis.horasDiarias)},'El horario supera el límite diario del destino.');`,
      );
    }
    instrucciones.push(
      `exigir(parametro(${q(`JORNADA_${h.jornada}_HORAS_SEMANA`)})>=${analisis.horasSemanales},'El horario supera el límite semanal del destino.');`,
    );
    agregar(
      'HORARIOS',
      h.clave,
      { NOMBRE: h.nombre, DESCRIPCION: null, JORNADA: h.jornada },
      'NOMBRE',
    );
    for (const [i, b] of h.bloques.entries()) {
      const k = `${h.clave}:bloque:${i}`;
      agregar(
        'HORARIO_BLOQUES',
        k,
        {
          ID_HORARIO: ref(clave('HORARIOS', h.clave)),
          MINUTO_ENTRADA: minutos(b.entrada),
          MINUTO_SALIDA: minutos(b.salida),
          CRUZA_MEDIANOCHE: Number(b.cruzaMedianoche),
          MINUTOS_DESCANSO: b.minutosDescanso,
        },
        '',
        clave('HORARIOS', h.clave),
      );
      for (const dia of b.dias)
        agregar(
          'HORARIO_BLOQUE_DIAS',
          `${k}:${dia}`,
          { ID_HORARIO_BLOQUE: ref(clave('HORARIO_BLOQUES', k)), DIA_SEMANA: dia },
          '',
          clave('HORARIOS', h.clave),
        );
    }
    instrucciones.push(`validar_horario(${id('HORARIOS', h.clave)},${jsonSql(h.bloques)});`);
  }
  for (const a of d.centros) {
    instrucciones.push(`ubicacion(${q(a.departamentoGt)},${q(a.municipioGt)});`);
    agregar(
      'CENTROS_TRABAJO',
      a.clave,
      {
        NOMBRE: a.nombre,
        DESCRIPCION: a.descripcion ?? null,
        DIRECCION: a.direccion,
        ID_DEPARTAMENTO_GT: ref('departamento-gt'),
        ID_MUNICIPIO_GT: ref('municipio-gt'),
        LOCALIDAD: { localidad: true },
      },
      'NOMBRE',
    );
  }
  for (const e of d.empleados) {
    instrucciones.push(`ubicacion(${q(e.departamentoGt)},${q(e.municipioGt)});`);
    const contrato = d.configuracion.contratos.find((c) => c.clave === e.tipoContrato)!;
    instrucciones.push(
      `contrato(${q(contrato.clave)},${q(contrato.nombre)},${Number(contrato.requiereFechaFin)});`,
    );
    comprobar(
      `SELECT COUNT(*) FROM PARENTESCOS WHERE NOMBRE=${q(e.contactoParentesco)} AND ACTIVO=1`,
      1,
      'Falta un parentesco activo del conjunto.',
    );
    instrucciones.push(
      `exigir(DATE ${q(e.fechaIngreso)}>=ADD_MONTHS(DATE ${q(e.fechaNacimiento)},12*parametro('EMPLEADO_EDAD_MINIMA')) AND ${hoySql}<ADD_MONTHS(DATE ${q(e.fechaNacimiento)},12*(parametro('EMPLEADO_EDAD_MAXIMA')+1)) AND DATE ${q(e.fechaIngreso)}<=${hoySql}+30,'Edad o fecha de ingreso incompatibles con el destino.');`,
    );
    if (e.fechaFinContrato)
      instrucciones.push(
        `exigir(DATE ${q(e.fechaFinContrato)}>${hoySql},'El contrato demo venció: actualiza el JSON.');`,
      );
    instrucciones.push(
      `exigir(parametro('SALARIO_MINIMO_MENSUAL')<=${e.salarioBase},'El salario demo es inferior al mínimo del destino.');`,
    );
    const ek = clave('EMPLEADOS', e.clave);
    agregar(
      'EMPLEADOS',
      e.clave,
      {
        NOMBRES: e.nombres,
        APELLIDOS: e.apellidos,
        DPI: e.dpi,
        NIT: e.nit,
        AFILIACION_IGSS: e.afiliacionIgss,
        FECHA_NACIMIENTO: fecha(e.fechaNacimiento),
        SEXO: e.sexo,
        ESTADO_CIVIL: e.estadoCivil,
        ID_DEPARTAMENTO_GT: ref('departamento-gt'),
        ID_MUNICIPIO_GT: ref('municipio-gt'),
        ZONA: e.zona,
        DIRECCION: e.direccion,
        DIRECCION_COMPLETA: { direccion: e.direccion, zona: e.zona },
        TELEFONO: e.telefono,
        CORREO: e.correo,
        ID_DEPARTAMENTO: ref(clave('DEPARTAMENTOS', e.departamento)),
        ID_PUESTO: ref(clave('PUESTOS', e.puesto)),
        ID_JEFATURA: null,
        ID_CENTRO_TRABAJO: ref(clave('CENTROS_TRABAJO', e.centroTrabajo)),
        ID_TIPO_CONTRATO: ref('contrato'),
        FECHA_INGRESO: fecha(e.fechaIngreso),
        FECHA_FIN_CONTRATO: fecha(e.fechaFinContrato),
        ID_BANCO: ref(clave('BANCOS', e.banco)),
        CUENTA_BANCARIA: e.cuentaBancaria,
        TIPO_CUENTA: e.tipoCuenta,
        ESTADO: e.estado,
      },
      'CORREO',
    );
    agregar(
      'USUARIOS',
      e.clave,
      {
        USUARIO: {
          usuario: baseNombreUsuario(e.nombres.split(' ')[0]!, e.apellidos.split(' ')[0]!),
        },
        CORREO: e.correo,
        CONTRASENA_HASH: await hashearContrasena(contrasena),
        ID_ROL: { rol: e.rol },
        CAMBIO_OBLIGATORIO: 1,
      },
      '',
      ek,
    );
    instrucciones.push(
      `IF v_nuevas.EXISTS(${q(ek)}) THEN UPDATE EMPLEADOS SET ID_USUARIO=${id('USUARIOS', e.clave)},MODIFICADO_POR=v_actor WHERE ID_EMPLEADO=${id('EMPLEADOS', e.clave)}; END IF;`,
    );
    agregar(
      'EMPLEADO_CONTACTOS_EMERGENCIA',
      e.clave,
      {
        ID_EMPLEADO: ref(ek),
        NOMBRE: e.contactoNombre,
        PARENTESCO: e.contactoParentesco,
        TELEFONO: e.contactoTelefono,
        PRIORIDAD: 1,
      },
      '',
      ek,
    );
    agregar(
      'HISTORIAL_SALARIAL',
      `${e.clave}:inicial`,
      {
        ID_EMPLEADO: ref(ek),
        SALARIO_BASE: extras
          ? (e.extras?.historialSalarial?.[0]?.salarioBase ?? e.salarioBase)
          : e.salarioBase,
        VIGENTE_DESDE: fecha(e.fechaIngreso),
        MOTIVO: extras
          ? (e.extras?.historialSalarial?.[0]?.motivo ?? 'Salario inicial del conjunto demo.')
          : 'Salario inicial del conjunto demo.',
      },
      '',
      ek,
    );
    agregar(
      'EMPLEADO_HORARIO',
      e.clave,
      {
        ID_EMPLEADO: ref(ek),
        ID_HORARIO: ref(clave('HORARIOS', e.horario)),
        VIGENTE_DESDE: fecha(e.fechaIngreso),
        MOTIVO: 'Horario inicial del conjunto demo.',
      },
      '',
      ek,
    );
  }
  if (extras) agregarExtras(d, instrucciones, agregar, sinCierre);
  const migraciones = await cargarMigraciones(
    fileURLToPath(new URL('../../../../../db/migrations', import.meta.url)),
  );
  const runtime = await readFile(new URL('exportar.runtime.sql', import.meta.url), 'utf8');
  const preflight = migraciones
    .map(
      (m) =>
        `exigir(cantidad(${q(`SELECT COUNT(*) FROM VERSION_ESQUEMA WHERE VERSION=${m.version} AND ARCHIVO=${q(m.archivo)} AND CHECKSUM=${q(m.checksum)} AND ESTADO='APLICADA'`)})=1,'Falta una migración compatible del proyecto.');`,
    )
    .join('\n');
  return `-- NOMINA2: datos demo generados exclusivamente desde database/seed/data.
-- Archivo privado: hashes Argon2id; no versionar ni registrar su contenido.
-- Conectar al esquema de aplicación actualizado. Ejecutar como SCRIPT completo.
-- SQLPlus/SQLcl: @seed_demo.sql. DBeaver: Alt+X, delimitador / para PL/SQL.
-- Desactivar autocommit y usar una sesión sin cambios pendientes.
-- No crea objetos, no deshabilita triggers ni modifica el esquema.
${runtime
  .replace(
    '-- TABLAS_PERMITIDAS',
    Object.entries(tablas)
      .map(([t, pk]) => `v_pk(${q(t)}):=${q(pk)};`)
      .join('\n'),
  )
  .replace('-- PREFLIGHT', preflight)
  .replace('-- INSTRUCCIONES', instrucciones.join('\n'))
  .replace(/^[\t ]*\r?\n/gm, '')}
`;
}

type Agregar = (
  t: Tabla,
  k: string,
  v: Record<string, unknown>,
  natural?: string,
  padre?: string,
) => void;
function agregarExtras(
  d: Dataset,
  sql: string[],
  agregar: Agregar,
  sinCierre: (desde: string, hasta: string) => void,
) {
  const id = (t: Tabla, k: string) => `v_ids(${q(clave(t, k))})`;
  for (const t of d.configuracion.tarifasParqueoDemo) {
    sql.push(
      `IF cantidad(${q(`SELECT COUNT(*) FROM PARQUEO_TARIFAS WHERE VEHICULO=${q(t.vehiculo)} AND ACTIVO=1 AND VIGENTE_DESDE<=TRUNC(${hoySql},'MM') AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TRUNC(${hoySql},'MM'))`)})=0 THEN`,
    );
    sql.push(
      `exigir(cantidad(${q(`SELECT COUNT(*) FROM PARQUEO_TARIFAS WHERE VEHICULO=${q(t.vehiculo)} AND ACTIVO=1`)})=0,'Hay historia de tarifas sin vigencia aplicable.');`,
    );
    sinCierre(`DATE ${q(t.vigenteDesde)}`, "DATE '9999-12-31'");
    agregar('PARQUEO_TARIFAS', t.vehiculo, {
      VEHICULO: t.vehiculo,
      MONTO: t.monto,
      VIGENTE_DESDE: fecha(t.vigenteDesde),
      MOTIVO: t.motivo,
    });
    sql.push('END IF;');
  }
  for (const e of d.empleados) {
    const x = e.extras,
      ek = clave('EMPLEADOS', e.clave);
    if (!x) continue;
    if (x.historialSalarial) {
      sql.push(
        `IF cantidad('SELECT COUNT(*) FROM HISTORIAL_SALARIAL WHERE ACTIVO=1 AND ID_EMPLEADO='||${id('EMPLEADOS', e.clave)})=1 THEN`,
      );
      sinCierre(`DATE ${q(e.fechaIngreso)}`, "DATE '9999-12-31'");
      sql.push(
        `ampliar_salario(${id('EMPLEADOS', e.clave)},${jsonSql(x.historialSalarial)}); END IF;`,
      );
    }
    for (const n of x.comisiones ?? []) {
      sql.push(`IF NOT propia('NOVEDADES_MENSUALES',${q(n.referencia)}) THEN`);
      sinCierre(`DATE ${q(n.mes + '-01')}`, `LAST_DAY(DATE ${q(n.mes + '-01')})`);
      sql.push('END IF;');
      agregar('NOVEDADES_MENSUALES', n.referencia, {
        ID_EMPLEADO: ref(ek),
        TIPO: 'COMISION',
        MES: fecha(n.mes + '-01'),
        DESCRIPCION: n.motivo,
        REFERENCIA: n.referencia,
        CLAVE_REFERENCIA: { comision: n.referencia, empleado: ek, mes: n.mes },
        CANTIDAD: 1,
        MONTO: n.monto,
        VALOR_UNITARIO: null,
        RECARGO: null,
      });
    }
    for (const p of [x.prestamo, x.anticipo].filter((a) => a !== undefined)) {
      const plan = amortizar(p.monto, p.cuotas, p.fechaInicio),
        dk = clave('DESCUENTOS_EMPLEADO', p.referencia);
      sql.push(
        `IF NOT propia('DESCUENTOS_EMPLEADO',${q(p.referencia)}) THEN exigir(DATE ${q(p.fechaInicio)}>=${hoySql},'El préstamo demo requiere actualizar sus fechas.');`,
      );
      sinCierre(`DATE ${q(p.fechaInicio)}`, `DATE ${q(plan.at(-1)!.fecha)}`);
      sql.push('END IF;');
      agregar('DESCUENTOS_EMPLEADO', p.referencia, {
        ID_EMPLEADO: ref(ek),
        ID_TIPO_DESCUENTO: { tipoDescuento: p.tipoDescuento },
        MODALIDAD: 'CUOTAS',
        MONTO_QUINCENA: plan[0]!.monto,
        MONTO_TOTAL: p.monto,
        SALDO: p.monto,
        NUMERO_CUOTAS: plan.length,
        FECHA_INICIO: fecha(p.fechaInicio),
        FECHA_FIN: fecha(plan.at(-1)!.fecha),
        ESTADO: 'VIGENTE',
        MOTIVO: p.motivo,
      });
      agregar(
        'PRESTAMOS',
        p.referencia,
        {
          ID_DESCUENTO_EMPLEADO: ref(dk),
          ID_EMPLEADO: ref(ek),
          CAPITAL: p.monto,
          FECHA_DESEMBOLSO: fecha(p.fechaDesembolso),
          REFERENCIA: p.referencia,
        },
        '',
        dk,
      );
      for (const [i, c] of plan.entries())
        agregar(
          'DESCUENTOS_CUOTAS',
          `${p.referencia}:${i + 1}`,
          {
            ID_DESCUENTO_EMPLEADO: ref(dk),
            ID_EMPLEADO: ref(ek),
            NUMERO_CUOTA: i + 1,
            FECHA_VENCIMIENTO: fecha(c.fecha),
            MONTO: c.monto,
          },
          '',
          dk,
        );
    }
    for (const [i, a] of (x.ausencias ?? []).entries()) {
      const k = `${e.clave}:ausencia:${i}`,
        ak = clave('AUSENCIAS', k);
      sql.push(`IF NOT propia('AUSENCIAS',${q(k)}) THEN`);
      sinCierre(`DATE ${q(a.fechaInicio)}`, `DATE ${q(a.fechaFin)}`);
      sql.push(
        `exigir(cantidad('SELECT COUNT(*) FROM AUSENCIAS WHERE ACTIVO=1 AND ID_EMPLEADO='||${id('EMPLEADOS', e.clave)}||${q(` AND FECHA_INICIO<=DATE ${q(a.fechaFin)} AND FECHA_FIN>=DATE ${q(a.fechaInicio)}`)})=0,'La ausencia se traslapa con otro registro.'); END IF;`,
      );
      agregar('AUSENCIAS', k, {
        ID_EMPLEADO: ref(ek),
        ID_TIPO_AUSENCIA: { tipoAusencia: a.tipoAusencia },
        FECHA_INICIO: fecha(a.fechaInicio),
        FECHA_FIN: fecha(a.fechaFin),
        DIAS: diasInclusivos(a.fechaInicio, a.fechaFin),
        ESTADO: a.estado,
        MOTIVO: a.motivo,
        APROBADO_POR: ref('actor'),
      });
      // El dataset aprobado contiene rangos dentro de un mes y sin cambios salariales en ellos.
      exigir(
        a.fechaInicio.slice(0, 7) === a.fechaFin.slice(0, 7),
        'El exportador requiere desglosar la ausencia por mes.',
      );
      const dias = diasInclusivos(a.fechaInicio, a.fechaFin);
      agregar(
        'NOVEDADES_MENSUALES',
        `${k}:mes`,
        {
          ID_EMPLEADO: ref(ek),
          TIPO: 'AUSENCIA',
          MES: fecha(a.fechaInicio.slice(0, 7) + '-01'),
          CANTIDAD: dias,
          MONTO: { ausencia: ak },
          DESCRIPCION: a.motivo,
          AUTORIZACION: a.estado,
          ID_AUSENCIA: ref(ak),
        },
        '',
        ak,
      );
    }
    if (x.parqueo) {
      const p = x.parqueo,
        k = `${e.clave}:parqueo`,
        sk = clave('SOLICITUDES', k);
      sql.push(`IF NOT propia('SOLICITUDES',${q(k)}) THEN`);
      sinCierre(`TRUNC(${hoySql},'MM')`, `LAST_DAY(${hoySql})`);
      sql.push(`validar_parqueo(${id('EMPLEADOS', e.clave)},${q(p.vehiculo)}); END IF;`);
      agregar('SOLICITUDES', k, {
        ID_EMPLEADO: ref(ek),
        ID_TIPO_SOLICITUD: { tipoSolicitud: 'PARQUEO' },
        OBSERVACIONES: p.motivo,
        VEHICULO: p.vehiculo,
        PLACA: p.placa,
      });
      agregar(
        'PARQUEO_SUSCRIPCIONES',
        k,
        {
          ID_EMPLEADO: ref(ek),
          ID_SOLICITUD: ref(sk),
          VEHICULO: p.vehiculo,
          PLACA: p.placa,
          MES_INICIO: { mesActual: true },
          MOTIVO: 'Alta al aprobar solicitud',
        },
        '',
        sk,
      );
      for (const estado of ['EN_PROCESO', 'APROBADA'])
        agregar(
          'SOLICITUD_HISTORIAL',
          `${k}:${estado}`,
          {
            ID_SOLICITUD: ref(sk),
            ESTADO_ANTERIOR: estado === 'EN_PROCESO' ? null : 'EN_PROCESO',
            ESTADO_NUEVO: estado,
            ID_USUARIO: ref('actor'),
            MOTIVO: p.motivo,
            TIPO_MOVIMIENTO: 'ESTADO',
          },
          '',
          sk,
        );
      agregar(
        'NOTIFICACIONES',
        k,
        {
          ID_SOLICITUD: ref(sk),
          ID_USUARIO: ref(clave('USUARIOS', e.clave)),
          TIPO: 'CAMBIO_ESTADO',
          TITULO: 'Parqueo · APROBADA',
          MENSAJE: { mensajeSolicitud: sk },
          CLAVE_EVENTO: { eventoSolicitud: sk },
        },
        '',
        sk,
      );
      sql.push(
        `IF v_nuevas.EXISTS(${q(sk)}) THEN UPDATE SOLICITUDES SET ESTADO='APROBADA',RESUELTO_POR=v_actor,RESUELTO_EN=CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),MODIFICADO_POR=v_actor WHERE ID_SOLICITUD=${id('SOLICITUDES', k)}; END IF;`,
      );
    }
  }
}

export async function exportarCli() {
  dotenv.config({
    path: fileURLToPath(new URL('../../../../../.env', import.meta.url)),
    quiet: true,
  });
  try {
    exigir(
      process.argv.slice(2).every((a) => a === '--with-extras'),
      'El exportador admite únicamente --with-extras; usa seed:remote para validar, instalar o borrar.',
    );
    const sql = await generarSqlDemo(
      await cargarDataset(),
      process.env.SEED_DEFAULT_PASSWORD ?? '',
      process.argv.includes('--with-extras'),
    );
    const destino = new URL('../../../../../database/seed/seed_demo.sql', import.meta.url);
    const temporal = new URL(`seed_demo.${randomBytes(8).toString('hex')}.sql`, destino);
    try {
      await writeFile(temporal, sql, { mode: 0o600, flag: 'wx' });
      await rename(temporal, destino);
      await chmod(destino, 0o600);
    } finally {
      await rm(temporal, { force: true });
    }
    process.stdout.write(
      'SQL privado generado: database/seed/seed_demo.sql. Sin conexión Oracle ni contraseñas en texto plano.\n',
    );
  } catch {
    process.stderr.write(
      'No se pudo exportar. Revisa SEED_DEFAULT_PASSWORD, las banderas y los JSON; no se sobrescribió un archivo válido.\n',
    );
    process.exitCode = 1;
  }
}
