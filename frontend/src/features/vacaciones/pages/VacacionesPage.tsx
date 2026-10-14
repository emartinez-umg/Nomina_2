import { CampoCodigo } from '../../../components/forms/CampoCodigo';
import { useDraftValues, useFormDraft } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { DayPicker } from 'react-day-picker';
import type { CSSProperties } from 'react';
import { tokens } from '../../../styles/tokens';
import type { DateRange } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import * as api from '../api/vacaciones';
import type { Fila, Saldo } from '../api/vacaciones';
import { ayudaVacaciones } from '../help/pasos';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { useSession } from '../../../app/session';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Badge } from '../../../components/ui/Badge';
import { Modal, ConfirmModal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useToast } from '../../../components/ui/Toast';
import {
  DateField,
  FormErrorSummary,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../components/forms';
import { ReferenciaNovedad } from '../../novedades/pages/CampoNovedad';
import { descargar } from '../../empleados/api/empleados';
import { fechaVisible, hoyGuatemala } from '../../../lib/validadores';
import { mapearErrores } from '../../../lib/http';
export function VacacionesPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaVacaciones, usuario?.rol);
  return (
    <div>
      <h1>{usuario?.rol === 'EMPLEADO' ? 'Mis vacaciones' : 'Vacaciones'}</h1>
      <p className="text-secundario mb-5">
        Consulta el saldo, revisa días laborales y da seguimiento a las solicitudes.
      </p>
      {usuario?.rol === 'EMPLEADO' ? <Portal /> : <GestionSaldo />}
      <Bandeja empleado={usuario?.rol === 'EMPLEADO'} />
    </div>
  );
}
function SaldoCard({ s }: { s: Saldo }) {
  const [kardex, setKardex] = useState(false);
  return (
    <Card data-tour="vacaciones-saldo" className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2>{s.empleado}</h2>
          <p className="text-secundario">
            Al {fechaVisible(s.corte)} · meses cumplidos desde la contratación
          </p>
          <p className="vacaciones-disponible">
            {s.disponible} <span>días disponibles</span>
          </p>
          <p>
            Apertura: {s.saldoInicial} · Acumulados: {s.acumulado}
          </p>
        </div>
        <Button
          icono="documento"
          variante="secundario"
          aria-expanded={kardex}
          onClick={() => setKardex((v) => !v)}
        >
          Ver kardex
        </Button>
      </div>
      {kardex && (
        <div className="table-scroll mt-5">
          <table>
            <caption>Kardex de vacaciones</caption>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Días</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {s.kardex.map((m) => (
                <tr key={m.id}>
                  <td>{fechaVisible(m.fecha)}</td>
                  <td>{m.tipo.replace(/_/g, ' ')}</td>
                  <td>{m.dias}</td>
                  <td>{m.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!s.kardex.length && (
            <p>No hay movimientos todavía. La acumulación empieza al cumplir el primer mes.</p>
          )}
        </div>
      )}
    </Card>
  );
}
function Portal() {
  const cache = useQueryClient(),
    toast = useToast();
  const { campo, valores, draft } = useDraftValues('vacaciones-solicitud', undefined, {
    inicio: '',
    fin: '',
  });
  const [, setInicio] = campo('inicio');
  const [, setFin] = campo('fin');
  const rango: DateRange | undefined = valores.inicio
    ? {
        from: new Date(`${valores.inicio}T12:00:00`),
        to: valores.fin ? new Date(`${valores.fin}T12:00:00`) : undefined,
      }
    : undefined;
  const setRango = (r: DateRange | undefined) => {
    setInicio(r?.from ? api.isoLocal(r.from) : '');
    setFin(r?.to ? api.isoLocal(r.to) : '');
  };
  const [error, setError] = useState(''),
    [confirmar, setConfirmar] = useState(false);
  const hoy = hoyGuatemala(),
    fin = new Date(Date.parse(hoy) + 365 * 86400000).toISOString().slice(0, 10);
  const s = useQuery({
    queryKey: ['vacaciones', 'saldo'],
    queryFn: ({ signal }) => api.saldo(undefined, signal),
  });
  const c = useQuery({
    queryKey: ['vacaciones', 'calendario', hoy],
    queryFn: ({ signal }) => api.calendario(hoy, fin, signal),
  });
  const inicio = rango?.from ? api.isoLocal(rango.from) : '',
    hasta = rango?.to ? api.isoLocal(rango.to) : '';
  const p = useQuery({
    queryKey: ['vacaciones', 'preview', inicio, hasta],
    queryFn: ({ signal }) => api.preview(inicio, hasta, signal),
    enabled: !!inicio && !!hasta,
  });
  const crear = useMutation({
    mutationFn: () => api.crear(inicio, hasta),
    onSuccess: () => {
      draft.limpiar();
      toast('Solicitud enviada a RRHH.');
      setConfirmar(false);
      setRango(undefined);
      void cache.invalidateQueries({ queryKey: ['vacaciones'] });
      void cache.invalidateQueries({ queryKey: ['notificaciones'] });
    },
    onError: (e) => {
      setConfirmar(false);
      setError(e.message);
      void cache.invalidateQueries({ queryKey: ['vacaciones'] });
    },
  });
  if (s.isPending || c.isPending) return <Skeleton lineas={8} />;
  if (s.error || c.error)
    return (
      <EmptyState
        titulo="No se pudo cargar tu calendario y saldo"
        descripcion={(s.error ?? c.error)!.message}
        accion={
          <Button
            icono="actualizar"
            onClick={() => {
              void s.refetch();
              void c.refetch();
            }}
          >
            Reintentar
          </Button>
        }
      />
    );
  const dias = new Map(c.data!.dias.map((d) => [d.fecha, d]));
  const motivo =
    error ||
    p.error?.message ||
    p.data?.bloqueo ||
    (!hasta
      ? 'Selecciona el inicio y fin del rango.'
      : p.isFetching
        ? 'Revisando días y saldo…'
        : undefined);
  return (
    <>
      <SaldoCard s={s.data!} />
      <FormDraftNotice draft={draft} />
      <CampoCodigo entidad="solicitudes" />
      <Card className="mb-5">
        <div className="vacaciones-seleccion">
          <section data-tour="vacaciones-calendario">
            <h2>Solicitar vacaciones</h2>
            <p className="campo-hint">
              Selecciona el inicio y el fin en días laborales. Los descansos y feriados intermedios
              no consumen saldo.
            </p>
            <div className="calendario">
              <DayPicker
                style={
                  {
                    '--rdp-accent-color': tokens.colores.primario,
                    '--rdp-accent-background-color': tokens.colores.suave,
                  } as CSSProperties
                }
                mode="range"
                locale={es}
                selected={rango}
                startMonth={new Date(`${hoy}T12:00:00`)}
                endMonth={new Date(`${fin}T12:00:00`)}
                showOutsideDays
                disabled={(dia) => {
                  const f = api.isoLocal(dia),
                    d = dias.get(f);
                  return f < c.data!.hoy || !d || !d.laborable || d.bloqueado;
                }}
                onSelect={(r) => {
                  setError('');
                  if (
                    r?.from &&
                    r.to &&
                    !api.rangoLibre(api.isoLocal(r.from), api.isoLocal(r.to), c.data!)
                  ) {
                    setError(
                      'El rango cruza una solicitud, ausencia o periodo cerrado. Selecciona fechas libres.',
                    );
                    return;
                  }
                  setRango(r);
                }}
              />
            </div>
            <p className="campo-hint">
              Días atenuados: descanso, feriado, fecha pasada o bloqueo. Puedes navegar hasta un
              año.
            </p>
            <Button
              icono="cancelar"
              variante="texto"
              onClick={() => {
                setRango(undefined);
                setError('');
              }}
            >
              Limpiar rango
            </Button>
          </section>
          <section data-tour="vacaciones-enviar" aria-live="polite">
            <h2>Revisa tu solicitud</h2>
            <p>Inicio: {inicio ? fechaVisible(inicio) : 'Selecciona una fecha'}</p>
            <p>Fin: {hasta ? fechaVisible(hasta) : 'Selecciona una fecha'}</p>
            {p.data && (
              <div
                className={`vacaciones-comparacion ${p.data.alcanza ? 'vacaciones-verde' : 'vacaciones-rojo'}`}
              >
                <strong>{p.data.dias} días laborales</strong>
                <p>{p.data.disponible} días disponibles</p>
                <p>{p.data.alcanza ? 'El saldo alcanza.' : 'El saldo no alcanza.'}</p>
              </div>
            )}
            {!hasta && (
              <p className="campo-hint my-4">
                Selecciona el inicio y el fin para revisar los días laborales.
              </p>
            )}
            <FormErrorSummary
              mensajes={[error || p.error?.message || p.data?.bloqueo || undefined]}
            />
            <Button
              icono="crear"
              disabled={!p.data?.puedeAprobar || p.isFetching || !!error || crear.isPending}
              motivoDeshabilitado={motivo}
              onClick={() => setConfirmar(true)}
            >
              Enviar solicitud
            </Button>
          </section>
        </div>
      </Card>
      <ConfirmModal
        abierto={confirmar}
        titulo="Enviar solicitud de vacaciones"
        descripcion={`Solicitarás ${p.data?.dias ?? ''} días laborales del ${fechaVisible(inicio)} al ${fechaVisible(hasta)}. RRHH revisará tu solicitud; el saldo se descuenta al aprobar.`}
        cargando={crear.isPending}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => crear.mutate()}
      />
    </>
  );
}
export function Semaforo({ f }: { f: Pick<Fila, 'disponible' | 'dias' | 'alcanza' | 'bloqueo'> }) {
  return (
    <div className={`vacaciones-comparacion ${f.alcanza ? 'vacaciones-verde' : 'vacaciones-rojo'}`}>
      <strong>{f.alcanza ? 'Saldo suficiente' : 'Saldo insuficiente o no verificable'}</strong>
      <p>
        Disponible: {f.disponible ?? 'Sin verificar'} · Solicita: {f.dias} días
      </p>
      {f.bloqueo && <p>{f.bloqueo}</p>}
    </div>
  );
}
export function AprobarVacaciones({ f, onClick }: { f: Fila; onClick: () => void }) {
  return (
    <Button
      icono="aprobar"
      disabled={!f.puedeAprobar}
      motivoDeshabilitado={
        !f.puedeAprobar ? (f.bloqueo ?? 'La solicitud ya fue resuelta.') : undefined
      }
      onClick={onClick}
    >
      Aprobar
    </Button>
  );
}
function Bandeja({ empleado }: { empleado: boolean }) {
  const cache = useQueryClient(),
    toast = useToast();
  const [params] = useSearchParams();
  const [q, setQ] = useState<Record<string, string>>({
    pagina: '1',
    limite: '10',
    ordenarPor: 'id',
    direccion: 'desc',
    estado: empleado ? '' : 'EN_PROCESO',
    idEmpleado: empleado ? '' : (params.get('empleado') ?? ''),
  });
  const [filtros, setFiltros] = useState(false),
    [resolucion, setResolucion] = useState<{ fila: Fila; estado: 'APROBADA' | 'RECHAZADA' }>();
  const datos = useQuery({
    queryKey: ['vacaciones', 'solicitudes', q],
    queryFn: ({ signal }) => api.listar(q, signal),
  });
  const exportacion = useMutation({
    mutationFn: () => api.exportar(q),
    onSuccess: (csv) => descargar(csv, 'vacaciones.csv'),
    onError: (e) => toast(e.message, 'peligro'),
  });
  const cambiar = (k: string, v: string) => setQ((prev) => ({ ...prev, [k]: v, pagina: '1' }));
  const limpiar = () => setQ({ pagina: '1', limite: '10', ordenarPor: 'id', direccion: 'desc' });
  const activos = Object.entries(q).filter(
    ([k, v]) => v && !['pagina', 'limite', 'ordenarPor', 'direccion'].includes(k),
  );
  return (
    <Card data-tour="vacaciones-bandeja">
      <div className="flex flex-wrap justify-between gap-3">
        <h2>{empleado ? 'Mis solicitudes' : 'Bandeja de solicitudes'}</h2>
        <div className="flex gap-2">
          <Button
            icono="filtrar"
            variante="secundario"
            onClick={() => setFiltros((v) => !v)}
            aria-expanded={filtros}
          >
            Filtros
          </Button>
          <Button
            icono="exportar"
            variante="secundario"
            cargando={exportacion.isPending}
            onClick={() => exportacion.mutate()}
          >
            Exportar CSV
          </Button>
        </div>
      </div>
      <section data-tour="vacaciones-filtros">
        {filtros && (
          <div className="form-grid my-5">
            {!empleado && (
              <>
                <TextField
                  name="buscar"
                  label="Buscar empleado"
                  hint="Nombre, apellido o código del expediente o solicitud."
                  value={q.buscar ?? ''}
                  onValueChange={(v) => cambiar('buscar', v)}
                />
                <div className="campo campo-medio">
                  <ReferenciaNovedad
                    referencia="empleados"
                    name="idEmpleado"
                    label="Empleado"
                    hint="Busca un expediente para filtrar sus solicitudes."
                    value={q.idEmpleado ?? ''}
                    onValueChange={(v) => cambiar('idEmpleado', v)}
                  />
                </div>
              </>
            )}
            <SelectField
              name="estado"
              label="Estado"
              hint="Estado actual de la solicitud."
              value={q.estado ?? ''}
              onValueChange={(v) => cambiar('estado', v)}
              opciones={['EN_PROCESO', 'APROBADA', 'RECHAZADA', 'CANCELADA', 'TOMADA'].map(
                (value) => ({ value, label: value.replace(/_/g, ' ') }),
              )}
            />
            <DateField
              name="desde"
              label="Desde"
              hint="Incluye solicitudes que cruzan esta fecha."
              value={q.desde ?? ''}
              onValueChange={(v) => cambiar('desde', v)}
            />
            <DateField
              name="hasta"
              label="Hasta"
              min={q.desde ?? ''}
              hint="Última fecha del filtro, inclusive."
              value={q.hasta ?? ''}
              onValueChange={(v) => cambiar('hasta', v)}
            />
          </div>
        )}
        <div className="my-4 flex flex-wrap gap-2">
          {activos.map(([k, v]) => (
            <Button key={k} icono="cancelar" variante="secundario" onClick={() => cambiar(k, '')}>
              {
                (
                  {
                    estado: 'Estado',
                    idEmpleado: 'Empleado',
                    buscar: 'Búsqueda',
                    desde: 'Desde',
                    hasta: 'Hasta',
                  } as Record<string, string>
                )[k]
              }
              : {v}
            </Button>
          ))}
          {activos.length > 0 && (
            <Button icono="cancelar" variante="texto" onClick={limpiar}>
              Limpiar filtros
            </Button>
          )}
        </div>
      </section>
      <Table
        titulo={empleado ? 'Historial de mis vacaciones' : 'Solicitudes de vacaciones'}
        filas={datos.data?.registros ?? []}
        total={datos.data?.total ?? 0}
        pagina={Number(q.pagina)}
        limite={10}
        clave={(f) => f.id}
        orden={{ campo: q.ordenarPor!, direccion: q.direccion as 'asc' | 'desc' }}
        onOrden={(campo, direccion) =>
          setQ((v) => ({ ...v, ordenarPor: campo, direccion, pagina: '1' }))
        }
        onPagina={(p) => setQ((v) => ({ ...v, pagina: String(p) }))}
        cargando={datos.isPending}
        error={datos.error?.message ?? ''}
        onReintentar={() => void datos.refetch()}
        columnas={[
          { id: 'codigo', titulo: 'Código', render: (f) => f.codigo },
          ...(!empleado
            ? [
                {
                  id: 'empleado',
                  titulo: 'Empleado',
                  ordenable: true,
                  render: (f: Fila) => f.empleado,
                },
              ]
            : []),
          {
            id: 'inicio',
            titulo: 'Inicio',
            ordenable: true,
            render: (f) => fechaVisible(f.inicio),
          },
          { id: 'fin', titulo: 'Fin', ordenable: true, render: (f) => fechaVisible(f.fin) },
          { id: 'dias', titulo: 'Días', ordenable: true, render: (f) => f.diasRegistrados },
          {
            id: 'estado',
            titulo: 'Estado',
            ordenable: true,
            render: (f) => (
              <>
                <Badge
                  tono={
                    f.estado === 'APROBADA'
                      ? 'correcto'
                      : f.estado === 'RECHAZADA'
                        ? 'peligro'
                        : 'informacion'
                  }
                >
                  {f.estado.replace(/_/g, ' ')}
                </Badge>
                {f.motivo && <p>{f.motivo}</p>}
              </>
            ),
          },
          ...(!empleado
            ? [
                {
                  id: 'comparacion',
                  titulo: 'Comparación actual',
                  render: (f: Fila) =>
                    f.estado === 'EN_PROCESO' ? (
                      <Semaforo f={f} />
                    ) : (
                      <p>Saldo al resolver: {f.saldoAlResolver ?? '—'}</p>
                    ),
                },
                {
                  id: 'acciones',
                  titulo: 'Resolver',
                  render: (f: Fila) =>
                    f.estado === 'EN_PROCESO' ? (
                      <div className="flex flex-wrap gap-2">
                        <AprobarVacaciones
                          f={f}
                          onClick={() => setResolucion({ fila: f, estado: 'APROBADA' })}
                        />
                        <Button
                          icono="rechazar"
                          variante="peligro"
                          onClick={() => setResolucion({ fila: f, estado: 'RECHAZADA' })}
                        >
                          Rechazar
                        </Button>
                      </div>
                    ) : null,
                },
              ]
            : []),
        ]}
      />
      {resolucion && (
        <Resolver
          key={resolucion.fila.id + resolucion.estado}
          {...resolucion}
          cerrar={() => setResolucion(undefined)}
          resuelto={() => {
            setResolucion(undefined);
            void cache.invalidateQueries({ queryKey: ['vacaciones'] });
            void cache.invalidateQueries({ queryKey: ['notificaciones'] });
          }}
        />
      )}
    </Card>
  );
}
const motivoSchema = z.object({
  motivo: z.string().trim().min(10, 'Explica el rechazo con al menos 10 caracteres.').max(500),
});
function Resolver({
  fila,
  estado,
  cerrar,
  resuelto,
}: {
  fila: Fila;
  estado: 'APROBADA' | 'RECHAZADA';
  cerrar: () => void;
  resuelto: () => void;
}) {
  const toast = useToast(),
    cache = useQueryClient();
  const form = useForm<{ motivo: string }>({
    defaultValues: { motivo: '' },
    mode: 'onBlur',
    resolver: zodResolver(estado === 'RECHAZADA' ? motivoSchema : z.object({ motivo: z.string() })),
  });
  const draft = useFormDraft(`vacaciones-${estado}`, fila.id, { form, version: 1 });
  const m = useMutation({
    mutationFn: () => api.resolver(fila.id, estado, form.getValues('motivo')),
    onSuccess: () => {
      draft.limpiar();
      toast(
        estado === 'APROBADA'
          ? 'Vacaciones aprobadas; saldo actualizado.'
          : 'Solicitud rechazada y empleado notificado.',
      );
      resuelto();
    },
    onError: (e) => {
      mapearErrores(e, form.setError, ['motivo']);
      void cache.invalidateQueries({ queryKey: ['vacaciones'] });
    },
  });
  return (
    <Modal
      abierto
      titulo={estado === 'APROBADA' ? 'Confirmar aprobación' : 'Rechazar vacaciones'}
      onCerrar={() => {
        if (!m.isPending) cerrar();
      }}
    >
      <p className="my-4" data-tour="vacaciones-resolver">
        {fila.empleado} · {fechaVisible(fila.inicio)} al {fechaVisible(fila.fin)}
      </p>
      <Semaforo f={fila} />
      <FormDraftNotice draft={draft} />
      <form onSubmit={form.handleSubmit(() => m.mutate())} noValidate>
        <FormErrorSummary
          mensajes={Object.values(form.formState.errors).map((e) => e.message)}
          mensajeServidor={m.error?.message}
        />
        {estado === 'RECHAZADA' && (
          <div className="form-grid my-4">
            <Controller
              control={form.control}
              name="motivo"
              render={({ field, fieldState }) => (
                <TextAreaField
                  name={field.name}
                  label="Motivo de rechazo"
                  hint="El empleado recibirá esta explicación. Indica cómo puede corregir la solicitud."
                  placeholder="Ejemplo: las fechas coinciden con…"
                  required
                  maxLength={500}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>
        )}
        <p className="my-4">
          {estado === 'APROBADA'
            ? `Se descontarán ${fila.dias} días. El servidor volverá a comprobar el saldo y el calendario.`
            : 'El rechazo conserva el historial y no descuenta días.'}
        </p>
        <div className="flex gap-3 justify-end">
          <Button icono="cancelar" variante="secundario" disabled={m.isPending} onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            icono={estado === 'APROBADA' ? 'aprobar' : 'rechazar'}
            type="submit"
            variante={estado === 'APROBADA' ? 'primario' : 'peligro'}
            cargando={m.isPending}
          >
            Confirmar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
const cargaFormSchema = z
  .object({
    tipo: z.enum(['SALDO_INICIAL', 'TOMADAS']),
    dias: z.string().regex(/^\d{1,5}(\.\d{1,2})?$/, 'Ingresa días con hasta dos decimales.'),
    referencia: z
      .string()
      .trim()
      .min(3, 'Ingresa una referencia de al menos 3 caracteres.')
      .max(60)
      .regex(/^[A-Za-z0-9_-]+$/, 'Usa letras, números y guiones.'),
    motivo: z.string().trim().min(10, 'Explica el origen con al menos 10 caracteres.').max(500),
  })
  .refine(
    (d) => d.tipo !== 'TOMADAS' || !/^\d+(\.\d+)?$/.test(d.dias) || new Decimal(d.dias).gt(0),
    { path: ['dias'], message: 'Ingresa más de cero días tomados.' },
  );
function GestionSaldo() {
  const [params] = useSearchParams();
  const [id, setId] = useState(params.get('empleado') ?? ''),
    [carga, setCarga] = useState(false);
  const s = useQuery({
    queryKey: ['vacaciones', 'saldo', id],
    queryFn: ({ signal }) => api.saldo(id, signal),
    enabled: !!id,
  });
  return (
    <section data-tour="vacaciones-carga" className="mb-5">
      <Card className="mb-5">
        <h2>Saldo e historia anterior</h2>
        <div className="form-grid mt-4">
          <div className="campo campo-medio">
            <ReferenciaNovedad
              referencia="empleados"
              name="empleadoSaldo"
              label="Empleado"
              hint="Selecciona un expediente real para consultar su saldo y kardex."
              value={id}
              onValueChange={setId}
            />
          </div>
        </div>
        <Button
          className="mt-4"
          icono="cargar"
          disabled={!id}
          motivoDeshabilitado={!id ? 'Selecciona un empleado.' : undefined}
          onClick={() => setCarga(true)}
        >
          Cargar vacaciones previas
        </Button>
      </Card>
      {id && s.isPending && <Skeleton lineas={4} />}{' '}
      {s.error && (
        <EmptyState
          titulo="Saldo pendiente de configuración"
          descripcion={s.error.message}
          accion={
            <Button icono="actualizar" onClick={() => void s.refetch()}>
              Reintentar
            </Button>
          }
        />
      )}{' '}
      {s.data && <SaldoCard s={s.data} />}{' '}
      {carga && <CargarPrevias id={id} cerrar={() => setCarga(false)} />}
    </section>
  );
}
function CargarPrevias({ id, cerrar }: { id: string; cerrar: () => void }) {
  const cache = useQueryClient(),
    toast = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const form = useForm<z.infer<typeof cargaFormSchema>>({
    defaultValues: { tipo: 'TOMADAS', dias: '', referencia: '', motivo: '' },
    mode: 'onBlur',
    resolver: zodResolver(cargaFormSchema),
  });
  const draft = useFormDraft('vacaciones-previas', id, { form, version: 1 });
  const m = useMutation({
    mutationFn: () => api.cargar(id, { ...form.getValues(), confirmado: true }),
    onSuccess: () => {
      draft.limpiar();
      toast('Historia de vacaciones registrada; saldo actualizado.');
      void cache.invalidateQueries({ queryKey: ['vacaciones'] });
      cerrar();
    },
    onError: (e) => {
      setConfirmar(false);
      mapearErrores(e, form.setError, ['tipo', 'dias', 'referencia', 'motivo']);
    },
  });
  const tipo = form.watch('tipo');
  return (
    <Modal
      abierto
      titulo="Cargar vacaciones previas"
      onCerrar={() => {
        if (!m.isPending) cerrar();
      }}
    >
      <FormDraftNotice draft={draft} />
      <form
        noValidate
        onChange={() => setConfirmar(false)}
        onSubmit={form.handleSubmit(() => setConfirmar(true))}
      >
        <p className="my-4">
          La carga queda auditada con tu usuario, referencia y motivo. No vuelvas a cargar una
          historia ya registrada.
        </p>
        <FormErrorSummary
          mensajes={Object.values(form.formState.errors).map((e) => e.message)}
          mensajeServidor={m.error?.message}
        />
        <div className="form-grid">
          <Controller
            control={form.control}
            name="tipo"
            render={({ field }) => (
              <SelectField
                name={field.name}
                label="Tipo de carga"
                hint="Tomadas resta días anteriores. Apertura reconoce el saldo disponible certificado al día de hoy, antes de ajustes o disfrutes."
                required
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                opciones={[
                  { value: 'TOMADAS', label: 'Días ya tomados' },
                  { value: 'SALDO_INICIAL', label: 'Saldo inicial certificado' },
                ]}
              />
            )}
          />
          <Controller
            control={form.control}
            name="dias"
            render={({ field, fieldState }) => (
              <NumberField
                name={field.name}
                label={tipo === 'TOMADAS' ? 'Días tomados' : 'Días disponibles al abrir'}
                hint="Hasta dos decimales. Ejemplo: 7.50 días."
                required
                decimales={2}
                min={tipo === 'TOMADAS' ? '0.01' : '0'}
                max="99999.99"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="referencia"
            render={({ field, fieldState }) => (
              <TextField
                name={field.name}
                label="Referencia única"
                hint="Identifica el respaldo histórico para evitar cargarlo dos veces. Letras, números y guiones."
                placeholder="EXP_2026_001"
                required
                maxLength={60}
                tipo="referencia"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="motivo"
            render={({ field, fieldState }) => (
              <TextAreaField
                name={field.name}
                label="Origen y motivo"
                hint="Describe el expediente o respaldo con el que verificaste el saldo."
                required
                maxLength={500}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
        </div>
        {confirmar && (
          <p role="alert" className="resumen-error my-4">
            {tipo === 'TOMADAS'
              ? `Se restarán ${form.getValues('dias')} días del saldo actual.`
              : `El saldo al día de hoy quedará en ${form.getValues('dias')} días; la apertura sustituye la historia anterior y solo puede registrarse una vez.`}{' '}
            Revisa el respaldo y confirma.
          </p>
        )}
        <div className="flex gap-3 justify-end mt-5">
          <Button icono="cancelar" variante="secundario" disabled={m.isPending} onClick={cerrar}>
            Cancelar
          </Button>
          {confirmar ? (
            <Button icono="guardar" cargando={m.isPending} onClick={() => m.mutate()}>
              Confirmar carga
            </Button>
          ) : (
            <Button icono="ver" type="submit">
              Revisar carga
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
