import { ayudaSaldosEquipo } from '../../equipo/help';
import { opcionesEquipo } from '../../equipo/api';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import {
  listarSaldos,
  exportarSaldos,
  listarSaldosEquipo,
  exportarSaldosEquipo,
} from '../api/saldos';
import type { SaldoGeneral } from '../api/saldos';
import { listar as listarCatalogo } from '../../catalogos/api/catalogos';
import { descargar } from '../../nomina/api/nomina';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { iconos } from '../../../components/ui/icons';
import { Table } from '../../../components/ui/Table';
import { FormGrid } from '../../../components/forms/FormGrid';
import { TextField, SelectField } from '../../../components/forms';
import { fechaVisible } from '../../../lib/validadores';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaSaldosVacaciones, ayudaUmbralVacaciones } from '../help/saldos';
import { EditarUmbralVacaciones } from '../components/EditarUmbralVacaciones';
import { useToast } from '../../../components/ui/Toast';
function FiltroOrganizacion({
  slug,
  label,
  value,
  onChange,
  equipo = false,
}: {
  equipo?: boolean;
  slug: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [buscar, setBuscar] = useState('');
  const deEquipo = useQuery({
    queryKey: ['equipo', 'opciones', 'vacaciones'],
    queryFn: ({ signal }) => opcionesEquipo('vacaciones', signal),
    enabled: equipo,
  });
  const q = useInfiniteQuery({
    queryKey: ['catalogos', 'saldos-filtro', slug, buscar],
    enabled: !equipo,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      listarCatalogo(
        slug,
        {
          buscar,
          pagina: String(pageParam),
          limite: '100',
          ordenarPor: 'nombre',
          direccion: 'asc',
        },
        signal,
      ),
    getNextPageParam: (last, _all, p) => (p * 100 < last.total ? p + 1 : undefined),
  });
  const opciones = equipo
    ? (deEquipo.data?.[
        slug === 'departamentos' ? 'departamentos' : slug === 'jefaturas' ? 'jefaturas' : 'centros'
      ].map((o) => ({ value: String(o.id), label: o.nombre })) ?? [])
    : (q.data?.pages.flatMap((p) =>
        p.registros.map((r) => ({ value: String(r.id), label: String(r.nombre) })),
      ) ?? []);
  return (
    <SelectField
      name={slug}
      label={label}
      hint={`Busca y selecciona ${label.toLowerCase()} para limitar los empleados. Vacío incluye todos.`}
      value={value}
      onValueChange={onChange}
      onBuscar={setBuscar}
      filtrarEnServidor={!equipo}
      opciones={[{ value: '', label: 'Todos' }, ...opciones]}
      error={deEquipo.error?.message ?? q.error?.message}
      complemento={
        <>
          {(equipo ? deEquipo.isPending : q.isPending) && <p role="status">Cargando opciones…</p>}
          {q.hasNextPage && (
            <Button
              icono="siguiente"
              variante="texto"
              cargando={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              Más opciones
            </Button>
          )}
          {value && (
            <Button icono="cancelar" variante="texto" onClick={() => onChange('')}>
              Quitar selección
            </Button>
          )}
        </>
      }
    />
  );
}
const iniciales: Record<string, string> = {
  activos: 'true',
  pagina: '1',
  limite: '10',
  ordenarPor: 'disponible',
  direccion: 'desc',
};
const etiquetas: Record<string, string> = {
  buscar: 'Búsqueda',
  idDepartamento: 'Departamento',
  idCentroTrabajo: 'Centro',
  idJefatura: 'Jefatura',
  soloAlerta: 'Solo con alerta',
  activos: 'Estado',
};
export function SaldosVacacionesPage({ equipo = false }: { equipo?: boolean }) {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [editarUmbral, setEditarUmbral] = useState(false);
  usePageHelp(
    equipo ? ayudaSaldosEquipo : editarUmbral ? ayudaUmbralVacaciones : ayudaSaldosVacaciones,
  );
  const [filtros, setFiltros] = useState(false);
  const q = {
    ...iniciales,
    ...Object.fromEntries([...params].filter(([k]) => k in iniciales || k in etiquetas)),
  };
  const cambiar = (campo: string, valor: string) => {
    const next = new URLSearchParams(params);
    if (valor) next.set(campo, valor);
    else next.delete(campo);
    if (campo !== 'pagina') next.set('pagina', '1');
    setParams(next, { replace: true });
  };
  const consulta = useQuery({
    queryKey: ['vacaciones', 'saldos', equipo ? 'equipo' : 'general', q],
    queryFn: ({ signal }) => (equipo ? listarSaldosEquipo : listarSaldos)(q, signal),
    refetchInterval: 60000,
  });
  const exportacion = useMutation({
    mutationFn: (formato: 'csv' | 'excel') =>
      (equipo ? exportarSaldosEquipo : exportarSaldos)(q, formato),
    onSuccess: (d) => {
      descargar(d);
      toast('Saldos exportados.');
    },
    onError: (e) => toast(e.message, 'peligro'),
  });
  const d = consulta.error ? undefined : consulta.data;
  const chips = Object.entries(etiquetas).filter(
    ([k]) => q[k] && (k !== 'soloAlerta' || q[k] === 'true'),
  );
  return (
    <div>
      {editarUmbral && d && (
        <EditarUmbralVacaciones id={d.idParametro} onCerrar={() => setEditarUmbral(false)} />
      )}
      <h1>{equipo ? 'Vacaciones de mi equipo' : 'Saldos de vacaciones'}</h1>
      <p className="text-secundario mb-5">
        {equipo
          ? 'Mi equipo / Vacaciones · Solo las personas de tus jefaturas autorizadas. Consulta y exporta sus saldos, sin aprobar solicitudes.'
          : 'Planifica el descanso del personal y localiza los saldos que requieren atención.'}
      </p>
      <section
        data-tour="saldos-indicadores"
        aria-label="Indicadores de saldos"
        className="grid grid-cols-1 gap-4 my-6 sm:grid-cols-3"
        aria-busy={consulta.isFetching}
      >
        {[
          ['Empleados en alerta', d?.indicadores.empleadosAlerta],
          ['Promedio disponible', d?.indicadores.promedioDisponible],
          ['Total de días acumulados', d?.indicadores.totalAcumulado],
        ].map(([label, value]) => (
          <Card key={label}>
            <p>{label}</p>
            <strong className="text-2xl">{value ?? '—'}</strong>
          </Card>
        ))}
      </section>
      <Card className="my-5" data-tour="saldos-umbral">
        <p>
          <iconos.advertencia aria-hidden="true" className="inline h-5 w-5 mr-2" />
          {d
            ? `${d.etiquetaAlerta}: disponible estrictamente mayor que ${d.umbral}. Corte al ${fechaVisible(d.corte)}.`
            : 'Consulta el umbral vigente al cargar los saldos.'}
        </p>
        <p className="campo-hint">
          Una aprobación descuenta días; una solicitud pendiente no reserva saldo. Los indicadores
          abarcan todos los resultados filtrados.
        </p>
        {!equipo && (
          <Button
            icono="configuracion"
            variante="texto"
            disabled={!d}
            onClick={() => setEditarUmbral(true)}
          >
            Configurar umbral
          </Button>
        )}
      </Card>
      <Card>
        <div className="flex flex-wrap justify-between gap-3 mb-4">
          <Button
            icono="filtrar"
            variante="secundario"
            aria-expanded={filtros}
            onClick={() => setFiltros((v) => !v)}
          >
            Filtros
          </Button>
          <div className="flex flex-wrap gap-2" data-tour="saldos-exportar">
            <Button
              icono="actualizar"
              variante="secundario"
              cargando={consulta.isFetching}
              onClick={() => void consulta.refetch()}
            >
              Actualizar
            </Button>
            {(['csv', 'excel'] as const).map((f) => (
              <Button
                key={f}
                icono="exportar"
                variante="secundario"
                cargando={exportacion.isPending}
                disabled={!d || consulta.isFetching}
                onClick={() => exportacion.mutate(f)}
              >
                Exportar {f === 'csv' ? 'CSV' : 'Excel'}
              </Button>
            ))}
          </div>
        </div>
        <section data-tour="saldos-filtros">
          <TextField
            name="buscar"
            label="Buscar nombre o código"
            placeholder="Nombre, apellido o EMP_…"
            hint="Busca coincidencias por nombre o código del empleado."
            maxLength={150}
            value={q.buscar ?? ''}
            onValueChange={(v) => cambiar('buscar', v)}
          />
          {filtros && (
            <FormGrid className="my-4">
              <FiltroOrganizacion
                equipo={equipo}
                slug="departamentos"
                label="Departamento"
                value={q.idDepartamento ?? ''}
                onChange={(v) => cambiar('idDepartamento', v)}
              />
              <FiltroOrganizacion
                equipo={equipo}
                slug="centros-trabajo"
                label="Centro de trabajo"
                value={q.idCentroTrabajo ?? ''}
                onChange={(v) => cambiar('idCentroTrabajo', v)}
              />
              <FiltroOrganizacion
                equipo={equipo}
                slug="jefaturas"
                label="Jefatura"
                value={q.idJefatura ?? ''}
                onChange={(v) => cambiar('idJefatura', v)}
              />
              <SelectField
                name="activos"
                label="Estado del empleado"
                hint={
                  equipo
                    ? 'El equipo solo incluye personas activas. Los filtros nunca amplían tu alcance.'
                    : 'Activos: ficha habilitada y estado Activo. Todos incluye bajas e inactivos.'
                }
                value={q.activos!}
                onValueChange={(v) => cambiar('activos', v)}
                opciones={[
                  { value: 'true', label: 'Activos' },
                  { value: 'false', label: 'Inactivos / bajas' },
                  { value: 'todos', label: 'Todos' },
                ]}
              />
              <SelectField
                name="soloAlerta"
                label="Alerta de saldo"
                hint="Limita la consulta a quienes superan el umbral vigente; la comparación usa decimales."
                value={q.soloAlerta ?? 'false'}
                onValueChange={(v) => cambiar('soloAlerta', v)}
                opciones={[
                  { value: 'false', label: 'Todos los saldos' },
                  { value: 'true', label: 'Solo con alerta' },
                ]}
              />
            </FormGrid>
          )}
          <div className="flex flex-wrap gap-2 my-4" aria-label="Filtros activos">
            {chips.map(([k, label]) => (
              <Button
                key={k}
                icono="cancelar"
                variante="texto"
                onClick={() => cambiar(k, k === 'activos' ? 'todos' : '')}
              >
                {label}:{' '}
                {k === 'activos'
                  ? { true: 'Activos', false: 'Inactivos / bajas', todos: 'Todos' }[q[k]!]
                  : k === 'soloAlerta'
                    ? 'Sí'
                    : q[k]}
              </Button>
            ))}
            <Button
              icono="cancelar"
              variante="secundario"
              onClick={() =>
                setParams(new URLSearchParams({ activos: 'todos' }), { replace: true })
              }
            >
              Limpiar filtros
            </Button>
          </div>
        </section>
        <div data-tour="saldos-listado">
          <Table<SaldoGeneral>
            titulo="Saldos de vacaciones"
            filas={d?.registros ?? []}
            clave={(f) => f.id}
            pagina={Number(q.pagina)}
            limite={Number(q.limite)}
            total={d?.total ?? 0}
            orden={{ campo: q.ordenarPor!, direccion: q.direccion === 'asc' ? 'asc' : 'desc' }}
            onPagina={(p) => cambiar('pagina', String(p))}
            onOrden={(campo, dir) => {
              setParams(
                { ...Object.fromEntries(params), ordenarPor: campo, direccion: dir, pagina: '1' },
                { replace: true },
              );
            }}
            cargando={consulta.isPending}
            {...(consulta.error ? { error: consulta.error.message } : {})}
            onReintentar={() => void consulta.refetch()}
            claseFila={(f) => (f.alerta ? 'saldo-vacaciones-alerta' : undefined)}
            columnas={[
              { id: 'codigo', titulo: 'Código', ordenable: true, render: (f) => f.codigo },
              {
                id: 'nombre',
                titulo: 'Nombre',
                ordenable: true,
                render: (f) => (
                  <>
                    <span className="block">{f.nombre}</span>
                    {f.alerta && (
                      <Badge tono="peligro">
                        <iconos.advertencia className="inline h-4 w-4 mr-1" aria-hidden="true" />
                        {d?.etiquetaAlerta}
                      </Badge>
                    )}
                    {!f.activo && <Badge>Inactivo / baja</Badge>}
                  </>
                ),
              },
              {
                id: 'disponible',
                titulo: 'Disponible',
                ordenable: true,
                render: (f) => <strong>{f.disponible}</strong>,
              },
              {
                id: 'solicitables',
                titulo: 'Solicitables',
                ordenable: true,
                render: (f) => f.solicitables,
              },
              ...(['departamento', 'centro', 'jefatura'] as const).map((k) => ({
                id: k,
                titulo: { departamento: 'Departamento', centro: 'Centro', jefatura: 'Jefatura' }[k],
                ordenable: true,
                render: (f: SaldoGeneral) => f[k] ?? `Sin ${k}`,
              })),
              {
                id: 'ingreso',
                titulo: 'Ingreso',
                ordenable: true,
                render: (f) => fechaVisible(f.ingreso),
              },
              {
                id: 'mesesCompletos',
                titulo: 'Meses completos',
                ordenable: true,
                render: (f) => f.mesesCompletos,
              },
              { id: 'acumulado', titulo: 'Acumulado', ordenable: true, render: (f) => f.acumulado },
              {
                id: 'tomados',
                titulo: 'Tomados',
                ordenable: true,
                render: (f) => (
                  <>
                    {f.tomados}
                    {f.previas !== '0.00' && (
                      <small className="block">Previas / ajustes: {f.previas}</small>
                    )}
                  </>
                ),
              },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}
