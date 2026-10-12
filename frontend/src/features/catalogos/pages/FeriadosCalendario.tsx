import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import type { Fila } from '../api/catalogos';
import { Button } from '../../../components/ui/Button';
import { fechaVisible } from '../../../lib/validadores';
const meses = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
export function FeriadosCalendario({
  filas,
  anio,
  onVer,
}: {
  filas: Fila[];
  anio: number;
  onVer: (fila: Fila) => void;
}) {
  const fechas = filas.filter((f) => f.activo).map((f) => new Date(`${f.fecha}T12:00:00`));
  const hora = (min: unknown) =>
    `${String(Math.floor(Number(min) / 60)).padStart(2, '0')}:${String(Number(min) % 60).padStart(2, '0')}`;
  return (
    <section
      data-tour="feriados-calendario"
      className="mt-6"
      aria-label={`Calendario de feriados ${anio}`}
    >
      <h2>Calendario anual · {anio}</h2>
      <p className="my-3 text-sm text-secundario">
        Feriados activos de la consulta. Selecciona Ver para consultar ámbito, franja y fundamento.
      </p>
      <div className="calendario-anual">
        {meses.map((mes, i) => {
          const delMes = filas.filter(
            (f) =>
              f.activo &&
              String(f.fecha).slice(0, 7) === `${anio}-${String(i + 1).padStart(2, '0')}`,
          );
          return (
            <article className="mes-feriados" key={mes}>
              <h3 className="font-bold">{mes}</h3>
              <DayPicker
                month={new Date(anio, i, 1, 12)}
                locale={es}
                hideNavigation
                disableNavigation
                modifiers={{ feriado: fechas }}
                modifiersClassNames={{ feriado: 'dia-feriado' }}
                components={{
                  DayButton: ({ day, modifiers }) => (
                    <span
                      aria-label={`${day.date.getDate()}${modifiers.feriado ? ' · Feriado' : ''}`}
                    >
                      {day.date.getDate()}
                    </span>
                  ),
                }}
              />
              {delMes.length ? (
                delMes.map((f) => (
                  <div key={f.id} className="feriado-resumen">
                    <strong>
                      {fechaVisible(String(f.fecha))} · {String(f.nombre)}
                    </strong>
                    <p>
                      {String(f.ambito)}
                      {f.ambito === 'LOCAL' ? ` · ${f.localidad}` : ''} · {hora(f.minutoInicio)}–
                      {hora(f.minutoFin)}
                    </p>
                    <Button icono="ver" variante="texto" onClick={() => onVer(f)}>
                      Ver {String(f.nombre)}
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-secundario">Sin feriados en la consulta.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
