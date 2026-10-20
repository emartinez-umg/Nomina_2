import { Decimal } from 'decimal.js';
import { ErrorConflicto } from '../errors/errors.js';
export interface JornadaDia {
  desde: string;
  hasta: string | null;
  dia: number;
  horas: string;
}
export function horasDiariasEnFecha(jornadas: JornadaDia[], fecha: string) {
  const vigentes = jornadas.filter((j) => j.desde <= fecha && (!j.hasta || j.hasta >= fecha));
  if (
    !vigentes.length ||
    new Set(vigentes.map((j) => `${j.desde}:${j.hasta}`)).size !== 1 ||
    new Set(vigentes.map((j) => j.dia)).size !== vigentes.length
  )
    throw new ErrorConflicto('Completa un horario vigente único para valorar las horas extra.');
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay() || 7;
  const asignadas = vigentes.filter((j) => j.dia === dia);
  // El trabajo extraordinario en descanso toma la duración media de los días de trabajo del patrón.
  const horas = asignadas.length
    ? new Decimal(asignadas[0]!.horas)
    : vigentes.reduce((s, j) => s.plus(j.horas), new Decimal(0)).div(vigentes.length);
  if (!horas.gt(0))
    throw new ErrorConflicto('El horario vigente debe tener horas diarias mayores que cero.');
  return horas;
}
