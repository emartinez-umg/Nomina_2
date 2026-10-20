import type { BaseDatos } from '../../shared/db/pool.js';
import * as repository from './ubicaciones.repository.js';

export function crearUbicacionesService(db: BaseDatos) {
  return {
    departamentos: (buscar: string) => db.conConexion((c) => repository.departamentos(c, buscar)),
    municipios: (buscar: string, idDepartamentoGt?: number) =>
      db.conConexion((c) => repository.municipios(c, buscar, idDepartamentoGt)),
  };
}
