import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useSession } from '../../app/session';
import { solicitar } from '../../lib/http';
import { fechaVisible } from '../../lib/validadores';
import { opcionesEstado } from '../../lib/estados';
import { estadosActa } from '../../../../backend/src/shared/actas/modelo';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { EstadoBadge } from '../../components/ui/EstadoBadge';
import { DateField, SelectField, TextField } from '../../components/forms';
import { SelectorEmpleado } from '../../components/forms/SelectorEmpleado';
import { FormGrid } from '../../components/forms/FormGrid';
import { usePageHelp } from '../../components/help/HelpProvider';
import { guardarArchivo } from '../expedientes/api';
import { ayudaActas } from './help/pasos';
import * as api from './api';
export function useDepartamentos(enabled = true) {
  return useQuery({
    queryKey: ['actas', 'departamentos'],
    queryFn: ({ signal }) =>
      solicitar(
        '/catalogos/opciones/departamentos',
        z.array(z.object({ value: z.string(), label: z.string() })),
        { signal },
      ),
    enabled,
  });
}
export function ActasPage() {
  const { usuario } = useSession(),
    empleado = usuario?.rol === 'EMPLEADO';
  usePageHelp(ayudaActas(empleado), usuario?.rol);
  return (
    <>
      <h1>{empleado ? 'Mis actas' : 'Actas administrativas'}</h1>
      <p className="my-3 text-secundario">
        {empleado
          ? 'Consulta tus documentos emitidos y su seguimiento.'
          : 'Registra amonestaciones y medidas con documentos y trazabilidad.'}
      </p>
      <ActasListado />
    </>
  );
}
export function ActasListado({ idEmpleado }: { idEmpleado?: number }) {
  const { usuario } = useSession(),
    nav = useNavigate(),
    propio = usuario?.rol === 'EMPLEADO',
    [url, setUrl] = useSearchParams(),
    [error, setError] = useState(''),
    [exportando, setExportando] = useState(false);
  const keys = [
    'buscar',
    'idEmpleado',
    'idDepartamento',
    'idTipo',
    'estado',
    'desde',
    'hasta',
    'pagina',
    'ordenarPor',
    'direccion',
  ];
  const q = new URLSearchParams([...url].filter(([k]) => keys.includes(k)));
  if (idEmpleado) q.set('idEmpleado', String(idEmpleado));
  const filtro = (key: string, v: string) => {
    const n = new URLSearchParams(url);
    if (v) n.set(key, v);
    else n.delete(key);
    if (key !== 'pagina') n.delete('pagina');
    if (key === 'idDepartamento') n.delete('idEmpleado');
    setUrl(n, { replace: key === 'buscar' });
  };
  const datos = useQuery({
    queryKey: ['actas', usuario?.idUsuario, 'lista', q.toString()],
    queryFn: ({ signal }) => api.listar(q, signal),
    retry: false,
    gcTime: 0,
  });
  const departamentos = useDepartamentos(!propio),
    reglas = useQuery({
      queryKey: ['actas', usuario?.idUsuario, 'reglas'],
      queryFn: ({ signal }) => api.reglas(signal),
      enabled: !propio,
    });
  const tipoOpciones =
    reglas.data?.tipos.map((t) => ({ value: String(t.id), label: t.nombre })) ?? [];
  const activos = [...q].filter(
    ([k]) =>
      !['pagina', 'ordenarPor', 'direccion'].includes(k) && !(k === 'idEmpleado' && idEmpleado),
  );
  const etiquetas: Record<string, string> = {
    buscar: 'Búsqueda',
    idEmpleado: 'Empleado',
    idDepartamento: 'Departamento',
    idTipo: 'Tipo',
    estado: 'Estado',
    desde: 'Desde',
    hasta: 'Hasta',
  };
  const tituloValor = (k: string, v: string) =>
    k === 'buscar'
      ? v
      : k === 'estado'
        ? opcionesEstado(estadosActa).find((x) => x.value === v)?.label
        : k === 'idTipo'
          ? tipoOpciones.find((x) => x.value === v)?.label
          : k === 'idDepartamento'
            ? departamentos.data?.find((x) => x.value === v)?.label
            : k === 'desde' || k === 'hasta'
              ? fechaVisible(v)
              : 'seleccionado';
  return (
    <section className="my-5 min-w-0" data-tour="actas-listado">
      <div className="flex flex-wrap gap-3 mb-4">
        {!propio && (
          <>
            <Button
              icono="crear"
              onClick={() => nav(`/actas/nueva${idEmpleado ? `?empleado=${idEmpleado}` : ''}`)}
            >
              Nueva acta
            </Button>
            <Button icono="editar" variante="secundario" onClick={() => nav('/actas/plantilla')}>
              Editar plantilla
            </Button>
          </>
        )}
        <Button
          icono="exportar"
          variante="secundario"
          cargando={exportando}
          onClick={() => {
            setExportando(true);
            setError('');
            void api
              .exportar(q)
              .then(guardarArchivo)
              .catch((e: Error) => setError(e.message))
              .finally(() => setExportando(false));
          }}
        >
          Exportar CSV
        </Button>
      </div>
      <Card>
        <details data-tour="actas-filtros">
          <summary className="cursor-pointer font-semibold">Filtros de actas</summary>
          <FormGrid className="my-4">
            <TextField
              name="buscar"
              label="Buscar acta"
              hint="Código del acta o nombre del empleado, hasta 150 caracteres."
              maxLength={150}
              value={q.get('buscar') ?? ''}
              onValueChange={(v) => filtro('buscar', v)}
            />
            {!propio && !idEmpleado && (
              <>
                <SelectField
                  name="idDepartamento"
                  label="Departamento"
                  hint="Filtra el área del empleado; cambiarla limpia la selección de empleado."
                  value={q.get('idDepartamento') ?? ''}
                  onValueChange={(v) => filtro('idDepartamento', v)}
                  opciones={departamentos.data ?? []}
                  error={departamentos.error?.message}
                />
                <SelectorEmpleado
                  name="idEmpleado"
                  label="Empleado"
                  hint="Busca por nombre o código."
                  soloActivos={false}
                  departamentoId={q.get('idDepartamento') ?? ''}
                  value={q.get('idEmpleado') ?? ''}
                  onValueChange={(v) => filtro('idEmpleado', v)}
                />
              </>
            )}
            {!propio && (
              <SelectField
                name="idTipo"
                label="Tipo de acta"
                hint="Selecciona el tipo; sin selección se muestran todos."
                value={q.get('idTipo') ?? ''}
                onValueChange={(v) => filtro('idTipo', v)}
                opciones={tipoOpciones}
                error={reglas.error?.message}
              />
            )}
            <SelectField
              name="estado"
              label="Estado"
              hint="Emitida significa pendiente de firma."
              value={q.get('estado') ?? ''}
              onValueChange={(v) => filtro('estado', v)}
              opciones={opcionesEstado(
                propio ? estadosActa.filter((x) => x !== 'BORRADOR') : estadosActa,
              )}
            />
            <DateField
              name="desde"
              label="Desde"
              hint="Fecha del hecho inicial, incluida."
              value={q.get('desde') ?? ''}
              onValueChange={(v) => filtro('desde', v)}
            />
            <DateField
              name="hasta"
              label="Hasta"
              hint="Fecha del hecho final, incluida; igual o posterior a Desde."
              {...(q.get('desde') ? { min: q.get('desde')! } : {})}
              value={q.get('hasta') ?? ''}
              onValueChange={(v) => filtro('hasta', v)}
            />
          </FormGrid>
        </details>
        <div className="flex flex-wrap gap-2 my-3">
          {activos.map(([k, v]) => (
            <Button key={k} icono="cancelar" variante="texto" onClick={() => filtro(k, '')}>
              {etiquetas[k]}: {tituloValor(k, v)}
            </Button>
          ))}
          {activos.length > 0 && (
            <Button
              icono="cancelar"
              variante="secundario"
              onClick={() => {
                const n = new URLSearchParams(url);
                keys.forEach((k) => n.delete(k));
                setUrl(n);
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        <Table
          columnas={[
            {
              id: 'codigo',
              titulo: 'Código',
              ordenable: true,
              render: (r: api.FilaActa) => r.codigo,
            },
            {
              id: 'empleado',
              titulo: 'Empleado',
              ordenable: true,
              render: (r: api.FilaActa) => r.empleado,
            },
            { id: 'tipo', titulo: 'Tipo', ordenable: true, render: (r: api.FilaActa) => r.tipo },
            {
              id: 'fechaHecho',
              titulo: 'Hecho',
              ordenable: true,
              render: (r: api.FilaActa) => fechaVisible(r.fechaHecho),
            },
            {
              id: 'estado',
              titulo: 'Estado',
              ordenable: true,
              render: (r: api.FilaActa) => <EstadoBadge estado={r.estado} />,
            },
            {
              id: 'acciones',
              titulo: 'Acciones',
              render: (r: api.FilaActa) => (
                <Button
                  icono="ver"
                  variante="texto"
                  onClick={() => nav(`${propio ? '/mis-gestiones/actas' : '/actas'}/${r.id}`)}
                >
                  Consultar {r.codigo}
                </Button>
              ),
            },
          ]}
          filas={datos.error ? [] : (datos.data?.registros ?? [])}
          clave={(r) => r.id}
          total={datos.data?.total ?? 0}
          pagina={datos.data?.pagina ?? 1}
          limite={20}
          onPagina={(p) => filtro('pagina', String(p))}
          orden={{
            campo: q.get('ordenarPor') ?? 'fechaHecho',
            direccion: q.get('direccion') === 'asc' ? 'asc' : 'desc',
          }}
          onOrden={(campo) => {
            const n = new URLSearchParams(url);
            n.set('ordenarPor', campo);
            n.set(
              'direccion',
              q.get('ordenarPor') === campo && q.get('direccion') === 'asc' ? 'desc' : 'asc',
            );
            n.delete('pagina');
            setUrl(n);
          }}
          cargando={datos.isPending}
          {...(datos.error ? { error: datos.error.message } : {})}
          onReintentar={() => void datos.refetch()}
        />
        <p className="campo-hint mt-3">
          {propio
            ? 'Solo actas propias emitidas.'
            : 'Sin eliminación física. Abre el registro para emitir, imprimir y registrar su firma.'}
        </p>
      </Card>
    </section>
  );
}
