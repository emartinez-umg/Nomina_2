const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Distancia de edición con transposición: admite «boltea» y errores de una o dos letras.
function distancia(a: string, b: string): number {
  const filas = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  filas[0] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      filas[i]![j] = Math.min(
        filas[i - 1]![j]! + 1,
        filas[i]![j - 1]! + 1,
        filas[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        filas[i]![j] = Math.min(filas[i]![j]!, filas[i - 2]![j - 2]! + 1);
    }
  }
  return filas[a.length]![b.length]!;
}
export function puntuarBusqueda(valor: string, consulta: string, palabras: string[] = []): number {
  const texto = normalizar([valor, ...palabras].join(' '));
  const terminos = normalizar(consulta).trim().split(/\s+/).filter(Boolean);
  if (!terminos.length) return 1;
  const vocabulario = texto.split(/[^a-z0-9]+/).filter(Boolean);
  let puntaje = 1;
  for (const termino of terminos) {
    if (texto.includes(termino)) continue;
    if (termino.length < 4) return 0;
    const limite = termino.length >= 7 ? 2 : 1;
    if (
      !vocabulario.some(
        (palabra) =>
          Math.abs(palabra.length - termino.length) <= limite &&
          distancia(termino, palabra) <= limite,
      )
    )
      return 0;
    puntaje *= 0.6;
  }
  return puntaje;
}
