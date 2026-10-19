import { FormGrid } from '../../../components/forms/FormGrid';
import { CampoCodigo } from '../../../components/forms/CampoCodigo';
import { useFormDraft } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  detalle,
  reglas,
  restricciones,
  guardar,
  previsualizar,
  leerAdjunto,
  titulos,
} from '../api/novedades';
import type { Tipo, Fila, Preview } from '../api/novedades';
import { campos, iniciales, schemaFormulario, cuerpo } from '../api/formulario';
import { CampoNovedad } from './CampoNovedad';
import { tipoValido, moneda, NavegacionNovedades } from './NovedadesPage';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ConfirmModal } from '../../../components/ui/Modal';
import { FileField, FormErrorSummary } from '../../../components/forms';
import { fechaVisible } from '../../../lib/validadores';
import { mapearErrores } from '../../../lib/http';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { useSession } from '../../../app/session';
import { useToast } from '../../../components/ui/Toast';
import { ayudaNovedades } from '../help/pasos';
export function NovedadFormularioPage() {
  const { tipo, id } = useParams();
  if (!tipoValido(tipo)) return <Navigate to="/novedades/descuentos" replace />;
  return <Cargar key={`${tipo}-${id ?? 'nuevo'}`} tipo={tipo} id={id} />;
}
function Cargar({ tipo, id }: { tipo: Tipo; id: string | undefined }) {
  const { usuario } = useSession();
  const ayuda = useMemo(() => ayudaNovedades(tipo, 'formulario'), [tipo]);
  usePageHelp(ayuda, usuario?.rol);
  const r = useQuery({
    queryKey: ['novedades', 'reglas'],
    queryFn: ({ signal }) => reglas(signal),
  });
  const actual = useQuery({
    queryKey: ['novedades', tipo, 'detalle', id],
    queryFn: ({ signal }) => detalle(tipo, Number(id), signal),
    enabled: !!id,
  });
  if (r.isPending || (id && actual.isPending)) return <Skeleton lineas={8} />;
  const error = r.error ?? actual.error;
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
              if (id) void actual.refetch();
            }}
          >
            Reintentar
          </Button>
        }
      />
    );
  if (
    actual.data &&
    (actual.data.autorizacion === 'RECHAZADA' ||
      actual.data.bloqueada ||
      !actual.data.activo ||
      ['LIQUIDADO', 'CANCELADO'].includes(actual.data.estado))
  )
    return (
      <EmptyState
        titulo="Registro protegido"
        descripcion="La novedad está cerrada, consumida por nómina o finalizada."
      />
    );
  return <Formulario tipo={tipo} hoy={r.data!.hoy} actual={actual.data} />;
}
function Formulario({ tipo, hoy, actual }: { tipo: Tipo; hoy: string; actual: Fila | undefined }) {
  const nav = useNavigate(),
    cache = useQueryClient(),
    toast = useToast();
  const [error, setErrorGeneral] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [revisando, setRevisando] = useState(false),
    [enviando, setEnviando] = useState(false),
    [pendiente, setPendiente] = useState<Record<string, unknown> | null>(null),
    [archivo, setArchivo] = useState<File | null>(null),
    [quitarAdjunto, setQuitarAdjunto] = useState(false);
  const resolver = useMemo(() => zodResolver(schemaFormulario(tipo, hoy)), [tipo, hoy]);
  const form = useForm<Record<string, string>>({
    mode: 'onBlur',
    resolver,
    defaultValues: iniciales(tipo, hoy, actual),
  });
  const {
    control,
    watch,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;
  const draft = useFormDraft(`novedad-${tipo}`, actual?.id, {
    form,
    version: 9,
    alDescartar: () => {
      setPreview(null);
      setPendiente(null);
      setErrorGeneral('');
    },
  });
  const d = watch(),
    defs = campos(tipo, d.modalidad);
  const r = useQuery({
    queryKey: ['novedades', 'restricciones', d.idEmpleado, actual?.id],
    queryFn: ({ signal }) =>
      restricciones(d.idEmpleado!, tipo === 'ausencias' && actual ? String(actual.id) : '', signal),
    enabled: !!d.idEmpleado,
  });
  const ocupado = isSubmitting || enviando || revisando;
  async function preparar(vals: Record<string, string>) {
    const out = cuerpo(tipo, vals);
    if (tipo === 'ausencias') {
      if (archivo) out.adjunto = await leerAdjunto(archivo);
      else if (quitarAdjunto) out.adjunto = null;
    }
    return out;
  }
  function fallo(e: unknown) {
    mapearErrores(e, setError, [...defs.map((f) => f.nombre), 'adjunto', 'confirmado']);
    setErrorGeneral(e instanceof Error ? e.message : 'No se pudo completar la operación.');
  }
  return (
    <>
      <h1>
        {actual ? 'Editar' : 'Nueva novedad'} · {titulos[tipo]}
      </h1>
      <NavegacionNovedades tipo={tipo} />
      <form
        noValidate
        onSubmit={handleSubmit(async (vals) => {
          setErrorGeneral('');
          try {
            const body = await preparar(vals);
            if (tipo === 'horas-extra') setPreview(await previsualizar(tipo, body, actual?.id));
            setPendiente(body);
          } catch (e) {
            fallo(e);
          }
        })}
      >
        <FormDraftNotice draft={draft} />
        {(tipo === 'descuentos' || tipo === 'prestamos') && (
          <CampoCodigo entidad={tipo} codigo={actual?.codigo ?? undefined} />
        )}
        <Card>
          <FormGrid data-tour="novedad-campos">
            {defs.map((f) => (
              <div key={f.nombre} className="contents">
                <Controller
                  name={f.nombre}
                  control={control}
                  render={({ field }) => (
                    <CampoNovedad
                      campo={f}
                      name={field.name}
                      label={f.label}
                      hint={f.hint}
                      placeholder={
                        f.tipo === 'fecha'
                          ? 'dd/mm/aaaa'
                          : f.tipo === 'dinero'
                            ? '1,234.56'
                            : (f.hint.split('.')[0] ?? '')
                      }
                      value={field.value ?? ''}
                      onValueChange={(v) => {
                        field.onChange(v);
                        setPreview(null);
                      }}
                      onBlur={field.onBlur}
                      inputRef={field.ref}
                      required={!f.opcional}
                      disabled={ocupado || (!!actual && f.nombre === 'idEmpleado')}
                      error={errors[f.nombre]?.message}
                      r={r.data}
                      hoy={hoy}
                      tipoN={tipo}
                      inicio={d.fechaInicio}
                    />
                  )}
                />
              </div>
            ))}
          </FormGrid>
          {r.error && (
            <p role="alert" className="alerta my-3">
              No se pudieron cargar las restricciones: {r.error.message}
            </p>
          )}
          {tipo === 'ausencias' && (
            <div className="my-5">
              <FileField
                key={quitarAdjunto ? 'sin-respaldo' : 'con-respaldo'}
                name="adjunto"
                label="Respaldo (opcional)"
                hint="PDF, PNG o JPEG de hasta 1 MB. Solo RH y ADMIN pueden descargarlo."
                accept="application/pdf,image/png,image/jpeg"
                maxBytes={1048576}
                disabled={ocupado}
                {...(errors.adjunto?.message ? { error: errors.adjunto.message } : {})}
                onValueChange={(f) => {
                  setArchivo(f);
                  setQuitarAdjunto(false);
                }}
              />
              {actual?.soporteNombre && (
                <p className="campo-hint">
                  Actual: {actual.soporteNombre}
                  {quitarAdjunto ? ' · Se quitará al guardar' : ''}
                </p>
              )}
              {actual?.soporteNombre && (
                <Button
                  icono={quitarAdjunto ? 'actualizar' : 'eliminar'}
                  variante="texto"
                  disabled={ocupado}
                  onClick={() => {
                    setArchivo(null);
                    setQuitarAdjunto((v) => !v);
                  }}
                >
                  {quitarAdjunto ? 'Conservar adjunto' : 'Quitar adjunto al guardar'}
                </Button>
              )}
            </div>
          )}
          {(['prestamos', 'horas-extra', 'ausencias'].includes(tipo) ||
            (tipo === 'descuentos' && d.modalidad !== 'FIJO')) && (
            <div className="my-5" data-tour="novedad-preview">
              <Button
                icono="ver"
                variante="secundario"
                cargando={revisando}
                disabled={enviando}
                onClick={() =>
                  void handleSubmit(async (vals) => {
                    setRevisando(true);
                    setErrorGeneral('');
                    try {
                      setPreview(await previsualizar(tipo, await preparar(vals), actual?.id));
                    } catch (e) {
                      fallo(e);
                    } finally {
                      setRevisando(false);
                    }
                  })()
                }
              >
                {tipo === 'horas-extra' || tipo === 'ausencias'
                  ? 'Revisar cálculo'
                  : 'Revisar amortización'}
              </Button>
              {preview && <VistaPrevia datos={preview} />}
            </div>
          )}
          <FormErrorSummary
            mensajes={Object.values(errors).map((e) => e?.message)}
            mensajeServidor={error}
          />
          <div className="my-5 flex justify-end gap-3" data-tour="novedad-guardar">
            <Button
              cancelarFormulario
              icono="cancelar"
              variante="secundario"
              disabled={ocupado}
              onClick={() => draft.cancelar(() => nav(`/novedades/${tipo}`))}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              icono="guardar"
              cargando={isSubmitting || enviando}
              disabled={revisando}
            >
              Revisar y guardar
            </Button>
          </div>
        </Card>
      </form>
      <ConfirmModal
        abierto={!!pendiente}
        titulo="Confirmar novedad"
        descripcion={`Empleado: ${r.data?.empleado?.nombre ?? actual?.empleado ?? 'selección pendiente'} · Monto: ${moneda(String(pendiente?.monto ?? '').replace(/,/g, ''))} · Mes: ${String(pendiente?.mes ?? '—')} · Fecha: ${fechaVisible(String(pendiente?.fecha ?? pendiente?.fechaInicio ?? ''))} · Cuotas: ${String(pendiente?.cuotas ?? '—')} · Horas: ${String(pendiente?.horas ?? '—')} · Estado: ${String(pendiente?.estado ?? 'VIGENTE')}. Se guardará con tu usuario y motivo en auditoría. ${preview?.advertencia ?? ''}`}
        cargando={enviando}
        onCancelar={() => setPendiente(null)}
        onConfirmar={() => {
          if (!pendiente || enviando) return;
          setEnviando(true);
          void guardar(tipo, pendiente, actual?.id)
            .then(async (saved) => {
              draft.limpiar();
              await cache.invalidateQueries({ queryKey: ['novedades'] });
              await cache.invalidateQueries({ queryKey: ['empleados'] });
              toast('Novedad guardada y auditada.');
              nav(`/novedades/${tipo}/${saved.id}`);
            })
            .catch((e) => {
              setPendiente(null);
              fallo(e);
            })
            .finally(() => setEnviando(false));
        }}
      />
    </>
  );
}
export function VistaPrevia({ datos }: { datos: Preview }) {
  return (
    <div className="my-4" aria-live="polite">
      {datos.advertencia && <p className="alerta">{datos.advertencia}</p>}
      {datos.descuento !== undefined && (
        <p className="banda-informativa">
          Descuento por ausencias: {moneda(datos.descuento)}. Valor día = salario / 30; las
          ausencias con goce no restan.
        </p>
      )}
      {datos.meses?.map((m) => (
        <p key={m.mes}>
          {m.mes}: {m.dias} días · {moneda(m.monto)}
        </p>
      ))}
      {datos.calculo && (
        <p className="banda-informativa">
          Valor hora: {moneda(datos.calculo.valorHora)} · Recargo: {datos.calculo.recargo}% · Total
          estimado: {moneda(datos.calculo.monto)}. El cálculo final congelará sus parámetros.
        </p>
      )}
      {datos.plan.length > 0 && (
        <div className="table-scroll">
          <table>
            <caption>Amortización prevista · sin intereses</caption>
            <thead>
              <tr>
                <th>Cuota</th>
                <th>Vencimiento</th>
                <th>Monto</th>
                <th>Saldo posterior</th>
              </tr>
            </thead>
            <tbody>
              {datos.plan.map((f) => (
                <tr key={f.numero}>
                  <td>{f.numero}</td>
                  <td>{fechaVisible(f.fecha)}</td>
                  <td>{moneda(f.monto)}</td>
                  <td>{moneda(f.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
