import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { reglas, detalle, crear, editar } from '../api/empleados';
import type { Empleado, Reglas, Credencial } from '../api/empleados';
import { secciones, todosCampos, iniciales, schemaFormulario, cuerpo } from '../api/formulario';
import { CampoEmpleado } from './CampoEmpleado';
import { Credenciales } from './Credenciales';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { TextAreaField, DateField, FormErrorSummary } from '../../../components/forms';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { useToast } from '../../../components/ui/Toast';
import { useSession } from '../../../app/session';
import { fechaValida } from '../../../lib/validadores';
import { mapearErrores } from '../../../lib/http';
import { ayudaEmpleados } from '../help/pasos';
const ayuda = ayudaEmpleados('formulario');
export function EmpleadoFormularioPage() {
  const { id } = useParams();
  const { usuario } = useSession();
  usePageHelp(ayuda, usuario?.rol);
  const r = useQuery({
    queryKey: ['empleados', 'reglas'],
    queryFn: ({ signal }) => reglas(signal),
  });
  const d = useQuery({
    queryKey: ['empleados', 'detalle', id],
    queryFn: ({ signal }) => detalle(Number(id), signal),
    enabled: !!id,
  });
  if (r.isPending || (id && d.isPending)) return <Skeleton lineas={8} />;
  const error = r.error ?? d.error;
  if (error)
    return (
      <EmptyState
        titulo="No se pudo abrir el formulario"
        descripcion={error.message}
        accion={
          <Button
            icono="actualizar"
            onClick={() => {
              void r.refetch();
              if (id) void d.refetch();
            }}
          >
            Reintentar
          </Button>
        }
      />
    );
  if (d.data?.estado === 'EGRESADO')
    return (
      <EmptyState
        titulo="Expediente egresado"
        descripcion="Este expediente se conserva para consulta."
      />
    );
  return <Formulario key={id ?? 'nuevo'} reglas={r.data!} actual={d.data} />;
}
function Formulario({ reglas: r, actual }: { reglas: Reglas; actual: Empleado | undefined }) {
  const nav = useNavigate(),
    cliente = useQueryClient(),
    toast = useToast();
  const [error, setErrorGeneral] = useState(''),
    [credenciales, setCredenciales] = useState<Credencial[] | null>(null);
  const [destino, setDestino] = useState('');
  const resolver = useMemo(() => zodResolver(schemaFormulario(r, !!actual)), [r, actual]);
  const {
    control,
    watch,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>({
    mode: 'onBlur',
    resolver,
    defaultValues: iniciales(actual),
  });
  const vals = watch();
  const reglaSalario = useQuery({
    queryKey: ['empleados', 'reglas', vals.fechaIngreso],
    queryFn: ({ signal }) => reglas(signal, vals.fechaIngreso),
    enabled: fechaValida(vals.fechaIngreso ?? ''),
  });
  const minimo =
    reglaSalario.data?.salarioMinimo ?? (vals.fechaIngreso === r.hoy ? r.salarioMinimo : null);
  const bajo =
    !!minimo &&
    /^\d+(\.\d{1,2})?$/.test((vals.salarioBase ?? '').replace(/,/g, '')) &&
    new Decimal(vals.salarioBase!.replace(/,/g, '')).lt(minimo!);
  return (
    <>
      <div className="my-4 flex justify-between gap-3">
        <h1>{actual ? 'Editar empleado' : 'Nuevo empleado'}</h1>
        <Link className="enlace-icono" to={actual ? `/empleados/${actual.id}` : '/empleados'}>
          Volver a empleados
        </Link>
      </div>

      <form
        noValidate
        onSubmit={handleSubmit(async (d) => {
          if (isSubmitting) return;
          setErrorGeneral('');
          try {
            let id: number;
            if (actual) {
              const saved = await editar(actual.id, cuerpo(d, true));
              id = saved.id;
            } else {
              const saved = await crear(cuerpo(d));
              id = saved.empleado.id;
              if (saved.credenciales) setCredenciales([saved.credenciales]);
              for (const aviso of saved.advertencias) toast(aviso, 'peligro');
            }
            await cliente.invalidateQueries({ queryKey: ['empleados'] });
            toast('Expediente guardado y auditado.');
            const path = `/empleados/${id}`;
            if (!actual && d.generarUsuario === 'true') setDestino(path);
            else nav(path);
          } catch (e) {
            mapearErrores(e, setError, [
              ...todosCampos.map((f) => f.nombre),
              'motivo',
              'fechaHorario',
            ]);
            setErrorGeneral(e instanceof Error ? e.message : 'No se pudo guardar.');
          }
        })}
      >
        {secciones.map((s, i) => (
          <section className="mb-5" key={s.titulo} data-tour={`empleado-seccion-${i}`}>
            <Card>
              <h2 className="mb-4">{s.titulo}</h2>
              {i === 2 && (
                <p className={bajo ? 'alerta mb-4' : 'campo-hint mb-4'}>
                  {actual
                    ? 'Utiliza Cambiar salario en la ficha para registrar una nueva vigencia.'
                    : reglaSalario.isFetching
                      ? 'Consultando mínimo vigente…'
                      : reglaSalario.error
                        ? `No se pudo consultar el mínimo: ${reglaSalario.error.message}`
                        : minimo
                          ? `Mínimo mensual parametrizado: Q ${minimo}.${bajo ? ' Advertencia: el salario ingresado es inferior al mínimo.' : ''}`
                          : 'No hay mínimo mensual parametrizado. RRHH debe configurar SALARIO_MINIMO_MENSUAL con unidad QUETZALES.'}
                </p>
              )}
              <div className="form-grid">
                {s.campos.map((f) => (
                  <div
                    key={f.nombre}
                    className={
                      f.ancho === 'ancho'
                        ? 'col-span-12'
                        : f.ancho === 'corto'
                          ? 'col-span-12 md:col-span-4'
                          : 'col-span-12 md:col-span-6'
                    }
                  >
                    <Controller
                      name={f.nombre}
                      control={control}
                      render={({ field }) => (
                        <CampoEmpleado
                          campo={f}
                          name={field.name}
                          label={f.label}
                          hint={f.hint}
                          placeholder={f.hint.split('.')[0] ?? ''}
                          value={field.value ?? ''}
                          onValueChange={(v) => {
                            field.onChange(v);
                          }}
                          onBlur={field.onBlur}
                          inputRef={field.ref}
                          required={!!f.required}
                          disabled={
                            isSubmitting ||
                            (!!actual && ['fechaIngreso', 'salarioBase'].includes(f.nombre))
                          }
                          error={errors[f.nombre]?.message}
                          ancho={f.ancho ?? 'medio'}
                          reglas={r}
                          nacimiento={vals.fechaNacimiento}
                          ingreso={vals.fechaIngreso}
                          departamento={
                            ['idPuesto', 'idJefatura'].includes(f.nombre)
                              ? vals.idDepartamento
                              : undefined
                          }
                        />
                      )}
                    />
                  </div>
                ))}
              </div>
              {i === 1 && actual && (
                <div className="form-grid mt-4">
                  <div className="col-span-12 md:col-span-4">
                    <Controller
                      name="fechaHorario"
                      control={control}
                      render={({ field }) => (
                        <DateField
                          name={field.name}
                          label="Fecha efectiva de horario"
                          hint="Solo si cambias horario. Posterior al último cambio y al último periodo cerrado."
                          value={field.value ?? ''}
                          onValueChange={field.onChange}
                          error={errors.fechaHorario?.message}
                          disabled={isSubmitting}
                          min={r.ultimoCierre ? r.ultimoCierre : (actual.fechaIngreso as string)}
                        />
                      )}
                    />
                  </div>
                </div>
              )}
            </Card>
          </section>
        ))}
        <Card>
          {!actual ? (
            <div data-tour="empleado-usuario">
              <Controller
                name="generarUsuario"
                control={control}
                render={({ field }) => (
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={field.value === 'true'}
                      onChange={(e) => field.onChange(String(e.target.checked))}
                      disabled={isSubmitting}
                    />
                    Generar usuario de empleado y contraseña temporal
                  </label>
                )}
              />
              <p className="campo-hint">
                Usuario nombre.apellido. La contraseña se muestra una sola vez; cambio obligatorio
                en el primer inicio.
              </p>
            </div>
          ) : (
            <Controller
              name="motivo"
              control={control}
              render={({ field }) => (
                <TextAreaField
                  name={field.name}
                  label="Motivo de edición"
                  hint="Explica el cambio con 5–500 caracteres. Queda registrado con tu usuario."
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.motivo?.message}
                  required
                  disabled={isSubmitting}
                  maxLength={500}
                />
              )}
            />
          )}
          <FormErrorSummary
            mensajes={Object.values(errors).map((e) => e?.message)}
            mensajeServidor={error}
          />
          <div className="mt-5 flex justify-end gap-3" data-tour="empleado-guardar">
            <Button
              icono="cancelar"
              variante="secundario"
              disabled={isSubmitting}
              onClick={() => nav(actual ? `/empleados/${actual.id}` : '/empleados')}
            >
              Cancelar
            </Button>
            <Button type="submit" icono="guardar" cargando={isSubmitting}>
              Guardar empleado
            </Button>
          </div>
        </Card>
      </form>
      {credenciales && (
        <Credenciales
          datos={credenciales}
          onCerrar={() => {
            setCredenciales(null);
            nav(destino);
          }}
        />
      )}
    </>
  );
}
