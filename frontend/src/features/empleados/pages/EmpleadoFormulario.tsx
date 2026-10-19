import { FormGrid } from '../../../components/forms/FormGrid';
import { AvisoEmpresa } from '../../empresa/pages/AvisoEmpresa';
import { CrearHorarioModal } from '../../horarios/CrearHorarioModal';
import { CampoCodigo } from '../../../components/forms/CampoCodigo';
import { useFormDraft } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { reglas, detalle, crear, editar, opciones, parentescos } from '../api/empleados';
import type { Empleado, Reglas, Credencial } from '../api/empleados';
import { secciones, todosCampos, iniciales, schemaFormulario, cuerpo } from '../api/formulario';
import { CampoEmpleado } from './CampoEmpleado';
import { Credenciales } from './Credenciales';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import {
  TextAreaField,
  DateField,
  FormErrorSummary,
  UbicacionSelect,
  ZonaSelect,
} from '../../../components/forms';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { useToast } from '../../../components/ui/Toast';
import { useSession } from '../../../app/session';
import { fechaValida } from '../../../lib/validadores';
import { mapearErrores } from '../../../lib/http';
import { municipiosGt } from '../../ubicaciones/api/ubicaciones';
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
  const [pdf, setPdf] = useState('');
  const [requiereFin, setRequiereFin] = useState<boolean | undefined>();
  const [codigoMunicipio, setCodigoMunicipio] = useState('');
  const [destino, setDestino] = useState('');
  const [crearHorario, setCrearHorario] = useState(false);
  const [seccionActual, setSeccionActual] = useState(0);
  const catalogoParentescos = useQuery({
    queryKey: ['empleados', 'parentescos'],
    queryFn: ({ signal }) => parentescos(signal),
  });
  const resolver = useMemo(
    () =>
      zodResolver(
        schemaFormulario(
          r,
          !!actual,
          requiereFin,
          codigoMunicipio,
          catalogoParentescos.data
            ? [
                ...catalogoParentescos.data.map((p) => p.value),
                ...(actual?.contactoParentesco ? [String(actual.contactoParentesco)] : []),
              ]
            : undefined,
        ),
      ),
    [r, actual, requiereFin, codigoMunicipio, catalogoParentescos.data],
  );
  const form = useForm<Record<string, string>>({
    mode: 'onBlur',
    resolver,
    defaultValues: iniciales(actual, r.hoy),
  });
  const {
    control,
    watch,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;
  const draft = useFormDraft('empleado', actual?.id, {
    form,
    version: 7,
    alDescartar: () => setErrorGeneral(''),
    paso: seccionActual,
    restaurarPaso: (paso) => {
      if (typeof paso === 'number' && paso >= 0 && paso < secciones.length) {
        setSeccionActual(paso);
        document
          .querySelector(`[data-tour="empleado-seccion-${paso}"]`)
          ?.scrollIntoView?.({ block: 'start' });
      }
    },
  });
  const vals = watch();
  const contratos = useQuery({
    queryKey: ['empleados', 'contrato', vals.idTipoContrato],
    queryFn: ({ signal }) =>
      opciones('idTipoContrato', '', 1, vals.idTipoContrato ?? '', undefined, signal),
    enabled: !!vals.idTipoContrato,
  });
  const municipios = useQuery({
    queryKey: ['ubicaciones', 'municipios', vals.idDepartamentoGt],
    queryFn: ({ signal }) => municipiosGt(vals.idDepartamentoGt ?? '', signal),
    enabled: !!vals.idDepartamentoGt,
    staleTime: Infinity,
  });
  const contrato = contratos.data?.find((o) => o.value === vals.idTipoContrato);
  useEffect(() => {
    const fin = contrato ? contrato.requiereFechaFin === 1 : undefined;
    setRequiereFin(fin);
    if (fin === false && form.getValues('fechaFinContrato'))
      form.setValue('fechaFinContrato', '', { shouldDirty: true, shouldValidate: true });
  }, [contrato, form]);
  useEffect(() => {
    setCodigoMunicipio(
      municipios.data?.find((m) => String(m.id) === vals.idMunicipioGt)?.codigo ?? '',
    );
  }, [municipios.data, vals.idMunicipioGt]);
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
      {crearHorario && (
        <CrearHorarioModal
          onCerrar={() => setCrearHorario(false)}
          onCreado={(id) =>
            form.setValue('idHorario', id, { shouldDirty: true, shouldValidate: true })
          }
        />
      )}
      <div className="my-4 flex justify-between gap-3">
        <h1>{actual ? 'Editar empleado' : 'Nuevo empleado'}</h1>
        <Link className="enlace-icono" to={actual ? `/empleados/${actual.id}` : '/empleados'}>
          Volver a empleados
        </Link>
      </div>

      {!actual && <AvisoEmpresa />}
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
              setCredenciales([saved.credenciales]);
              setPdf(saved.pdfCredenciales);
              for (const aviso of saved.advertencias) toast(aviso, 'peligro');
            }
            draft.limpiar();
            await cliente.invalidateQueries({ queryKey: ['empleados'] });
            toast('Expediente guardado y auditado.');
            const path = `/empleados/${id}`;
            if (!actual) setDestino(path);
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
        <FormDraftNotice draft={draft} />
        {secciones.map((s, i) => (
          <section
            className="mb-5"
            key={s.titulo}
            data-tour={`empleado-seccion-${i}`}
            onFocusCapture={() => setSeccionActual(i)}
          >
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
              {i === 0 && actual?.direccionAnterior && (
                <p className="campo-hint mb-4">
                  Dirección anterior (referencia): {String(actual.direccionAnterior)}
                </p>
              )}
              {i === 3 && actual?.parentescoAnterior && (
                <p className="campo-hint mb-4">
                  Parentesco anterior (referencia): {String(actual.parentescoAnterior)}
                </p>
              )}
              <FormGrid>
                {s.campos
                  .filter((f) => f.nombre !== 'idMunicipioGt')
                  .map((f) => (
                    <div
                      key={f.nombre}
                      title={
                        f.nombre === 'fechaFinContrato' && requiereFin === false
                          ? 'Contrato indefinido: el fin queda vacío.'
                          : undefined
                      }
                      className={f.nombre === 'idHorario' ? 'campo-con-acciones' : 'contents'}
                    >
                      {f.nombre === 'idDepartamentoGt' ? (
                        <UbicacionSelect
                          value={{
                            idDepartamentoGt: vals.idDepartamentoGt ?? '',
                            idMunicipioGt: vals.idMunicipioGt ?? '',
                          }}
                          predeterminar={!actual && !draft.pendiente}
                          disabled={isSubmitting}
                          errores={{
                            idDepartamentoGt: errors.idDepartamentoGt?.message,
                            idMunicipioGt: errors.idMunicipioGt?.message,
                          }}
                          onBlur={(campo) => void form.trigger(campo)}
                          onChange={(v, predeterminado) => {
                            form.setValue('idDepartamentoGt', v.idDepartamentoGt, {
                              shouldDirty: !predeterminado,
                            });
                            form.setValue('idMunicipioGt', v.idMunicipioGt, {
                              shouldDirty: !predeterminado,
                              shouldValidate: true,
                            });
                          }}
                        />
                      ) : f.nombre === 'zona' ? (
                        <ZonaSelect
                          name="zona"
                          value={vals.zona ?? ''}
                          codigoMunicipio={codigoMunicipio}
                          disabled={isSubmitting}
                          onValueChange={(v) =>
                            form.setValue('zona', v, { shouldDirty: true, shouldValidate: true })
                          }
                          onBlur={() => void form.trigger('zona')}
                          error={errors.zona?.message}
                        />
                      ) : f.nombre === 'codigo' ? (
                        <CampoCodigo
                          entidad="empleados"
                          idDepartamento={vals.idDepartamento}
                          codigo={actual?.codigo}
                        />
                      ) : (
                        <Controller
                          name={f.nombre}
                          control={control}
                          render={({ field }) => (
                            <CampoEmpleado
                              parentescoAnterior={
                                actual?.contactoParentesco
                                  ? String(actual.contactoParentesco)
                                  : undefined
                              }
                              campo={f}
                              name={field.name}
                              label={f.label}
                              hint={
                                f.nombre === 'fechaFinContrato' && requiereFin === false
                                  ? 'Contrato por tiempo indefinido: no tiene fecha de fin.'
                                  : f.hint
                              }
                              placeholder={f.hint.split('.')[0] ?? ''}
                              value={field.value ?? ''}
                              onValueChange={(v) => {
                                if (f.nombre === 'idDepartamento' && v !== field.value) {
                                  form.setValue('idPuesto', '', { shouldDirty: true });
                                  form.setValue('idJefatura', '', { shouldDirty: true });
                                }
                                field.onChange(v);
                              }}
                              onBlur={field.onBlur}
                              inputRef={field.ref}
                              required={
                                f.nombre === 'fechaFinContrato'
                                  ? requiereFin === true
                                  : !!f.required
                              }
                              disabled={
                                isSubmitting ||
                                (!!actual && ['fechaIngreso', 'salarioBase'].includes(f.nombre)) ||
                                (f.nombre === 'fechaFinContrato' && requiereFin !== true)
                              }
                              error={errors[f.nombre]?.message}
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
                      )}
                      {f.nombre === 'idHorario' && (
                        <Button
                          className="mt-2"
                          icono="crear"
                          variante="secundario"
                          data-tour="empleado-crear-horario"
                          disabled={isSubmitting}
                          onClick={() => setCrearHorario(true)}
                        >
                          Crear horario personalizado
                        </Button>
                      )}
                    </div>
                  ))}
              </FormGrid>
              {i === 1 && actual && (
                <FormGrid className="mt-4">
                  <div className="contents">
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
                </FormGrid>
              )}
            </Card>
          </section>
        ))}
        <Card>
          {!actual ? (
            <div data-tour="empleado-usuario">
              <p>
                El usuario nombre.apellido y la contraseña temporal se crean automáticamente al
                guardar.
              </p>
              <p className="campo-hint">
                Copia las credenciales o descarga su PDF membretado antes de cerrar. El primer
                ingreso exige cambiar la contraseña.
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
          {contratos.error && (
            <p role="alert" className="campo-error">
              No se pudo consultar la regla de contrato. Vuelve a seleccionar el tipo.
            </p>
          )}
          <FormErrorSummary
            mensajes={Object.values(errors).map((e) => e?.message)}
            mensajeServidor={error}
          />
          <div className="mt-5 flex justify-end gap-3" data-tour="empleado-guardar">
            <Button
              cancelarFormulario
              icono="cancelar"
              variante="secundario"
              disabled={isSubmitting}
              onClick={() =>
                draft.cancelar(() => nav(actual ? `/empleados/${actual.id}` : '/empleados'))
              }
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              icono="guardar"
              cargando={isSubmitting}
              disabled={
                !!credenciales ||
                !contrato ||
                !!contratos.error ||
                !codigoMunicipio ||
                !catalogoParentescos.data
              }
            >
              Guardar empleado
            </Button>
          </div>
        </Card>
      </form>
      {credenciales && (
        <Credenciales
          datos={credenciales}
          pdf={pdf}
          onCerrar={() => {
            setCredenciales(null);
            setPdf('');
            nav(destino);
          }}
        />
      )}
    </>
  );
}
