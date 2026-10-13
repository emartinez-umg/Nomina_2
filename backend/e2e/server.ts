import { crearBaseDatos } from '../src/shared/db/pool.js';
import { validarEntorno } from '../src/config/env.schema.js';
import { ejecutarMigraciones } from '../src/shared/db/migraciones.js';
import { ejecutarSeeds } from '../src/shared/db/seeds.js';
import { validarEntornoSeeds } from '../src/shared/db/seeds.env.js';
import { crearLogger } from '../src/config/logger.js';
import { enTransaccion } from '../src/shared/db/transaccion.js';
import { crearApp } from '../src/app.js';
import { crearAuthService } from '../src/modules/auth/auth.service.js';
import {
  crearUsuariosService,
  crearUsuarioInterno,
} from '../src/modules/usuarios/usuarios.service.js';
import { crearAuditoriaService } from '../src/modules/auditoria/auditoria.service.js';
import { crearCatalogosService } from '../src/modules/catalogos/catalogos.service.js';
import { crearEmpleadosService } from '../src/modules/empleados/empleados.service.js';
import { crearNovedadesService } from '../src/modules/novedades/novedades.service.js';
import { crearVacacionesService } from '../src/modules/vacaciones/vacaciones.service.js';
import { crearNominaService } from '../src/modules/nomina/nomina.service.js';
import { crearPrestacionesService } from '../src/modules/prestaciones/prestaciones.service.js';
import { crearSolicitudesService } from '../src/modules/solicitudes/solicitudes.service.js';
import { crearComunicacionService } from '../src/modules/comunicacion/comunicacion.service.js';
import { crearTablerosService } from '../src/modules/tableros/tableros.service.js';
import { crearSaludRepository } from '../src/modules/salud/salud.repository.js';
import { crearSaludService } from '../src/modules/salud/salud.service.js';
import { hashearContrasena } from '../src/shared/security/credenciales.js';
if (!/^N2E2E_[A-F0-9]{12}$/.test(process.env.DB_USER ?? ''))
  throw new Error('E2E exige un esquema desechable.');
const config = validarEntorno({
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '3018',
    NODE_ENV: 'test',
    LOGIN_RATE_LIMIT: '1000',
  }),
  logger = crearLogger('silent');
