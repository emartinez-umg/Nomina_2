import { Decimal } from 'decimal.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import type { Entrada } from './nomina.types.js';
import type { Historia } from './nomina.repository.js';
export function completarHistoria(e: Entrada) {
  const historia = (e as Entrada & { historia?: Historia }).historia;
  if (!historia) return e;
  const inicioAnio = `${e.inicio.slice(0, 4)}-01-01`;
  let cursor = e.empleado.ingreso > inicioAnio ? e.empleado.ingreso : inicioAnio;
  const a = historia.apertura;
  if (a) {
    if (a.corte >= e.inicio)
      throw new ErrorConflicto(
        'La apertura fiscal se traslapa con esta quincena. Calcula desde el periodo siguiente al corte.',
      );
    cursor = new Date(Date.parse(a.corte) + 86400000).toISOString().slice(0, 10);
  }
  const acumulado = {
    renta: new Decimal(a?.renta ?? 0),
    igss: new Decimal(a?.igss ?? 0),
    isr: new Decimal(a?.isr ?? 0),
  };
  for (const n of historia.previos) {
    if (a && n.inicio <= a.corte)
      throw new ErrorConflicto('La apertura fiscal se traslapa con nóminas cerradas del empleado.');
    if (n.inicio > cursor)
      throw new ErrorConflicto(
        `Falta historia fiscal desde ${cursor}. Cierra las quincenas anteriores o registra la apertura certificada.`,
      );
    cursor = new Date(Date.parse(n.fin) + 86400000).toISOString().slice(0, 10);
    for (const k of ['renta', 'igss', 'isr'] as const) acumulado[k] = acumulado[k].plus(n[k]);
  }
  if (cursor < e.inicio)
    throw new ErrorConflicto(
      `Falta historia fiscal desde ${cursor}. Registra ingresos, IGSS e ISR reales mediante apertura certificada o calcula las quincenas anteriores.`,
    );
  return {
    ...e,
    acumulado: {
      renta: acumulado.renta.toFixed(2),
      igss: acumulado.igss.toFixed(2),
      isr: acumulado.isr.toFixed(2),
    },
  };
}
