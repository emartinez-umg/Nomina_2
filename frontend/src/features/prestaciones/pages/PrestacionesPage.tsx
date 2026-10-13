import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as api from '../api/prestaciones';
import type { Vista, Registro } from '../api/prestaciones';
import { useSession } from '../../../app/session';
import { usePageHelp, HelpButton } from '../../../components/help/HelpProvider';
import { ayudaPrestaciones } from '../help/pasos';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Modal, ConfirmModal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
import {
  TextField,
  DateField,
  NumberField,
  SelectField,
  TextAreaField,
  FormErrorSummary,
} from '../../../components/forms';
import { ReferenciaNovedad } from '../../novedades/pages/CampoNovedad';
import { RefField } from '../../empleados/pages/CampoEmpleado';
import { detalle as detalleEmpleado } from '../../empleados/api/empleados';
import { descargar } from '../../nomina/api/nomina';
import { fechaVisible, hoyGuatemala, fechaValida } from '../../../lib/validadores';
import { formatoMoneda } from '../../../components/forms/MoneyField';
import { ErrorApi } from '../../../lib/http';
const moneda = (v: string) => `Q ${formatoMoneda(v)}`;
export function DetalleCalculo({ v }: { v: Vista }) {
  return (
    <div className="my-4">
      <h3>{v.empleado}</h3>
      {v.error ? (
        <p role="alert" className="campo-error">
          {v.error}
        </p>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Componentes de la prestación</caption>
              <thead>
                <tr>
                  <th>Concepto / base</th>
                  <th>Promedio</th>
                  <th>Tiempo</th>
                  <th>Importe</th>
                  <th>Exento ISR</th>
                  <th>Gravado</th>
                </tr>
              </thead>
              <tbody>
                {v.componentes.map((l) => (
                  <tr key={l.concepto}>
                    <td>
                      {l.concepto.replace(/_/g, ' ')}
                      <br />
                      {fechaVisible(l.inicio)} al {fechaVisible(l.fin)}
                    </td>
                    <td className="whitespace-nowrap">{moneda(l.promedio)}</td>
                    <td>
                      {l.tiempo}
                      {l.concepto === 'VACACIONES_PENDIENTES' ? ' días' : ' años/fracción'}
                    </td>
                    <td className="whitespace-nowrap">{moneda(l.monto)}</td>
                    <td className="whitespace-nowrap">{moneda(l.exento)}</td>
                    <td className="whitespace-nowrap">{moneda(l.gravado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-bold text-exito">Total: {moneda(v.total)}</p>
        </>
      )}
    </div>
  );
}
export function AccionesPrestacion({
  r,
  ocupado,
  onAccion,
}: {
  r: Registro;
  ocupado: boolean;
  onAccion: (a: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {[
        ['aprobar', 'Aprobar'],
        ['pagar', 'Registrar pago'],
        ['anular', 'Anular'],
      ].map(([a, t]) => (
        <Button
          key={a}
          icono={a === 'anular' ? 'cancelar' : 'aprobar'}
          variante={a === 'anular' ? 'peligro' : 'secundario'}
          disabled={
            ocupado ||
            (a === 'aprobar'
              ? r.estado !== 'CALCULADA'
              : a === 'pagar'
                ? r.estado !== 'APROBADA'
                : !['CALCULADA', 'APROBADA'].includes(r.estado) || r.tipo === 'INDEMNIZACION')
          }
          motivoDeshabilitado={
            r.estado === 'PAGADA'
              ? 'Un pago registrado conserva su historial.'
              : 'Sigue cálculo → aprobación → pago. La liquidación confirmada conserva la baja.'
          }
          onClick={() => onAccion(a!)}
        >
          {t}
        </Button>
      ))}
    </div>
  );
}
export function PrestacionesPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaPrestaciones, usuario?.rol);
  const [params, setParams] = useSearchParams(),
    [tab, setTab] = useState(params.get('empleado') ? 'finiquito' : 'anual');
  const [id, setId] = useState<number>();
  return (
    <>
      <h1>Prestaciones de ley</h1>
      <p className="mb-5 text-secundario">
        Promedios reales, liquidaciones y constancias de salario.
      </p>
      <div className="my-4 flex flex-wrap gap-2">
        {[
          ['anual', 'Bono 14 y aguinaldo'],
          ['finiquito', 'Indemnización y finiquito'],
          ['constancia', 'Constancias de salario'],
        ].map(([t, label]) => (
          <Button
            key={t}
            icono={t === 'constancia' ? 'documento' : 'planilla'}
            variante={tab === t ? 'primario' : 'secundario'}
            onClick={() => setTab(t!)}
          >
            {label}
          </Button>
        ))}
      </div>
      <Calculo key={tab} modo={tab} empleadoInicial={params.get('empleado') ?? ''} />
      <Historial onDetalle={setId} params={params} cambiar={setParams} />
      {id && <Detalle id={id} cerrar={() => setId(undefined)} />}
    </>
  );
}
const formSchema = z.object({
  tipo: z.enum(['AGUINALDO', 'BONO_14']),
  anio: z.string().regex(/^\d{4}$/, 'Ingresa el año de cierre.'),
  idEmpleado: z.string(),
  idDepartamento: z.string(),
  corte: z.string(),
  causa: z.enum(['DESPIDO_INJUSTIFICADO', 'RENUNCIA', 'DESPIDO_JUSTIFICADO']),
  inicio: z.string(),
  fin: z.string(),
});
type Form = z.infer<typeof formSchema>;
function Calculo({ modo, empleadoInicial }: { modo: string; empleadoInicial: string }) {
  const hoy = hoyGuatemala(),
    toast = useToast(),
    qc = useQueryClient();
  const form = useForm<Form>({
    resolver: zodResolver(formSchema),
    mode: 'onBlur',
    defaultValues: {
      tipo: 'BONO_14',
      anio: hoy.slice(0, 4),
      idEmpleado: empleadoInicial,
      idDepartamento: '',
      corte: hoy,
      causa: 'DESPIDO_INJUSTIFICADO',
      inicio: `${hoy.slice(0, 4)}-01-01`,
      fin: hoy,
    },
  });
  const idSeleccionado = form.watch('idEmpleado');
  const expediente = useQuery({
    queryKey: ['empleados', 'detalle', idSeleccionado],
    queryFn: ({ signal }) => detalleEmpleado(Number(idSeleccionado), signal),
    enabled: modo === 'finiquito' && !!idSeleccionado,
  });
  const ingreso =
    typeof expediente.data?.fechaIngreso === 'string' ? expediente.data.fechaIngreso : '1900-01-01';
  const [prev, setPrev] = useState<{
      filas: Vista[];
      hash: string;
      seleccion: unknown;
      limitePago?: string;
    }>(),
    [motivo, setMotivo] = useState(''),
    [confirmar, setConfirmar] = useState(false);
  const campos = (
    name: keyof Form,
    label: string,
    hint: string,
    tipo = 'texto',
    extras: {
      opciones?: { value: string; label: string }[];
      min?: string;
      max?: string;
      maxLength?: number;
      ancho?: 'corto' | 'medio' | 'ancho';
      required?: boolean;
    } = {},
  ) => (
    <Controller
      key={name}
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const props = {
          name,
          label,
          hint,
          value: field.value,
          onValueChange: (v: string) => {
            field.onChange(v);
            setPrev(undefined);
          },
          onBlur: field.onBlur,
          error: fieldState.error?.message,
          disabled: preview.isPending || guardar.isPending,
          ...extras,
        };
        if (tipo === 'opcion') return <SelectField {...props} opciones={extras.opciones ?? []} />;
        if (tipo === 'empleado')
          return (
            <div className="col-span-12 md:col-span-6">
              <ReferenciaNovedad {...props} referencia="empleados" />
            </div>
          );
        if (tipo === 'departamento')
          return (
            <div className="col-span-12 md:col-span-6">
              <RefField {...props} />
            </div>
          );
        if (tipo === 'fecha') return <DateField {...props} />;
        if (tipo === 'numero') return <NumberField {...props} />;
        return <TextField {...props} />;
      }}
    />
  );
  const validar = (d: Form) => {
    if (modo !== 'anual' && !d.idEmpleado)
      form.setError('idEmpleado', { message: 'Selecciona un empleado.' });
    if (modo === 'finiquito' && (!fechaValida(d.corte) || d.corte > hoy || d.corte < ingreso))
      form.setError('corte', {
        message: 'El egreso debe ser una fecha real desde el ingreso y no futura.',
      });
    if (
      modo === 'constancia' &&
      (!fechaValida(d.inicio) || !fechaValida(d.fin) || d.fin < d.inicio || d.fin > hoy)
    )
      form.setError('fin', { message: 'Selecciona un rango real, no invertido y no futuro.' });
    return !(
      (modo !== 'anual' && !d.idEmpleado) ||
      (modo === 'finiquito' && (!fechaValida(d.corte) || d.corte > hoy || d.corte < ingreso)) ||
      (modo === 'constancia' &&
        (!fechaValida(d.inicio) || !fechaValida(d.fin) || d.fin < d.inicio || d.fin > hoy))
    );
  };
  const preview = useMutation({
    mutationFn: async (d: Form) => {
      if (modo === 'anual') {
        const seleccion = {
          tipo: d.tipo,
          anio: Number(d.anio),
          ...(d.idEmpleado ? { idEmpleado: Number(d.idEmpleado) } : {}),
          ...(d.idDepartamento ? { idDepartamento: Number(d.idDepartamento) } : {}),
        };
        const r = await api.previsualizar(seleccion);
        return { ...r, seleccion };
      }
      if (modo === 'finiquito') {
        const seleccion = { idEmpleado: Number(d.idEmpleado), corte: d.corte, causa: d.causa };
        const r = await api.simular(seleccion);
        return { filas: [r], hash: r.hash, seleccion };
      }
      const r = await api.constancia({ idEmpleado: d.idEmpleado, inicio: d.inicio, fin: d.fin });
      descargar(r, true);
      return undefined;
    },
    onSuccess: (r) => {
      setPrev(r);
    },
    onError: (e) => {
      if (e instanceof ErrorApi)
        for (const [k, v] of Object.entries(e.campos ?? {}))
          if (k in form.getValues()) form.setError(k as keyof Form, { message: v[0] ?? e.message });
    },
  });
  const guardar = useMutation({
    onError: () => setConfirmar(false),
    mutationFn: async () => {
      const body = { seleccion: prev!.seleccion, hash: prev!.hash, motivo, confirmado: true };
      return modo === 'anual' ? api.calcular(body) : api.liquidar(body);
    },
    onSuccess: () => {
      toast(
        modo === 'anual'
          ? 'Cálculos guardados. Revisa y aprueba desde el historial.'
          : 'Liquidación confirmada y empleado dado de baja. Registra el pago desde el historial.',
      );
      setPrev(undefined);
      setConfirmar(false);
      setMotivo('');
      void qc.invalidateQueries({ queryKey: ['prestaciones'] });
      void qc.invalidateQueries({ queryKey: ['empleados'] });
      void qc.invalidateQueries({ queryKey: ['vacaciones'] });
    },
  });
  return (
    <Card data-tour={`prestaciones-${modo === 'anual' ? 'calculo' : modo}`}>
      <h2>
        {modo === 'anual'
          ? 'Cálculo masivo con vista previa'
          : modo === 'finiquito'
            ? 'Simular liquidación'
            : 'Emitir constancia'}
      </h2>
      <form
        className="form-grid mt-4"
        onSubmit={form.handleSubmit((d) => {
          if (validar(d)) preview.mutate(d);
        })}
      >
        {modo === 'anual' && (
          <>
            {campos('tipo', 'Prestación', 'Selecciona el ciclo anual.', 'opcion', {
              opciones: [
                { value: 'BONO_14', label: 'Bono 14' },
                { value: 'AGUINALDO', label: 'Aguinaldo' },
              ],
            })}
            {campos(
              'anio',
              'Año de cierre',
              'Ejemplo: 2026 identifica junio o noviembre de 2026.',
              'numero',
              { min: '1901', max: '2199', maxLength: 4, ancho: 'corto', required: true },
            )}
            {campos(
              'idDepartamento',
              'Departamento',
              'Opcional: limita el lote a un departamento.',
              'departamento',
            )}
          </>
        )}
        {campos(
          'idEmpleado',
          'Empleado',
          modo === 'anual'
            ? 'Opcional: deja vacío para todo el departamento.'
            : 'Busca el empleado por código o nombre.',
          'empleado',
          { required: modo !== 'anual' },
        )}
        {modo === 'finiquito' && (
          <>
            {campos(
              'corte',
              'Fecha de egreso',
              'Fecha real no futura. Resuelve reservas posteriores.',
              'fecha',
              {
                max: hoy,
                min: ingreso,
                required: true,
                ancho: 'corto',
              },
            )}
            {campos(
              'causa',
              'Causa del egreso',
              'La indemnización corresponde a despido injustificado.',
              'opcion',
              {
                opciones: [
                  { value: 'DESPIDO_INJUSTIFICADO', label: 'Despido injustificado' },
                  { value: 'RENUNCIA', label: 'Renuncia' },
                  { value: 'DESPIDO_JUSTIFICADO', label: 'Despido justificado' },
                ],
              },
            )}
          </>
        )}
        {modo === 'constancia' && (
          <>
            {campos('inicio', 'Desde', 'Fecha inicial de pago incluida.', 'fecha', {
              max: hoy,
              required: true,
              ancho: 'corto',
            })}
            {campos(
              'fin',
              'Hasta',
              'Fecha final de pago incluida. Solo ingresos pagados.',
              'fecha',
              { min: form.watch('inicio'), max: hoy, required: true, ancho: 'corto' },
            )}
          </>
        )}
        <div className="col-span-12">
          <FormErrorSummary
            mensajes={Object.values(form.formState.errors).map((e) => e.message)}
            mensajeServidor={preview.error?.message ?? guardar.error?.message}
          />
          <Button
            icono={modo === 'constancia' ? 'ver' : 'actualizar'}
            type="submit"
            cargando={preview.isPending}
          >
            {modo === 'constancia' ? 'Vista previa PDF' : 'Calcular vista previa'}
          </Button>
        </div>
      </form>
      {prev && (
        <>
          <p className="my-4 text-secundario">
            {prev.filas.length} empleados.{' '}
            {prev.limitePago && `Fecha límite de pago: ${fechaVisible(prev.limitePago)}.`}
          </p>
          {!prev.filas.length && <p>No hay empleados en el ciclo. Revisa los filtros.</p>}
          {prev.filas.map((v) => (
            <DetalleCalculo key={v.idEmpleado} v={v} />
          ))}
          <div data-tour="prestaciones-confirmar">
            <TextAreaField
              name="motivo"
              label="Motivo"
              hint="Explica la operación con 10 a 500 caracteres."
              maxLength={500}
              required
              value={motivo}
              onValueChange={setMotivo}
            />
            <Button
              icono="guardar"
              disabled={
                !prev.filas.length ||
                prev.filas.some((f) => f.error) ||
                motivo.trim().length < 10 ||
                guardar.isPending
              }
              motivoDeshabilitado="Resuelve los errores y escribe un motivo de al menos diez caracteres."
              onClick={() => setConfirmar(true)}
            >
              {modo === 'anual' ? 'Guardar cálculos' : 'Confirmar liquidación y baja'}
            </Button>
          </div>
        </>
      )}
      {modo === 'constancia' && (
        <Button
          icono="exportar"
          variante="secundario"
          cargando={preview.isPending}
          onClick={() => {
            const d = form.getValues();
            if (validar(d))
              void api
                .constancia({ idEmpleado: d.idEmpleado, inicio: d.inicio, fin: d.fin })
                .then((r) => descargar(r))
                .catch((e) => toast((e as Error).message, 'peligro'));
          }}
        >
          Descargar PDF
        </Button>
      )}
      <ConfirmModal
        abierto={confirmar}
        titulo={modo === 'anual' ? 'Guardar cálculos' : 'Liquidar y dar de baja'}
        descripcion={
          modo === 'anual'
            ? 'Se guardarán los importes revisados para aprobación. Todavía no se registra pago.'
            : `Se guardará el finiquito de ${prev?.filas[0]?.empleado ?? ''} por ${moneda(prev?.filas[0]?.total ?? '0')}, se descontarán sus vacaciones y se revocará su acceso.`
        }
        cargando={guardar.isPending}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => guardar.mutate()}
      />
    </Card>
  );
}
function Historial({
  params,
  cambiar,
  onDetalle,
}: {
  params: URLSearchParams;
  cambiar: (p: URLSearchParams) => void;
  onDetalle: (id: number) => void;
}) {
  const q = Object.fromEntries([...params].filter(([k]) => k !== 'empleado')),
    [filtros, setFiltros] = useState(false),
    toast = useToast();
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k !== 'pagina') p.delete('pagina');
    cambiar(p);
  };
  const r = useQuery({
    queryKey: ['prestaciones', 'historial', q],
    queryFn: ({ signal }) => api.listar(q, signal),
  });
  const descarga = useMutation({
    mutationFn: () => api.exportar(q),
    onSuccess: (d) => descargar(d),
    onError: (e) => toast(e.message, 'peligro'),
  });
  return (
    <Card className="mt-5">
      <h2>Historial de prestaciones</h2>
      <div data-tour="prestaciones-filtros">
        <div className="my-4 flex flex-wrap gap-3">
          <Button
            icono="filtrar"
            variante="secundario"
            onClick={() => setFiltros(!filtros)}
            aria-expanded={filtros}
          >
            Filtros
          </Button>
          <Button
            icono="exportar"
            variante="secundario"
            cargando={descarga.isPending}
            onClick={() => descarga.mutate()}
          >
            Exportar CSV
          </Button>
          <Button icono="cancelar" variante="texto" onClick={() => cambiar(new URLSearchParams())}>
            Limpiar filtros
          </Button>
        </div>
        <TextField
          name="buscar"
          label="Buscar empleado"
          hint="Código, nombres o apellidos."
          value={q.buscar ?? ''}
          maxLength={150}
          onValueChange={(v) => set('buscar', v)}
        />
        {filtros && (
          <div className="form-grid my-4">
            <div className="col-span-12 md:col-span-6">
              <ReferenciaNovedad
                referencia="empleados"
                name="idEmpleado"
                label="Empleado"
                hint="Filtra por empleado."
                value={q.idEmpleado ?? ''}
                onValueChange={(v) => set('idEmpleado', v)}
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <RefField
                name="idDepartamento"
                label="Departamento"
                hint="Filtra por departamento actual."
                value={q.idDepartamento ?? ''}
                onValueChange={(v) => set('idDepartamento', v)}
              />
            </div>
            <SelectField
              name="tipo"
              label="Tipo"
              hint="Prestación o liquidación."
              value={q.tipo ?? ''}
              onValueChange={(v) => set('tipo', v)}
              opciones={['', 'AGUINALDO', 'BONO_14', 'INDEMNIZACION'].map((value) => ({
                value,
                label: value.replace(/_/g, ' ') || 'Todos',
              }))}
            />
            <SelectField
              name="estado"
              label="Estado"
              hint="Etapa de la prestación."
              value={q.estado ?? ''}
              onValueChange={(v) => set('estado', v)}
              opciones={['', 'CALCULADA', 'APROBADA', 'PAGADA', 'ANULADA'].map((value) => ({
                value,
                label: value || 'Todos',
              }))}
            />
            <DateField
              name="desde"
              label="Desde"
              hint="El ciclo intersecta esta fecha."
              value={q.desde ?? ''}
              onValueChange={(v) => set('desde', v)}
            />
            <DateField
              name="hasta"
              label="Hasta"
              hint="Fin del rango de ciclos."
              {...(q.desde ? { min: q.desde } : {})}
              value={q.hasta ?? ''}
              onValueChange={(v) => set('hasta', v)}
            />
          </div>
        )}
        <div className="my-3 flex flex-wrap gap-2">
          {Object.entries(q)
            .filter(([k, v]) => v && !['pagina', 'limite', 'ordenarPor', 'direccion'].includes(k))
            .map(([k, v]) => (
              <Button key={k} icono="cancelar" variante="texto" onClick={() => set(k, '')}>
                {k}: {v}
              </Button>
            ))}
        </div>
      </div>
      <div data-tour="prestaciones-historial">
        <Table
          filas={r.data?.registros ?? []}
          total={r.data?.total ?? 0}
          pagina={r.data?.pagina ?? 1}
          limite={10}
          clave={(r) => r.id}
          cargando={r.isPending}
          {...(r.error ? { error: r.error.message } : {})}
          onReintentar={() => void r.refetch()}
          orden={{ campo: q.ordenarPor ?? 'id', direccion: q.direccion === 'asc' ? 'asc' : 'desc' }}
          onPagina={(n) => set('pagina', String(n))}
          onOrden={(campo, direccion) => {
            const p = new URLSearchParams(params);
            p.set('ordenarPor', campo);
            p.set('direccion', direccion);
            p.delete('pagina');
            cambiar(p);
          }}
          columnas={[
            { id: 'empleado', titulo: 'Empleado', ordenable: true, render: (r) => r.empleado },
            {
              id: 'tipo',
              titulo: 'Tipo',
              ordenable: true,
              render: (r) => r.tipo.replace(/_/g, ' '),
            },
            {
              id: 'fin',
              titulo: 'Ciclo',
              ordenable: true,
              render: (r) => `${fechaVisible(r.inicio)} - ${fechaVisible(r.fin)}`,
            },
            { id: 'total', titulo: 'Total', ordenable: true, render: (r) => moneda(r.total) },
            {
              id: 'estado',
              titulo: 'Estado',
              ordenable: true,
              render: (r) => <Badge>{r.estado}</Badge>,
            },
            {
              id: 'acciones',
              titulo: 'Detalle',
              render: (r) => (
                <Button icono="ver" variante="texto" onClick={() => onDetalle(r.id)}>
                  Ver
                </Button>
              ),
            },
          ]}
        />
      </div>
    </Card>
  );
}
function Detalle({ id, cerrar }: { id: number; cerrar: () => void }) {
  const r = useQuery({
      queryKey: ['prestaciones', 'detalle', id],
      queryFn: ({ signal }) => api.detalle(id, signal),
    }),
    qc = useQueryClient(),
    toast = useToast();
  const [op, setOp] = useState(''),
    [motivo, setMotivo] = useState(''),
    [fechaPago, setFecha] = useState(hoyGuatemala()),
    [referencia, setRef] = useState(''),
    [confirmar, setConfirmar] = useState(false);
  const m = useMutation({
    onError: () => setConfirmar(false),
    mutationFn: () =>
      api.accion(id, op, {
        hash: r.data!.hash,
        motivo,
        confirmado: true,
        ...(op === 'pagar' ? { fechaPago, referencia } : {}),
      }),
    onSuccess: () => {
      toast('Operación registrada.');
      setOp('');
      setConfirmar(false);
      void qc.invalidateQueries({ queryKey: ['prestaciones'] });
    },
  });
  const pdf = useMutation({ mutationFn: () => api.pdf(id), onSuccess: (d) => descargar(d, true) });
  return (
    <Modal
      abierto
      titulo="Detalle de prestación"
      onCerrar={() => {
        if (!m.isPending) cerrar();
      }}
    >
      <HelpButton />
      {r.isPending ? (
        <Skeleton lineas={4} />
      ) : r.data ? (
        <>
          <p className="my-3">
            Estado: {r.data.estado}{' '}
            {r.data.fechaPago && `- Pago ${fechaVisible(r.data.fechaPago)} - ${r.data.referencia}`}
          </p>
          {r.data.snapshot ? (
            <DetalleCalculo v={r.data.snapshot} />
          ) : (
            <p>Registro histórico sin instantánea.</p>
          )}
          <Button icono="ver" cargando={pdf.isPending} onClick={() => pdf.mutate()}>
            Vista previa PDF
          </Button>
          <div className="my-4">
            <AccionesPrestacion r={r.data} ocupado={m.isPending || !r.data.hash} onAccion={setOp} />
          </div>
          {op && (
            <div data-tour="prestaciones-confirmar">
              <h3>
                {op === 'pagar'
                  ? 'Registrar pago realizado'
                  : op === 'aprobar'
                    ? 'Aprobar cálculo'
                    : 'Anular cálculo'}
              </h3>
              {op === 'pagar' && (
                <div className="form-grid my-4">
                  <DateField
                    name="fechaPago"
                    label="Fecha de pago"
                    hint="Pago real, no futuro, posterior al último cierre."
                    required
                    min={r.data.fin}
                    max={hoyGuatemala()}
                    value={fechaPago}
                    onValueChange={setFecha}
                  />
                  <TextField
                    name="referencia"
                    label="Referencia"
                    hint="Identificador del comprobante; letras, números, guion o guion bajo."
                    required
                    maxLength={100}
                    value={referencia}
                    onValueChange={(v) => setRef(v.replace(/[^A-Za-z0-9_-]/g, ''))}
                  />
                </div>
              )}
              <TextAreaField
                name="motivo"
                label="Motivo"
                hint="Justifica la operación con al menos diez caracteres."
                required
                maxLength={500}
                value={motivo}
                onValueChange={setMotivo}
              />
              <Button
                icono="aprobar"
                disabled={
                  motivo.trim().length < 10 ||
                  m.isPending ||
                  (op === 'pagar' &&
                    (!fechaValida(fechaPago) ||
                      fechaPago > hoyGuatemala() ||
                      referencia.length < 3))
                }
                motivoDeshabilitado="Completa motivo y, para pagar, fecha y referencia válidas."
                onClick={() => setConfirmar(true)}
              >
                Revisar confirmación
              </Button>
            </div>
          )}
        </>
      ) : null}
      <FormErrorSummary
        mensajes={[]}
        mensajeServidor={r.error?.message ?? m.error?.message ?? pdf.error?.message}
      />
      <ConfirmModal
        abierto={confirmar}
        titulo="Confirmar operación"
        descripcion={`${op}: ${r.data?.empleado ?? ''} por ${moneda(r.data?.total ?? '0')}. Motivo: ${motivo}`}
        cargando={m.isPending}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => m.mutate()}
      />
    </Modal>
  );
}
