const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
export interface Asignacion {
  desde: string;
  hasta: string | null;
  dias: number[];
}
export function diasLaboralesRango(
  inicio: string,
  fin: string,
  horarios: Asignacion[],
  feriados: string[],
) {
  const dias: { fecha: string; laborable: boolean; motivo: string | null }[] = [];
  for (let fecha = inicio; fecha <= fin; fecha = sumarDias(fecha, 1)) {
    const h = horarios.filter((h) => h.desde <= fecha && (!h.hasta || h.hasta >= fecha));
    const semana = new Date(`${fecha}T12:00:00Z`).getUTCDay() || 7;
    const motivo =
      h.length !== 1
        ? 'Sin horario vigente'
        : feriados.includes(fecha)
          ? 'Feriado'
          : !h[0]!.dias.includes(semana)
            ? 'Día de descanso'
            : null;
    dias.push({ fecha, laborable: !motivo, motivo });
  }
  return dias;
}
