import { tarifas } from '../../novedades/api/parqueo';
import { formatoMoneda } from '../../../components/forms/MoneyField';
import { hoyGuatemala } from '../../../lib/validadores';
import { AvisoEmpresa, useBloqueoFirma } from '../../empresa/pages/AvisoEmpresa';
import { CampoCodigo } from '../../../components/forms/CampoCodigo';
import { useFormDraft } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as api from '../api/solicitudes';
import { Estado } from './SolicitudesPage';
import { HelpButton } from '../../../components/help/HelpProvider';
import { PdfView } from './PdfView';
import { Button } from '../../../components/ui/Button';
import { Modal, ConfirmModal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { TextAreaField, FormErrorSummary } from '../../../components/forms';
import { useToast } from '../../../components/ui/Toast';
import { mapearErrores } from '../../../lib/http';
const etiquetasCriticos: Record<string, string> = {
  nombres: 'Nombres',
  apellidos: 'Apellidos',
  dpi: 'DPI',
  nit: 'NIT',
  estadoCivil: 'Estado civil',
};
export function SolicitudDetalle({
  id,
  empleado,
  onCerrar,
}: {
  id: number;
  empleado: boolean;
  onCerrar: () => void;
}) {
  const q = useQuery({
    queryKey: ['solicitudes', 'detalle', id],
    queryFn: ({ signal }) => api.detalle(id, signal),
  });
  return (
    <Modal abierto titulo={`Solicitud #${id}`} onCerrar={onCerrar}>
      <AvisoEmpresa firma={!empleado} empleado={empleado} />
      {q.isPending ? (
        <Skeleton lineas={6} />
      ) : q.error ? (
        <EmptyState
          titulo="No se pudo abrir la solicitud"
          descripcion={q.error.message}
          accion={
            <Button icono="actualizar" onClick={() => void q.refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : (
        q.data && <Contenido key={`${id}:${q.data.estado}`} s={q.data} empleado={empleado} />
      )}
    </Modal>
  );
}
function Contenido({ s, empleado }: { s: api.Detalle; empleado: boolean }) {
  const bloqueoFirma = useBloqueoFirma();
  const mesActual = hoyGuatemala().slice(0, 7);
  const t = useQuery({
    queryKey: ['novedades', 'tarifas'],
    queryFn: ({ signal }) => tarifas(signal),
    enabled: !empleado && s.tipo === 'PARQUEO' && s.estado === 'EN_PROCESO',
  });
  const vigentes =
    t.data?.filter(
      (v) =>
        v.vehiculo === s.vehiculo &&
        v.desde <= `${mesActual}-01` &&
        (!v.hasta || v.hasta >= `${mesActual}-01`),
    ) ?? [];
  const tarifaActual = vigentes.length === 1 ? vigentes[0] : undefined;
  const bloqueoParqueo =
    s.tipo === 'PARQUEO'
      ? t.isPending
        ? 'Cargando la tarifa vigente.'
        : t.error
          ? 'No se pudo consultar la tarifa. Reintenta antes de aprobar.'
          : !s.vehiculo
            ? 'La solicitud histórica no indica vehículo; rechaza y solicita una nueva.'
            : !tarifaActual
              ? 'Configura una tarifa mensual vigente única para este vehículo.'
              : undefined
      : undefined;
  const cache = useQueryClient(),
    toast = useToast();
  const [accion, setAccion] = useState<'APROBADA' | 'RECHAZADA' | 'ENTREGADA' | 'REEMITIR'>(),
    [preview, setPreview] = useState<api.Documento>();
  const [revisado, setRevisado] = useState(false);
  const alRevisar = useCallback(() => setRevisado(true), []);
  const f = useForm<{ motivo: string }>({
    mode: 'onBlur',
    defaultValues: { motivo: '' },
    resolver: zodResolver(z.object({ motivo: z.string().max(500) })),
  });
  const draft = useFormDraft('solicitud-resolucion', s.id, {
    form: f,
    version: 9,
    alDescartar: () => setAccion(undefined),
    enabled: !empleado && s.estado === 'EN_PROCESO',
  });
  const invalidar = () => {
    void cache.invalidateQueries({ queryKey: ['solicitudes'] });
    void cache.invalidateQueries({ queryKey: ['notificaciones'] });
  };
  const mutar = useMutation({
    mutationFn: () =>
      accion === 'REEMITIR'
        ? api.reemitir(s.id)
        : accion === 'ENTREGADA'
          ? api.entregar(s.id, preview?.sha256)
          : api.resolver(s.id, {
              estado: accion,
              motivo: f.getValues('motivo'),
              confirmado: true,
            }),
    onSuccess: () => {
      draft.limpiar();
      toast(
        accion === 'ENTREGADA'
          ? 'Entrega registrada. El empleado recibió su aviso.'
          : 'Resolución guardada y notificada.',
      );
      setAccion(undefined);
      invalidar();
    },
    onError: (e) => {
      mapearErrores(e, f.setError, ['motivo']);
      setAccion(undefined);
    },
  });
  const archivo = useMutation({
    mutationFn: () => api.documento(s.id),
    onSuccess: (d) => {
      setPreview(d);
      setRevisado(false);
    },
    onError: (e) => toast(e.message, 'peligro'),
  });
  const resolver = (estado: 'APROBADA' | 'RECHAZADA') => {
    f.clearErrors();
    if (estado === 'RECHAZADA' && f.getValues('motivo').trim().length < 5) {
      f.setError('motivo', {
        message:
          'Explica el rechazo con al menos 5 caracteres para que el empleado pueda corregirlo.',
      });
      return;
    }
    setAccion(estado);
  };
  return (
    <section data-tour="solicitud-detalle" className="mt-5">
      <CampoCodigo entidad="solicitudes" codigo={s.codigo} />

      {!empleado && s.estado === 'EN_PROCESO' && <FormDraftNotice draft={draft} />}
      <HelpButton />
      <h3>
        {s.nombreTipo} · {s.empleado}
      </h3>
      <Estado estado={s.estado} />
      <p className="my-4 whitespace-pre-wrap">
        {s.observaciones || 'Sin observaciones adicionales.'}
      </p>
      {s.motivo && <p className="resumen-error">Motivo de rechazo: {s.motivo}</p>}
      {s.datos && (
        <div className="table-scroll mb-5">
          <table>
            <caption>Datos críticos propuestos</caption>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Actual al solicitar</th>
                <th>Propuesto</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(s.datos.nuevo).map(([k, v]) => (
                <tr key={k}>
                  <td>{etiquetasCriticos[k] ?? k}</td>
                  <td>{s.datos!.anterior[k as keyof api.MisDatos['criticos']]}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!empleado &&
        s.requiereReemision &&
        s.generaPdf === 1 &&
        ['APROBADA', 'ENTREGADA'].includes(s.estado) && (
          <Button icono="actualizar" onClick={() => setAccion('REEMITIR')}>
            Reemitir documento histórico
          </Button>
        )}
      {!empleado && s.estado === 'EN_PROCESO' && (
        <>
          {s.tipo === 'PARQUEO' && (
            <p data-tour="solicitud-parqueo" className="banda-informativa">
              Tarifa mensual:{' '}
              {tarifaActual ? `Q ${formatoMoneda(tarifaActual.monto)}` : 'Sin tarifa vigente'} ·
              Vehículo: {s.vehiculo ?? 'Sin vehículo: rechaza y pide una nueva solicitud'} · Placa:{' '}
              {s.placa ?? 'Sin placa'}. Aprobar crea una suscripción con la tarifa mensual vigente
              desde este mes, sin prorrateo. Configura Carro/Moto en Configuración → Tarifas de
              parqueo.
            </p>
          )}
          {t.error && s.tipo === 'PARQUEO' && (
            <Button icono="actualizar" onClick={() => void t.refetch()}>
              Reintentar tarifa
            </Button>
          )}
          <div className="form-grid">
            <Controller
              control={f.control}
              name="motivo"
              render={({ field: { ref: _ref, ...field }, fieldState }) => (
                <TextAreaField
                  {...field}
                  label="Motivo de resolución"
                  hint="Obligatorio al rechazar. Explica qué debe corregir el empleado."
                  maxLength={500}
                  placeholder="La solicitud se rechaza porque…"
                  onValueChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>
          <FormErrorSummary
            mensajes={Object.values(f.formState.errors).map((e) => e.message)}
            mensajeServidor={mutar.error?.message}
          />
          <div className="flex flex-wrap gap-3 my-5">
            <Button
              icono="aprobar"
              cargando={mutar.isPending}
              disabled={(!!s.generaPdf && !!bloqueoFirma) || !!bloqueoParqueo}
              motivoDeshabilitado={bloqueoParqueo ?? (s.generaPdf ? bloqueoFirma : undefined)}
              onClick={() => resolver('APROBADA')}
            >
              Aprobar
            </Button>
            <Button
              icono="rechazar"
              variante="peligro"
              disabled={mutar.isPending}
              onClick={() => resolver('RECHAZADA')}
            >
              Rechazar
            </Button>
          </div>
        </>
      )}
      {!!s.generaPdf && (s.estado === 'ENTREGADA' || (!empleado && s.estado === 'APROBADA')) && (
        <div className="my-5">
          <Button icono="ver" cargando={archivo.isPending} onClick={() => archivo.mutate()}>
            {empleado ? 'Ver y descargar documento' : 'Vista previa del PDF'}
          </Button>
          {preview && <PdfView documento={preview} onListo={alRevisar} />}
        </div>
      )}
      {!empleado && s.estado === 'APROBADA' && (
        <>
          <FormErrorSummary mensajes={[]} mensajeServidor={mutar.error?.message} />
          <Button
            icono="correo"
            cargando={mutar.isPending}
            disabled={!!s.generaPdf && !revisado}
            motivoDeshabilitado="Abre y revisa la vista previa antes de entregar el documento."
            onClick={() => setAccion('ENTREGADA')}
          >
            {s.generaPdf ? 'Enviar y entregar documento' : 'Confirmar entrega de la gestión'}
          </Button>
        </>
      )}
      <h3 className="mt-6">Historial de cambios</h3>
      <ol className="mt-3 space-y-3">
        {s.historial.map((h) => (
          <li key={h.id}>
            <Estado estado={h.estado} />
            <p>
              {h.fecha.slice(0, 10).split('-').reverse().join('/')} {h.fecha.slice(11)} · {h.actor}
            </p>
            {h.motivo && <p className="whitespace-pre-wrap">{h.motivo}</p>}
          </li>
        ))}
      </ol>
      <ConfirmModal
        abierto={!!accion}
        titulo={
          accion === 'REEMITIR'
            ? 'Reemitir documento con membrete'
            : accion === 'ENTREGADA'
              ? 'Confirmar entrega'
              : accion === 'APROBADA'
                ? 'Aprobar solicitud'
                : 'Rechazar solicitud'
        }
        descripcion={
          accion === 'REEMITIR'
            ? 'Se conserva el archivo original y se genera una nueva versión con el membrete y tu firma. Revisa el PDF y confirma nuevamente su entrega.'
            : accion === 'APROBADA' && s.tipo === 'PARQUEO'
              ? `Se creará una suscripción de ${s.vehiculo ?? 'vehículo pendiente'} desde ${mesActual}, con tarifa mensual de ${tarifaActual ? `Q ${formatoMoneda(tarifaActual.monto)}` : 'tarifa pendiente'}. El mes se cobra completo, sin prorrateo. Confirma que el empleado conoce la tarifa.`
              : accion === 'APROBADA' && s.tipo === 'ACTUALIZACION_DATOS'
                ? 'Se aplicarán los datos críticos propuestos al expediente y se notificará al empleado.'
                : accion === 'ENTREGADA'
                  ? 'Se registrará la entrega y se notificará al empleado. El PDF quedará disponible para su descarga.'
                  : 'La resolución quedará en el historial y se notificará al empleado.'
        }
        onCancelar={() => {
          if (!mutar.isPending) setAccion(undefined);
        }}
        onConfirmar={() => mutar.mutate()}
        cargando={mutar.isPending}
      />
    </section>
  );
}
