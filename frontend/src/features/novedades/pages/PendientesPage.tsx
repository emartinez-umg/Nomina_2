import { FormGrid } from '../../../components/forms/FormGrid';
import { descargar } from '../../empleados/api/empleados';
import { useToast } from '../../../components/ui/Toast';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { pendientes, exportarPendientes } from '../api/parqueo';
import type { Resumen } from '../api/parqueo';
import { MonthField } from '../../../components/forms/MonthField';
import { TextField } from '../../../components/forms';
import { ReferenciaNovedad } from './CampoNovedad';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Table } from '../../../components/ui/Table';
import { hoyGuatemala } from '../../../lib/validadores';
import { moneda } from './NovedadesPage';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { useSession } from '../../../app/session';
import { ayudaPendientes } from '../help/parqueo';
const nombres: Record<string, string> = {
  HORAS_EXTRA: 'Horas extra',
  COMISION: 'Comisiones',
  CONSUMO_TIENDA: 'Consumo en tienda',
  AUSENCIA: 'Ausencias',
  PARQUEO: 'Parqueo',
};
export function PendientesPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaPendientes, usuario?.rol);
  const toast = useToast(),
    [exportando, setExportando] = useState(false),
    [orden, setOrden] = useState<{ campo: 'empleado' | 'departamento'; direccion: 'asc' | 'desc' }>(
      { campo: 'departamento', direccion: 'asc' },
    );
  const hoy = hoyGuatemala(),
    nav = useNavigate(),
    [mes, setMes] = useState(hoy.slice(0, 7)),
    [buscar, setBuscar] = useState(''),
    [dep, setDep] = useState(''),
    [pagina, setPagina] = useState(1);
  const q = useQuery({
    queryKey: ['novedades', 'pendientes', mes, buscar, dep, pagina, orden],
    queryFn: ({ signal }) =>
      pendientes(
        {
          mes,
          buscar,
          idDepartamento: dep,
          pagina: String(pagina),
          ordenarPor: orden.campo,
          direccion: orden.direccion,
        },
        signal,
      ),
  });
  return (
    <>
      <h1>Novedades pendientes</h1>
      <Card>
        <details open data-tour="pendientes-filtros">
          <summary className="cursor-pointer text-primario">
            Filtros de novedades pendientes
          </summary>
          <FormGrid className="my-4">
            <div className="contents">
              <MonthField
                name="mes"
                label="Mes"
                hint="Incluye pendientes de este mes y anteriores."
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
            <div className="contents">
              <TextField
                name="buscar"
                label="Buscar empleado"
                hint="Nombre o código del empleado."
                value={buscar}
                onValueChange={(v) => {
                  setBuscar(v);
                  setPagina(1);
                }}
              />
            </div>
            <div className="contents">
              <ReferenciaNovedad
                referencia="departamentos"
                name="departamento"
                label="Departamento"
                hint="Filtra el departamento laboral."
                value={dep}
                onValueChange={(v) => {
                  setDep(v);
                  setPagina(1);
                }}
              />
            </div>
          </FormGrid>
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
          {dep && (
            <Button
              icono="cancelar"
              variante="texto"
              onClick={() => {
                setDep('');
                setPagina(1);
              }}
            >
              Departamento seleccionado
            </Button>
          )}
        </div>
        <div className="my-4 flex flex-wrap gap-2">
          <Button
            icono="exportar"
            cargando={exportando}
            onClick={() => {
              setExportando(true);
              void exportarPendientes({ mes, buscar, idDepartamento: dep })
                .then((csv) => descargar(csv, `novedades-pendientes-${mes}.csv`))
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
              setMes(hoy.slice(0, 7));
              setBuscar('');
              setDep('');
              setPagina(1);
            }}
          >
            Limpiar filtros
          </Button>
          {['horas-extra', 'comisiones', 'consumo-tienda', 'ausencias'].map((t) => (
            <Button
              key={t}
              icono="crear"
              variante="secundario"
              onClick={() => nav(`/novedades/${t}/nuevo`)}
            >
              Cargar {t.replace(/-/g, ' ')}
            </Button>
          ))}
        </div>
        <p className="banda-informativa">
          Sin registro requiere revisar los respaldos; no implica que deba existir un cargo. Las
          alertas deben resolverse antes del pago.
        </p>
        <div
          data-tour="pendientes-departamentos"
          className="table-scroll my-5"
          tabIndex={0}
          role="region"
          aria-label="Tabla de resumen"
        >
          <table>
            <caption>Resumen por departamento</caption>
            <thead>
              <tr>
                <th>Departamento</th>
                <th>Empleados</th>
                <th>Pendientes</th>
                <th>Alertas</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.departamentos.map((d) => (
                <tr key={d.departamento}>
                  <td>{d.departamento}</td>
                  <td>{d.empleados}</td>
                  <td>{d.pendientes}</td>
                  <td>{d.alertas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div data-tour="pendientes-empleados">
          <Table<Resumen>
            columnas={[
              {
                id: 'empleado',
                titulo: 'Empleado',
                ordenable: true,
                render: (r) => r.empleado,
              },
              {
                id: 'departamento',
                titulo: 'Departamento',
                ordenable: true,
                render: (r) => r.departamento,
              },
              ...Object.entries(nombres).map(([tipo, nombre]) => ({
                id: tipo,
                titulo: nombre,
                render: (r: Resumen) => {
                  const items = r.novedades.filter((n) => n.tipo === tipo);
                  return items.length
                    ? items.map((n, i) => (
                        <p key={i}>
                          {n.mes} · {tipo === 'HORAS_EXTRA' ? `${n.cantidad} h · ` : ''}
                          {moneda(n.monto)} {n.autorizacion !== 'APROBADA' ? '· Por autorizar' : ''}
                          {n.advertencia && <span className="block">{n.advertencia}</span>}
                        </p>
                      ))
                    : 'Sin registro';
                },
              })),
              {
                id: 'alertas',
                titulo: 'Revisión',
                render: (r) => (
                  <>
                    {r.pendientes} pendientes · {r.retroactivas} retroactivas · {r.alertas} alertas
                  </>
                ),
              },
            ]}
            orden={orden}
            onOrden={(campo, direccion) => {
              setOrden({ campo: campo === 'empleado' ? 'empleado' : 'departamento', direccion });
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
    </>
  );
}
