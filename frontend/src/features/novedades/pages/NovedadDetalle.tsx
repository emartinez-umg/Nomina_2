import { useDraftValues } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { detalle, anular, adjunto, descargarAdjunto, titulos } from '../api/novedades';
import type { Tipo, Fila } from '../api/novedades';
import { tipoValido, moneda, finVisible, NavegacionNovedades } from './NovedadesPage';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal, ConfirmModal } from '../../../components/ui/Modal';
import { TextAreaField } from '../../../components/forms';
import { fechaVisible } from '../../../lib/validadores';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { useSession } from '../../../app/session';
import { useToast } from '../../../components/ui/Toast';
import { ayudaNovedades } from '../help/pasos';
export function NovedadDetallePage() {
  const { tipo, id } = useParams();
  if (!tipoValido(tipo)) return <Navigate to="/novedades/descuentos" replace />;
  return <Detalle key={`${tipo}-${id}`} tipo={tipo} id={Number(id)} />;
}
function Detalle({ tipo, id }: { tipo: Tipo; id: number }) {
  const nav = useNavigate(),
    { usuario } = useSession();
  const ayuda = useMemo(() => ayudaNovedades(tipo, 'detalle'), [tipo]);
  usePageHelp(ayuda, usuario?.rol);
  const d = useQuery({
    queryKey: ['novedades', tipo, 'detalle', String(id)],
    queryFn: ({ signal }) => detalle(tipo, id, signal),
  });
  if (d.isPending) return <Skeleton lineas={6} />;
  if (d.error)
    return (
      <EmptyState
        titulo="No se pudo abrir la novedad"
        descripcion={d.error.message}
        accion={
          <Button icono="actualizar" onClick={() => void d.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  return <Ficha tipo={tipo} d={d.data} volver={() => nav(`/novedades/${tipo}`)} />;
}
function Ficha({ tipo, d, volver }: { tipo: Tipo; d: Fila; volver: () => void }) {
  const nav = useNavigate(),
    cache = useQueryClient(),
    toast = useToast();
  const { campo, draft } = useDraftValues(`novedad-${tipo}-anular`, d.id, { motivo: '' });
  const [motivo, setMotivo] = campo('motivo');
  const [anulando, setAnulando] = useState(false),
    [confirmando, setConfirmando] = useState(false),
    [guardando, setGuardando] = useState(false),
    [error, setError] = useState(''),
    [descargando, setDescargando] = useState(false);
  const protegida =
    d.autorizacion === 'RECHAZADA' ||
    !!d.bloqueada ||
    !d.activo ||
    ['LIQUIDADO', 'CANCELADO'].includes(d.estado);
  const cuotas = d.cuotasDetalle ?? [];
  let restante = new Decimal(d.monto ?? 0);
  return (
    <>
      <h1>
        {titulos[tipo]} · #{d.id}
      </h1>
      <NavegacionNovedades tipo={tipo} />
      <Card>
        <section data-tour="novedad-detalle">
          <h2>{d.empleado}</h2>
          <p className="my-3 text-secundario">
            {d.tipoNombre ?? titulos[tipo]} · {d.activo ? d.estado : 'ANULADA'}
          </p>
          {protegida && (
            <p className="alerta my-3">
              Registro protegido: periodo cerrado, consumo en nómina o estado finalizado.
            </p>
          )}
          <dl className="form-grid my-5">
            {Object.entries({
              Mes: d.mes,
              'Autorización del origen': d.autorizacion,
              'Estado de aplicación': d.estadoAplicacion,
              'Pago aplicado': d.idPago,
              'Descuento por ausencias': d.descuento ? moneda(d.descuento) : undefined,
              Inicio: fechaVisible(d.fechaInicio),
              Fin: finVisible(d.fechaFin),
              Modalidad: d.modalidad,
              Monto: d.monto ? moneda(d.monto) : undefined,
              'Cuota mensual': d.montoQuincena ? moneda(d.montoQuincena) : undefined,
              'Saldo pendiente': d.saldo != null ? moneda(d.saldo) : undefined,
              Cuotas: d.cuotas,
              Referencia: d.referencia,
              Desembolso: d.fechaDesembolso ? fechaVisible(d.fechaDesembolso) : undefined,
              Horas: d.horas,
              Jornada: d.jornada,
              Efecto: d.efecto,
              'Días calendario': d.dias,
              Motivo: d.motivo,
            })
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => (
                <div
                  key={k}
                  className={k === 'Motivo' ? 'col-span-12' : 'col-span-12 md:col-span-4'}
                >
                  <dt className="text-secundario">{k}</dt>
                  <dd className="mt-1 font-bold">{v}</dd>
                </div>
              ))}
          </dl>
          {d.calculo && (
            <p className="banda-informativa">
              Valor hora: {moneda(d.calculo.valorHora)} · Recargo {d.calculo.recargo}% · Importe
              estimado: {moneda(d.calculo.monto)}
            </p>
          )}
          {!!d.origenes?.length && (
            <details className="my-4">
              <summary>Registros originales v0 ({d.origenes.length})</summary>
              {d.origenes.map((o) => (
                <p key={`${o.entidad}-${o.id}`}>
                  {o.entidad} #{o.id} · {o.fecha ? fechaVisible(o.fecha) : ''}{' '}
                  {o.cantidad ? `${o.cantidad} h` : ''} {o.monto ? moneda(o.monto) : ''} ·{' '}
                  {o.estado} · {o.descripcion}
                </p>
              ))}
            </details>
          )}
          {d.aplicaciones?.map((m, i) => (
            <p key={`${m.mes}-${i}`}>
              {m.mes} · {m.dias} días · {moneda(m.monto)} · {m.estado}{' '}
              {m.idPago ? `· Pago #${m.idPago}` : ''}
            </p>
          ))}
          {d.advertencia && <p className="alerta">{d.advertencia}</p>}
          {cuotas.length > 0 && (
            <div className="table-scroll my-5">
              <table>
                <caption>Tabla de amortización y pagos registrados</caption>
                <thead>
                  <tr>
                    <th>Cuota</th>
                    <th>Vencimiento</th>
                    <th>Monto</th>
                    <th>Pagado</th>
                    <th>Saldo previsto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cuotas.map((c) => {
                    restante = restante.minus(c.monto);
                    return (
                      <tr key={c.id}>
                        <td>{c.numero}</td>
                        <td>{fechaVisible(c.fecha)}</td>
                        <td>{moneda(c.monto)}</td>
                        <td>{moneda(c.pagado)}</td>
                        <td>{moneda(restante.toFixed(2))}</td>
                        <td>{c.estado}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="campo-hint">
                Los saldos previstos suponen cada cuota pagada. Saldo pendiente refleja únicamente
                los cobros registrados. La última cuota liquida automáticamente el acuerdo.
              </p>
            </div>
          )}
          {d.soporteNombre && (
            <div className="my-5">
              <p>Respaldo: {d.soporteNombre}</p>
              <Button
                icono="exportar"
                variante="secundario"
                cargando={descargando}
                onClick={() => {
                  setDescargando(true);
                  void adjunto(d.id)
                    .then(descargarAdjunto)
                    .catch((e) => toast((e as Error).message, 'peligro'))
                    .finally(() => setDescargando(false));
                }}
              >
                Descargar respaldo
              </Button>
            </div>
          )}
          <div className="my-5 flex flex-wrap gap-3">
            <Button icono="anterior" variante="secundario" onClick={volver}>
              Volver al listado
            </Button>
            <Button
              icono="ver"
              variante="secundario"
              onClick={() => nav(`/empleados/${d.idEmpleado}`)}
            >
              Ficha del empleado
            </Button>
            <Button
              icono="editar"
              disabled={protegida}
              motivoDeshabilitado={
                protegida ? 'Conserva el registro histórico. No admite cambios.' : undefined
              }
              onClick={() => nav(`/novedades/${tipo}/${d.id}/editar`)}
            >
              Editar / autorizar
            </Button>
            <Button
              icono="eliminar"
              variante="peligro"
              disabled={protegida}
              motivoDeshabilitado={
                protegida ? 'Conserva el registro histórico. No admite anulación.' : undefined
              }
              onClick={() => {
                setAnulando(true);
                setError('');
              }}
            >
              Anular
            </Button>
          </div>
        </section>
      </Card>
      <Modal
        abierto={anulando && !confirmando}
        titulo="Motivo de anulación"
        onCerrar={() => {
          if (!guardando) setAnulando(false);
        }}
      >
        <FormDraftNotice draft={draft} />
        <div className="my-5">
          <TextAreaField
            name="motivo"
            label="Motivo"
            hint="Explica la anulación con 5–500 caracteres. Se conservará el registro auditado."
            value={motivo}
            onValueChange={setMotivo}
            required
            maxLength={500}
          />
          {error && (
            <p role="alert" className="alerta my-3">
              {error}
            </p>
          )}
          <Button
            icono="ver"
            onClick={() => {
              if (motivo.trim().length < 5) {
                setError('Explica el motivo con al menos 5 caracteres.');
                return;
              }
              setConfirmando(true);
            }}
          >
            Revisar anulación
          </Button>
        </div>
      </Modal>
      <ConfirmModal
        abierto={confirmando}
        titulo="Confirmar anulación"
        descripcion={`Se anulará ${titulos[tipo]} #${d.id} de ${d.empleado}. Motivo: ${motivo}. Se conserva el historial.`}
        cargando={guardando}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() => {
          if (guardando) return;
          setGuardando(true);
          void anular(tipo, d.id, motivo)
            .then(async () => {
              draft.limpiar();
              await cache.invalidateQueries({ queryKey: ['novedades'] });
              await cache.invalidateQueries({ queryKey: ['empleados'] });
              setConfirmando(false);
              setAnulando(false);
              toast('Novedad anulada y auditada.');
            })
            .catch((e) => {
              setError((e as Error).message);
              setConfirmando(false);
            })
            .finally(() => setGuardando(false));
        }}
      />
    </>
  );
}
