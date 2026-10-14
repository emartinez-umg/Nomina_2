import { useDraftValues } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { Decimal } from 'decimal.js';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../../app/session';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaNomina } from '../help/pasos';
import * as api from '../api/nomina';
import type { Periodo, Fila } from '../api/nomina';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
import {
  DateField,
  NumberField,
  TextField,
  SelectField,
  TextAreaField,
  FormErrorSummary,
} from '../../../components/forms';
import { ReferenciaNovedad } from '../../novedades/pages/CampoNovedad';
import { RefField } from '../../empleados/pages/CampoEmpleado';
import { fechaVisible, hoyGuatemala } from '../../../lib/validadores';
import { Fiscal } from './Fiscal';
import { FormatoIgss } from './FormatoIgss';
const moneda = (v: string) => {
  const [entero, centavos] = new Decimal(v).toFixed(2).split('.');
  return `Q ${entero!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${centavos}`;
};
export function AccionesPeriodo({
  p,
  admin,
  ocupado,
  onAccion,
}: {
  p: Periodo;
  admin: boolean;
  ocupado: boolean;
  onAccion: (a: string) => void;
}) {
  const opciones: [string, string, string[]][] = [
    ['calcular', p.version ? 'Recalcular' : 'Calcular', ['ABIERTO', 'CALCULADO', 'REVISADO']],
    ['revisar', 'Marcar revisada', ['CALCULADO']],
    ['aprobar', 'Aprobar', ['REVISADO']],
    ['cerrar', 'Cerrar', ['APROBADO']],
    ['devolver', 'Devolver a revisión', ['APROBADO']],
    ...(admin ? [['reabrir', 'Reabrir', ['CERRADO']] as [string, string, string[]]] : []),
  ];
  return (
    <div className="flex flex-wrap gap-2" data-tour="nomina-flujo">
      {opciones.map(([a, label, estados]) => {
        const bloqueada =
          ocupado ||
          !(estados as readonly string[]).includes(p.estado) ||
          (!['calcular', 'reabrir', 'devolver'].includes(a) && api.alertasDe(p).length > 0);
        return (
          <Button
            key={a}
            icono={
              a === 'calcular'
                ? 'actualizar'
                : a === 'reabrir' || a === 'devolver'
                  ? 'editar'
                  : 'aprobar'
            }
            variante={a === 'cerrar' || a === 'reabrir' ? 'peligro' : 'secundario'}
            disabled={bloqueada}
            motivoDeshabilitado={
              api.alertasDe(p).length && !['calcular', 'reabrir', 'devolver'].includes(a)
                ? 'Resuelve las alertas y recalcula.'
                : `Acción disponible en: ${estados.join(', ')}.`
            }
            onClick={() => onAccion(a)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
export function NominaPage() {
  const { usuario } = useSession(),
    propio = usuario?.rol === 'EMPLEADO';
  usePageHelp(ayudaNomina, usuario?.rol);
  const [params, setParams] = useSearchParams(),
    id = Number(params.get('periodo')) || undefined;
  const [historial, setHistorial] = useState(false),
    [fiscal, setFiscal] = useState(false),
    [formato, setFormato] = useState(false);
  return (
    <>
      <h1>{propio ? 'Mis boletas de pago' : 'Planilla de nómina'}</h1>
      <p className="text-secundario mb-5">
        {propio
          ? 'Consulta el detalle y descarga tus boletas de periodos cerrados.'
          : 'Calcula cada quincena, revisa los conceptos y conserva el historial de tus pagos.'}
      </p>
      {!propio && (
        <>
          <div className="flex flex-wrap gap-2 mb-5">
            <Button
              icono="calendario"
              variante="secundario"
              onClick={() => {
                setHistorial(false);
                setParams({});
              }}
            >
              Periodos
            </Button>
            <Button
              icono="documento"
              variante="secundario"
              onClick={() => {
                setHistorial(true);
                setParams({});
              }}
            >
              Historial por mes y año
            </Button>
            <Button icono="configuracion" variante="secundario" onClick={() => setFiscal(true)}>
              Historia fiscal y deducciones
            </Button>
            <Button icono="configuracion" variante="secundario" onClick={() => setFormato(true)}>
              Configurar IGSS
            </Button>
          </div>
          {!historial && !id && <Periodos onAbrir={(id) => setParams({ periodo: String(id) })} />}
        </>
      )}
      {(propio || historial || id) && (
        <Planilla propio={propio} id={id} admin={usuario?.rol === 'ADMIN'} />
      )}
      <Modal
        abierto={fiscal}
        titulo="Historia fiscal y deducciones ISR"
        onCerrar={() => setFiscal(false)}
      >
        {fiscal && <Fiscal />}
      </Modal>
      <Modal
        abierto={formato}
        titulo="Configuración patronal IGSS"
        onCerrar={() => setFormato(false)}
      >
        {formato && <FormatoIgss />}
      </Modal>
    </>
  );
}
function Periodos({ onAbrir }: { onAbrir: (id: number) => void }) {
  const cache = useQueryClient(),
    toast = useToast();
  const { campo, draft } = useDraftValues('periodo-nomina', undefined, { fecha: hoyGuatemala() });
  const [fecha, setFecha] = campo('fecha');
  const [q, setQ] = useState<Record<string, string>>({ pagina: '1', limite: '10' });
  const ps = useQuery({
    queryKey: ['nomina', 'periodos', q],
    queryFn: ({ signal }) => api.periodos(q, signal),
  });
  const crear = useMutation({
    mutationFn: () => api.crear(fecha),
    onSuccess: (r) => {
      draft.limpiar();
      void cache.invalidateQueries({ queryKey: ['nomina'] });
      onAbrir(r.id);
    },
    onError: (e) => toast(e.message, 'peligro'),
  });
  return (
    <Card data-tour="nomina-periodos">
      <h2>Periodos quincenales</h2>
      <FormDraftNotice draft={draft} />
      <div className="form-grid my-4">
        <DateField
          name="fecha"
          label="Fecha de la quincena"
          hint="Cualquier día del intervalo; se crean los límites exactos sin solaparse."
          value={fecha}
          onValueChange={setFecha}
          required
        />
        <div className="campo campo-medio self-end">
          <Button
            icono="crear"
            cargando={crear.isPending}
            disabled={!fecha}
            onClick={() => crear.mutate()}
          >
            Crear periodo
          </Button>
        </div>
        <NumberField
          name="anio"
          label="Año"
          hint="Filtra el año, por ejemplo 2026."
          value={q.anio ?? ''}
          min="2000"
          max="9999"
          onValueChange={(v) => setQ((p) => ({ ...p, anio: v, pagina: '1' }))}
        />
        <SelectField
          name="mes"
          label="Mes"
          hint="Mes calendario de la nómina."
          value={q.mes ?? ''}
          onValueChange={(v) => setQ((p) => ({ ...p, mes: v, pagina: '1' }))}
          opciones={meses}
        />
        <SelectField
          name="estado"
          label="Estado"
          hint="Paso actual del flujo."
          value={q.estado ?? ''}
          onValueChange={(v) => setQ((p) => ({ ...p, estado: v, pagina: '1' }))}
          opciones={['ABIERTO', 'CALCULADO', 'REVISADO', 'APROBADO', 'CERRADO'].map((v) => ({
            value: v,
            label: v,
          }))}
        />
      </div>
      <Button icono="cancelar" variante="texto" onClick={() => setQ({ pagina: '1', limite: '10' })}>
        Limpiar filtros
      </Button>
      <Table
        titulo="Quincenas de nómina"
        orden={{
          campo: q.ordenarPor ?? 'inicio',
          direccion: (q.direccion as 'asc' | 'desc') ?? 'desc',
        }}
        onOrden={(campo, direccion) =>
          setQ((p) => ({ ...p, ordenarPor: campo, direccion, pagina: '1' }))
        }
        filas={ps.data?.registros ?? []}
        total={ps.data?.total ?? 0}
        pagina={Number(q.pagina)}
        limite={10}
        clave={(p) => p.id}
        cargando={ps.isPending}
        error={ps.error?.message ?? ''}
        onReintentar={() => void ps.refetch()}
        onPagina={(v) => setQ((p) => ({ ...p, pagina: String(v) }))}
        columnas={[
          {
            id: 'inicio',
            titulo: 'Quincena',
            render: (p) => `${fechaVisible(p.inicio)} al ${fechaVisible(p.fin)}`,
          },
          { id: 'estado', titulo: 'Estado', render: (p) => <Badge>{p.estado}</Badge> },
          { id: 'version', titulo: 'Versión', render: (p) => p.version },
          { id: 'empleados', titulo: 'Empleados calculados', render: (p) => p.empleados },
          { id: 'alertas', titulo: 'Alertas', render: (p) => api.alertasDe(p).length },
          {
            id: 'acciones',
            titulo: 'Consultar',
            render: (p) => (
              <Button icono="ver" onClick={() => onAbrir(p.id)}>
                Abrir planilla
              </Button>
            ),
          },
        ]}
      />
    </Card>
  );
}
const meses = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Intl.DateTimeFormat('es-GT', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, i, 1)),
  ),
}));
function Planilla({
  propio,
  id,
  admin,
}: {
  propio: boolean;
  id: number | undefined;
  admin: boolean;
}) {
  const cache = useQueryClient(),
    toast = useToast();
  const [q, setQ] = useState<Record<string, string>>({
      pagina: '1',
      limite: '10',
      ordenarPor: 'inicio',
      direccion: 'desc',
    }),
    [filtros, setFiltros] = useState(false),
    [accion, setAccion] = useState(''),
    [error, setError] = useState(''),
    [ver, setVer] = useState<number>();
  const { campo, draft } = useDraftValues(
    `periodo-${accion || 'operacion'}`,
    id,
    { motivo: '' },
    !!id && ['reabrir', 'devolver'].includes(accion),
  );
  const [motivo, setMotivo] = campo('motivo');
  const datos = useQuery({
    queryKey: ['nomina', 'tabla', propio, id, q],
    queryFn: ({ signal }) => api.listar(q, propio, id, signal),
  });
  const p = useQuery({
    queryKey: ['nomina', 'periodo', id],
    queryFn: ({ signal }) => api.obtenerPeriodo(id!, signal),
    enabled: !!id,
  });
  const actuar = useMutation({
    mutationFn: () => api.accion(id!, p.data!.version, accion, motivo),
    onSuccess: (r) => {
      draft.limpiar();
      toast(
        r.alertas.length
          ? 'Cálculo guardado con alertas. Revísalas antes de aprobar.'
          : 'Periodo actualizado.',
      );
      setAccion('');
      setMotivo('');
      void cache.invalidateQueries({ queryKey: ['nomina'] });
      void cache.invalidateQueries({ queryKey: ['empleados'] });
      void cache.invalidateQueries({ queryKey: ['novedades'] });
    },
    onError: (e) => setError(e.message),
  });
  const descarga = useMutation({
    mutationFn: ({
      tipo,
      boleta,
      preview,
    }: {
      tipo?: string;
      boleta?: number;
      preview?: boolean;
    }) =>
      boleta
        ? api.boleta(boleta).then((d) => ({ d, preview }))
        : tipo === 'igss'
          ? api.igss(q.anio!, q.mes!).then((d) => ({ d, preview: false }))
          : api.exportar(q, tipo!, id).then((d) => ({ d, preview: false })),
    onSuccess: (r) => api.descargar(r.d, r.preview),
    onError: (e) => toast(e.message, 'peligro'),
  });
  const cambiar = (k: string, v: string) => setQ((p) => ({ ...p, [k]: v, pagina: '1' }));
  const activos = Object.entries(q).filter(
    ([k, v]) => v && !['pagina', 'limite', 'ordenarPor', 'direccion'].includes(k),
  );
  const labels: Record<string, string> = {
    anio: 'Año',
    mes: 'Mes',
    estado: 'Estado',
    buscar: 'Búsqueda',
    idEmpleado: 'Empleado',
    idDepartamento: 'Departamento',
    alertas: 'Con alertas',
  };
  return (
    <>
      {id && (
        <Card className="mb-5">
          {p.isPending ? (
            <Skeleton lineas={3} />
          ) : p.error ? (
            <p role="alert">{p.error.message}</p>
          ) : (
            p.data && (
              <>
                <h2>
                  {fechaVisible(p.data.inicio)} al {fechaVisible(p.data.fin)} · {p.data.estado}
                </h2>
                <p className="campo-hint mb-4">
                  Versión {p.data.version} · {p.data.empleados} empleados calculados. Cada recálculo
                  conserva la versión anterior.
                </p>
                <AccionesPeriodo
                  p={p.data}
                  admin={admin}
                  ocupado={actuar.isPending}
                  onAccion={(a) => {
                    setAccion(a);
                    setError('');
                  }}
                />
                {api.alertasDe(p.data).length > 0 && (
                  <div className="form-resumen-errores mt-4" role="alert">
                    <strong>Resuelve estas alertas antes de continuar</strong>
                    <ul>
                      {api.alertasDe(p.data).map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )
          )}
        </Card>
      )}
      <Card>
        <div
          data-tour="nomina-totales"
          className={
            propio
              ? 'grid grid-cols-2 gap-3 mb-5'
              : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5'
          }
        >
          {(['ingresos', 'descuentos', 'neto', 'patronal'] as const)
            .filter((k) => !propio || k !== 'patronal')
            .map((k) => (
              <div
                className={`banda-informativa ${propio && k === 'neto' ? 'col-span-2' : ''}`}
                key={k}
              >
                <div>
                  <p>
                    {
                      {
                        ingresos: 'Total ingresos',
                        descuentos: 'Total descuentos',
                        neto: 'Neto a pagar',
                        patronal: 'Aporte patronal',
                      }[k]
                    }
                  </p>
                  <strong>{datos.data ? moneda(datos.data.totales[k]) : '…'}</strong>
                </div>
              </div>
            ))}
        </div>
        <div className="flex flex-wrap justify-between gap-3">
          <Button
            icono="filtrar"
            variante="secundario"
            aria-expanded={filtros}
            onClick={() => setFiltros((v) => !v)}
          >
            Filtros
          </Button>
          {!propio && (
            <div className="flex flex-wrap gap-2" data-tour="nomina-exportar">
              {['excel', 'pdf', 'boletas'].map((tipo) => (
                <Button
                  key={tipo}
                  icono="exportar"
                  variante="secundario"
                  cargando={descarga.isPending}
                  disabled={!datos.data?.total}
                  onClick={() => descarga.mutate({ tipo })}
                >
                  {tipo === 'excel' ? 'Excel' : tipo === 'pdf' ? 'PDF planilla' : 'Boletas masivas'}
                </Button>
              ))}
              <Button
                icono="exportar"
                variante="secundario"
                disabled={!q.anio || !q.mes || descarga.isPending}
                motivoDeshabilitado="Selecciona mes y año. Las dos quincenas deben estar cerradas."
                onClick={() => descarga.mutate({ tipo: 'igss' })}
              >
                Reporte IGSS mensual
              </Button>
            </div>
          )}
        </div>
        <section data-tour="nomina-filtros">
          {filtros && (
            <div className="form-grid my-4">
              <NumberField
                name="anio"
                label="Año"
                hint="Año del periodo de pago."
                value={q.anio ?? ''}
                min="2000"
                max="9999"
                onValueChange={(v) => cambiar('anio', v)}
              />
              <SelectField
                name="mes"
                label="Mes"
                hint="Filtra el mes de pago."
                value={q.mes ?? ''}
                onValueChange={(v) => cambiar('mes', v)}
                opciones={meses}
              />
              {!propio && (
                <>
                  <TextField
                    name="buscar"
                    label="Buscar empleado"
                    hint="Nombre, apellido o código."
                    value={q.buscar ?? ''}
                    onValueChange={(v) => cambiar('buscar', v)}
                  />
                  <div className="campo campo-medio">
                    <ReferenciaNovedad
                      referencia="empleados"
                      name="idEmpleado"
                      label="Empleado"
                      hint="Selecciona un expediente real."
                      value={q.idEmpleado ?? ''}
                      onValueChange={(v) => cambiar('idEmpleado', v)}
                    />
                  </div>
                  <div className="campo campo-medio">
                    <RefField
                      name="idDepartamento"
                      label="Departamento"
                      hint="Departamento conservado al calcular."
                      value={q.idDepartamento ?? ''}
                      onValueChange={(v) => cambiar('idDepartamento', v)}
                    />
                  </div>
                  <SelectField
                    name="alertas"
                    label="Alertas"
                    hint="Empleados con avisos dentro del cálculo."
                    value={q.alertas ?? ''}
                    onValueChange={(v) => cambiar('alertas', v)}
                    opciones={[
                      { value: '1', label: 'Con alertas' },
                      { value: '0', label: 'Sin alertas' },
                    ]}
                  />
                  <SelectField
                    name="estado"
                    label="Estado"
                    hint="Paso actual del periodo."
                    value={q.estado ?? ''}
                    onValueChange={(v) => cambiar('estado', v)}
                    opciones={['CALCULADO', 'REVISADO', 'APROBADO', 'CERRADO'].map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                </>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 my-4">
            {activos.map(([k, v]) => (
              <Button key={k} icono="cancelar" variante="secundario" onClick={() => cambiar(k, '')}>
                {labels[k]}: {v}
              </Button>
            ))}
            {activos.length > 0 && (
              <Button
                icono="cancelar"
                variante="texto"
                onClick={() =>
                  setQ({ pagina: '1', limite: '10', ordenarPor: 'inicio', direccion: 'desc' })
                }
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        </section>
        <section data-tour="nomina-tabla">
          {propio && (
            <div className="md:hidden">
              {datos.isPending ? (
                <Skeleton lineas={4} />
              ) : datos.error ? (
                <EmptyState
                  titulo="No se pudieron cargar tus boletas"
                  descripcion={datos.error.message}
                  accion={
                    <Button icono="actualizar" onClick={() => void datos.refetch()}>
                      Reintentar
                    </Button>
                  }
                />
              ) : !datos.data?.total ? (
                <EmptyState
                  titulo="Aún no tienes boletas"
                  descripcion="Cuando RRHH cierre tu primera quincena aparecerá aquí. Si aplicaste filtros, prueba limpiarlos."
                />
              ) : (
                <>
                  <SelectField
                    name="ordenMovil"
                    label="Orden del historial"
                    hint="Ordena tus periodos de pago."
                    value={q.direccion!}
                    onValueChange={(v) =>
                      setQ((p) => ({ ...p, direccion: v, ordenarPor: 'inicio', pagina: '1' }))
                    }
                    opciones={[
                      { value: 'desc', label: 'Más recientes primero' },
                      { value: 'asc', label: 'Más antiguos primero' },
                    ]}
                  />
                  {datos.data.registros.map((f) => (
                    <BoletaMovil
                      key={f.id}
                      f={f}
                      ocupado={descarga.isPending}
                      detalle={() => setVer(f.id)}
                      descargar={() => descarga.mutate({ boleta: f.id })}
                    />
                  ))}
                  <div className="flex justify-between gap-2 mt-4">
                    <Button
                      icono="anterior"
                      variante="secundario"
                      disabled={Number(q.pagina) <= 1}
                      onClick={() => setQ((p) => ({ ...p, pagina: String(Number(p.pagina) - 1) }))}
                    >
                      Anterior
                    </Button>
                    <span>
                      {q.pagina} / {Math.max(1, Math.ceil(datos.data.total / 10))}
                    </span>
                    <Button
                      icono="siguiente"
                      variante="secundario"
                      disabled={Number(q.pagina) * 10 >= datos.data.total}
                      onClick={() => setQ((p) => ({ ...p, pagina: String(Number(p.pagina) + 1) }))}
                    >
                      Siguiente
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
          <div className={propio ? 'hidden md:block' : ''}>
            <Table
              titulo={propio ? 'Mis boletas' : 'Planilla consolidada'}
              filas={datos.data?.registros ?? []}
              total={datos.data?.total ?? 0}
              pagina={Number(q.pagina)}
              limite={10}
              clave={(f) => f.id}
              cargando={datos.isPending}
              error={datos.error?.message ?? ''}
              onReintentar={() => void datos.refetch()}
              onPagina={(v) => setQ((p) => ({ ...p, pagina: String(v) }))}
              orden={{ campo: q.ordenarPor!, direccion: q.direccion as 'asc' | 'desc' }}
              onOrden={(campo, direccion) =>
                setQ((p) => ({ ...p, ordenarPor: campo, direccion, pagina: '1' }))
              }
              columnas={[
                ...(!propio
                  ? [
                      {
                        id: 'empleado',
                        titulo: 'Empleado',
                        ordenable: true,
                        render: (f: Fila) => (
                          <>
                            {f.empleado}
                            <p className="campo-hint">{f.departamento}</p>
                          </>
                        ),
                      },
                    ]
                  : []),
                {
                  id: 'inicio',
                  titulo: 'Periodo',
                  ordenable: true,
                  render: (f) => (
                    <>
                      {fechaVisible(f.inicio)} al {fechaVisible(f.fin)}
                      <p className="campo-hint">
                        {f.estado} · v{f.version}
                      </p>
                    </>
                  ),
                },
                ...(['ingresos', 'descuentos', 'neto'] as const).map((k) => ({
                  id: k,
                  titulo: { ingresos: 'Ingresos', descuentos: 'Descuentos', neto: 'Neto' }[k],
                  ordenable: true,
                  render: (f: Fila) => <span className="whitespace-nowrap">{moneda(f[k])}</span>,
                })),
                {
                  id: 'alertas',
                  titulo: 'Alertas',
                  render: (f) => (
                    <Badge tono={f.alertas && f.alertas !== '[]' ? 'aviso' : 'correcto'}>
                      {f.alertas && f.alertas !== '[]' ? 'Revisar' : 'Sin alertas'}
                    </Badge>
                  ),
                },
                {
                  id: 'acciones',
                  titulo: 'Boleta',
                  render: (f) => (
                    <div className="flex flex-wrap gap-2">
                      <Button icono="ver" variante="secundario" onClick={() => setVer(f.id)}>
                        Detalle
                      </Button>
                      <Button
                        icono="exportar"
                        cargando={descarga.isPending}
                        onClick={() => descarga.mutate({ boleta: f.id })}
                      >
                        PDF
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </section>
      </Card>
      <Modal
        abierto={!!accion}
        titulo={`Confirmar: ${accion}`}
        onCerrar={() => {
          if (!actuar.isPending) setAccion('');
        }}
      >
        {['reabrir', 'devolver'].includes(accion) && <FormDraftNotice draft={draft} />}
        <p className="my-4" data-tour="nomina-confirmar">
          {accion === 'cerrar'
            ? 'Se aplicarán los descuentos, se publicarán las boletas y el periodo quedará bloqueado.'
            : accion === 'reabrir'
              ? 'Se revertirán los cobros de esta versión. Debes recalcular, revisar, aprobar y cerrar de nuevo. Las versiones anteriores se conservarán.'
              : accion === 'calcular'
                ? 'Se calculará una nueva versión con las fuentes y vigencias actuales; tendrás que revisarla otra vez.'
                : accion === 'devolver'
                  ? 'Se quitará la aprobación para corregir fuentes y recalcular.'
                  : 'Confirma que revisaste los conceptos, totales y alertas de esta versión.'}
        </p>
        {['reabrir', 'devolver'].includes(accion) && (
          <div className="form-grid">
            <TextAreaField
              name="motivo"
              label="Motivo"
              hint="Explica por qué se requiere corregir el periodo; mínimo 10 caracteres."
              value={motivo}
              onValueChange={setMotivo}
              required
              maxLength={500}
            />
          </div>
        )}
        <FormErrorSummary mensajes={[error]} />
        <div className="flex justify-end gap-3 mt-4">
          <Button
            icono="cancelar"
            variante="secundario"
            disabled={actuar.isPending}
            onClick={() => setAccion('')}
          >
            Cancelar
          </Button>
          <Button
            icono="aprobar"
            cargando={actuar.isPending}
            disabled={['reabrir', 'devolver'].includes(accion) && motivo.trim().length < 10}
            onClick={() => actuar.mutate()}
          >
            Confirmar {accion}
          </Button>
        </div>
      </Modal>
      {ver && (
        <DetalleBoleta
          id={ver}
          cerrar={() => setVer(undefined)}
          descargar={() => descarga.mutate({ boleta: ver })}
          preview={() => descarga.mutate({ boleta: ver, preview: true })}
        />
      )}
    </>
  );
}
function DetalleBoleta({
  id,
  cerrar,
  descargar,
  preview,
}: {
  id: number;
  cerrar: () => void;
  descargar: () => void;
  preview: () => void;
}) {
  const d = useQuery({
    queryKey: ['nomina', 'detalle', id],
    queryFn: ({ signal }) => api.detalle(id, signal),
  });
  return (
    <Modal abierto titulo="Detalle de boleta" onCerrar={cerrar}>
      <section data-tour="nomina-detalle">
        {d.isPending ? (
          <Skeleton lineas={8} />
        ) : d.error ? (
          <p role="alert">{d.error.message}</p>
        ) : (
          d.data && (
            <>
              <h3 className="my-4">{d.data.empleado}</h3>
              <p>
                {fechaVisible(d.data.inicio)} al {fechaVisible(d.data.fin)} · {d.data.estado} · v
                {d.data.version}
              </p>
              <p>
                Salario mensual {moneda(d.data.resultado.salario)} · Días pagados{' '}
                {d.data.resultado.dias}
              </p>
              <div className="table-scroll my-4">
                <table>
                  <caption>Conceptos conservados en el cálculo</caption>
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      <th>Base</th>
                      <th>Cantidad / tasa</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.data.resultado.lineas.map((l, i) => (
                      <tr key={i}>
                        <td>
                          {l.descripcion}
                          <p className="campo-hint">
                            {l.concepto.naturaleza} · IGSS {l.concepto.igss ? 'Sí' : 'No'} · ISR{' '}
                            {l.concepto.isr ? 'Sí' : 'No'}
                          </p>
                        </td>
                        <td className="whitespace-nowrap">{moneda(l.base)}</td>
                        <td>
                          {l.cantidad}
                          {l.tasa ? ` · ${l.tasa}%` : ''}
                        </td>
                        <td className="whitespace-nowrap">{moneda(l.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <strong>Neto: {moneda(d.data.resultado.neto)}</strong>
              <details className="my-4">
                <summary>Proyección ISR y acumulados</summary>
                {Object.entries(d.data.resultado.isr).map(([k, v]) => (
                  <p key={k}>
                    {
                      (
                        {
                          renta: 'Renta anual proyectada',
                          personal: 'Deducción personal',
                          acreditadas: 'Deducciones acreditadas',
                          igss: 'IGSS proyectado',
                          imponible: 'Renta imponible',
                          anual: 'ISR anual',
                          retenido: 'Retenido acumulado',
                          restantes: 'Periodos restantes',
                          retencion: 'Retención de esta quincena',
                          exceso: 'Retenido en exceso',
                          futuro: 'Renta futura proyectada',
                        } as Record<string, string>
                      )[k]
                    }
                    : {k === 'restantes' ? v : moneda(String(v))}
                  </p>
                ))}
              </details>
              {d.data.resultado.alertas.map((a) => (
                <p key={a} role="status">
                  {a}
                </p>
              ))}
              <div className="flex flex-wrap gap-3">
                <Button icono="ver" onClick={preview}>
                  Vista previa PDF
                </Button>
                <Button icono="exportar" onClick={descargar}>
                  Descargar PDF
                </Button>
              </div>
            </>
          )
        )}
      </section>
    </Modal>
  );
}

export function BoletaMovil({
  f,
  ocupado,
  detalle,
  descargar,
}: {
  f: Fila;
  ocupado: boolean;
  detalle: () => void;
  descargar: () => void;
}) {
  return (
    <article className="border border-borde rounded-xl p-4 my-4">
      <h3>
        {fechaVisible(f.inicio)} al {fechaVisible(f.fin)}
      </h3>
      <p className="campo-hint">
        {f.estado} · Versión {f.version}
      </p>
      <p className="my-3">
        <strong>Neto: {moneda(f.neto)}</strong>
      </p>
      <p>Ingresos: {moneda(f.ingresos)}</p>
      <p>Descuentos: {moneda(f.descuentos)}</p>
      <div className="flex flex-wrap gap-3 mt-4">
        <Button icono="ver" variante="secundario" onClick={detalle}>
          Ver detalle
        </Button>
        <Button icono="exportar" cargando={ocupado} onClick={descargar}>
          Descargar PDF
        </Button>
      </div>
    </article>
  );
}
