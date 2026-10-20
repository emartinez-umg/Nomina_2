import oracledb, { type BindParameters } from 'oracledb';

/** Datos de ejemplo exclusivamente en el esquema aleatorio del runner E2E. */
export async function prepararDashboard() {
  if (!/^N2E2E_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
    throw new Error('El dashboard E2E exige un esquema desechable.');
  const c = await oracledb.getConnection({
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    connectString: process.env.DB_CONNECT_STRING!,
  });
  const sql = (consulta: string, binds: BindParameters = {}) => c.execute(consulta, binds);
  const scalar = async (consulta: string, binds: BindParameters = {}) =>
    Number((await c.execute<unknown[]>(consulta, binds)).rows![0]![0]);
  const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guatemala' }).format(
    new Date(),
  );
  const desplazar = (dias: number) => {
    const f = new Date(`${hoy}T12:00:00Z`);
    f.setUTCDate(f.getUTCDate() + dias);
    return f.toISOString().slice(0, 10);
  };
  let dep = 0,
    periodo = 0;
  const limpiar = async () => {
    // Los IDs se originan en este esquema; nunca se borra información de la aplicación.
    for (const tabla of ['NOMINA_DETALLE', 'NOMINA_EMPLEADO'])
      await sql(`DELETE FROM ${tabla} WHERE ID_PERIODO_NOMINA=:id`, { id: periodo });
    await sql('DELETE FROM PERIODOS_NOMINA WHERE ID_PERIODO_NOMINA=:id', { id: periodo });
    for (const tabla of [
      'AUSENCIAS',
      'VACACIONES_SOLICITUDES',
      'SOLICITUDES',
      'HISTORIAL_SALARIAL',
      'EMPLEADO_HORARIO',
    ])
      await sql(
        `DELETE FROM ${tabla} WHERE ID_EMPLEADO IN (SELECT ID_EMPLEADO FROM EMPLEADOS WHERE ID_DEPARTAMENTO=:dep)`,
        { dep },
      );
    await sql('DELETE FROM EMPLEADOS WHERE ID_DEPARTAMENTO=:dep', { dep });
    await sql('DELETE FROM PUESTOS WHERE ID_DEPARTAMENTO=:dep', { dep });
    await sql('DELETE FROM DEPARTAMENTOS WHERE ID_DEPARTAMENTO=:dep', { dep });
    await c.commit();
  };
  try {
    await sql("INSERT INTO DEPARTAMENTOS(NOMBRE) VALUES('Equipo dashboard QA')");
    dep = await scalar(
      "SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE NOMBRE='Equipo dashboard QA'",
    );
    await sql("INSERT INTO PUESTOS(NOMBRE,ID_DEPARTAMENTO) VALUES('Analista dashboard QA',:dep)", {
      dep,
    });
    const puesto = await scalar('SELECT ID_PUESTO FROM PUESTOS WHERE ID_DEPARTAMENTO=:dep', {
      dep,
    });
    const empleados: number[] = [];
    for (let i = 0; i < 2; i++) {
      await sql(
        `INSERT INTO EMPLEADOS(NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO)
        SELECT :nombre,:apellido,:dpi,:nit,TO_DATE(:nace,'YYYY-MM-DD'),'F','SOLTERO','Dirección de ejemplo','55551234',:correo,:puesto,:dep,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,TO_DATE(:ingreso,'YYYY-MM-DD') FROM EMPLEADOS WHERE ID_EMPLEADO=(SELECT MIN(ID_EMPLEADO) FROM EMPLEADOS)`,
        {
          nombre: i === 0 ? 'Ana Tablero' : 'Luis',
          apellido: i === 0 ? 'Ejemplo QA' : 'Dashboard QA',
          dpi: `791234560000${i}`,
          nit: `7912345${i}-0`,
          nace: `1992-${(i === 0 ? hoy : desplazar(10)).slice(5)}`,
          correo: `tablero${i}@example.test`,
          puesto,
          dep,
          ingreso: `2020-${hoy.slice(5)}`,
        },
      );
      const id = await scalar('SELECT MAX(ID_EMPLEADO) FROM EMPLEADOS');
      empleados.push(id);
      await sql(
        "INSERT INTO EMPLEADO_HORARIO(ID_EMPLEADO,ID_HORARIO,VIGENTE_DESDE,MOTIVO) SELECT :id,MIN(ID_HORARIO),DATE '2020-01-01','Fixture dashboard' FROM HORARIO_BLOQUES",
        { id },
      );
    }
    const ana = empleados[0]!,
      luis = empleados[1]!;
    await sql(
      "INSERT INTO HISTORIAL_SALARIAL(ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES(:id,12000,DATE '2020-01-01','Fixture dashboard')",
      { id: ana },
    );
    await sql(
      "INSERT INTO PERIODOS_NOMINA(FECHA_INICIO,FECHA_FIN,QUINCENA,ESTADO,VERSION_CALCULO,MOTOR,APROBADO_EN,APROBADO_POR,CERRADO_EN,CERRADO_POR) SELECT DATE '2024-09-16',DATE '2024-09-30',2,'CERRADO',1,'V0',SYSDATE,MIN(ID_USUARIO),SYSDATE,MIN(ID_USUARIO) FROM USUARIOS",
    );
    periodo = await scalar(
      "SELECT ID_PERIODO_NOMINA FROM PERIODOS_NOMINA WHERE FECHA_INICIO=DATE '2024-09-16'",
    );
    const snapshot = JSON.stringify({
      entrada: {
        empleado: {
          id: ana,
          codigo: 'QA',
          nombres: 'Ana Tablero',
          apellidos: 'Ejemplo QA',
          idDepartamento: dep,
          departamento: 'Equipo dashboard QA',
        },
      },
      resultado: { alertas: [] },
    });
    await sql(
      `INSERT INTO NOMINA_EMPLEADO(ID_PERIODO_NOMINA,ID_EMPLEADO,ID_HISTORIAL_SALARIAL,VERSION_CALCULO,DIAS_PAGADOS,SALARIO_BASE,TOTAL_INGRESOS,TOTAL_DESCUENTOS,NETO,COSTO_PATRONAL,DATOS_EMPLEADO)
      SELECT :periodo,:id,ID_HISTORIAL_SALARIAL,1,15,12000,12750,0,12750,0,:snapshot FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=:id`,
      { periodo, id: ana, snapshot },
    );
    const nomina = await scalar('SELECT MAX(ID_NOMINA_EMPLEADO) FROM NOMINA_EMPLEADO');
    for (const [orden, codigo, monto] of [
      [1, 'SALARIO_BASE', 12000],
      [2, 'COMISION', 350],
      [3, 'HORAS_EXTRA', 150],
    ] as const)
      await sql(
        `INSERT INTO NOMINA_DETALLE(ID_NOMINA_EMPLEADO,ID_EMPLEADO,ID_PERIODO_NOMINA,ID_CONCEPTO_NOMINA,ORDEN,DESCRIPCION,NATURALEZA,BASE_CALCULO,CANTIDAD,MONTO,AFECTA_IGSS,AFECTA_ISR,AFECTA_PRESTACIONES)
        SELECT :nomina,:id,:periodo,ID_CONCEPTO_NOMINA,:orden,NOMBRE,NATURALEZA,:monto,1,:monto,AFECTA_IGSS,AFECTA_ISR,AFECTA_PRESTACIONES FROM CONCEPTOS_NOMINA WHERE CODIGO=:codigo AND VIGENTE_DESDE=DATE '2026-01-01'`,
        { nomina, id: ana, periodo, orden, codigo, monto },
      );
    const cats = [
      'IGSS_JUSTIFICADA',
      'JUSTIFICADA_CON_GOCE',
      'JUSTIFICADA_SIN_GOCE',
      'SIN_JUSTIFICAR',
    ];
    const aprobador = await scalar('SELECT MIN(ID_USUARIO) FROM USUARIOS');
    for (const [i, cat] of cats.entries()) {
      const fecha = `${hoy.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`;
      await sql(
        `INSERT INTO AUSENCIAS(ID_EMPLEADO,ID_TIPO_AUSENCIA,FECHA_INICIO,FECHA_FIN,DIAS,MOTIVO,ESTADO,APROBADO_POR)
        SELECT :id,MIN(ID_TIPO_AUSENCIA),TO_DATE(:fecha,'YYYY-MM-DD'),TO_DATE(:fecha,'YYYY-MM-DD'),1,'Ausencia dashboard QA','APROBADA',:aprobador FROM TIPOS_AUSENCIA WHERE CATEGORIA_INASISTENCIA=:cat`,
        { id: ana, fecha, cat, aprobador },
      );
    }
    for (const [id, inicio, fin] of [
      [ana, hoy, desplazar(4)],
      [luis, desplazar(45), desplazar(49)],
    ] as const) {
      await sql(
        "INSERT INTO SOLICITUDES(ID_EMPLEADO,ID_TIPO_SOLICITUD) SELECT :id,ID_TIPO_SOLICITUD FROM TIPOS_SOLICITUD WHERE NVL(CODIGO_ANTERIOR,CODIGO)='VACACIONES'",
        { id },
      );
      const solicitud = await scalar('SELECT MAX(ID_SOLICITUD) FROM SOLICITUDES');
      await sql(
        `INSERT INTO VACACIONES_SOLICITUDES(ID_SOLICITUD,ID_EMPLEADO,FECHA_INICIO,FECHA_FIN,DIAS_SOLICITADOS,SALDO_AL_SOLICITAR,SALDO_AL_RESOLVER,ESTADO,RESUELTO_POR,RESUELTO_EN)
        VALUES(:solicitud,:id,TO_DATE(:inicio,'YYYY-MM-DD'),TO_DATE(:fin,'YYYY-MM-DD'),3,30,30,'APROBADA',(SELECT MIN(ID_USUARIO) FROM USUARIOS),SYSDATE)`,
        { solicitud, id, inicio, fin },
      );
    }
    await c.commit();
    return {
      ana,
      luis,
      dep,
      hoy,
      limpiar: async () => {
        try {
          await limpiar();
        } finally {
          await c.close();
        }
      },
    };
  } catch (error) {
    await c.rollback();
    await c.close();
    throw error;
  }
}
