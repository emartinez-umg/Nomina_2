import { FormGrid } from '../../../components/forms/FormGrid';
import { useFormDraft } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/nomina';
import {
  DateField,
  NumberField,
  MoneyField,
  SelectField,
  TextField,
  TextAreaField,
  FormErrorSummary,
} from '../../../components/forms';
import { Button } from '../../../components/ui/Button';
import { ReferenciaNovedad } from '../../novedades/pages/CampoNovedad';
import { mapearErrores } from '../../../lib/http';
import { hoyGuatemala, fechaVisible, fechaSchema } from '../../../lib/validadores';
import { useToast } from '../../../components/ui/Toast';
const schema = z.object({
  operacion: z.string(),
  idEmpleado: z.string().min(1, 'Selecciona un empleado.'),
  anio: z.string().regex(/^\d{4}$/, 'Ingresa un año de cuatro dígitos.'),
  fecha: fechaSchema,
  monto: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Ingresa el monto con dos decimales.'),
  igss: z.string(),
  isr: z.string(),
  idTipo: z.string(),
  referencia: z.string(),
  motivo: z.string().trim().min(10, 'Explica el origen con al menos 10 caracteres.').max(500),
});
type Datos = z.infer<typeof schema>;
export function Fiscal() {
  const cache = useQueryClient(),
    toast = useToast(),
    [confirmar, setConfirmar] = useState(false),
    [error, setError] = useState('');
  const form = useForm<Datos>({
      resolver: zodResolver(schema),
      mode: 'onBlur',
      defaultValues: {
        operacion: 'aperturas',
        idEmpleado: '',
        anio: hoyGuatemala().slice(0, 4),
        fecha: '',
        monto: '',
        igss: '0',
        isr: '0',
        idTipo: '',
        referencia: '',
        motivo: '',
      },
    }),
    id = form.watch('idEmpleado'),
    anio = form.watch('anio');
  const tipo = form.watch('operacion');
  const setTipo = (v: string) => form.setValue('operacion', v, { shouldDirty: true });
  const draft = useFormDraft('fiscal', undefined, {
    form,
    version: 1,
    alDescartar: () => {
      setConfirmar(false);
      setError('');
    },
  });
  useEffect(() => {
    const subscription = form.watch(() => setConfirmar(false));
    return () => subscription.unsubscribe();
  }, [form]);
  const tipos = useQuery({ queryKey: ['nomina', 'tipos-isr'], queryFn: api.tipos });
  const datos = useQuery({
    queryKey: ['nomina', 'fiscal', id, anio],
    queryFn: () => api.fiscal(id, anio),
    enabled: !!id && /^\d{4}$/.test(anio),
  });
  const guardar = useMutation({
    mutationFn: (d: Datos) => {
      const comun = {
        idEmpleado: Number(d.idEmpleado),
        anio: Number(d.anio),
        fecha: d.fecha,
        monto: d.monto,
        motivo: d.motivo,
        confirmado: true,
      };
      return api.guardarFiscal(
        tipo,
        tipo === 'aperturas'
          ? { ...comun, igss: d.igss, isr: d.isr }
          : { ...comun, idTipo: Number(d.idTipo), referencia: d.referencia },
      );
    },
    onSuccess: () => {
      draft.limpiar();
      setConfirmar(false);
      toast('Datos fiscales registrados. Recalcula las quincenas abiertas.');
      void cache.invalidateQueries({ queryKey: ['nomina'] });
    },
    onError: (e) => {
      setError(e.message);
      mapearErrores(e, form.setError, [
        'idEmpleado',
        'anio',
        'fecha',
        'monto',
        'igss',
        'isr',
        'idTipo',
        'referencia',
        'motivo',
      ]);
    },
  });
  return (
    <section data-tour="nomina-fiscal">
      <FormDraftNotice draft={draft} />
      <p className="campo-hint my-4">
        Registra únicamente importes acreditados. La apertura certifica pagos anteriores al sistema
        y se permite una sola vez por empleado/año, antes de aprobar su primera nómina.
      </p>
      <FormGrid>
        <SelectField
          name="operacion"
          label="Operación fiscal"
          hint="Apertura de acumulados anteriores o deducción con comprobante."
          value={tipo}
          onValueChange={(v) => {
            setTipo(v || 'aperturas');
            setConfirmar(false);
          }}
          opciones={[
            { value: 'aperturas', label: 'Apertura de acumulados' },
            { value: 'deducciones', label: 'Deducción acreditada' },
          ]}
        />
      </FormGrid>
      <form
        onSubmit={form.handleSubmit((d) => {
          setError('');
          if (tipo === 'deducciones' && (!d.idTipo || d.referencia.length < 3)) {
            setError('Selecciona el tipo y escribe una referencia de al menos 3 caracteres.');
            return;
          }
          if (confirmar) guardar.mutate(d);
          else setConfirmar(true);
        })}
        noValidate
      >
        <FormGrid className="my-4">
          <Controller
            control={form.control}
            name="idEmpleado"
            render={({ field, fieldState }) => (
              <div className="contents">
                <ReferenciaNovedad
                  referencia="empleados"
                  soloActivos={false}
                  label="Empleado"
                  hint="Expediente al que pertenecen los comprobantes."
                  name={field.name}
                  value={field.value}
                  onValueChange={field.onChange}
                  error={fieldState.error?.message}
                />
              </div>
            )}
          />
          <Controller
            control={form.control}
            name="anio"
            render={({ field, fieldState }) => (
              <NumberField
                label="Año fiscal"
                hint="Año de los ingresos o deducciones."
                min="2000"
                max="9999"
                name={field.name}
                value={field.value}
                onBlur={field.onBlur}
                onValueChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="fecha"
            render={({ field, fieldState }) => (
              <DateField
                label={tipo === 'aperturas' ? 'Corte de acumulados' : 'Fecha de comprobante'}
                hint={
                  tipo === 'aperturas'
                    ? 'Último día de la quincena anterior a la primera nómina del sistema.'
                    : 'Fecha real del comprobante dentro del año fiscal.'
                }
                name={field.name}
                value={field.value}
                onBlur={field.onBlur}
                onValueChange={field.onChange}
                required
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="monto"
            render={({ field, fieldState }) => (
              <MoneyField
                label={tipo === 'aperturas' ? 'Renta gravada acumulada' : 'Monto acreditado'}
                hint={
                  tipo === 'aperturas'
                    ? 'Ingresos afectos a ISR ya pagados, excluyendo rentas exentas.'
                    : 'Monto total del comprobante; el motor aplicará el tope vigente.'
                }
                name={field.name}
                value={field.value}
                onBlur={field.onBlur}
                onValueChange={field.onChange}
                required
                error={fieldState.error?.message}
              />
            )}
          />
          {tipo === 'aperturas' ? (
            <>
              {(['igss', 'isr'] as const).map((k) => (
                <Controller
                  key={k}
                  control={form.control}
                  name={k}
                  render={({ field, fieldState }) => (
                    <MoneyField
                      label={k === 'igss' ? 'IGSS acumulado' : 'ISR retenido acumulado'}
                      hint="Importe real ya descontado hasta la fecha de corte."
                      name={field.name}
                      value={field.value}
                      onBlur={field.onBlur}
                      onValueChange={field.onChange}
                      required
                      error={fieldState.error?.message}
                    />
                  )}
                />
              ))}
            </>
          ) : (
            <>
              <Controller
                control={form.control}
                name="idTipo"
                render={({ field, fieldState }) => (
                  <SelectField
                    label="Tipo de deducción"
                    hint="Clasificación legal del comprobante acreditado."
                    opciones={(tipos.data ?? []).map((t) => ({
                      value: String(t.id),
                      label: t.nombre,
                    }))}
                    name={field.name}
                    value={field.value}
                    onBlur={field.onBlur}
                    onValueChange={field.onChange}
                    required
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="referencia"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Referencia del comprobante"
                    hint="Número único por empleado, año y tipo."
                    tipo="referencia"
                    maxLength={100}
                    name={field.name}
                    value={field.value}
                    onBlur={field.onBlur}
                    onValueChange={field.onChange}
                    required
                    error={fieldState.error?.message}
                  />
                )}
              />
            </>
          )}
          <Controller
            control={form.control}
            name="motivo"
            render={({ field, fieldState }) => (
              <TextAreaField
                label="Origen y motivo"
                hint="Explica el origen de los importes y su acreditación; mínimo 10 caracteres."
                name={field.name}
                value={field.value}
                onBlur={field.onBlur}
                onValueChange={field.onChange}
                required
                maxLength={500}
                error={fieldState.error?.message}
              />
            )}
          />
        </FormGrid>
        <FormErrorSummary
          mensajes={[error, ...Object.values(form.formState.errors).map((v) => v.message)]}
        />
        {confirmar && (
          <p role="status" className="banda-informativa my-4">
            Confirma los importes y el corte mostrados. Una apertura no se puede duplicar ni
            sustituir historia ya cerrada.
          </p>
        )}
        <Button type="submit" icono="guardar" cargando={guardar.isPending}>
          {confirmar ? 'Confirmar registro' : 'Revisar importes'}
        </Button>
        {confirmar && (
          <Button icono="cancelar" variante="texto" onClick={() => setConfirmar(false)}>
            Volver a editar
          </Button>
        )}
      </form>
      {datos.error && <p role="alert">{datos.error.message}</p>}
      {datos.data && (
        <div className="table-scroll my-5">
          <table>
            <caption>Datos fiscales del empleado y año seleccionados</caption>
            <thead>
              <tr>
                <th>Registro</th>
                <th>Fecha</th>
                <th>Monto</th>
                <th>Referencia / motivo</th>
              </tr>
            </thead>
            <tbody>
              {datos.data.aperturas.map((a) => (
                <tr key={a.fecha}>
                  <td>
                    Apertura: renta {a.renta} · IGSS {a.igss} · ISR {a.isr}
                  </td>
                  <td>{fechaVisible(a.fecha)}</td>
                  <td>{a.renta}</td>
                  <td>{a.motivo}</td>
                </tr>
              ))}
              {datos.data.deducciones.map((d, i) => (
                <tr key={i}>
                  <td>{d.tipo}</td>
                  <td>{fechaVisible(d.fecha)}</td>
                  <td>{d.monto}</td>
                  <td>{d.referencia}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!datos.data.aperturas.length && !datos.data.deducciones.length && (
            <p>
              No hay comprobantes ni apertura registrados. Usa el formulario para incorporar la
              historia acreditada.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
