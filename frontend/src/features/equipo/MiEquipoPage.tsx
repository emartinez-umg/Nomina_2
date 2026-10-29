import type { personaEquipoSchema } from './api';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { listarEquipo, opcionesEquipo, resumenEquipo } from './api';
import { useSession } from '../../app/session';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { TextField, SelectField } from '../../components/forms';
import { FormGrid } from '../../components/forms/FormGrid';
import { iconos } from '../../components/ui/icons';
import { usePageHelp } from '../../components/help/HelpProvider';
import { ayudaMiEquipo } from './help';
export function MiEquipoPage() {
  usePageHelp(ayudaMiEquipo, 'EMPLEADO');
  const { reintentar } = useSession();
  const r = useQuery({
    queryKey: ['equipo', 'resumen'],
    queryFn: ({ signal }) => resumenEquipo(signal),
  });
  return (
    <div>
      <h1>Mi equipo</h1>
      <p className="my-3 text-secundario">Mis gestiones / Mi equipo</p>
      <Card data-tour="equipo-resumen">
        {r.isPending ? (
          <Skeleton />
        ) : r.error ? (
          <EmptyState
            titulo="Equipo no disponible"
            descripcion={r.error.message}
            accion={
              <Button
                icono="actualizar"
                onClick={() => {
                  void r.refetch();
                  reintentar();
                }}
              >
                Actualizar permisos
              </Button>
            }
          />
        ) : (
          <>
            <h2>Equipo: {r.data.total} personas</h2>
            <p className="campo-hint my-3">
              Solo consultas autorizadas de las jefaturas que diriges y sus descendientes activas.
              Conservas el rol Empleado.
            </p>
            {r.data.permisos.includes('VER_VACACIONES_EQUIPO') && (
              <Link className="enlace-icono" to="/mi-equipo/vacaciones">
                <iconos.calendario aria-hidden="true" /> Saldos de vacaciones del equipo
              </Link>
            )}
            {r.data.permisos.includes('VER_COMISIONES_EQUIPO') && (
              <Link className="enlace-icono my-3" to="/mi-equipo/comisiones">
                <iconos.estadisticas aria-hidden="true" />
                Estadísticas de comisiones del equipo
              </Link>
            )}
          </>
        )}
      </Card>
      {r.data?.permisos.includes('VER_EQUIPO') && !r.error && <DirectorioEquipo />}
    </div>
  );
}
function DirectorioEquipo() {
  const [params, setParams] = useSearchParams(),
    [filtros, setFiltros] = useState(false);
  const q: Record<string, string> = {
    pagina: '1',
    limite: '10',
    ordenarPor: 'nombre',
    direccion: 'asc',
    ...Object.fromEntries(
      [...params].filter(([k]) =>
        [
          'buscar',
          'idDepartamento',
          'idCentroTrabajo',
          'idJefatura',
          'pagina',
          'limite',
          'ordenarPor',
          'direccion',
        ].includes(k),
      ),
    ),
  };
  const cambiar = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== 'pagina') n.set('pagina', '1');
    setParams(n, { replace: true });
  };
  const consulta = useQuery({
    queryKey: ['equipo', 'personas', q],
    queryFn: ({ signal }) => listarEquipo(q, signal),
  });
  const opciones = useQuery({
    queryKey: ['equipo', 'opciones', 'personas'],
    queryFn: ({ signal }) => opcionesEquipo('personas', signal),
  });
  return (
    <Card className="my-5">
      <section data-tour="equipo-filtros">
        <div className="flex flex-wrap gap-3 my-4">
          <Button
            icono="filtrar"
            variante="secundario"
            aria-expanded={filtros}
            onClick={() => setFiltros((v) => !v)}
          >
            Filtros
          </Button>
          <Button
            icono="actualizar"
            variante="secundario"
            cargando={consulta.isFetching}
            onClick={() => {
              void consulta.refetch();
              void opciones.refetch();
            }}
          >
            Actualizar
          </Button>
        </div>
        <TextField
          name="buscar"
          label="Buscar nombre o código"
          hint="Busca solo dentro de tu equipo autorizado."
          placeholder="Nombre, apellido o EMP_…"
          maxLength={150}
          value={q.buscar ?? ''}
          onValueChange={(v) => cambiar('buscar', v)}
        />
        {filtros && (
          <FormGrid className="my-4">
            {(
              [
                ['idDepartamento', 'Departamento', 'departamentos'],
                ['idCentroTrabajo', 'Centro', 'centros'],
                ['idJefatura', 'Jefatura', 'jefaturas'],
              ] as const
            ).map(([k, label, lista]) => (
              <SelectField
                key={k}
                name={k}
                label={label}
                hint="Las opciones pertenecen a tu equipo. Vacío incluye todas las opciones autorizadas."
                value={q[k] ?? ''}
                onValueChange={(v) => cambiar(k, v)}
                opciones={[
                  { value: '', label: 'Todos' },
                  ...(opciones.data?.[lista].map((o) => ({
                    value: String(o.id),
                    label: o.nombre,
                  })) ?? []),
                ]}
                error={opciones.error?.message}
              />
            ))}
          </FormGrid>
        )}
        <div className="my-4 flex flex-wrap gap-2">
          {['buscar', 'idDepartamento', 'idCentroTrabajo', 'idJefatura']
            .filter((k) => q[k])
            .map((k) => (
              <Button key={k} icono="cancelar" variante="texto" onClick={() => cambiar(k, '')}>
                Quitar{' '}
                {k === 'buscar'
                  ? 'búsqueda'
                  : k === 'idDepartamento'
                    ? 'departamento'
                    : k === 'idCentroTrabajo'
                      ? 'centro'
                      : 'jefatura'}
                : {q[k]}
              </Button>
            ))}
          <Button icono="cancelar" variante="secundario" onClick={() => setParams({})}>
            Limpiar filtros
          </Button>
        </div>
      </section>
      <div data-tour="equipo-listado">
        <Table<z.infer<typeof personaEquipoSchema>>
          titulo="Directorio del equipo"
          filas={consulta.error ? [] : (consulta.data?.registros ?? [])}
          clave={(f) => f.id}
          pagina={Number(q.pagina)}
          limite={Number(q.limite)}
          total={consulta.error ? 0 : (consulta.data?.total ?? 0)}
          orden={{ campo: q.ordenarPor!, direccion: q.direccion === 'desc' ? 'desc' : 'asc' }}
          onPagina={(p) => cambiar('pagina', String(p))}
          onOrden={(campo, direccion) =>
            setParams({ ...q, ordenarPor: campo, direccion, pagina: '1' })
          }
          cargando={consulta.isPending}
          {...(consulta.error ? { error: consulta.error.message } : {})}
          onReintentar={() => void consulta.refetch()}
          columnas={(['codigo', 'nombre', 'puesto', 'departamento', 'centro'] as const).map(
            (k) => ({
              id: k,
              titulo: {
                codigo: 'Código',
                nombre: 'Nombre',
                puesto: 'Puesto',
                departamento: 'Departamento',
                centro: 'Centro',
              }[k],
              ordenable: true,
              render: (f) => f[k] ?? 'Sin centro',
            }),
          )}
        />
      </div>
    </Card>
  );
}
