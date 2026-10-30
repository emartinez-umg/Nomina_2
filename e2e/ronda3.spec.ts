import { createHash } from 'node:crypto';
import oracledb, { type Connection } from 'oracledb';
import { test, expect, type Page } from '@playwright/test';
import type { ObjetivoPago } from '../backend/src/modules/nomina/pago.schemas.js';
import { elegirEmpleadoCampo } from './empleado.helpers.js';

// Fixtures reales exclusivamente en el esquema aleatorio que elimina el runner.
let db: Connection;
const personas: Record<string, number> = {};
test.beforeAll(async () => {
  if (!/^N2E2E_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
    throw new Error('La regresión exige un esquema E2E desechable.');
  oracledb.fetchAsString = [oracledb.CLOB];
  db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });
  for (const [i, nombre, ingreso, salario] of [
    [1, 'Octavo', '2026-10-08', 9000],
    [2, 'Tardio', '2026-10-24', 9000],
    [3, 'Anual', '2026-01-01', 5000],
  ] as const) {
    const previo = (
      await db.execute<number[]>('SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CORREO=:correo', {
        correo: `ronda3-${i}@example.test`,
      })
    ).rows?.[0]?.[0];
    if (previo) {
      personas[nombre] = previo;
      continue;
    }
    await db.execute(
      `INSERT INTO USUARIOS(ID_ROL,USUARIO,CORREO,CONTRASENA_HASH,CAMBIO_OBLIGATORIO)
       SELECT ID_ROL,:usuario,:correo,CONTRASENA_HASH,0 FROM USUARIOS WHERE USUARIO='persona.pruebas'`,
      { usuario: `ronda3.persona${i}`, correo: `usuario-ronda3-${i}@example.test` },
    );
    await db.execute(
      `INSERT INTO EMPLEADOS(ID_USUARIO,NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO)
       SELECT (SELECT ID_USUARIO FROM USUARIOS WHERE USUARIO=:usuario),:nombre,'Regresion',:dpi,:nit,DATE '1990-01-01','F','SOLTERO','Guatemala','55551234',:correo,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,TO_DATE(:ingreso,'YYYY-MM-DD')
       FROM EMPLEADOS WHERE ID_EMPLEADO=1`,
      {
        nombre,
        dpi: `781234567890${i}`,
        nit: `7812345${i}-0`,
        correo: `ronda3-${i}@example.test`,
        ingreso,
        usuario: `ronda3.persona${i}`,
      },
    );
    const id = (
      await db.execute<number[]>('SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CORREO=:correo', {
        correo: `ronda3-${i}@example.test`,
      })
    ).rows![0]![0]!;
    personas[nombre] = id;
    await db.execute(
      "INSERT INTO HISTORIAL_SALARIAL(ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES(:id,:salario,TO_DATE(:ingreso,'YYYY-MM-DD'),'Aceptación aislada R3-13')",
      { id, salario, ingreso },
    );
    await db.execute(
      "INSERT INTO EMPLEADO_HORARIO(ID_EMPLEADO,ID_HORARIO,VIGENTE_DESDE,MOTIVO) SELECT :id,MIN(ID_HORARIO),TO_DATE(:ingreso,'YYYY-MM-DD'),'Aceptación aislada R3-13' FROM HORARIO_BLOQUES",
      { id, ingreso },
    );
  }
  await db.commit();
});
test.afterAll(async () => {
  await db?.close();
});
async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill('revisor.pruebas');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/rh');
}
async function simular(page: Page, nombre: string, tipo: string) {
  await page.goto('/nomina/simular');
  await elegirEmpleadoCampo(page, 'Tipo de pago', tipo);
  if (tipo !== 'Bono 14') {
    await page.getByLabel('Año de mes del pago').selectOption('2026');
    await page.getByRole('combobox', { name: 'Mes del pago', exact: true }).selectOption('10');
  }
  await elegirEmpleadoCampo(page, 'Objetivo', 'Un empleado');
  await page.getByRole('combobox', { name: 'Empleado', exact: true }).fill(`${nombre} Regresion`);
  await page
    .getByRole('option')
    .filter({ hasText: `${nombre} Regresion` })
    .click();
  const respuesta = page.waitForResponse(
    (r) => r.url().endsWith('/api/nomina/simular') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Simular', exact: true }).click();
  const r = await respuesta;
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).data;
}
async function pagar(page: Page, anual = false) {
  await page
    .getByRole('checkbox', {
      name: anual
        ? 'Confirmo que la historia salarial, comisiones y horas extra del ciclo están completas'
        : 'Confirmo que las novedades del mes están completas',
    })
    .check();
  await page.getByRole('button', { name: 'Confirmar y pagar', exact: true }).click();
  const respuesta = page.waitForResponse((r) => r.url().endsWith('/api/nomina/pagar'));
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
  const r = await respuesta;
  expect(r.status(), await r.text()).toBe(201);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  return (await r.json()).data;
}

