import type { Dia } from '../api/catalogos';
import { InputField } from '../../../components/forms/Field';
import { NumberField, SelectField } from '../../../components/forms';
import { diasIniciales } from '../api/validacion';
const nombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export function HorarioEditor({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  error?: string | undefined;
}) {
  const dias = JSON.parse(value) as Dia[];
  const cambiar = (i: number, cambio: Partial<Dia>) =>
    onChange(JSON.stringify(dias.map((d, j) => (i === j ? { ...d, ...cambio } : d))));
  return (
    <fieldset className="col-span-12 espacio-horario" data-tour="horario-dias" disabled={disabled}>
      <legend className="font-bold text-primario">Distribución semanal</legend>
      <p className="my-3 text-sm">
        Configura cada día; las horas diarias se calculan al restar el descanso. Marca el cruce de
        medianoche para turnos nocturnos.
      </p>
      {dias.map((d, i) => {
        const minuto = (v: string | null) =>
          v && /^\d{2}:\d{2}$/.test(v) ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3)) : NaN;
        const horas =
          (minuto(d.salida) +
            (d.cruzaMedianoche ? 1440 : 0) -
            minuto(d.entrada) -
            d.minutosDescanso) /
          60;
        return (
          <section key={d.diaSemana} className="horario-dia">
            <div className="form-grid">
              <SelectField
                name={`laborable-${i}`}
                label={nombres[i]!}
                hint="Selecciona si se trabaja este día."
                value={d.laborable ? '1' : '0'}
                onValueChange={(v) =>
                  cambiar(i, v === '1' ? { laborable: true } : { ...diasIniciales[i]! })
                }
                opciones={[
                  { value: '1', label: 'Laborable' },
                  { value: '0', label: 'Descanso' },
                ]}
                disabled={disabled}
                ancho="corto"
              />
              {d.laborable && (
                <>
                  {(['entrada', 'salida'] as const).map((tipo) => (
                    <InputField
                      key={tipo}
                      name={`${tipo}-${i}`}
                      label={`${tipo === 'entrada' ? 'Entrada' : 'Salida'} · ${nombres[i]}`}
                      hint="Hora de 24 horas. Ejemplo: 08:00."
                      value={d[tipo] ?? ''}
                      onValueChange={(v) => cambiar(i, { [tipo]: v || null })}
                      maxLength={5}
                      inputMode="numeric"
                      pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                      placeholder="hh:mm"
                      ancho="corto"
                      required
                      disabled={disabled}
                      sanitizar={(v) => {
                        const n = v.replace(/\D/g, '').slice(0, 4);
                        return n.length > 2 ? `${n.slice(0, 2)}:${n.slice(2)}` : n;
                      }}
                      validar={(v) =>
                        /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
                          ? undefined
                          : 'Ingresa una hora válida (hh:mm).'
                      }
                    />
                  ))}
                  <NumberField
                    name={`descanso-${i}`}
                    label={`Descanso · ${nombres[i]}`}
                    hint="Minutos sin trabajo dentro del turno. Ejemplo: 60."
                    value={String(d.minutosDescanso)}
                    onValueChange={(v) => cambiar(i, { minutosDescanso: Number(v) })}
                    min="0"
                    max="1439"
                    disabled={disabled}
                  />
                  <SelectField
                    name={`cruza-${i}`}
                    label={`Cruza medianoche · ${nombres[i]}`}
                    hint="Sí cuando la salida ocurre al día siguiente."
                    value={d.cruzaMedianoche ? '1' : '0'}
                    onValueChange={(v) => cambiar(i, { cruzaMedianoche: v === '1' })}
                    opciones={[
                      { value: '0', label: 'No' },
                      { value: '1', label: 'Sí' },
                    ]}
                    disabled={disabled}
                    ancho="corto"
                  />
                  <p className="col-span-12 text-sm font-bold" aria-live="polite">
                    Horas efectivas:{' '}
                    {Number.isFinite(horas) && horas > 0 && horas <= 24
                      ? horas.toFixed(2)
                      : 'Revisa las horas ingresadas'}
                  </p>
                </>
              )}
            </div>
          </section>
        );
      })}
      {error && (
        <p role="alert" className="campo-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
