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
import {
  secciones,
  todosCampos,
  iniciales,
  schemaFormulario,
  cuerpo,
  camposPaso,
  omisionesOpcionales,
} from '../api/formulario';
import { CampoEmpleado } from './CampoEmpleado';
import { Credenciales } from './Credenciales';
import { Modal } from '../../../components/ui/Modal';
import { iconos } from '../../../components/ui/icons';
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
import { fechaValida, fechaVisible } from '../../../lib/validadores';
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
  const [visitados, setVisitados] = useState(0);
  const [revision, setRevision] = useState<Record<string, string> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const catalogoParentescos = useQuery({
    queryKey: ['empleados', 'parentescos'],
    queryFn: ({ signal }) => parentescos(signal),
  });
  const schema = useMemo(
    () =>
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
    [r, actual, requiereFin, codigoMunicipio, catalogoParentescos.data],
  );
  const form = useForm<Record<string, string>>({
    mode: 'onBlur',
    resolver: zodResolver(schema),
    shouldUnregister: false,
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
    version: 8,
    alDescartar: () => {
      setErrorGeneral('');
      setRevision(null);
      setSeccionActual(0);
      setVisitados(0);
    },
    paso: `${seccionActual}:${visitados}`,
    restaurarPaso: (paso) => {
      const [actual, visitado] = String(paso).split(':').map(Number);
      if (Number.isInteger(actual) && actual! >= 0 && actual! < secciones.length) {
        setSeccionActual(actual!);
        setVisitados(
          Number.isInteger(visitado) && visitado! >= actual! && visitado! < secciones.length
            ? visitado!
            : actual!,
        );
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
  const ocupado = isSubmitting || guardando;
  const erroresPaso = (paso: number) => camposPaso(paso, !!actual).some((k) => !!errors[k]);
  const schemaDelPaso = (paso: number) =>
    schemaFormulario(
      r,
      !!actual,
      requiereFin,
      codigoMunicipio,
      catalogoParentescos.data
        ?.map((p) => p.value)
        .concat(actual?.contactoParentesco ? [String(actual.contactoParentesco)] : []),
      paso,
    );
  const valido = (paso: number) => schemaDelPaso(paso).safeParse(vals).success;
  const ir = (paso: number) => {
    setSeccionActual(paso);
    setVisitados((v) => Math.max(v, paso));
  };
  useEffect(() => {
    document
      .querySelector<HTMLElement>(`[data-tour="empleado-seccion-${seccionActual}"] h2`)
      ?.focus({ preventScroll: true });
  }, [seccionActual]);
  const validarPaso = () => {
    if (seccionActual === 1 && vals.idTipoContrato && !contrato) {
      form.setError('idTipoContrato', {
        type: 'manual',
        message: 'Espera a consultar la regla del contrato o vuelve a seleccionarlo.',
      });
      return;
    }
    const resultado = schemaDelPaso(seccionActual).safeParse(form.getValues());
    form.clearErrors(camposPaso(seccionActual, !!actual));
    if (!resultado.success) {
      for (const issue of resultado.error.issues)
        form.setError(issue.path.join('.'), { type: 'manual', message: issue.message });
      return;
    }
    ir(Math.min(3, seccionActual + 1));
  };
  const guardar = async (d: Record<string, string>) => {
    if (guardando) return;
    setGuardando(true);
    setErrorGeneral('');
    try {
      let id: number;
      if (actual) {
        const saved = await editar(actual.id, cuerpo(d, true, !!actual.salarioBase));
        id = saved.id;
      } else {
        const saved = await crear(cuerpo(d));
        id = saved.empleado.id;
        setCredenciales([saved.credenciales]);
        setPdf(saved.pdfCredenciales);
        for (const aviso of saved.advertencias) toast(aviso, 'peligro');
      }
      draft.limpiar();
      await Promise.all([
        cliente.invalidateQueries({ queryKey: ['empleados'] }),
        cliente.invalidateQueries({ queryKey: ['tablero'] }),
      ]);
      toast('Expediente guardado y auditado.');
      const path = `/empleados/${id}`;
      if (!actual) setDestino(path);
      else nav(path);
      setRevision(null);
    } catch (e) {
      mapearErrores(e, setError, [...todosCampos.map((f) => f.nombre), 'motivo', 'fechaHorario']);
      setErrorGeneral(e instanceof Error ? e.message : 'No se pudo guardar.');
      setRevision(null);
    } finally {
      setGuardando(false);
    }
  };
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
        onSubmit={handleSubmit(
          (d) => setRevision(d),
          (fallos) => {
            const paso = secciones.findIndex((_s, i) =>
              camposPaso(i, !!actual).some((k) => fallos[k]),
            );
            if (paso >= 0) ir(paso);
          },
        )}
      >
        <FormDraftNotice draft={draft} />
        <nav aria-label="Pasos del expediente" data-tour="empleado-pasos" className="my-5">
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {secciones.map((s, i) => {
              const conErrores = erroresPaso(i);
              const completo = valido(i) && (!s.opcional || s.campos.some((f) => vals[f.nombre]));
              const Estado = iconos[conErrores ? 'error' : completo ? 'completado' : 'informacion'];
              return (
                <li key={s.titulo}>
                  <Button
                    icono={s.icono}
                    variante={i === seccionActual ? 'primario' : 'secundario'}
                    className="h-full w-full justify-start text-left"
                    aria-current={i === seccionActual ? 'step' : undefined}
                    disabled={ocupado || i > visitados}
                    motivoDeshabilitado={
                      i > visitados
                        ? 'Avanza con Siguiente para validar el paso anterior.'
                        : undefined
                    }
                    onClick={() => ir(i)}
                  >
                    <span>
                      <span className="block">
                        {i + 1}. {s.titulo}
                      </span>
                      <span className="flex items-center gap-1 text-xs">
                        <Estado size={14} aria-hidden="true" />
                        {conErrores
                          ? 'Con errores'
                          : completo
                            ? 'Completo'
                            : s.opcional
                              ? 'Opcional'
                              : 'Pendiente'}
                      </span>
                    </span>
                  </Button>
                </li>
              );
            })}
          </ol>
        </nav>
        {secciones.map(
          (s, i) =>
            i === seccionActual && (
              <section className="mb-5" key={s.titulo} data-tour={`empleado-seccion-${i}`}>
                <Card>
                  <h2 className="mb-4" tabIndex={-1}>
                    Paso {i + 1} de 4 · {s.titulo}
                    {s.opcional ? ' (opcional)' : ''}
                  </h2>
                  {s.opcional && (
                    <p className="campo-hint mb-4">
                      Puedes dejar este paso vacío. Si ingresas un dato, completa todo el grupo
                      antes de guardar.
                    </p>
                  )}
                  {i === 2 && (
                    <p className={bajo ? 'alerta mb-4' : 'campo-hint mb-4'}>
                      {actual
                        ? actual.salarioBase
                          ? 'Utiliza Cambiar salario en la ficha para registrar una nueva vigencia.'
                          : r.ultimoCierre && String(actual.fechaIngreso) <= r.ultimoCierre
                            ? 'El ingreso afecta un periodo cerrado. Agrega el salario desde Cambiar salario en la ficha, con fecha posterior al último cierre.'
                            : 'Puedes registrar aquí el salario inicial junto con los datos bancarios, o completar la vigencia desde la ficha.'
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
                              disabled={ocupado}
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
                              disabled={ocupado}
                              onValueChange={(v) =>
                                form.setValue('zona', v, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
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
                                      : f.nombre === 'nit' && r.validarDigitoNit
                                        ? `${f.hint} Módulo 11 activado por ADMIN.`
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
                                      : i >= 2
                                        ? s.campos.some((c) => !!vals[c.nombre])
                                        : !!f.required
                                  }
                                  disabled={
                                    ocupado ||
                                    (!!actual &&
                                      (f.nombre === 'fechaIngreso' ||
                                        (f.nombre === 'salarioBase' && !!actual.salarioBase))) ||
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
                              disabled={ocupado}
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
                              disabled={ocupado}
                              min={
                                r.ultimoCierre ? r.ultimoCierre : (actual.fechaIngreso as string)
                              }
                            />
                          )}
                        />
                      </div>
                    </FormGrid>
                  )}
                </Card>
              </section>
            ),
        )}
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
                  disabled={ocupado}
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
          <div className="mt-5 flex flex-wrap justify-end gap-3" data-tour="empleado-guardar">
            <Button
              cancelarFormulario
              icono="cancelar"
              variante="secundario"
              disabled={ocupado}
              onClick={() =>
                draft.cancelar(() => nav(actual ? `/empleados/${actual.id}` : '/empleados'))
              }
            >
              Cancelar
            </Button>
            <Button
              icono="anterior"
              variante="secundario"
              disabled={ocupado || seccionActual === 0}
              onClick={() => ir(seccionActual - 1)}
            >
              Anterior
            </Button>
            {seccionActual < 3 && (
              <Button icono="siguiente" disabled={ocupado} onClick={() => void validarPaso()}>
                Siguiente
              </Button>
            )}
            <Button
              type="submit"
              icono="guardar"
              cargando={ocupado}
              motivoDeshabilitado={
                !valido(0) || !valido(1)
                  ? 'Completa y corrige los pasos Datos personales y Datos laborales.'
                  : undefined
              }
              disabled={
                !!credenciales ||
                !valido(0) ||
                !valido(1) ||
                !contrato ||
                !!contratos.error ||
                !codigoMunicipio ||
                (!!vals.contactoParentesco && !catalogoParentescos.data)
              }
            >
              Guardar empleado
            </Button>
          </div>
        </Card>
      </form>
      {revision && (
        <Modal
          abierto
          titulo="Revisar empleado antes de guardar"
          onCerrar={() => {
            if (!guardando) setRevision(null);
          }}
        >
          <div data-tour="empleado-revision" className="my-5">
            <p>
              <strong>
                {revision.nombres} {revision.apellidos}
              </strong>{' '}
              · DPI {revision.dpi}
            </p>
            <p>
              Ingreso: {revision.fechaIngreso}. Salario mensual:{' '}
              {revision.salarioBase ? `Q ${revision.salarioBase}` : 'Omitido'}.
            </p>
            <p>
              Dirección: {revision.direccion}
              {revision.zona ? `, zona ${revision.zona}` : ''},{' '}
              {municipios.data?.find((m) => String(m.id) === revision.idMunicipioGt)?.nombre}.
            </p>
            <p>
              Teléfono: {revision.telefono} · Correo: {revision.correo}.
            </p>
            <p>
              Nacimiento: {fechaVisible(revision.fechaNacimiento ?? '')} · NIT: {revision.nit}.
            </p>
            {revision.idBanco && (
              <p>
                Cuenta bancaria: {revision.cuentaBancaria} ({revision.tipoCuenta}).
              </p>
            )}
            {revision.contactoNombre && (
              <p>
                Contacto: {revision.contactoNombre} · {revision.contactoParentesco} ·{' '}
                {revision.contactoTelefono}.
              </p>
            )}
            <h3 className="mt-4">Datos opcionales y consecuencias</h3>
            {omisionesOpcionales(revision).length ? (
              <ul className="my-3 list-disc pl-5">
                {omisionesOpcionales(revision).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              <p>Datos salariales, bancarios y contacto completos.</p>
            )}
            <p className="campo-hint">
              Revisa los datos antes de confirmar. El servidor vuelve a validar todas las reglas.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button
                icono="anterior"
                variante="secundario"
                disabled={guardando}
                onClick={() => setRevision(null)}
              >
                Volver al asistente
              </Button>
              <Button icono="guardar" cargando={guardando} onClick={() => void guardar(revision)}>
                Confirmar y guardar empleado
              </Button>
            </div>
          </div>
        </Modal>
      )}
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
