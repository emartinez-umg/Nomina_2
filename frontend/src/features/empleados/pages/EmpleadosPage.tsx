import { EstadoBadge } from '../../../components/ui/EstadoBadge';
import { FormGrid } from '../../../components/forms/FormGrid';
import { useState } from 'react';
import { ayudaAsignacionJefaturas } from '../../jefaturas/help';
import { AsignarJefatura } from '../../jefaturas/JefaturasPanel';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listar, exportar, descargar } from '../api/empleados';
import { CampoEmpleado } from './CampoEmpleado';
import { todosCampos } from '../api/formulario';
import type { CampoEmpleado as Def } from '../api/formulario';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { TextField } from '../../../components/forms';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { useSession } from '../../../app/session';
import { useToast } from '../../../components/ui/Toast';
import { ayudaEmpleados } from '../help/pasos';
import { fechaVisible } from '../../../lib/validadores';
import { formatoMoneda } from '../../../components/forms/MoneyField';
const ayuda = ayudaEmpleados('listado');
const filtros: Def[] = [
  {
    nombre: 'nombre',
    label: 'Nombre o apellidos',
    tipo: 'texto',
    hint: 'Busca una parte del nombre completo o del código.',
    max: 200,
  },
  ...todosCampos
    .filter((f) =>
      [
        'dpi',
        'nit',
        'idDepartamento',
        'idPuesto',
        'idJefatura',
        'idCentroTrabajo',
        'idTipoContrato',
        'estado',
      ].includes(f.nombre),
    )
    .map((f) => ({
      ...f,
      required: false,
      ...(f.nombre === 'estado' ? { opciones: ['ACTIVO', 'SUSPENDIDO', 'EGRESADO'] } : {}),
    })),
  {
    nombre: 'ingresoDesde',
    label: 'Ingreso desde',
    tipo: 'fecha',
    hint: 'Primer día de ingreso incluido en la consulta.',
  },
  {
    nombre: 'ingresoHasta',
    label: 'Ingreso hasta',
    tipo: 'fecha',
    hint: 'Último día de ingreso incluido en la consulta.',
  },
  {
    nombre: 'salarioMin',
    label: 'Salario mínimo',
    tipo: 'dinero',
    hint: 'Salario mensual desde este monto.',
  },
  {
    nombre: 'salarioMax',
    label: 'Salario máximo',
    tipo: 'dinero',
    hint: 'Salario mensual hasta este monto.',
  },
];
export function EmpleadosPage() {
  const { usuario } = useSession();
  const [asignando, setAsignando] = useState(false);
  usePageHelp(asignando ? ayudaAsignacionJefaturas : ayuda, usuario?.rol);
  const nav = useNavigate(),
    toast = useToast();
  const [url] = useSearchParams();
  const inicial = {
    ...(url.get('sinJefatura') === '1' ? { sinJefatura: '1', estado: 'ACTIVO' } : {}),
    ...(url.get('expedienteIncompleto') === '1' ? { expedienteIncompleto: '1' } : {}),
  };
  const [borrador, setBorrador] = useState<Record<string, string>>(inicial),
    [q, setQ] = useState<Record<string, string>>(inicial),
    [pagina, setPagina] = useState(1),
    [orden, setOrden] = useState<{ campo: string; direccion: 'asc' | 'desc' }>({
      campo: 'nombre',
      direccion: 'asc',
    }),
    [exportando, setExportando] = useState(false);
  const query = {
    ...q,
    pagina: String(pagina),
    ordenarPor: orden.campo,
    direccion: orden.direccion,
  };
  const datos = useQuery({
    queryKey: ['empleados', 'lista', query],
    queryFn: ({ signal }) => listar(query, signal),
  });
  const set = (key: string, v: string) => setBorrador((d) => ({ ...d, [key]: v }));
  const aplicar = () => {
    setQ(
      Object.fromEntries(
        Object.entries(borrador)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => [k, k.startsWith('salario') ? v.replace(/,/g, '') : v]),
      ),
    );
    setPagina(1);
  };
  return (
    <>
      {asignando && <AsignarJefatura cerrar={() => setAsignando(false)} />}
      <h1>Gestión de empleados</h1>
      <p className="my-3 text-secundario">Expedientes, salarios y altas individuales o masivas.</p>

      <div className="my-5 flex flex-wrap gap-3" data-tour="empleados-acciones">
        <Button icono="crear" onClick={() => nav('/empleados/nuevo')}>
          Nuevo empleado
        </Button>
        <Button icono="cargar" variante="secundario" onClick={() => nav('/empleados/carga-masiva')}>
          Carga masiva
        </Button>
        <Button
          icono="empleados"
          data-tour="jefaturas-asignar"
          variante="secundario"
          onClick={() => setAsignando(true)}
        >
          Asignar jefatura
        </Button>
        <span data-tour="empleados-exportar">
          <Button
            icono="exportar"
            variante="secundario"
            cargando={exportando}
            onClick={() => {
              setExportando(true);
              void exportar(query)
                .then((csv) => descargar(csv, 'empleados.csv'))
                .catch((e) => toast((e as Error).message, 'peligro'))
                .finally(() => setExportando(false));
            }}
          >
            Exportar CSV
          </Button>
        </span>
      </div>
      <Card>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            aplicar();
          }}
          data-tour="empleados-filtros"
        >
          <div className="mb-3">
            <TextField
              name="nombre"
              label="Buscar empleado"
              hint="Combina esta búsqueda con los filtros avanzados."
              value={borrador.nombre ?? ''}
              onValueChange={(v) => set('nombre', v)}
              maxLength={200}
            />
          </div>
          <details>
            <summary className="cursor-pointer text-primario">Filtros avanzados</summary>
            <label
              className="flex items-center gap-2 my-4"
              title="Falta algún documento obligatorio vigente, o se dio de baja."
            >
              <input
                type="checkbox"
                checked={borrador.expedienteIncompleto === '1'}
                onChange={(e) => set('expedienteIncompleto', e.target.checked ? '1' : '')}
              />
              Expediente incompleto
            </label>
            <FormGrid className="my-4">
              {filtros
                .filter((f) => f.nombre !== 'nombre')
                .map((f) => (
                  <div className="contents" key={f.nombre}>
                    {['dpi', 'nit'].includes(f.nombre) ? (
                      <TextField
                        name={f.nombre}
                        label={f.label}
                        hint="Puedes buscar una parte del número. El listado protege el documento completo."
                        value={borrador[f.nombre] ?? ''}
                        onValueChange={(v) =>
                          set(
                            f.nombre,
                            v.replace(f.nombre === 'dpi' ? /\D/g : /[^0-9K-]/gi, '').toUpperCase(),
                          )
                        }
                        maxLength={f.nombre === 'dpi' ? 13 : 20}
                      />
                    ) : (
                      <CampoEmpleado
                        campo={f}
                        name={f.nombre}
                        label={f.label}
                        hint={f.hint}
                        value={borrador[f.nombre] ?? ''}
                        onValueChange={(v) => set(f.nombre, v)}
                        departamento={
                          ['idPuesto', 'idJefatura'].includes(f.nombre)
                            ? borrador.idDepartamento
                            : undefined
                        }
                      />
                    )}
                  </div>
                ))}
            </FormGrid>
          </details>
          <div className="my-4 flex flex-wrap gap-2">
            <Button type="submit" icono="filtrar">
              Aplicar filtros
            </Button>
            <Button
              icono="cancelar"
              variante="texto"
              onClick={() => {
                setBorrador({});
                setQ({});
                setPagina(1);
              }}
            >
              Limpiar filtros
            </Button>
          </div>
          <div role="group" className="my-3 flex flex-wrap gap-2" aria-label="Filtros activos">
            {Object.entries(q).map(([k, v]) => (
              <Button
                key={k}
                icono="cancelar"
                variante="texto"
                onClick={() => {
                  const next = { ...q };
                  delete next[k];
                  setQ(next);
                  setBorrador(next);
                  setPagina(1);
                }}
              >
                {k === 'expedienteIncompleto'
                  ? 'Expediente incompleto'
                  : k === 'sinJefatura'
                    ? 'Sin jefatura activa'
                    : filtros.find((f) => f.nombre === k)?.label}
                : {k.startsWith('ingreso') ? fechaVisible(v) : v}
              </Button>
            ))}
          </div>
        </form>
        <div data-tour="empleados-tabla">
          <Table
            columnas={[
              { id: 'codigo', titulo: 'Código', ordenable: true, render: (r) => r.codigo },
              {
                id: 'nombre',
                titulo: 'Empleado',
                ordenable: true,
                render: (r) => (
                  <div>
                    <strong>{r.nombre}</strong>
                    {r.perfilIncompleto && (
                      <p className="text-sm text-secundario">
                        <strong>Perfil incompleto</strong> · Falta: {r.faltantes.join(', ')}
                      </p>
                    )}
                  </div>
                ),
              },
              {
                id: 'expediente',
                titulo: 'Expediente',
                render: (r) => (
                  <Button
                    icono="documento"
                    variante="texto"
                    onClick={() => nav(`/empleados/${r.id}?tab=documentos`)}
                  >
                    {r.expedienteCompletos === undefined
                      ? 'Consultar expediente'
                      : `Expediente ${r.expedienteCompletos} de ${r.expedienteRequeridos}`}
                  </Button>
                ),
              },
              { id: 'dpi', titulo: 'DPI', render: (r) => r.dpi },
              { id: 'nit', titulo: 'NIT', render: (r) => r.nit },
              {
                id: 'departamento',
                titulo: 'Departamento',
                ordenable: true,
                render: (r) => r.departamento,
              },
              {
                id: 'jefatura',
                titulo: 'Jefatura',
                render: (r) => r.jefatura ?? 'Sin jefatura asignada',
              },
              {
                id: 'jefeInmediato',
                titulo: 'Jefe inmediato',
                render: (r) => r.jefeInmediato ?? 'Sin jefe asignado',
              },
              { id: 'puesto', titulo: 'Puesto', ordenable: true, render: (r) => r.puesto },
              {
                id: 'fechaIngreso',
                titulo: 'Ingreso',
                ordenable: true,
                render: (r) => fechaVisible(r.fechaIngreso),
              },
              {
                id: 'salarioBase',
                titulo: 'Salario mensual',
                ordenable: true,
                render: (r) =>
                  r.salarioBase ? `Q ${formatoMoneda(r.salarioBase)}` : 'Sin vigencia',
              },
              {
                id: 'estado',
                titulo: 'Estado',
                ordenable: true,
                render: (r) => <EstadoBadge estado={r.estado} />,
              },
              {
                id: 'acciones',
                titulo: 'Acciones',
                render: (r) => (
                  <Button icono="ver" variante="texto" onClick={() => nav(`/empleados/${r.id}`)}>
                    Ver ficha
                  </Button>
                ),
              },
            ]}
            filas={datos.data?.registros ?? []}
            clave={(r) => r.id}
            pagina={pagina}
            limite={20}
            total={datos.data?.total ?? 0}
            orden={orden}
            onOrden={(campo, direccion) => {
              setOrden({ campo, direccion });
              setPagina(1);
            }}
            onPagina={setPagina}
            cargando={datos.isPending}
            {...(datos.error ? { error: datos.error.message } : {})}
            onReintentar={() => void datos.refetch()}
          />
        </div>
      </Card>
    </>
  );
}
