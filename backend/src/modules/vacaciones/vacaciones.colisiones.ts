import { createHash } from 'node:crypto';

export interface ColisionVacaciones {
  idSolicitud: number;
  codigoSolicitud: string;
  idEmpleado: number;
  empleado: string;
  codigo: string;
  departamento: string;
  centro: string | null;
  inicio: string;
  fin: string;
  inicioCoincidencia: string;
  finCoincidencia: string;
  diasCoincidentes: number;
  estado: 'EN_PROCESO' | 'APROBADA';
  tipoCoincidencia: 'Mismo departamento' | 'Mismo centro de trabajo' | 'Ambos';
}

// La advertencia mide rangos naturales inclusivos; no modifica los días laborales ni el saldo.
export function resumirColisiones(
  solicitud: { id: number; idEmpleado: number; inicio: string; fin: string; estado: string },
  colisiones: ColisionVacaciones[],
  tamanoEquipo: number,
) {
  const lineaTiempo = [];
  for (
    let dia = Date.parse(`${solicitud.inicio}T00:00:00Z`);
    dia <= Date.parse(`${solicitud.fin}T00:00:00Z`);
    dia += 86400000
  ) {
    const fecha = new Date(dia).toISOString().slice(0, 10);
    const aprobadas = new Set<number>();
    const enProceso = new Set<number>();
    if (['APROBADA', 'EN_PROCESO'].includes(solicitud.estado))
      (solicitud.estado === 'APROBADA' ? aprobadas : enProceso).add(solicitud.idEmpleado);
    for (const c of colisiones) {
      if (c.inicioCoincidencia <= fecha && c.finCoincidencia >= fecha)
        (c.estado === 'APROBADA' ? aprobadas : enProceso).add(c.idEmpleado);
    }
    // Una persona con más de una solicitud cuenta solo una vez; prima la aprobada.
    for (const id of aprobadas) enProceso.delete(id);
    lineaTiempo.push({
      fecha,
      aprobadas: aprobadas.size,
      enProceso: enProceso.size,
      ausentes: aprobadas.size + enProceso.size,
    });
  }
  const maximoAusentes = Math.max(0, ...lineaTiempo.map((d) => d.ausentes));
  const informe = {
    idSolicitud: solicitud.id,
    inicio: solicitud.inicio,
    fin: solicitud.fin,
    colisiones,
    ocupacion: {
      tamanoEquipo,
      maximoAusentes,
      fechaMaximo: lineaTiempo.find((d) => d.ausentes === maximoAusentes)?.fecha ?? null,
    },
    lineaTiempo,
  };
  return {
    ...informe,
    revision: createHash('sha256').update(JSON.stringify(informe)).digest('hex'),
  };
}
export type InformeColisiones = ReturnType<typeof resumirColisiones>;
export type AprobacionColisiones = InformeColisiones & {
  confirmadoPor: number;
  confirmadoEn: string;
};
