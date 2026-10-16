// Reglas puras compartidas con el constructor del frontend. Los límites proceden de Oracle.
export type Jornada = 'DIURNA' | 'MIXTA' | 'NOCTURNA';
export interface BloqueHorario {
  dias: number[];
  entrada: string;
  salida: string;
  cruzaMedianoche: boolean;
  minutosDescanso: number;
}
export type LimitesHorario = Record<Jornada, { diarias: number; semanales: number }>;
export const nombresDias = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];
export const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
export const horaTexto = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function jornadaBloque(b: BloqueHorario): Jornada {
  const entrada = minutos(b.entrada),
    salida = minutos(b.salida) + (b.cruzaMedianoche ? 1440 : 0);
  let diurnos = 0;
  for (let dia = 0; dia < 2; dia++)
    diurnos += Math.max(
      0,
      Math.min(salida, dia * 1440 + 1080) - Math.max(entrada, dia * 1440 + 360),
    );
  return diurnos === salida - entrada ? 'DIURNA' : diurnos === 0 ? 'NOCTURNA' : 'MIXTA';
}
export const minutosEfectivos = (b: BloqueHorario) =>
  minutos(b.salida) + (b.cruzaMedianoche ? 1440 : 0) - minutos(b.entrada) - b.minutosDescanso;
const combinar = (jornadas: Jornada[]): Jornada =>
  new Set(jornadas).size === 1 ? jornadas[0]! : 'MIXTA';
export function analizarHorario(
  bloques: BloqueHorario[],
  limites?: LimitesHorario,
  estricto = true,
) {
  const errores: string[] = [];
  const intervalos: { inicio: number; fin: number; bloque: number }[] = [];
  const diarios = Array.from({ length: 7 }, () => ({ minutos: 0, jornadas: [] as Jornada[] }));
  if (!bloques.length || bloques.length > 28)
    errores.push('Agrega entre 1 y 28 bloques de trabajo.');
  bloques.forEach((b, i) => {
    const prefijo = `Bloque ${i + 1}: `;
    if (
      !b.dias.length ||
      b.dias.some((d) => !Number.isInteger(d) || d < 1 || d > 7) ||
      new Set(b.dias).size !== b.dias.length
    )
      errores.push(prefijo + 'selecciona días distintos de lunes a domingo.');
    if (![b.entrada, b.salida].every((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h))) {
      errores.push(prefijo + 'selecciona horas válidas de la lista.');
      return;
    }
    const entrada = minutos(b.entrada),
      salida = minutos(b.salida) + (b.cruzaMedianoche ? 1440 : 0);
    if (
      !Number.isInteger(b.minutosDescanso) ||
      b.minutosDescanso < 0 ||
      salida <= entrada ||
      salida - entrada > 1440 ||
      minutosEfectivos(b) <= 0
    )
      errores.push(
        prefijo +
          'la salida debe ser posterior a la entrada y el descanso menor a la duración; activa el cruce de medianoche solo si sales al día siguiente.',
      );
    if (
      estricto &&
      (entrada % 30 || minutos(b.salida) % 30 || ![30, 60].includes(b.minutosDescanso))
    )
      errores.push(
        prefijo + 'usa horas en intervalos de 30 minutos y descanso de 30 o 60 minutos.',
      );
    for (const d of b.dias) {
      const diario = diarios[d - 1];
      if (!diario) continue;
      diario.minutos += minutosEfectivos(b);
      diario.jornadas.push(jornadaBloque(b));
      intervalos.push({
        inicio: (d - 1) * 1440 + entrada,
        fin: (d - 1) * 1440 + salida,
        bloque: i,
      });
    }
  });
  for (let i = 0; i < intervalos.length; i++)
    for (let j = i + 1; j < intervalos.length; j++) {
      const a = intervalos[i]!,
        b = intervalos[j]!;
      if (
        [-10080, 0, 10080].some(
          (desfase) => a.inicio < b.fin + desfase && b.inicio + desfase < a.fin,
        )
      ) {
        errores.push(
          `Los bloques ${a.bloque + 1} y ${b.bloque + 1} se solapan, incluso al cruzar medianoche. Cambia sus días u horas.`,
        );
      }
    }
  const jornada = combinar(bloques.map(jornadaBloque));
  const minutosSemanales = diarios.reduce((s, d) => s + d.minutos, 0);
  if (limites) {
    diarios.forEach((d, i) => {
      if (!d.jornadas.length) return;
      const tipo = combinar(d.jornadas),
        max = limites[tipo].diarias;
      if (d.minutos > max * 60)
        errores.push(
          `${nombresDias[i]}: supera ${max} horas diarias de jornada ${tipo.toLowerCase()}. Reduce los bloques de ese día.`,
        );
    });
    if (minutosSemanales > limites[jornada].semanales * 60)
      errores.push(
        `Supera ${limites[jornada].semanales} horas semanales de jornada ${jornada.toLowerCase()}. Reduce horas o días.`,
      );
  }
  return {
    errores: [...new Set(errores)],
    jornada,
    horasSemanales: minutosSemanales / 60,
    horasDiarias: diarios.map((d) => d.minutos / 60),
    descansos: diarios.flatMap((d, i) => (d.jornadas.length ? [] : [i + 1])),
  };
}
export function normalizarBloques(bloques: BloqueHorario[]) {
  return bloques
    .map((b) => ({
      dias: [...b.dias].sort((a, b) => a - b),
      entrada: b.entrada,
      salida: b.salida,
      cruzaMedianoche: b.cruzaMedianoche,
      minutosDescanso: b.minutosDescanso,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
