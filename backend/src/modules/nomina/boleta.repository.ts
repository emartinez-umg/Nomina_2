import type { Connection } from 'oracledb';
import { filas } from '../novedades/mensuales.repository.js';
import type { DatosBoleta } from './boleta.pdf.js';
import type { Guardado } from './nomina.repository.js';
import type { Snapshot } from './nomina.exportar.js';

// Solo completa datos de impresión ausentes en los snapshots anteriores; no altera sus importes.
export async function datosBoletas(c: Connection, ns: Guardado[]) {
  const datos = new Map<number, DatosBoleta>();
  for (const n of ns) {
    const e = (JSON.parse(n.snapshot) as Snapshot).entrada.empleado;
    const r = await filas<DatosBoleta>(
      c,
      `SELECT (SELECT P.CODIGO FROM PUESTOS P WHERE P.NOMBRE=:puesto FETCH FIRST 1 ROW ONLY) "codigoPuesto", C.NOMBRE "centro" FROM CENTROS_TRABAJO C WHERE C.ID_CENTRO_TRABAJO=:centro`,
      { puesto: e.puesto, centro: e.centro },
    );
    if (r[0]) datos.set(n.id, r[0]);
  }
  return datos;
}