test('R3-13: alta posterior al 15 sin anticipo; bonificación proporcional y pago real', async ({
  page,
}) => {
  await entrar(page);
  const cero = await simular(page, 'Tardio', 'Anticipo');
  expect(cero.registros[0]).toMatchObject({
    informacion: 'Sin anticipo: ingresó después del día 15',
    resultado: null,
    alertas: [],
  });
  const tabla = page.getByRole('table', { name: 'Resultados de simulación' });
  await expect(tabla).toContainText('No corresponde');
  await expect(tabla.getByRole('button', { name: 'Vista previa' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Confirmar y pagar' })).toBeDisabled();
  const pagoTardio = await simular(page, 'Tardio', 'Pago del mes');
  expect(pagoTardio.registros[0].alertas).toEqual([]);
  expect(pagoTardio.registros[0].resultado).toMatchObject({
    anticipo: '0.00',
    devengado: '2466.67',
  });
  expect(pagoTardio.registros[0].resultado.lineas).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        concepto: expect.objectContaining({ codigo: 'BONIFICACION_INCENTIVO' }),
        monto: '66.67',
      }),
    ]),
  );
  await pagar(page);
  expect(
    (
      await db.execute<number[]>(
        "SELECT COUNT(*) FROM PAGOS_NOMINA WHERE ID_EMPLEADO=:id AND TIPO_PAGO='ANTICIPO'",
        { id: personas.Tardio },
      )
    ).rows![0]![0],
  ).toBe(0);
  const anticipo = await simular(page, 'Octavo', 'Anticipo');
  expect(anticipo.registros[0].resultado.neto).toBe('2533.33');
  await expect(tabla).toContainText('2,533.33');
  await pagar(page);
  const mensual = await simular(page, 'Octavo', 'Pago del mes');
  expect(mensual.registros[0].resultado).toMatchObject({
    anticipo: '2533.33',
    devengado: '7400.00',
  });
  expect(mensual.registros[0].resultado.lineas).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        concepto: expect.objectContaining({ codigo: 'BONIFICACION_INCENTIVO' }),
        monto: '200.00',
      }),
    ]),
  );
  await pagar(page);
  const historial = await page.request.get(
    `/api/nomina/historial?anio=2026&mes=10&idEmpleado=${personas.Octavo}&limite=1`,
  );
  expect(historial.status()).toBe(200);
  expect((await historial.json()).data).toMatchObject({
    total: 2,
    totales: { ingresos: '7400.00', igss: '347.76' },
  });
});

