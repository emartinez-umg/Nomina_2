import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { definiciones, listar, detalle, restricciones, csv } from '../api/catalogos';
import type { Catalogo, Campo, Fila } from '../api/catalogos';
import { CatalogoFormulario, valorVisible, valorCampo } from './CatalogoFormulario';
import { CatalogoAccion } from './CatalogoAccion';
import { CampoEditor } from './CampoEditor';
import { FeriadosCalendario } from './FeriadosCalendario';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Table } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { TextField, NumberField, SelectField } from '../../../components/forms';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaCatalogo } from '../help/pasos';
import { useSession } from '../../../app/session';
import { useToast } from '../../../components/ui/Toast';
import { iconos } from '../../../components/ui/icons';
const anioActual = Number(
  new Intl.DateTimeFormat('en', { timeZone: 'America/Guatemala', year: 'numeric' }).format(
    new Date(),
  ),
);
export async function listarTodos(slug: string, q: Record<string, string>, signal?: AbortSignal) {
  const filas: Fila[] = [];
  let pagina = 1,
    total = 0;
  do {
    const r = await listar(slug, { ...q, pagina: String(pagina), limite: '100' }, signal);
    filas.push(...r.registros);
    total = r.total;
    pagina++;
    if (!r.registros.length) break;
  } while (filas.length < total);
  return filas;
}
export function CatalogosPage() {
  const { catalogo } = useParams();
  const q = useQuery({
    queryKey: ['catalogos', 'definiciones'],
    queryFn: ({ signal }) => definiciones(signal),
  });
  const cat = q.data?.find((c) => c.slug === catalogo);
  if (q.isPending) return <Skeleton lineas={6} />;
  if (q.error)
    return (
      <EmptyState
        titulo="No se pudieron cargar los catálogos"
        descripcion={q.error.message}
        accion={
          <Button icono="actualizar" onClick={() => void q.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  if (!catalogo) return <CatalogosInicio catalogos={q.data!} />;
  if (!cat)
    return (
      <EmptyState titulo="Catálogo no encontrado" descripcion="Selecciona un catálogo del menú." />
    );
  return <CatalogoPage key={cat.slug} cat={cat} catalogos={q.data!} />;
}
function CatalogosInicio({ catalogos }: { catalogos: Catalogo[] }) {
  const { usuario } = useSession();
  const ayuda = useMemo(
    () => ayudaCatalogo({ slug: 'inicio', titulo: 'Catálogos', campos: [], legal: false }, false),
    [],
  );
  usePageHelp(ayuda, usuario?.rol);
  return (
    <>
      <h1>Catálogos y parametrización</h1>
      <p className="my-4 text-secundario">
        Administra la organización, los calendarios y las reglas vigentes de nómina.
      </p>
      <nav data-tour="catalogo-menu" className="catalogos-inicio" aria-label="Catálogos">
        {catalogos.map((c) => (
          <Card key={c.slug}>
            <iconos.configuracion aria-hidden="true" className="mb-3 text-primario" />
            <h2>{c.titulo}</h2>
            <Link className="enlace-icono mt-4" to={`/catalogos/${c.slug}`}>
              <iconos.siguiente size={18} aria-hidden="true" />
              Abrir {c.titulo.toLowerCase()}
            </Link>
          </Card>
        ))}
      </nav>
    </>
  );
}
function filtrosCampos(cat: Catalogo): Campo[] {
  return cat.campos.flatMap((f) =>
    ['dinero', 'decimal', 'entero', 'fecha'].includes(f.tipo)
      ? ['Min', 'Max'].map((sufijo) => ({
          ...f,
          nombre: f.nombre + sufijo,
          etiqueta: `${f.etiqueta} ${sufijo === 'Min' ? 'desde' : 'hasta'}`,
          requerido: false,
        }))
      : [
          {
            ...f,
            nombre: f.nombre === 'direccion' ? 'direccionTexto' : f.nombre,
            requerido: false,
          },
        ],
  );
}
function CatalogoPage({ cat, catalogos }: { cat: Catalogo; catalogos: Catalogo[] }) {
  const { usuario } = useSession();
  const toast = useToast();
  const inicial = { activo: '1', ...(cat.slug === 'feriados' ? { anio: String(anioActual) } : {}) };
  const [borrador, setBorrador] = useState<Record<string, string>>(inicial);
  const [filtros, setFiltros] = useState<Record<string, string>>(inicial);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState('20');
  const [orden, setOrden] = useState({
    campo: cat.campos[0]!.nombre,
    direccion: 'asc' as 'asc' | 'desc',
  });
  const [expandido, setExpandido] = useState(false);
  const [formulario, setFormulario] = useState(false);
  const [actual, setActual] = useState<Fila>();
  const [ver, setVer] = useState<Fila>();
  const [accion, setAccion] = useState<{ fila: Fila; tipo: 'eliminar' | 'estado' }>();
  const [ocupado, setOcupado] = useState(false);
  const [exportando, setExportando] = useState(false);
  const ayuda = useMemo(() => ayudaCatalogo(cat, formulario), [cat, formulario]);
  usePageHelp(ayuda, usuario?.rol);
  const params = {
    ...filtros,
    pagina: String(pagina),
    limite,
    ordenarPor: orden.campo,
    direccion: orden.direccion,
  };
  const q = useQuery({
    queryKey: ['catalogos', 'lista', cat.slug, params],
    queryFn: ({ signal }) => listar(cat.slug, params, signal),
  });
  const reglas = useQuery({
    queryKey: ['catalogos', 'restricciones'],
    queryFn: ({ signal }) => restricciones(signal),
    enabled: cat.legal,
  });
  const calendario = useQuery({
    queryKey: ['catalogos', 'calendario', filtros],
    queryFn: ({ signal }) =>
      listarTodos(cat.slug, { ...filtros, ordenarPor: 'fecha', direccion: 'asc' }, signal),
    enabled: cat.slug === 'feriados',
  });
  const camposFiltro = filtrosCampos(cat);
  const actualizar = (campo: string, v: string) => setBorrador((d) => ({ ...d, [campo]: v }));
  const abrir = async (fila: Fila, editar: boolean) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const datos = await detalle(cat.slug, fila.id);
      if (editar) {
        setActual(datos);
        setFormulario(true);
      } else setVer(datos);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo abrir el registro.', 'peligro');
    } finally {
      setOcupado(false);
    }
  };
  const exportar = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const filas = await listarTodos(cat.slug, params);
      const url = URL.createObjectURL(
        new Blob([csv(cat, filas)], { type: 'text/csv;charset=utf-8;' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cat.slug}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`${filas.length} registros exportados.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo exportar.', 'peligro');
    } finally {
      setExportando(false);
    }
  };
  const permitidoCrear = !cat.legal || (reglas.isSuccess && !reglas.isFetching);
  return (
    <>
      <h1>{cat.titulo}</h1>
      <p className="my-3 text-sm text-secundario">Catálogos y parametrización / {cat.titulo}</p>
      <nav className="catalogo-menu" aria-label="Cambiar catálogo" data-tour="catalogo-menu">
        {catalogos.map((c) => (
          <Link
            key={c.slug}
            aria-current={c.slug === cat.slug ? 'page' : undefined}
            to={`/catalogos/${c.slug}`}
          >
            <iconos.configuracion size={16} aria-hidden="true" />
            {c.titulo}
          </Link>
        ))}
      </nav>
      <Card className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>Listado de {cat.titulo.toLowerCase()}</h2>
            <p className="text-sm text-secundario">
              Gestiona registros reales; los cambios quedan auditados.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              data-tour="catalogo-exportar"
              icono="exportar"
              variante="secundario"
              cargando={exportando}
              disabled={q.isPending || !!q.error}
              onClick={() => void exportar()}
            >
              Exportar CSV
            </Button>
            <Button
              data-tour="catalogo-nuevo"
              icono="crear"
              disabled={!permitidoCrear}
              motivoDeshabilitado={
                !permitidoCrear ? 'Espera a que se validen los periodos cerrados.' : undefined
              }
              onClick={() => {
                setActual(undefined);
                setFormulario(true);
              }}
            >
              Crear registro
            </Button>
          </div>
        </div>
        {reglas.error && (
          <div role="alert" className="resumen-error">
            {reglas.error.message}
            <Button icono="actualizar" variante="texto" onClick={() => void reglas.refetch()}>
              Reintentar restricciones
            </Button>
          </div>
        )}
        <form
          data-tour="catalogo-busqueda"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const limpios = Object.fromEntries(
              Object.entries(borrador)
                .filter(([, v]) => v !== '')
                .map(([key, v]) => [
                  key,
                  camposFiltro.some(
                    (f) => f.nombre === key && ['dinero', 'decimal'].includes(f.tipo),
                  )
                    ? v.replace(/,/g, '')
                    : v,
                ]),
            );
            setFiltros(limpios);
            setPagina(1);
          }}
        >
          <div className="form-grid">
            <TextField
              name="buscar"
              label="Buscar"
              hint="Busca por código, nombre o contenido del catálogo."
              value={borrador.buscar ?? ''}
              onValueChange={(v) => actualizar('buscar', v)}
              placeholder="Escribe para buscar…"
              maxLength={150}
            />
            <div className="col-span-12 flex flex-wrap items-center gap-2 md:col-span-6">
              <Button type="submit" icono="buscar">
                Aplicar búsqueda y filtros
              </Button>
              <Button
                icono="filtrar"
                variante="secundario"
                aria-expanded={expandido}
                onClick={() => setExpandido((v) => !v)}
              >
                Filtros
              </Button>
              <Button
                icono="cancelar"
                variante="texto"
                onClick={() => {
                  setBorrador(cat.slug === 'feriados' ? { anio: String(anioActual) } : {});
                  setFiltros(cat.slug === 'feriados' ? { anio: String(anioActual) } : {});
                  setPagina(1);
                }}
              >
                Limpiar filtros
              </Button>
            </div>
          </div>
          {expandido && (
            <div className="form-grid mt-5">
              <SelectField
                name="activo"
                label="Estado"
                hint="Consulta activos, inactivos o ambos."
                value={borrador.activo ?? ''}
                onValueChange={(v) => actualizar('activo', v)}
                opciones={[
                  { value: '', label: 'Todos' },
                  { value: '1', label: 'Activo' },
                  { value: '0', label: 'Inactivo' },
                ]}
              />
              {cat.slug === 'feriados' && (
                <NumberField
                  name="anio"
                  label="Año del calendario"
                  hint="Año de la fecha efectiva. Ejemplo: 2026."
                  value={borrador.anio ?? ''}
                  onValueChange={(v) => actualizar('anio', v)}
                  min="1900"
                  max="9999"
                />
              )}
              {camposFiltro.map((f) => (
                <CampoEditor
                  key={f.nombre}
                  campo={f}
                  name={f.nombre}
                  label={f.etiqueta}
                  hint={`Filtro: ${f.hint}`}
                  value={borrador[f.nombre] ?? ''}
                  onValueChange={(v) => actualizar(f.nombre, v)}
                  {...(f.tipo === 'opcion' || f.tipo === 'booleano' ? {} : {})}
                />
              ))}
              {cat.slug === 'horarios' && (
                <>
                  <SelectField
                    name="diaSemana"
                    label="Día de semana"
                    hint="Combina el día con los filtros de distribución semanal."
                    value={borrador.diaSemana ?? ''}
                    onValueChange={(v) => actualizar('diaSemana', v)}
                    opciones={[
                      'Lunes',
                      'Martes',
                      'Miércoles',
                      'Jueves',
                      'Viernes',
                      'Sábado',
                      'Domingo',
                    ].map((label, i) => ({ value: String(i + 1), label }))}
                  />
                  <SelectField
                    name="laborable"
                    label="Tipo de día"
                    hint="Sin filtro se buscan días laborables."
                    value={borrador.laborable ?? ''}
                    onValueChange={(v) => actualizar('laborable', v)}
                    opciones={[
                      { value: '', label: 'Laborable (predeterminado)' },
                      { value: '1', label: 'Laborable' },
                      { value: '0', label: 'Descanso' },
                    ]}
                  />
                  <SelectField
                    name="cruzaMedianoche"
                    label="Cruza medianoche"
                    hint="Busca turnos con salida al día siguiente."
                    value={borrador.cruzaMedianoche ?? ''}
                    onValueChange={(v) => actualizar('cruzaMedianoche', v)}
                    opciones={[
                      { value: '', label: 'Todos' },
                      { value: '1', label: 'Sí' },
                      { value: '0', label: 'No' },
                    ]}
                  />
                  {[
                    { nombre: 'entradaMin', etiqueta: 'Entrada desde (minutos)' },
                    { nombre: 'entradaMax', etiqueta: 'Entrada hasta (minutos)' },
                    { nombre: 'salidaMin', etiqueta: 'Salida desde (minutos)' },
                    { nombre: 'descansoMin', etiqueta: 'Descanso desde (minutos)' },
                    { nombre: 'descansoMax', etiqueta: 'Descanso hasta (minutos)' },
                    { nombre: 'salidaMax', etiqueta: 'Salida hasta (minutos)' },
                    { nombre: 'horasMin', etiqueta: 'Horas diarias desde' },
                    { nombre: 'horasMax', etiqueta: 'Horas diarias hasta' },
                  ].map((f) => (
                    <NumberField
                      key={f.nombre}
                      name={f.nombre}
                      label={f.etiqueta}
                      hint="Todos los filtros diarios deben coincidir en el mismo día laborable."
                      value={borrador[f.nombre] ?? ''}
                      onValueChange={(v) => actualizar(f.nombre, v)}
                      decimales={f.nombre.startsWith('horas') ? 2 : 0}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </form>
        <div role="group" className="my-4 flex flex-wrap gap-2" aria-label="Filtros activos">
          {Object.entries(filtros).map(([key, v]) => (
            <Button
              key={key}
              icono="cancelar"
              variante="secundario"
              aria-label={`Quitar filtro ${key}`}
              onClick={() => {
                setFiltros((d) => {
                  const n = { ...d };
                  delete n[key];
                  return n;
                });
                setBorrador((d) => {
                  const n = { ...d };
                  delete n[key];
                  return n;
                });
                setPagina(1);
              }}
            >
              {key === 'activo'
                ? 'Estado'
                : key === 'buscar'
                  ? 'Buscar'
                  : key === 'anio'
                    ? 'Año'
                    : (camposFiltro.find((f) => f.nombre === key)?.etiqueta ?? key)}
              : {key === 'activo' ? (v === '1' ? 'Activo' : 'Inactivo') : v}
            </Button>
          ))}
        </div>
        <div data-tour="catalogo-tabla">
          <Table
            titulo={cat.titulo}
            filas={q.data?.registros ?? []}
            total={q.data?.total ?? 0}
            pagina={pagina}
            limite={Number(limite)}
            orden={orden}
            clave={(f) => f.id}
            onPagina={setPagina}
            onOrden={(campo, direccion) => {
              setOrden({ campo, direccion });
              setPagina(1);
            }}
            cargando={q.isPending || q.isFetching}
            {...(q.error ? { error: q.error.message } : {})}
            onReintentar={() => void q.refetch()}
            columnas={[
              ...cat.campos
                .filter((f) => f.tipo !== 'area')
                .map((f) => ({
                  id: f.nombre,
                  titulo: f.etiqueta,
                  ordenable: true,
                  render: (fila: Fila) =>
                    f.tipo === 'referencia'
                      ? String(fila[f.nombre + 'Etiqueta'] ?? 'Sin asignar')
                      : f.tipo === 'dinero' && fila[f.nombre] != null
                        ? valorCampo(f, fila[f.nombre])
                        : valorVisible(fila[f.nombre]),
                })),
              {
                id: 'activo',
                titulo: 'Estado',
                ordenable: true,
                render: (fila: Fila) => (
                  <Badge tono={fila.activo ? 'correcto' : 'aviso'}>
                    {fila.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                ),
              },
              {
                id: 'acciones',
                titulo: 'Acciones',
                render: (fila: Fila) => (
                  <div className="flex gap-1">
                    <Button
                      icono="ver"
                      variante="texto"
                      soloIcono
                      aria-label={`Ver registro ${fila.id}`}
                      disabled={ocupado}
                      onClick={() => void abrir(fila, false)}
                    />
                    <Button
                      icono="editar"
                      variante="texto"
                      soloIcono
                      aria-label={`Editar registro ${fila.id}`}
                      disabled={ocupado || !permitidoCrear}
                      onClick={() => void abrir(fila, true)}
                    />
                    <Button
                      icono={fila.activo ? 'rechazar' : 'aprobar'}
                      variante="texto"
                      soloIcono
                      aria-label={`${fila.activo ? 'Desactivar' : 'Activar'} registro ${fila.id}`}
                      onClick={() => setAccion({ fila, tipo: 'estado' })}
                    />
                    <Button
                      icono="eliminar"
                      variante="texto"
                      soloIcono
                      aria-label={`Eliminar registro ${fila.id}`}
                      disabled={fila.enUso}
                      motivoDeshabilitado={
                        fila.enUso ? 'El registro está en uso. Puedes desactivarlo.' : undefined
                      }
                      onClick={() => setAccion({ fila, tipo: 'eliminar' })}
                    />
                  </div>
                ),
              },
            ]}
          />
        </div>
        <div className="mt-4 max-w-xs">
          <SelectField
            name="limite"
            label="Registros por página"
            hint="La paginación se ejecuta en el servidor."
            value={limite}
            onValueChange={(v) => {
              setLimite(v);
              setPagina(1);
            }}
            opciones={['10', '20', '50', '100'].map((v) => ({ value: v, label: v }))}
          />
        </div>
        {q.data?.total === 0 && (
          <Button
            icono="crear"
            variante="texto"
            disabled={!permitidoCrear}
            onClick={() => {
              setActual(undefined);
              setFormulario(true);
            }}
          >
            Crear el primer registro o revisar los filtros
          </Button>
        )}
      </Card>
      {cat.slug === 'feriados' &&
        (calendario.isPending ? (
          <Skeleton lineas={4} />
        ) : calendario.error ? (
          <EmptyState
            titulo="No se pudo cargar el calendario"
            descripcion={calendario.error.message}
            accion={
              <Button icono="actualizar" onClick={() => void calendario.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : (
          <FeriadosCalendario
            filas={calendario.data ?? []}
            anio={Number(filtros.anio ?? anioActual)}
            onVer={(f) => void abrir(f, false)}
          />
        ))}
      {formulario && (
        <CatalogoFormulario
          cat={cat}
          actual={actual}
          cierre={reglas.data?.ultimoCierre ?? null}
          onCerrar={() => setFormulario(false)}
        />
      )}
      {accion && (
        <CatalogoAccion
          cat={cat}
          fila={accion.fila}
          tipo={accion.tipo}
          onCerrar={() => setAccion(undefined)}
        />
      )}
      <Modal abierto={!!ver} titulo={`Detalle · ${cat.titulo}`} onCerrar={() => setVer(undefined)}>
        {ver && (
          <div className="catalogo-detalle">
            <dl className="mt-5">
              {cat.campos.map((f) => (
                <div className="mb-4" key={f.nombre}>
                  <dt className="font-bold">{f.etiqueta}</dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {valorCampo(f, ver[f.nombre + 'Etiqueta'] ?? ver[f.nombre])}
                  </dd>
                </div>
              ))}
            </dl>
            {Array.isArray(ver.dias) && (
              <div className="table-scroll">
                <table>
                  <caption>Distribución semanal</caption>
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Entrada</th>
                      <th>Salida</th>
                      <th>Descanso (min)</th>
                      <th>Cruza medianoche</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ver.dias.map((d) => (
                      <tr key={d.diaSemana}>
                        <td>
                          {
                            [
                              'Lunes',
                              'Martes',
                              'Miércoles',
                              'Jueves',
                              'Viernes',
                              'Sábado',
                              'Domingo',
                            ][d.diaSemana - 1]
                          }
                        </td>
                        <td>{d.laborable ? d.entrada : 'Descanso'}</td>
                        <td>{d.salida}</td>
                        <td>{d.minutosDescanso}</td>
                        <td>{d.cruzaMedianoche ? 'Sí' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="my-4">
              {ver.enUso
                ? 'Tiene referencias; puedes desactivarlo para impedir nuevas asignaciones.'
                : 'Sin referencias.'}
            </p>
            <Button icono="cancelar" onClick={() => setVer(undefined)}>
              Cerrar detalle
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
