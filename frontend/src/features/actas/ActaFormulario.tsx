import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  actaSchema,
  validarFechaHecho,
  validarDiasSuspension,
} from '../../../../backend/src/shared/actas/modelo';
import { useFormDraft } from '../../hooks/useFormDraft';
import { useSession } from '../../app/session';
import { useTituloRegistro } from '../../app/titulos';
import { ErrorApi } from '../../lib/http';
import { fechaVisible } from '../../lib/validadores';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EstadoBadge } from '../../components/ui/EstadoBadge';
import { FormDraftNotice } from '../../components/forms/FormDraftNotice';
import {
  DateField,
  TextField,
  TextAreaField,
  SelectField,
  NumberField,
  FormErrorSummary,
} from '../../components/forms';
import { FormGrid } from '../../components/forms/FormGrid';
import { SelectorEmpleado } from '../../components/forms/SelectorEmpleado';
import { useToast } from '../../components/ui/Toast';
import { usePageHelp } from '../../components/help/HelpProvider';
import { ayudaActas } from './help/pasos';
import { useDepartamentos } from './ActasListado';
import * as api from './api';
const formularioSchema = actaSchema.extend({ departamento: z.string() });
type Formulario = z.infer<typeof formularioSchema>;
export function ActaFormularioPage() {
  const id = Number(useParams().id) || undefined,
    { usuario } = useSession();
  usePageHelp(ayudaActas(), usuario?.rol);
  const reglas = useQuery({
    queryKey: ['actas', usuario?.idUsuario, 'reglas'],
    queryFn: ({ signal }) => api.reglas(signal),
  });
  const detalle = useQuery({
    queryKey: ['actas', usuario?.idUsuario, 'detalle', id],
    queryFn: ({ signal }) => api.detalle(id!, signal),
    enabled: !!id,
    retry: false,
    gcTime: 0,
  });
  useTituloRegistro(detalle.data?.codigo);
  if (reglas.isPending || (id && detalle.isPending)) return <Skeleton lineas={8} />;
  const error = reglas.error ?? detalle.error;
  if (error)
    return (
      <div role="alert">
        <p>{error.message}</p>
        <Button
          icono="actualizar"
          onClick={() => {
            void reglas.refetch();
            if (id) void detalle.refetch();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  if (detalle.data && detalle.data.estado !== 'BORRADOR')
    return (
      <p role="alert">
        El acta ya fue emitida. Abre su detalle para consultar el PDF y registrar su firma.
      </p>
    );
  return (
    <EditorActa
      key={id ?? 'nueva'}
      reglas={reglas.data!}
      {...(detalle.data ? { actual: detalle.data } : {})}
    />
  );
}
function EditorActa({ reglas: r, actual }: { reglas: api.ReglasActas; actual?: api.Acta }) {
  const nav = useNavigate(),
    cliente = useQueryClient(),
    toast = useToast(),
    [url] = useSearchParams(),
    departamentos = useDepartamentos(),
    [pagina, setPagina] = useState(1),
    [error, setError] = useState(''),
    [ocupado, setOcupado] = useState(false);
  const form = useForm<Formulario>({
    mode: 'onBlur',
    resolver: zodResolver(formularioSchema),
    defaultValues: {
      idEmpleado: actual?.idEmpleado ?? Number(url.get('empleado') ?? 0),
      idTipo: actual?.idTipo ?? 0,
      fechaHecho: actual?.fechaHecho ?? r.hoy,
      lugar: actual?.lugar ?? '',
      descripcion: actual?.descripcion ?? '',
      testigos: actual?.testigos ?? '',
      norma: actual?.norma ?? '',
      medida: actual?.medida ?? '',
      descargos: actual?.descargos ?? '',
      diasSuspension: actual?.diasSuspension ?? 0,
      departamento: actual ? String(actual.idDepartamento) : '',
      ...(actual ? { version: actual.version } : {}),
    },
  });
  const draft = useFormDraft('acta', actual?.id, { form, version: 1 });
  const values = form.watch(),
    antecedentes = useQuery({
      queryKey: ['actas', 'antecedentes', values.idEmpleado, pagina],
      queryFn: ({ signal }) => api.antecedentes(values.idEmpleado, pagina, signal),
      enabled: values.idEmpleado > 0,
      retry: false,
      gcTime: 0,
    });
  const suspension = r.tipos.find((t) => t.id === values.idTipo)?.suspension === 1;
  const campos = useMemo(
    () => ['lugar', 'descripcion', 'testigos', 'norma', 'medida', 'descargos'] as const,
    [],
  );
  const etiquetas = {
    lugar: 'Lugar del hecho',
    descripcion: 'Descripción de los hechos',
    testigos: 'Testigos',
    norma: 'Norma o reglamento aplicado',
    medida: 'Medida adoptada',
    descargos: 'Descargos del empleado',
  };
  const hints = {
    lugar: 'Ubicación concreta del hecho, de 3 a 200 caracteres.',
    descripcion:
      'De 30 a 4,000 caracteres: explica qué ocurrió, cuándo y cómo. Revisa la exactitud antes de emitir.',
    testigos: 'Hasta 1,000 caracteres: nombres de las personas presentes; opcional.',
    norma: 'De 5 a 1,000 caracteres: identifica la regla interna aplicada.',
    medida: 'De 5 a 1,000 caracteres: describe la medida y su alcance.',
    descargos: 'Hasta 1,000 caracteres: respuesta del empleado; opcional.',
  };
  return (
    <>
      <h1>{actual ? `Editar ${actual.codigo}` : 'Nueva acta administrativa'}</h1>
      <Card>
        <FormDraftNotice draft={draft} />
        <p className="my-3">
          Código: <strong>{actual?.codigo ?? r.codigo}</strong>
          {!actual && ' · Vista previa; se asigna al guardar.'}
        </p>
        <form
          noValidate
          onSubmit={form.handleSubmit(async ({ departamento: _, ...d }) => {
            if (ocupado) return;
            setError('');
            form.clearErrors();
            if (!antecedentes.data || antecedentes.error) {
              setError('Consulta los antecedentes y la fecha de ingreso antes de guardar.');
              return;
            }
            const fecha = validarFechaHecho(d.fechaHecho, antecedentes.data.ingreso, r.hoy),
              dias = validarDiasSuspension(d.diasSuspension, suspension, r.maxDias);
            if (fecha) form.setError('fechaHecho', { message: fecha });
            if (dias) form.setError('diasSuspension', { message: dias });
            if (fecha || dias) return;
            setOcupado(true);
            try {
              const creado = await api.guardar(d, actual?.id);
              draft.limpiar();
              await cliente.invalidateQueries({ queryKey: ['actas'] });
              toast('Borrador de acta guardado. Ya puedes adjuntar evidencias y emitir.');
              nav(`/actas/${creado.id}`);
            } catch (e) {
              setError((e as Error).message);
              if (e instanceof ErrorApi)
                for (const [k, v] of Object.entries(e.campos ?? {}))
                  form.setError(k as keyof Formulario, { message: v.join(' ') });
            } finally {
              setOcupado(false);
            }
          })}
        >
          <fieldset disabled={ocupado}>
            <legend className="sr-only">Datos del acta</legend>
            <div data-tour="actas-empleado">
              <FormGrid>
                <Controller
                  name="departamento"
                  control={form.control}
                  render={({ field }) => (
                    <SelectField
                      name={field.name}
                      label="Departamento"
                      hint="Selecciona el área para filtrar empleados."
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        if (!actual) form.setValue('idEmpleado', 0, { shouldDirty: true });
                        setPagina(1);
                      }}
                      opciones={departamentos.data ?? []}
                      disabled={!!actual}
                      error={departamentos.error?.message}
                    />
                  )}
                />
                <Controller
                  name="idEmpleado"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <SelectorEmpleado
                      name={field.name}
                      label="Empleado"
                      hint="El empleado queda fijo después de guardar."
                      required
                      soloActivos={false}
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(v) => {
                        field.onChange(Number(v));
                        setPagina(1);
                      }}
                      onBlur={field.onBlur}
                      departamentoId={values.departamento}
                      disabled={!!actual}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  name="idTipo"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <SelectField
                      name={field.name}
                      label="Tipo de acta"
                      hint="La gravedad se define en Tipos de acta; suspensión exige días."
                      required
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(v) => {
                        field.onChange(Number(v));
                        form.setValue('diasSuspension', 0, { shouldDirty: true });
                      }}
                      onBlur={field.onBlur}
                      opciones={r.tipos
                        .filter((t) => t.activo !== 0 || t.id === actual?.idTipo)
                        .map((t) => ({
                          value: String(t.id),
                          label: t.nombre,
                          disabled: t.activo === 0,
                        }))}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  name="fechaHecho"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <DateField
                      name={field.name}
                      label="Fecha del hecho"
                      hint="Entre el ingreso del empleado y hoy, dd/mm/aaaa."
                      required
                      value={field.value}
                      onValueChange={field.onChange}
                      onBlur={() => {
                        field.onBlur();
                        const e =
                          antecedentes.data &&
                          validarFechaHecho(field.value, antecedentes.data.ingreso, r.hoy);
                        if (e) form.setError('fechaHecho', { message: e });
                      }}
                      {...(antecedentes.data ? { min: antecedentes.data.ingreso } : {})}
                      max={r.hoy}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </FormGrid>
              {values.idEmpleado > 0 && (
                <aside
                  className="my-5 rounded-xl border border-borde p-4"
                  aria-label="Antecedentes del empleado"
                >
                  <h2>Antecedentes de los últimos 12 meses</h2>
                  {antecedentes.isPending ? (
                    <Skeleton lineas={3} />
                  ) : antecedentes.error ? (
                    <div role="alert">
                      {antecedentes.error.message}
                      <Button icono="actualizar" onClick={() => void antecedentes.refetch()}>
                        Reintentar antecedentes
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="campo-hint">
                        Ingreso: {fechaVisible(antecedentes.data!.ingreso)}.{' '}
                        {antecedentes.data!.total} acta(s), según fecha del hecho.
                      </p>
                      {antecedentes.data!.registros.map((a) => (
                        <p key={a.id} className="my-2">
                          {a.codigo} · {a.tipo} · {fechaVisible(a.fechaHecho)} ·{' '}
                          <EstadoBadge estado={a.estado} />
                        </p>
                      ))}
                      {antecedentes.data!.total === 0 && <p>No hay actas en este intervalo.</p>}
                      {antecedentes.data!.total > 20 && (
                        <div className="flex gap-3">
                          <Button
                            icono="anterior"
                            disabled={pagina === 1}
                            onClick={() => setPagina((p) => p - 1)}
                          >
                            Anteriores
                          </Button>
                          <span>Página {pagina}</span>
                          <Button
                            icono="siguiente"
                            disabled={pagina * 20 >= antecedentes.data!.total}
                            onClick={() => setPagina((p) => p + 1)}
                          >
                            Siguientes
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </aside>
              )}
            </div>
            <div data-tour="actas-hechos">
              <FormGrid>
                {campos.map((k) => (
                  <Controller
                    key={k}
                    name={k}
                    control={form.control}
                    render={({ field, fieldState }) => {
                      const props = {
                        name: field.name,
                        label: etiquetas[k],
                        hint: hints[k],
                        required: !['testigos', 'descargos'].includes(k),
                        value: field.value,
                        onValueChange: field.onChange,
                        onBlur: field.onBlur,
                        error: fieldState.error?.message,
                        maxLength: k === 'descripcion' ? 4000 : k === 'lugar' ? 200 : 1000,
                      };
                      return k === 'lugar' ? (
                        <TextField {...props} />
                      ) : (
                        <div className="col-span-12">
                          <TextAreaField {...props} />
                        </div>
                      );
                    }}
                  />
                ))}
              </FormGrid>
            </div>
            {suspension && (
              <div data-tour="actas-suspension" className="my-5">
                <Controller
                  name="diasSuspension"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <NumberField
                      name={field.name}
                      label="Días de suspensión"
                      hint={`Enteros de 1 a ${r.maxDias}. La ausencia opcional se confirma al emitir.`}
                      required
                      value={String(field.value || '')}
                      onValueChange={(v) => field.onChange(Number(v))}
                      onBlur={field.onBlur}
                      min="1"
                      max={String(r.maxDias)}
                      maxLength={3}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <p className="alerta my-3">
                  Revisa la medida y la política interna con RH. Máximo vigente: {r.maxDias} días.
                  El registro de la ausencia sin goce requiere confirmación al emitir.
                </p>
              </div>
            )}
            <FormErrorSummary
              mensajes={Object.values(form.formState.errors).flatMap((e) =>
                e.message ? [e.message] : [],
              )}
              mensajeServidor={error}
            />
            <p className="campo-hint my-3">
              El borrador del navegador conserva texto en este dispositivo. Los adjuntos se cargan
              después de guardar y no se incluyen en el borrador.
            </p>
            <div className="flex flex-wrap gap-3 mt-5">
              <Button
                icono="cancelar"
                variante="secundario"
                onClick={() => draft.cancelar(() => nav(actual ? `/actas/${actual.id}` : '/actas'))}
              >
                Cancelar
              </Button>
              <Button icono="guardar" type="submit" cargando={ocupado}>
                Guardar borrador
              </Button>
            </div>
          </fieldset>
        </form>
      </Card>
    </>
  );
}