test('R3-13: Bono 14 extemporáneo conserva planillas posteriores y exige motivo', async ({
  page,
}) => {
  await entrar(page);
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
  const objetivo: ObjetivoPago = {
    mes: '2026-10',
    tipoPago: 'PAGO',
    objetivo: 'EMPLEADO',
    idEmpleado: personas.Anual,
  };
  const simulacion = await page.request.post('/api/nomina/simular', {
    headers: { 'X-CSRF-Token': csrf },
    data: objetivo,
  });
  expect(simulacion.status()).toBe(200);
  const pago = await page.request.post('/api/nomina/pagar', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      ...objetivo,
      hash: (await simulacion.json()).data.hash,
      confirmado: true,
      novedadesCompletas: true,
    },
  });
  expect(pago.status(), await pago.text()).toBe(201);
  const foto = async () =>
    createHash('sha256')
      .update(
        JSON.stringify(
          (
            await db.execute(
              `SELECT N.DATOS_EMPLEADO,B.SHA256,P.ESTADO,N.NETO FROM NOMINA_EMPLEADO N
     JOIN BOLETAS_PAGO B ON B.ID_NOMINA_EMPLEADO=N.ID_NOMINA_EMPLEADO
     JOIN PERIODOS_NOMINA P ON P.ID_PERIODO_NOMINA=N.ID_PERIODO_NOMINA
     WHERE N.ID_NOMINA_EMPLEADO=:id`,
              { id: (await pago.json()).data.pagados[0] },
            )
          ).rows,
        ),
      )
      .digest('hex');
  const antes = await foto();
  const anual = await simular(page, 'Anual', 'Bono 14');
  expect(anual.extemporaneo).toBe(true);
  await expect(page.getByRole('table')).toContainText('Pendiente de pago (atrasado desde');
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Confirmar y pagar' })).toBeDisabled();
  await page
    .getByRole('textbox', { name: 'Motivo del pago extemporáneo' })
    .fill('Regularización anual aprobada para aceptación R3-13');
  const confirmado = await pagar(page, true);
  const boleta = await page.request.get(`/api/nomina/boletas/${confirmado.pagados[0]}/pdf`);
  expect(boleta.status()).toBe(200);
  expect(
    Buffer.from((await boleta.json()).data.base64, 'base64')
      .subarray(0, 5)
      .toString(),
  ).toBe('%PDF-');
  expect(await foto()).toBe(antes);
  await page.getByRole('button', { name: 'Simular', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('ya tiene este pago registrado');
});

test('R3-13: nginx exige autenticación en cada familia nueva de endpoints', async ({ request }) => {
  const rutas = [
    '/api/tableros/anios?fuente=planillas',
    '/api/vacaciones/solicitudes/1/colisiones',
    '/api/vacaciones/saldos',
    '/api/vacaciones/saldos/exportar/csv',
    '/api/vacaciones/saldos/exportar/excel',
    '/api/equipo/resumen',
    '/api/equipo/personas',
    '/api/equipo/opciones',
    '/api/equipo/saldos',
    '/api/equipo/saldos/exportar/csv',
    '/api/equipo/saldos/exportar/excel',
    '/api/equipo/jefaturas/1/permisos',
    ...[
      'resumen',
      'tendencia',
      'ranking',
      'tabla',
      'opciones',
      'anios',
      'vendedores/1/historial',
      'exportar/csv',
      'exportar/excel',
    ].map((ruta) => `/api/tableros/comisiones/${ruta}?desde=2026-01&hasta=2026-10`),
    '/api/expedientes/mio',
    '/api/expedientes/empleados/1',
    '/api/expedientes/documentos/1?vista=1',
    '/api/actas',
    '/api/actas/exportar',
    '/api/actas/reglas',
    '/api/actas/plantilla',
    '/api/actas/antecedentes/1',
    '/api/actas/adjuntos/1',
    '/api/actas/1',
    '/api/actas/1/pdf',
  ];
  for (const ruta of rutas) {
    const r = await request.get(ruta);
    expect(r.status(), ruta).toBe(401);
    expect(r.headers()['content-type']).toContain('application/json');
    expect((await r.json()).ok).toBe(false);
  }
});
