import type { BaseDatos } from '../db/pool.js';
import { enTransaccion } from '../db/transaccion.js';
// Expediente exclusivo de pruebas: ingreso posterior a los periodos probados para no alterar la nómina.
export async function prepararFirmantePrueba(db: BaseDatos, usuario: number) {
  return enTransaccion(db, async (c) => {
    await c.execute(
      `INSERT INTO EMPLEADOS (ID_USUARIO,NOMBRES,APELLIDOS,DPI,NIT,FECHA_NACIMIENTO,SEXO,ESTADO_CIVIL,DIRECCION,TELEFONO,CORREO,ID_PUESTO,ID_DEPARTAMENTO,ID_TIPO_CONTRATO,ID_CENTRO_TRABAJO,FECHA_INGRESO)
  SELECT :usuario,'ZZ Firmante','Pruebas',:dpi,:nit,DATE '1990-01-01','F','SOLTERO','Guatemala','55551234',:correo,E.ID_PUESTO,E.ID_DEPARTAMENTO,E.ID_TIPO_CONTRATO,E.ID_CENTRO_TRABAJO,DATE '2199-01-01' FROM EMPLEADOS E WHERE E.ID_EMPLEADO=(SELECT MIN(ID_EMPLEADO) FROM EMPLEADOS) AND NOT EXISTS (SELECT 1 FROM EMPLEADOS WHERE ID_USUARIO=:usuario)`,
      {
        usuario,
        dpi: `8${String(usuario).padStart(12, '0')}`,
        nit: `${usuario}-${verificador(String(usuario))}`,
        correo: `firmante${usuario}@example.test`,
      },
    );
    const r = await c.execute<unknown[]>(
      'SELECT COUNT(*) FROM CONFIGURACION_EMPRESA WHERE ACTIVO=1',
    );
    if (!Number(r.rows![0]![0]))
      await c.execute(
        "INSERT INTO CONFIGURACION_EMPRESA(RAZON_SOCIAL,NIT,DIRECCION,TELEFONO,CORREO) VALUES ('Empresa de pruebas','1234567-9','Guatemala','55551234','empresa@example.test')",
      );
    await c.execute(
      "UPDATE CONFIGURACION_EMPRESA SET TELEFONO=NVL(TELEFONO,'55551234'),CORREO=NVL(CORREO,'empresa@example.test') WHERE ACTIVO=1",
    );
    await c.execute(
      'INSERT INTO IDENTIDAD_EMPRESA(ID_CONFIGURACION_EMPRESA) SELECT C.ID_CONFIGURACION_EMPRESA FROM CONFIGURACION_EMPRESA C WHERE NOT EXISTS(SELECT 1 FROM IDENTIDAD_EMPRESA I WHERE I.ID_CONFIGURACION_EMPRESA=C.ID_CONFIGURACION_EMPRESA)',
    );
  });
}
function verificador(cuerpo: string) {
  const n =
    (11 - ([...cuerpo].reverse().reduce((s, d, i) => s + Number(d) * (i + 2), 0) % 11)) % 11;
  return n === 10 ? 'K' : String(n);
}
