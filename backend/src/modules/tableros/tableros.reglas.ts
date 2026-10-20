import type { QueryInasistencias } from './tableros.schemas.js';
export const categoriasInasistencia = [
  { categoria: 'IGSS_JUSTIFICADA', nombre: 'Justificada por IGSS', color: 'verde' },
  { categoria: 'JUSTIFICADA_CON_GOCE', nombre: 'Justificada con goce', color: 'amarillo' },
  { categoria: 'JUSTIFICADA_SIN_GOCE', nombre: 'Justificada sin goce', color: 'naranja' },
  { categoria: 'SIN_JUSTIFICAR', nombre: 'Sin justificación', color: 'rojo' },
] as const;
export function rangoInasistencias(fecha: string, periodo: QueryInasistencias['periodo']) {
  const anio = Number(fecha.slice(0, 4)),
    mes = Number(fecha.slice(5, 7));
  const primero =
    periodo === 'anio' ? 1 : periodo === 'trimestre' ? Math.floor((mes - 1) / 3) * 3 + 1 : mes;
  const siguiente = primero + (periodo === 'anio' ? 12 : periodo === 'trimestre' ? 3 : 1);
  return {
    inicio: `${anio}-${String(primero).padStart(2, '0')}-01`,
    fin: new Date(Date.UTC(anio, siguiente - 1, 0)).toISOString().slice(0, 10),
  };
}
