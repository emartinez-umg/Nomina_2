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
import { DateField, MoneyField, TextAreaField, FormErrorSummary } from '../../../components/forms';
import { useToast } from '../../../components/ui/Toast';
import { fechaSchema, hoyGuatemala } from '../../../lib/validadores';
import { mapearErrores } from '../../../lib/http';
import { Decimal } from 'decimal.js';
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
  const cache = useQueryClient(),
    toast = useToast();
  const [accion, setAccion] = useState<'APROBADA' | 'RECHAZADA' | 'ENTREGADA' | 'REEMITIR'>(),
    [preview, setPreview] = useState<api.Documento>();
  const [revisado, setRevisado] = useState(false);
  const alRevisar = useCallback(() => setRevisado(true), []);
  const f = useForm<{ motivo: string; monto: string; fechaInicio: string }>({
    mode: 'onBlur',
    defaultValues: { motivo: '', monto: '', fechaInicio: hoyGuatemala() },
    resolver: zodResolver(
      z.object({ motivo: z.string().max(500), monto: z.string(), fechaInicio: z.string() }),
    ),
  });
  const draft = useFormDraft('solicitud-resolucion', s.id, {
    form: f,
    version: 1,
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
              ...(accion === 'APROBADA' && s.tipo === 'PARQUEO'
                ? {
                    parqueo: {
                      monto: f.getValues('monto').replace(/,/g, ''),
                      fechaInicio: f.getValues('fechaInicio'),
                    },
                  }
                : {}),
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
      mapearErrores(e, f.setError, ['motivo', 'monto', 'fechaInicio']);
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
    if (estado === 'APROBADA' && s.tipo === 'PARQUEO') {
      const monto = f.getValues('monto').replace(/,/g, ''),
        fecha = f.getValues('fechaInicio');
      if (!/^\d{1,10}(\.\d{1,2})?$/.test(monto) || new Decimal(monto || 0).lte(0)) {
        f.setError('monto', {
          message: 'Ingresa una tarifa positiva por quincena, con hasta dos decimales.',
        });
        return;
      }
      if (!fechaSchema.safeParse(fecha).success || fecha < hoyGuatemala()) {
        f.setError('fechaInicio', { message: 'Selecciona hoy o una fecha futura.' });
        return;
      }
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
            <div className="form-grid my-4" data-tour="solicitud-parqueo">
              <Controller
                control={f.control}
                name="monto"
                render={({ field: { ref: _ref, ...field }, fieldState }) => (
                  <MoneyField
                    {...field}
                    required
                    label="Tarifa por quincena"
                    hint="Monto real que se descontará en cada quincena desde el inicio indicado."
                    onValueChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={f.control}
                name="fechaInicio"
                render={({ field: { ref: _ref, ...field }, fieldState }) => (
                  <DateField
                    {...field}
                    required
                    label="Inicio del descuento"
                    hint="Hoy o una fecha futura, posterior a los periodos cerrados."
                    min={hoyGuatemala()}
                    onValueChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </div>
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
              disabled={!!s.generaPdf && !!bloqueoFirma}
              motivoDeshabilitado={bloqueoFirma}
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
              ? `Se creará un descuento fijo de Q ${f.getValues('monto')} por quincena desde ${f.getValues('fechaInicio').split('-').reverse().join('/')}. Confirma que el empleado conoce la tarifa.`
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
