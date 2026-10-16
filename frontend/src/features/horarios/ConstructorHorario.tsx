import { useQuery } from '@tanstack/react-query';
import {
  analizarHorario,
  horaTexto,
  jornadaBloque,
  minutosEfectivos,
  nombresDias,
} from '../../../../backend/src/shared/horarios/modelo';
import type { BloqueHorario } from '../../../../backend/src/shared/horarios/modelo';
import { restricciones } from '../catalogos/api/catalogos';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/forms/Field';
const atajos = [
  { nombre: 'Lun–Vie', dias: [1, 2, 3, 4, 5] },
  { nombre: 'Lun–Sáb', dias: [1, 2, 3, 4, 5, 6] },
  { nombre: 'Lun–Dom', dias: [1, 2, 3, 4, 5, 6, 7] },
  { nombre: 'Fin de semana', dias: [6, 7] },
];
const horas = Array.from({ length: 48 }, (_, i) => horaTexto(i * 30));
export const bloqueInicial = (): BloqueHorario => ({
  dias: [1, 2, 3, 4, 5],
  entrada: '08:00',
  salida: '17:00',
  minutosDescanso: 60,
  cruzaMedianoche: false,
});
export function ConstructorHorario({
  value,
  onChange,
  disabled = false,
  error,
}: {
  value: BloqueHorario[];
  onChange: (bloques: BloqueHorario[]) => void;
  disabled?: boolean;
  error?: string | undefined;
}) {
  const reglas = useQuery({
    queryKey: ['catalogos', 'restricciones'],
    queryFn: ({ signal }) => restricciones(signal),
  });
  const resultado = analizarHorario(value, reglas.data?.limitesHorario ?? undefined, !disabled);
  const cambiar = (i: number, cambio: Partial<BloqueHorario>) =>
    onChange(value.map((b, j) => (j === i ? { ...b, ...cambio } : b)));
  return (
    <fieldset className="col-span-12 min-w-0" data-tour="horario-bloques" disabled={disabled}>
      <legend className="font-bold text-primario">Constructor de horario por bloques</legend>
      <p className="my-3 text-sm">
        Selecciona rangos o combina días. Los días sin bloques son descansos. Para salir al día
        siguiente activa Cruza medianoche.
      </p>
      {value.map((b, i) => (
        <section
          className="my-4 rounded-lg border border-borde p-4"
          key={i}
          aria-label={`Bloque ${i + 1}`}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3>Bloque {i + 1}</h3>
            <Button
              icono="eliminar"
              variante="texto"
              disabled={disabled}
              onClick={() => onChange(value.filter((_, j) => i !== j))}
            >
              Quitar bloque {i + 1}
            </Button>
          </div>
          <Field
            id={`dias-bloque-${i}`}
            label={`Días del bloque ${i + 1}`}
            hint="Usa un atajo y ajusta los chips. Los días elegidos comparten las mismas horas y descanso."
            required
            ancho="ancho"
          >
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={`Rangos del bloque ${i + 1}`}
            >
              {atajos.map((a) => (
                <Button
                  key={a.nombre}
                  icono="calendario"
                  variante="secundario"
                  disabled={disabled}
                  onClick={() => cambiar(i, { dias: [...a.dias] })}
                >
                  {a.nombre}
                </Button>
              ))}
              <Button
                icono="editar"
                variante="secundario"
                disabled={disabled}
                onClick={() => document.getElementById(`dia-bloque-${i}-1`)?.focus()}
              >
                Personalizado
              </Button>
            </div>
            <div
              id={`dias-bloque-${i}`}
              aria-describedby={`dias-bloque-${i}-hint`}
              className="my-3 flex flex-wrap gap-2"
              role="group"
              aria-label={`Días del bloque ${i + 1}`}
            >
              {nombresDias.map((nombre, j) => (
                <Button
                  id={`dia-bloque-${i}-${j + 1}`}
                  key={nombre}
                  icono="calendario"
                  variante={b.dias.includes(j + 1) ? 'primario' : 'secundario'}
                  aria-pressed={b.dias.includes(j + 1)}
                  disabled={disabled}
                  onClick={() =>
                    cambiar(i, {
                      dias: b.dias.includes(j + 1)
                        ? b.dias.filter((d) => d !== j + 1)
                        : [...b.dias, j + 1].sort(),
                    })
                  }
                >
                  {nombre}
                </Button>
              ))}
            </div>
          </Field>
          <div className="form-grid">
            {(['entrada', 'salida'] as const).map((tipo) => {
              const opciones = horas.includes(b[tipo]) ? horas : [...horas, b[tipo]].sort();
              return (
                <Field
                  key={tipo}
                  id={`${tipo}-bloque-${i}`}
                  label={`${tipo === 'entrada' ? 'Entrada' : 'Salida'} · bloque ${i + 1}`}
                  hint="Selecciona una hora de 24 horas en intervalos de 30 minutos. No admite texto libre."
                  required
                  ancho="corto"
                >
                  <select
                    aria-label={`${tipo === 'entrada' ? 'Entrada' : 'Salida'} · bloque ${i + 1}`}
                    id={`${tipo}-bloque-${i}`}
                    aria-describedby={`${tipo}-bloque-${i}-hint`}
                    required
                    className="horario-select"
                    value={b[tipo]}
                    disabled={disabled}
                    onChange={(e) => cambiar(i, { [tipo]: e.target.value })}
                  >
                    {opciones.map((h) => (
                      <option key={h} value={h}>
                        {h}
                        {!horas.includes(h) ? ' (histórico)' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            })}
            <Field
              id={`descanso-bloque-${i}`}
              label={`Descanso · bloque ${i + 1}`}
              hint="Minutos sin trabajo dentro del bloque; se restan de las horas efectivas."
              required
              ancho="corto"
            >
              <select
                aria-label={`Descanso · bloque ${i + 1}`}
                id={`descanso-bloque-${i}`}
                aria-describedby={`descanso-bloque-${i}-hint`}
                required
                className="horario-select"
                value={b.minutosDescanso}
                disabled={disabled}
                onChange={(e) => cambiar(i, { minutosDescanso: Number(e.target.value) })}
              >
                {![30, 60].includes(b.minutosDescanso) && (
                  <option value={b.minutosDescanso}>{b.minutosDescanso} min (histórico)</option>
                )}
                <option value={30}>30 minutos</option>
                <option value={60}>60 minutos</option>
              </select>
            </Field>
            <Field
              id={`cruce-bloque-${i}`}
              label={`Cruza medianoche · bloque ${i + 1}`}
              hint="Elige Sí si la salida ocurre al día siguiente. Se revisan solapes con el turno siguiente."
              ancho="corto"
            >
              <select
                aria-label={`Cruza medianoche · bloque ${i + 1}`}
                id={`cruce-bloque-${i}`}
                aria-describedby={`cruce-bloque-${i}-hint`}
                className="horario-select"
                value={b.cruzaMedianoche ? '1' : '0'}
                disabled={disabled}
                onChange={(e) => cambiar(i, { cruzaMedianoche: e.target.value === '1' })}
              >
                <option value="0">No</option>
                <option value="1">Sí, sale al día siguiente</option>
              </select>
            </Field>
            <p className="col-span-12 font-bold" aria-live="polite">
              Horas diarias del bloque: {Math.max(0, minutosEfectivos(b) / 60).toFixed(2)} · Jornada{' '}
              {jornadaBloque(b).toLowerCase()}
            </p>
          </div>
        </section>
      ))}
      <Button
        icono="crear"
        variante="secundario"
        disabled={disabled || value.length >= 28}
        onClick={() => onChange([...value, bloqueInicial()])}
      >
        Agregar bloque
      </Button>
      <div
        className="my-4 rounded-lg bg-superficie p-3"
        data-tour="horario-totales"
        aria-live="polite"
      >
        <p className="font-bold">
          Horas semanales: {resultado.horasSemanales.toFixed(2)} · Jornada{' '}
          {resultado.jornada.toLowerCase()}
        </p>
        <p>
          Descansos: {resultado.descansos.map((d) => nombresDias[d - 1]).join(', ') || 'Ninguno'}
        </p>
        {reglas.data?.limitesHorario && (
          <p className="text-sm">
            Límites vigentes:{' '}
            {Object.entries(reglas.data.limitesHorario)
              .map(([j, l]) => `${j.toLowerCase()} ${l.diarias} h/día y ${l.semanales} h/semana`)
              .join('; ')}
            .
          </p>
        )}
        {reglas.isPending && <p>Consultando límites vigentes…</p>}
        {(reglas.error || (reglas.isSuccess && !reglas.data.limitesHorario)) && (
          <p role="alert">
            {reglas.error?.message ??
              'Faltan límites vigentes. Completa Parámetros legales antes de guardar.'}
            <Button icono="actualizar" variante="texto" onClick={() => void reglas.refetch()}>
              Reintentar
            </Button>
          </p>
        )}
      </div>
      {!!(error || resultado.errores.length) && (
        <div className="campo-error" role="alert">
          <ul>
            {[...new Set([error, ...resultado.errores].filter(Boolean))].map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
}
