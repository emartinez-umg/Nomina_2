import { descargar } from '../../empleados/api/empleados';
import { useToast } from '../../../components/ui/Toast';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaParqueo } from '../help/parqueo';
import { useDraftValues } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { MonthField } from '../../../components/forms/MonthField';
import { TextField, TextAreaField, SelectField } from '../../../components/forms';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Modal, ConfirmModal } from '../../../components/ui/Modal';
import { listarParqueo, cambiarParqueo, exportarParqueo } from '../api/parqueo';
import type { Suscripcion } from '../api/parqueo';
import { hoyGuatemala } from '../../../lib/validadores';
import { moneda } from './NovedadesPage';
export function ParqueoPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaParqueo, usuario?.rol);
  const toast = useToast(),
    [orden, setOrden] = useState<{ campo: string; direccion: 'asc' | 'desc' }>({
      campo: 'id',
      direccion: 'desc',
    }),
    [exportando, setExportando] = useState(false);
  const empleado = usuario?.rol === 'EMPLEADO',
    hoy = hoyGuatemala(),
    nav = useNavigate(),
    cache = useQueryClient();
  const [mes, setMes] = useState(hoy.slice(0, 7)),
    [pagina, setPagina] = useState(1),
    [buscar, setBuscar] = useState(''),
    [estado, setEstado] = useState(''),
    [accion, setAccion] = useState<{ s: Suscripcion; tipo: string }>();
  const q = useQuery({
    queryKey: ['novedades', 'parqueo', mes, pagina, buscar, estado, orden],
    queryFn: ({ signal }) =>
      listarParqueo(
        {
          mes,
          pagina: String(pagina),
          buscar,
          estado,
          ordenarPor: orden.campo,
          direccion: orden.direccion,
        },
        signal,
      ),
  });
  const invalidar = () => {
    void cache.invalidateQueries({ queryKey: ['novedades'] });
    void cache.invalidateQueries({ queryKey: ['notificaciones'] });
    setAccion(undefined);
  };
  const motivoBloqueo = (r: Suscripcion, tipo: string) =>
    r.estado !== 'ACTIVA'
      ? 'Suscripción finalizada. Solicita un alta nueva.'
      : r.inicio > hoy.slice(0, 7)
        ? 'La suscripción aún no comenzó.'
        : r.gestionBloqueada
          ? 'El mes en curso está cerrado y no admite gestiones de parqueo.'
          : tipo === 'COMPLETAR' && r.completarBloqueado
            ? 'El cargo actual está aplicado; conserva el vehículo histórico.'
            : tipo === 'SOLICITAR_BAJA' && r.bajaSolicitada
              ? 'Ya existe una baja solicitada.'
              : undefined;
  return (
    <>
      <h1>{empleado ? 'Mi parqueo' : 'Suscripciones de parqueo'}</h1>
      <Card>
        <p className="banda-informativa">
          Tarifa mensual completa desde la aprobación. La baja o suspensión conserva el cargo del
          mes en curso y detiene los siguientes.
        </p>
        <details open className="my-5" data-tour="parqueo-filtros">
          <summary className="cursor-pointer text-primario">Filtros de parqueo</summary>
          <div className="form-grid my-4">
            <div className="col-span-12 md:col-span-4">
              <MonthField
                name="mes"
                label="Mes"
                hint="Consulta tarifa y estado del cargo de este mes."
                value={mes}
                max={hoy.slice(0, 7)}
                onValueChange={(v) => {
                  if (v) {
                    setMes(v);
                    setPagina(1);
                  }
                }}
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <TextField
                name="buscar"
                label="Buscar"
                hint="Empleado, código o placa."
                value={buscar}
                onValueChange={(v) => {
                  setBuscar(v);
                  setPagina(1);
                }}
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <SelectField
                name="estado"
                label="Estado"
                hint="Estado de la suscripción; la baja se hace efectiva al finalizar su último mes."
                value={estado}
                onValueChange={(v) => {
                  setEstado(v);
                  setPagina(1);
                }}
                opciones={['ACTIVA', 'BAJA', 'SUSPENDIDA'].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </div>
          </div>
        </details>
        <div role="group" aria-label="Filtros activos" className="my-3 flex flex-wrap gap-2">
          {mes !== hoy.slice(0, 7) && (
            <Button
              icono="cancelar"
              variante="texto"
              onClick={() => {
                setMes(hoy.slice(0, 7));
                setPagina(1);
              }}
            >
              Mes: {mes}
            </Button>
          )}
          {buscar && (
            <Button
              icono="cancelar"
              variante="texto"
              onClick={() => {
                setBuscar('');
                setPagina(1);
              }}
            >
              Buscar: {buscar}
            </Button>
          )}
          {estado && (
            <Button
              icono="cancelar"
              variante="texto"
              onClick={() => {
                setEstado('');
                setPagina(1);
              }}
            >
              Estado: {estado}
            </Button>
          )}
        </div>
        <div className="my-4 flex flex-wrap gap-3">
          <Button
            icono="exportar"
            cargando={exportando}
            onClick={() => {
              setExportando(true);
              void exportarParqueo({
                mes,
                buscar,
                estado,
                ordenarPor: orden.campo,
                direccion: orden.direccion,
              })
                .then((csv) => descargar(csv, `parqueo-${mes}.csv`))
                .catch((e) => toast((e as Error).message, 'peligro'))
                .finally(() => setExportando(false));
            }}
          >
            Exportar CSV
          </Button>
          <Button
            icono="cancelar"
            variante="texto"
            onClick={() => {
              setBuscar('');
              setEstado('');
              setMes(hoy.slice(0, 7));
              setPagina(1);
            }}
          >
            Limpiar filtros
          </Button>
          <Button
            icono={empleado ? 'crear' : 'configuracion'}
            onClick={() =>
              nav(empleado ? '/mis-gestiones/solicitudes?nueva=PARQUEO' : '/configuracion/parqueo')
            }
          >
            {empleado ? 'Solicitar parqueo' : 'Configurar tarifas'}
          </Button>
        </div>
        <div data-tour="parqueo-tabla">
          <Table<Suscripcion>
            columnas={[
              { id: 'empleado', titulo: 'Empleado', ordenable: true, render: (r) => r.empleado },
              {
                id: 'vehiculo',
                titulo: 'Vehículo / placa',
                render: (r) => (
                  <>
                    {r.vehiculo ?? 'Completar vehículo'} · {r.placa ?? 'Sin placa'}
                    {r.montoAnterior && <p>Cuota v0: {moneda(r.montoAnterior)}</p>}
                  </>
                ),
              },
              {
                id: 'vigencia',
                titulo: 'Vigencia',
                render: (r) => `${r.inicio} → ${r.fin ?? 'Continua'}`,
              },
              {
                id: 'estado',
                titulo: 'Estado',
                ordenable: true,
                render: (r) => `${r.estado}${r.bajaSolicitada ? ' · Baja solicitada' : ''}`,
              },
              {
                id: 'tarifa',
                titulo: `Cargo ${mes}`,
                render: (r) =>
                  mes < r.inicio || (r.fin && mes > r.fin) ? (
                    'No corresponde'
                  ) : (
                    <>
                      {moneda(r.tarifa)} · {r.estadoAplicacion}
                      {r.idPago ? ` · Pago #${r.idPago}` : ''}
                      {!r.tarifa && <p>Completar vehículo/tarifa</p>}
                    </>
                  ),
              },
              {
                id: 'acciones',
                titulo: 'Acciones',
                render: (r) => (
                  <div className="flex flex-wrap gap-2">
                    {(empleado
                      ? ['SOLICITAR_BAJA']
                      : r.vehiculo
                        ? ['BAJA', 'SUSPENDER']
                        : ['COMPLETAR', 'BAJA', 'SUSPENDER']
                    ).map((tipo) => (
                      <Button
                        key={tipo}
                        icono={tipo === 'COMPLETAR' ? 'editar' : 'cancelar'}
                        variante="texto"
                        disabled={!!motivoBloqueo(r, tipo)}
                        motivoDeshabilitado={motivoBloqueo(r, tipo)}
                        onClick={() => setAccion({ s: r, tipo })}
                      >
                        {tipo === 'SOLICITAR_BAJA'
                          ? 'Solicitar baja'
                          : tipo === 'COMPLETAR'
                            ? 'Completar vehículo'
                            : tipo === 'BAJA'
                              ? 'Dar de baja'
                              : 'Suspender'}
                      </Button>
                    ))}
                  </div>
                ),
              },
            ]}
            orden={orden}
            onOrden={(campo, direccion) => {
              setOrden({ campo, direccion });
              setPagina(1);
            }}
            filas={q.data?.registros ?? []}
            clave={(r) => r.id}
            pagina={pagina}
            limite={20}
            total={q.data?.total ?? 0}
            onPagina={setPagina}
            cargando={q.isPending}
            {...(q.error ? { error: q.error.message } : {})}
            onReintentar={() => void q.refetch()}
          />
        </div>
      </Card>
      {accion && (
        <Cambio
          key={`${accion.s.id}-${accion.tipo}`}
          {...accion}
          onCerrar={() => setAccion(undefined)}
          onExito={invalidar}
        />
      )}
    </>
  );
}
function Cambio({
  s,
  tipo,
  onCerrar,
  onExito,
}: {
  s: Suscripcion;
  tipo: string;
  onCerrar: () => void;
  onExito: () => void;
}) {
  const { campo, draft } = useDraftValues(`parqueo-${tipo}`, s.id, {
      motivo: '',
      vehiculo: '',
      placa: '',
    }),
    [motivo, setMotivo] = campo('motivo'),
    [vehiculo, setVehiculo] = campo('vehiculo'),
    [placa, setPlaca] = campo('placa'),
    [confirmar, setConfirmar] = useState(false);
  const m = useMutation({
    mutationFn: () =>
      cambiarParqueo(s.id, {
        accion: tipo,
        motivo,
        confirmado: true,
        ...(tipo === 'COMPLETAR' ? { vehiculo, placa } : {}),
      }),
    onSuccess: () => {
      draft.limpiar();
      onExito();
    },
    onError: () => setConfirmar(false),
  });
  return (
    <>
      <Modal
        abierto
        titulo={tipo === 'COMPLETAR' ? 'Completar parqueo migrado' : 'Gestionar parqueo'}
        onCerrar={() => {
          if (!m.isPending) onCerrar();
        }}
      >
        <FormDraftNotice draft={draft} />
        <p data-tour="parqueo-cambio">{s.empleado}</p>
        {tipo === 'COMPLETAR' && (
          <>
            <SelectField
              name="vehiculo"
              label="Vehículo"
              hint="Selecciona el vehículo real; requiere tarifa mensual vigente."
              value={vehiculo}
              onValueChange={setVehiculo}
              opciones={['CARRO', 'MOTO'].map((value) => ({
                value,
                label: value === 'CARRO' ? 'Carro' : 'Moto',
              }))}
              required
            />
            <TextField
              name="placa"
              label="Placa (opcional)"
              hint="Letras, números y guion; hasta 12 caracteres."
              value={placa}
              onValueChange={(v) => setPlaca(v.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
              maxLength={12}
            />
          </>
        )}
        <TextAreaField
          name="motivo"
          label="Motivo"
          hint="Explica la gestión con 5–500 caracteres. Quedará en auditoría."
          value={motivo}
          onValueChange={setMotivo}
          maxLength={500}
          required
        />
        {m.error && <p role="alert">{m.error.message}</p>}
        <Button
          icono="ver"
          disabled={motivo.trim().length < 5 || (tipo === 'COMPLETAR' && !vehiculo)}
          onClick={() => setConfirmar(true)}
        >
          Revisar cambio
        </Button>
      </Modal>
      <ConfirmModal
        abierto={confirmar}
        titulo="Confirmar gestión de parqueo"
        descripcion={`${s.empleado}. ${tipo === 'SOLICITAR_BAJA' ? 'RRHH recibirá tu solicitud; el cargo continúa hasta su resolución.' : tipo === 'COMPLETAR' ? `Vehículo: ${vehiculo}. Se usará la tarifa mensual configurada.` : 'El cargo del mes actual se conserva completo; no habrá cargos en meses posteriores.'} Motivo: ${motivo}`}
        cargando={m.isPending}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => m.mutate()}
      />
    </>
  );
}
