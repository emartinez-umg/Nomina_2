export const fuentesAnios = [
  'planillas',
  'calculo-nomina',
  'comisiones',
  'ausencias',
  'vacaciones',
  'horas-extra',
  'consumos-tienda',
  'parqueo',
  'novedades',
  'tarifas-parqueo',
] as const;
export type FuenteAnios = (typeof fuentesAnios)[number];
