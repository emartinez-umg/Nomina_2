import { limpiarPalabra } from './codigos.generador.js';
import type { Connection } from 'oracledb';
import type { VistaPrevia } from './codigos.schemas.js';
export async function vistaPrevia(c: Connection, q: VistaPrevia) {
  const r = await c.execute<[string]>(
    'SELECT N2_CODIGOS.VISTA_PREVIA(:entidad,:palabra,:departamento,NULL,:clave) FROM DUAL',
    {
      entidad: q.entidad,
      palabra: q.palabra ?? null,
      departamento: q.idDepartamento ?? null,
      clave:
        q.entidad === 'parametros-legales'
          ? limpiarPalabra(q.palabra ?? '').replace(/ /g, '_')
          : null,
    },
  );
  return r.rows![0]![0];
}