const db = await crearBaseDatos(config);
await ejecutarMigraciones(db, logger);
await ejecutarSeeds(db, logger, validarEntornoSeeds(process.env));
await enTransaccion(db, async (c) => {
  const scalar = async (sql: string) => Number((await c.execute<number[]>(sql)).rows![0]![0]);
  await c.execute('UPDATE USUARIOS SET CAMBIO_OBLIGATORIO=0');
  const actor = {
    idUsuario: await scalar('SELECT MIN(ID_USUARIO) FROM USUARIOS'),
    idRol: await scalar("SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN'"),
    rol: 'ADMIN' as const,
    ip: '127.0.0.1',
  };
  const hash = await hashearContrasena(process.env.E2E_PASSWORD!);
  const cuentas = [];
  for (const [nombre, rol] of [
    ['Revisor', 'RH'],
    ['Persona', 'EMPLEADO'],
    ['Ajeno', 'EMPLEADO'],
  ] as const) {
    const u = await crearUsuarioInterno(c, actor, {
      nombre,
      apellido: 'Pruebas',
      correo: `${nombre.toLowerCase()}@example.test`,
      rol,
    });
    await c.execute(
      'UPDATE USUARIOS SET CONTRASENA_HASH=:hash,CAMBIO_OBLIGATORIO=0 WHERE ID_USUARIO=:id',
      { hash, id: u.idUsuario },
    );
    cuentas.push(u);
  }
  await c.execute("INSERT INTO DEPARTAMENTOS (CODIGO,NOMBRE) VALUES ('E2E','Departamento E2E')");
  const dep = await scalar("SELECT ID_DEPARTAMENTO FROM DEPARTAMENTOS WHERE CODIGO='E2E'");
  await c.execute(
    "INSERT INTO PUESTOS (CODIGO,NOMBRE,ID_DEPARTAMENTO) VALUES ('E2E','Analista E2E',:dep)",
    { dep },
  );
  await c.execute(
    "INSERT INTO CENTROS_TRABAJO (CODIGO,NOMBRE,LOCALIDAD) VALUES ('E2E','Centro E2E','E2E')",
  );
  await c.execute(
    "INSERT INTO HORARIOS (CODIGO,NOMBRE,JORNADA) VALUES ('E2E','Horario E2E','DIURNA')",
  );
  const puesto = await scalar("SELECT ID_PUESTO FROM PUESTOS WHERE CODIGO='E2E'"),
    centro = await scalar("SELECT ID_CENTRO_TRABAJO FROM CENTROS_TRABAJO WHERE CODIGO='E2E'"),
    horario = await scalar("SELECT ID_HORARIO FROM HORARIOS WHERE CODIGO='E2E'"),
    contrato = await scalar('SELECT MIN(ID_TIPO_CONTRATO) FROM TIPOS_CONTRATO');
  for (let dia = 1; dia <= 7; dia++)
    await c.execute(
      'INSERT INTO HORARIO_DIAS (ID_HORARIO,DIA_SEMANA,LABORABLE,MINUTO_ENTRADA,MINUTO_SALIDA) VALUES (:id,:dia,:laborable,:entrada,:salida)',
      {
        id: horario,
        dia,
        laborable: dia <= 5 ? 1 : 0,
        entrada: dia <= 5 ? 480 : null,
        salida: dia <= 5 ? 960 : null,
      },
    );
  await c.execute(
    "INSERT INTO CONFIGURACION_EMPRESA (RAZON_SOCIAL,NIT,DIRECCION,REPRESENTANTE) VALUES ('Empresa E2E','1234567-9','Dirección E2E','Representante E2E')",
  );
  for (const i of [1, 2]) {
    await c.execute(
      "INSERT INTO EMPLEADOS (CODIGO,ID_USUARIO,NOMBRES,APELLIDOS,DPI,NIT,AFILIACION_IGSS,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO) VALUES (:codigo,:usuario,:nombre,'E2E',:dpi,:nit,:igss,DATE '1995-01-01','O','SOLTERO','Dirección E2E','55551234',:correo,:puesto,:dep,:contrato,:centro,DATE '2026-01-01')",
      {
        codigo: `E2E_${i}`,
        usuario: cuentas[i]!.idUsuario,
        nombre: i === 1 ? 'Persona' : 'Ajeno',
        dpi: `987654321012${i}`,
        nit: i === 1 ? '1234567-9' : '123456-0',
        igss: `100000${i}`,
        correo: `empleado${i}@example.test`,
        puesto,
        dep,
        contrato,
        centro,
      },
    );
    const id = await scalar(`SELECT ID_EMPLEADO FROM EMPLEADOS WHERE CODIGO='E2E_${i}'`);
    await c.execute(
      "INSERT INTO HISTORIAL_SALARIAL (ID_EMPLEADO,SALARIO_BASE,VIGENTE_DESDE,MOTIVO) VALUES (:id,5000,DATE '2026-01-01','Salario E2E')",
      { id },
    );
    await c.execute(
      "INSERT INTO EMPLEADO_HORARIO (ID_EMPLEADO,ID_HORARIO,VIGENTE_DESDE,MOTIVO) VALUES (:id,:horario,DATE '2026-01-01','Horario E2E')",
      { id, horario },
    );
  }
});
const salud = crearSaludService(crearSaludRepository(db), logger);
const app = crearApp(salud, logger, {
  auth: await crearAuthService(db, config),
  usuarios: crearUsuariosService(db),
  auditoria: crearAuditoriaService(db),
  catalogos: crearCatalogosService(db),
  empleados: crearEmpleadosService(db),
  novedades: crearNovedadesService(db),
  vacaciones: crearVacacionesService(db),
  nomina: crearNominaService(db),
  prestaciones: crearPrestacionesService(db),
  solicitudes: crearSolicitudesService(db),
  comunicacion: crearComunicacionService(db),
  tableros: crearTablerosService(db),
  config,
});
const server = app.listen(3018, '127.0.0.1');
const cerrar = () =>
  server.close(() => {
    void db.cerrar().then(() => process.exit(0));
  });
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
