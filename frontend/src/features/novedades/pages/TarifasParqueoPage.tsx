import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { useSession } from '../../../app/session';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaTarifas } from '../help/parqueo';
import { useDraftValues } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { MonthField } from '../../../components/forms/MonthField';
import { MoneyField, SelectField, TextAreaField } from '../../../components/forms';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { ConfirmModal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { tarifas, guardarTarifa } from '../api/parqueo';
import { hoyGuatemala, fechaVisible } from '../../../lib/validadores';
import { moneda } from './NovedadesPage';
export function TarifasParqueoPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaTarifas, usuario?.rol);
  const hoy = hoyGuatemala(),
    cache = useQueryClient(),
    { campo, draft } = useDraftValues('tarifas-parqueo', undefined, {
      vehiculo: 'CARRO',
      mes: hoy.slice(0, 7),
      monto: '',
      motivo: '',
    }),
    [vehiculo, setVehiculo] = campo('vehiculo'),
    [mes, setMes] = campo('mes'),
    [monto, setMonto] = campo('monto'),
    [motivo, setMotivo] = campo('motivo'),
    [confirmar, setConfirmar] = useState(false);
  const q = useQuery({
    queryKey: ['novedades', 'tarifas'],
    queryFn: ({ signal }) => tarifas(signal),
  });
  const m = useMutation({
    mutationFn: () =>
      guardarTarifa({ vehiculo, mes, monto: monto.replace(/,/g, ''), motivo, confirmado: true }),
    onSuccess: () => {
      draft.limpiar();
      setConfirmar(false);
      setMonto('');
      setMotivo('');
      void cache.invalidateQueries({ queryKey: ['novedades'] });
    },
    onError: () => setConfirmar(false),
  });
  const importe = monto.replace(/,/g, ''),
    valido =
      /^\d{1,10}(\.\d{1,2})?$/.test(importe) &&
      new Decimal(importe || 0).gt(0) &&
      motivo.trim().length >= 5 &&
      !!mes;
  const anterior = q.data?.find(
    (t) =>
      t.vehiculo === vehiculo && t.desde <= `${mes}-01` && (!t.hasta || t.hasta >= `${mes}-01`),
  );
  return (
    <>
      <h1>Tarifas mensuales de parqueo</h1>
      <Card>
        <section data-tour="tarifas-parqueo">
          <p className="banda-informativa">
            Configura las tarifas reales de Carro y Moto. Cada nueva vigencia conserva el historial
            y requiere motivo y confirmación.
          </p>
          <FormDraftNotice draft={draft} />
          <div className="form-grid my-5">
            <div className="col-span-12 md:col-span-4">
              <SelectField
                name="vehiculo"
                label="Vehículo"
                hint="Tarifas independientes para Carro y Moto."
                value={vehiculo}
                onValueChange={setVehiculo}
                opciones={['CARRO', 'MOTO'].map((value) => ({
                  value,
                  label: value === 'CARRO' ? 'Carro' : 'Moto',
                }))}
                required
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <MonthField
                name="mes"
                label="Vigente desde el mes"
                hint="Comienza el primer día del mes; no altera periodos cerrados."
                value={mes}
                onValueChange={setMes}
                max={`${Number(hoy.slice(0, 4)) + 5}-12`}
                required
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <MoneyField
                name="monto"
                label="Tarifa mensual"
                hint="Monto mayor que cero con dos decimales. Sin prorrateo."
                value={monto}
                onValueChange={setMonto}
                required
              />
            </div>
            <div className="col-span-12">
              <TextAreaField
                name="motivo"
                label="Motivo del cambio"
                hint="Explica el cambio con 5–500 caracteres. Quedará auditado."
                value={motivo}
                onValueChange={setMotivo}
                maxLength={500}
                required
              />
            </div>
          </div>
          <p>
            Anterior: {moneda(anterior?.monto)} → Nueva: {moneda(importe)}
          </p>
          {m.error && (
            <p role="alert" className="alerta my-3">
              {m.error.message}
            </p>
          )}
          <Button
            icono="guardar"
            disabled={!valido || q.isPending || !!q.error || m.isPending}
            onClick={() => setConfirmar(true)}
          >
            Revisar y guardar tarifa
          </Button>
          {q.isPending ? (
            <Skeleton lineas={4} />
          ) : q.error ? (
            <p role="alert">
              {q.error.message}
              <Button icono="actualizar" onClick={() => void q.refetch()}>
                Reintentar
              </Button>
            </p>
          ) : (
            <div
              className="table-scroll my-5"
              tabIndex={0}
              role="region"
              aria-label="Tabla de resumen"
            >
              <table>
                <caption>Historial de tarifas</caption>
                <thead>
                  <tr>
                    <th>Vehículo</th>
                    <th>Mensual</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data?.map((t) => (
                    <tr key={t.id}>
                      <td>{t.vehiculo}</td>
                      <td>{moneda(t.monto)}</td>
                      <td>{fechaVisible(t.desde)}</td>
                      <td>{t.hasta ? fechaVisible(t.hasta) : 'Vigente sin fin'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!q.data?.length && (
                <p>No hay tarifas. Registra Carro y Moto antes de aprobar parqueos.</p>
              )}
            </div>
          )}
        </section>
      </Card>
      <ConfirmModal
        abierto={confirmar}
        titulo="Confirmar tarifa mensual"
        descripcion={`${vehiculo} desde ${mes}: ${moneda(anterior?.monto)} → ${moneda(importe)}. Motivo: ${motivo}. Los periodos cerrados conservan sus importes.`}
        cargando={m.isPending}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => m.mutate()}
      />
    </>
  );
}
