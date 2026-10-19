import { CatalogoAccion } from './CatalogoAccion';
import { FormGrid } from '../../../components/forms/FormGrid';
import { CampoCodigo } from '../../../components/forms/CampoCodigo';
import { useFormDraft } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Catalogo, Fila } from '../api/catalogos';
import { guardar, restricciones, detalle } from '../api/catalogos';
import { valoresIniciales, schemaFormulario, cuerpo, bloquesDesdeJson } from '../api/validacion';
import { CampoEditor } from './CampoEditor';
import { ConstructorHorario } from '../../horarios/ConstructorHorario';
import type { BloqueHorario } from '../api/catalogos';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { FormErrorSummary, TextAreaField, UbicacionSelect } from '../../../components/forms';
import { useToast } from '../../../components/ui/Toast';
import { HelpButton } from '../../../components/help/HelpProvider';
import { ErrorApi, mapearErrores } from '../../../lib/http';
import { fechaVisible } from '../../../lib/validadores';
import { formatoMoneda } from '../../../components/forms/MoneyField';
import type { Campo } from '../api/catalogos';
import { iconos } from '../../../components/ui/icons';
export function siguienteDia(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function valorVisible(v: unknown) {
  return v == null || v === ''
    ? 'Sin valor'
    : typeof v === 'boolean'
      ? v
        ? 'Sí'
        : 'No'
      : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
        ? fechaVisible(v)
        : Array.isArray(v)
          ? JSON.stringify(v)
          : String(v);
}
export function valorCampo(campo: Campo, valor: unknown) {
  return valor != null && valor !== '' && campo.tipo === 'dinero'
    ? `Q ${formatoMoneda(String(valor))}`
    : valorVisible(valor);
}
export function CatalogoFormulario({
  cat,
  actual,
  cierre,
  onCerrar,
  duplicar = false,
  onGuardado,
}: {
  cat: Catalogo;
  actual?: Fila | undefined;
  cierre: string | null;
  onCerrar: () => void;
  duplicar?: boolean;
  onGuardado?: (fila: Fila) => void;
}) {
  const cliente = useQueryClient();
  const toast = useToast();
  const [reactivar, setReactivar] = useState<Fila>();
  const [consultando, setConsultando] = useState(false);
  const [revision, setRevision] = useState<Record<string, string> | null>(null);
  const [motivoError, setMotivoError] = useState<string>();
  const reglasHorario = useQuery({
    queryKey: ['catalogos', 'restricciones'],
    queryFn: ({ signal }) => restricciones(signal),
    enabled: cat.slug === 'horarios',
  });
  const limites = reglasHorario.data?.limitesHorario ?? null;
  const anteriores = !duplicar ? (actual?.bloques as BloqueHorario[] | undefined) : undefined;
  const resolver = useMemo(
    () => zodResolver(schemaFormulario(cat, cierre, limites, anteriores)),
    [cat, cierre, limites, anteriores],
  );
  const form = useForm<Record<string, string>>({
    resolver,
    mode: 'onBlur',
    defaultValues: { ...valoresIniciales(cat, actual), motivo: '' },
  });
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = form;
  const draft = useFormDraft(`catalogo-${cat.slug}${duplicar ? '-duplicado' : ''}`, actual?.id, {
    form,
    version: cat.slug === 'horarios' ? 4 : cat.slug === 'centros-trabajo' ? 3 : 2,
    alDescartar: () => {
      setRevision(null);
      setMotivoError(undefined);
    },
    paso: revision ? 'revision' : 'edicion',
    restaurarPaso: (paso) => {
      if (paso === 'revision' && schemaFormulario(cat, cierre).safeParse(form.getValues()).success)
        setRevision(form.getValues());
    },
  });
  const motivo = form.watch('motivo') ?? '';
  const setMotivo = (v: string) => form.setValue('motivo', v, { shouldDirty: true });

  const mutation = useMutation({
    mutationFn: (datos: Record<string, string>) =>
      guardar(
        cat.slug,
        {
          ...cuerpo(cat, datos),
          ...(cat.legal ? { motivo: motivo.trim(), confirmado: true } : {}),
        },
        duplicar ? undefined : actual?.id,
      ),
    onSuccess: (fila) => {
      draft.limpiar();
      void cliente.invalidateQueries({ queryKey: ['catalogos'] });
      void cliente.invalidateQueries({ queryKey: ['empleados', 'opciones'] });
      void cliente.invalidateQueries({ queryKey: ['empleados', 'parentescos'] });
      onGuardado?.(fila);
      toast('Registro guardado y auditado.');
      onCerrar();
    },
    onError: (e) => {
      mapearErrores(e, setError, [...cat.campos.map((f) => f.nombre), 'bloques']);
      setRevision(null);
    },
  });
  const cerrar = () => {
    if (!mutation.isPending) onCerrar();
  };
  return (
    <>
      <Modal
        abierto
        titulo={`${duplicar ? 'Duplicar' : actual ? 'Editar' : 'Crear'} · ${cat.titulo}`}
        onCerrar={cerrar}
      >
        <form
          noValidate
          className="catalogo-formulario"
          data-tour="catalogo-formulario"
          onSubmit={handleSubmit((d) => {
            if (!mutation.isPending) {
              if (cat.legal) setRevision(d);
              else mutation.mutate(d);
            }
          })}
        >
          {!revision && <FormDraftNotice draft={draft} />}
          <div className="my-4 flex justify-between gap-3">
            <p className="text-sm text-secundario">Los campos con * son obligatorios.</p>
            <HelpButton />
          </div>
          {cat.legal && (
            <p className="alerta">
              Los cambios conservan su historial.{' '}
              {cierre
                ? `Último periodo cerrado: ${fechaVisible(cierre)}. Usa una vigencia posterior.`
                : 'Aún no hay periodos cerrados.'}
            </p>
          )}
          {actual?.enUso && !duplicar && cat.slug === 'horarios' && (
            <p className="alerta">
              El patrón está asignado. Para cambiar días o jornada crea un nuevo horario.
            </p>
          )}
          <FormGrid>
            {cat.campos
              .filter(
                (f) =>
                  (cat.slug !== 'centros-trabajo' ||
                    !['idDepartamentoGt', 'idMunicipioGt'].includes(f.nombre)) &&
                  (cat.slug !== 'horarios' || f.nombre !== 'jornada'),
              )
              .map((f) => (
                <div className="contents" key={f.nombre} data-tour={`campo-${f.nombre}`}>
                  {f.tipo === 'codigo' ? (
                    <CampoCodigo
                      entidad={cat.slug}
                      palabra={form.watch('nombre')}
                      codigo={!duplicar && actual?.codigo ? String(actual.codigo) : undefined}
                    />
                  ) : (
                    <Controller
                      control={control}
                      name={f.nombre}
                      render={({ field }) => (
                        <CampoEditor
                          campo={f}
                          actual={actual}
                          name={field.name}
                          label={f.etiqueta}
                          hint={f.hint}
                          placeholder={f.hint.split('.')[0] ?? ''}
                          value={field.value ?? ''}
                          onValueChange={field.onChange}
                          onBlur={field.onBlur}
                          inputRef={field.ref}
                          required={!!f.requerido}
                          error={errors[f.nombre]?.message}
                          disabled={
                            mutation.isPending ||
                            !!(
                              actual &&
                              cat.legal &&
                              ['codigo', 'unidad', 'limiteInferior'].includes(f.nombre)
                            ) ||
                            !!(
                              actual?.enUso &&
                              !duplicar &&
                              cat.slug === 'horarios' &&
                              f.nombre === 'jornada'
                            )
                          }
                          minFecha={
                            f.nombre === 'vigenteDesde' && cierre ? siguienteDia(cierre) : undefined
                          }
                        />
                      )}
                    />
                  )}
                </div>
              ))}
            {cat.slug === 'centros-trabajo' && (
              <>
                {actual?.localidadAnterior && (
                  <div className="col-span-12 alerta" data-tour="ubicacion-anterior">
                    <p>Localidad anterior: {String(actual.localidadAnterior)}</p>
                    {!actual.idMunicipioGt && (
                      <>
                        <p>
                          {actual.ubicacionPropuesta
                            ? `Coincidencia propuesta: ${String(actual.ubicacionPropuesta)}. Revisa antes de guardar.`
                            : 'Sin coincidencia única. Selecciona el departamento y municipio correctos antes de guardar.'}
                        </p>
                        {actual.idMunicipioGtPropuesto && (
                          <Button
                            icono="aprobar"
                            variante="secundario"
                            disabled={mutation.isPending}
                            onClick={() => {
                              form.setValue(
                                'idDepartamentoGt',
                                String(actual.idDepartamentoGtPropuesto),
                                { shouldDirty: true, shouldValidate: true },
                              );
                              form.setValue(
                                'idMunicipioGt',
                                String(actual.idMunicipioGtPropuesto),
                                { shouldDirty: true, shouldValidate: true },
                              );
                            }}
                          >
                            Usar coincidencia propuesta
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
                <UbicacionSelect
                  value={{
                    idDepartamentoGt: form.watch('idDepartamentoGt') ?? '',
                    idMunicipioGt: form.watch('idMunicipioGt') ?? '',
                  }}
                  predeterminar={!actual}
                  disabled={mutation.isPending}
                  onChange={(valor, predeterminado) => {
                    form.setValue('idDepartamentoGt', valor.idDepartamentoGt, {
                      shouldDirty: !predeterminado,
                      shouldValidate: !predeterminado,
                    });
                    form.setValue('idMunicipioGt', valor.idMunicipioGt, {
                      shouldDirty: !predeterminado,
                      shouldValidate: !predeterminado,
                    });
                  }}
                  onBlur={(campo) => {
                    void form.trigger(campo);
                  }}
                  errores={{
                    idDepartamentoGt: errors.idDepartamentoGt?.message,
                    idMunicipioGt: errors.idMunicipioGt?.message,
                  }}
                />
              </>
            )}
            {cat.slug === 'horarios' && (
              <Controller
                control={control}
                name="bloques"
                render={({ field }) => (
                  <ConstructorHorario
                    value={bloquesDesdeJson(field.value ?? '[]')}
                    onChange={(bloques) => {
                      field.onChange(JSON.stringify(bloques));
                      void form.trigger('bloques');
                    }}
                    disabled={mutation.isPending || (!!actual?.enUso && !duplicar)}
                    error={errors.bloques?.message}
                  />
                )}
              />
            )}
          </FormGrid>
          <div className="mt-5">
            <FormErrorSummary
              mensajes={Object.values(errors).map((e) => e?.message)}
              mensajeServidor={mutation.error?.message}
            />
            {mutation.error instanceof ErrorApi &&
              mutation.error.codigo === 'DUPLICADO' &&
              mutation.error.duplicado?.activo === false && (
                <Button
                  icono="aprobar"
                  variante="secundario"
                  cargando={consultando}
                  onClick={() => {
                    const id =
                      mutation.error instanceof ErrorApi ? mutation.error.duplicado?.id : undefined;
                    if (!id || consultando) return;
                    setConsultando(true);
                    void detalle(cat.slug, id)
                      .then(setReactivar)
                      .catch((e: unknown) =>
                        toast(
                          e instanceof Error ? e.message : 'No se pudo abrir el registro.',
                          'peligro',
                        ),
                      )
                      .finally(() => setConsultando(false));
                  }}
                >
                  Reactivar registro existente
                </Button>
              )}
          </div>
          <div className="mt-5 flex justify-end gap-3" data-tour="catalogo-guardar">
            <Button
              icono="cancelar"
              variante="secundario"
              disabled={mutation.isPending}
              onClick={cerrar}
              cancelarFormulario
            >
              Cancelar
            </Button>
            <Button type="submit" icono="guardar" cargando={mutation.isPending}>
              {cat.legal ? 'Revisar cambio' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Modal>
      {reactivar && (
        <CatalogoAccion
          cat={cat}
          fila={reactivar}
          tipo="estado"
          onCerrar={() => setReactivar(undefined)}
          onExito={() => {
            draft.limpiar();
            onCerrar();
          }}
        />
      )}
      <Modal
        abierto={!!revision}
        titulo="ADVERTENCIA · Cambio de parametrización legal"
        onCerrar={() => {
          if (!mutation.isPending) setRevision(null);
        }}
      >
        <div className="catalogo-advertencia">
          {revision && <FormDraftNotice draft={draft} />}
          <p className="alerta mt-4">
            <iconos.error className="inline" size={18} aria-hidden="true" /> Este cambio modifica
            las reglas de nómina desde la vigencia indicada. Revisa los valores y explica el motivo
            antes de confirmar.
          </p>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Comparación anterior y nuevo</caption>
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Anterior</th>
                  <th>Nuevo</th>
                </tr>
              </thead>
              <tbody>
                {cat.campos
                  .filter(
                    (f) =>
                      cat.slug !== 'centros-trabajo' ||
                      !['idDepartamentoGt', 'idMunicipioGt'].includes(f.nombre),
                  )
                  .map((f) => (
                    <tr key={f.nombre}>
                      <th scope="row">{f.etiqueta}</th>
                      <td>{valorCampo(f, actual?.[f.nombre])}</td>
                      <td>{valorCampo(f, revision?.[f.nombre])}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <TextAreaField
              name="motivo"
              label="Motivo del cambio"
              hint="Indica la norma, aprobación o corrección que justifica el cambio (5–500 caracteres)."
              value={motivo}
              onValueChange={setMotivo}
              maxLength={500}
              required
              error={motivoError}
              disabled={mutation.isPending}
            />
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <Button
              icono="cancelar"
              variante="secundario"
              disabled={mutation.isPending}
              onClick={() => setRevision(null)}
            >
              Volver a editar
            </Button>
            <Button
              icono="aprobar"
              variante="peligro"
              cargando={mutation.isPending}
              onClick={() => {
                if (motivo.trim().length < 5) {
                  setMotivoError('Explica el motivo con al menos 5 caracteres.');
                  return;
                }
                setMotivoError(undefined);
                if (revision && !mutation.isPending) mutation.mutate(revision);
              }}
            >
              Confirmar cambio legal
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
