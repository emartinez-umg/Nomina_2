import { useDraftValues } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useMemo, useState } from 'react';
import { useLocation, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import { useSession } from '../../../app/session';
import { usePageHelp, HelpButton } from '../../../components/help/HelpProvider';
import { ayudaComunicacion } from '../help/pasos';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Table } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Modal, ConfirmModal } from '../../../components/ui/Modal';
import { TextField, DateField, SelectField, TextAreaField } from '../../../components/forms';
import { useToast } from '../../../components/ui/Toast';
import { descargar } from '../../empleados/api/empleados';
import { ComunicacionFormulario, GrupoField } from './ComunicacionFormulario';
import * as api from '../api/comunicacion';
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function ComunicacionPage() {
  const { tipo: tipoParam } = useParams(),
    location = useLocation(),
    nav = useNavigate(),
    { usuario } = useSession();
  const tipo: api.Tipo =
      tipoParam === 'eventos' || location.pathname.endsWith('/eventos') ? 'eventos' : 'anuncios',
    empleado = usuario?.rol === 'EMPLEADO';
  const ayuda = useMemo(() => ({ ...ayudaComunicacion, id: `comunicacion-${tipo}` }), [tipo]);
  usePageHelp(ayuda, usuario?.rol);
  const [params, setParams] = useSearchParams(),
    [form, setForm] = useState<{ id?: number; dia?: string }>(),
    [borrar, setBorrar] = useState<api.Fila>(),
    [confirmar, setConfirmar] = useState(false),
    [filtros, setFiltros] = useState(false);
  const { campo, draft } = useDraftValues(
    `comunicacion-${tipo}-eliminar`,
    borrar?.id,
    { motivo: '' },
    !!borrar,
  );
  const [motivo, setMotivo] = campo('motivo');
  const cambiar = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k !== 'pagina') p.delete('pagina');
    setParams(p);
  };
  const q = Object.fromEntries(
    [
      'buscar',
      'desde',
      'hasta',
      'activo',
      'paraTodos',
      'grupo',
      'idGrupo',
      'pagina',
      'ordenarPor',
      'direccion',
    ].map((k) => [k, params.get(k) ?? '']),
  );
  const consulta = useQuery({
      queryKey: ['comunicacion', tipo, q],
      queryFn: ({ signal }) => api.listar(tipo, q, signal),
    }),
    cache = useQueryClient(),
    toast = useToast();
  const csv = useMutation({
    mutationFn: () => api.exportar(tipo, q),
    onSuccess: (s) => descargar(s, `${tipo}.csv`),
    onError: (e) => toast(e.message, 'peligro'),
  });
  const eliminar = useMutation({
    mutationFn: () =>
      api.eliminar(tipo, borrar!.id, { version: borrar!.version, motivo, confirmado: true }),
    onSuccess: () => {
      draft.limpiar();
      void cache.invalidateQueries({ queryKey: ['comunicacion'] });
      void cache.invalidateQueries({ queryKey: ['tablero'] });
      void cache.invalidateQueries({ queryKey: ['notificaciones'] });
      setConfirmar(false);
      setBorrar(undefined);
      toast('Publicación eliminada.', 'correcto');
    },
    onError: (e) => toast(e.message, 'peligro'),
  });
  const ver = Number(params.get('ver')) || undefined;
  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1>{tipo === 'anuncios' ? 'Anuncios' : 'Eventos y calendario'}</h1>
        {!empleado && (
          <Button icono="crear" onClick={() => setForm({})}>
            Crear {tipo === 'anuncios' ? 'anuncio' : 'evento'}
          </Button>
        )}
      </div>
      <p className="text-secundario mb-5">
        {empleado
          ? 'Publicaciones vigentes y actividades dirigidas a ti.'
          : 'Publica para todos o para grupos de la organización; se notificará a los empleados destinatarios.'}
      </p>
      <div className="flex gap-3 mb-5">
        <Button
          icono="notificaciones"
          variante={tipo === 'anuncios' ? 'primario' : 'secundario'}
          onClick={() => nav(`${empleado ? '/mis-gestiones' : '/comunicacion'}/anuncios`)}
        >
          Anuncios
        </Button>
        <Button
          icono="calendario"
          variante={tipo === 'eventos' ? 'primario' : 'secundario'}
          onClick={() => nav(`${empleado ? '/mis-gestiones' : '/comunicacion'}/eventos`)}
        >
          Eventos
        </Button>
      </div>
      {tipo === 'eventos' && (
        <Agenda
          empleado={empleado}
          onCrear={(dia) => setForm({ dia })}
          onVer={(id) => cambiar('ver', String(id))}
        />
      )}
      <Card className="mb-5" data-tour="comunicacion-filtros">
        <div className="flex flex-wrap gap-3">
          <Button
            icono="filtrar"
            variante="secundario"
            aria-expanded={filtros}
            onClick={() => setFiltros((v) => !v)}
          >
            Filtros
          </Button>
          <Button icono="cancelar" variante="texto" onClick={() => setParams({})}>
            Limpiar filtros
          </Button>
          <Button
            icono="exportar"
            variante="secundario"
            cargando={csv.isPending}
            onClick={() => csv.mutate()}
          >
            Exportar CSV
          </Button>
        </div>
        {filtros && (
          <div className="form-grid mt-4">
            <TextField
              name="buscar"
              label="Buscar título o código"
              hint="Busca parte del título."
              placeholder="Título de la publicación"
              value={q.buscar!}
              onValueChange={(v) => cambiar('buscar', v)}
              maxLength={200}
            />
            <DateField
              name="desde"
              label="Desde"
              hint="Incluye publicaciones que terminen desde esta fecha."
              value={q.desde!}
              onValueChange={(v) => cambiar('desde', v)}
            />
            <DateField
              name="hasta"
              label="Hasta"
              hint="Incluye publicaciones que inicien hasta esta fecha."
              {...(q.desde ? { min: q.desde } : {})}
              value={q.hasta!}
              onValueChange={(v) => cambiar('hasta', v)}
            />
            {!empleado && (
              <>
                <SelectField
                  name="activo"
                  label="Estado"
                  hint="Consulta publicaciones vigentes o eliminadas."
                  value={q.activo!}
                  onValueChange={(v) => cambiar('activo', v)}
                  opciones={[
                    { value: '', label: 'Todos' },
                    { value: '1', label: 'Activo' },
                    { value: '0', label: 'Eliminado' },
                  ]}
                />
                <SelectField
                  name="paraTodos"
                  label="Alcance"
                  hint="Filtra por todos o por grupos."
                  value={q.paraTodos!}
                  onValueChange={(v) => cambiar('paraTodos', v)}
                  opciones={[
                    { value: '', label: 'Cualquier alcance' },
                    { value: '1', label: 'Todos' },
                    { value: '0', label: 'Grupos' },
                  ]}
                />
                <SelectField
                  name="grupo"
                  label="Tipo de grupo"
                  hint="Combina el tipo con un grupo concreto."
                  value={params.get('tipoGrupo') ?? ''}
                  onValueChange={(v) => {
                    const p = new URLSearchParams(params);
                    p.set('tipoGrupo', v);
                    p.delete('grupo');
                    p.delete('idGrupo');
                    setParams(p);
                  }}
                  opciones={[
                    { value: '', label: 'Sin grupo' },
                    { value: 'DEPARTAMENTO', label: 'Departamento' },
                    { value: 'PUESTO', label: 'Puesto' },
                    { value: 'JEFATURA', label: 'Jefatura' },
                  ]}
                />
                {params.get('tipoGrupo') && (
                  <GrupoField
                    tipo={
                      params.get('tipoGrupo') === 'DEPARTAMENTO'
                        ? 'departamentos'
                        : params.get('tipoGrupo') === 'PUESTO'
                          ? 'puestos'
                          : 'jefaturas'
                    }
                    name="idGrupo"
                    label="Grupo"
                    hint="Selecciona el destinatario a filtrar."
                    value={q.idGrupo!}
                    onValueChange={(v) => {
                      const p = new URLSearchParams(params);
                      p.set('grupo', p.get('tipoGrupo')!);
                      p.set('idGrupo', v);
                      p.delete('pagina');
                      setParams(p);
                    }}
                  />
                )}
              </>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(q)
            .filter(([k, v]) => v && !['pagina', 'ordenarPor', 'direccion'].includes(k))
            .map(([k, v]) => (
              <Button
                key={k}
                icono="cancelar"
                variante="texto"
                onClick={() => {
                  if (k === 'grupo' || k === 'idGrupo') {
                    const p = new URLSearchParams(params);
                    p.delete('grupo');
                    p.delete('idGrupo');
                    p.delete('pagina');
                    setParams(p);
                  } else cambiar(k, '');
                }}
              >
                {k}: {v}
              </Button>
            ))}
        </div>
      </Card>
      <Card data-tour="comunicacion-listado">
        <Table
          titulo={tipo === 'anuncios' ? 'Listado de anuncios' : 'Listado de eventos'}
          filas={consulta.data?.registros ?? []}
          clave={(f) => f.id}
          pagina={consulta.data?.pagina ?? 1}
          limite={consulta.data?.limite ?? 20}
          total={consulta.data?.total ?? 0}
          orden={{
            campo: q.ordenarPor || 'inicio',
            direccion: q.direccion === 'asc' ? 'asc' : 'desc',
          }}
          onPagina={(p) => cambiar('pagina', String(p))}
          onOrden={(k, v) => {
            const p = new URLSearchParams(params);
            p.set('ordenarPor', k);
            p.set('direccion', v);
            p.delete('pagina');
            setParams(p);
          }}
          cargando={consulta.isPending}
          {...(consulta.error ? { error: consulta.error.message } : {})}
          onReintentar={() => void consulta.refetch()}
          columnas={[
            { id: 'codigo', titulo: 'Código', ordenable: true, render: (f) => f.codigo },
            {
              id: 'titulo',
              titulo: 'Título',
              ordenable: true,
              render: (f) => <strong>{f.titulo}</strong>,
            },
            {
              id: 'inicio',
              titulo: tipo === 'anuncios' ? 'Vigencia desde' : 'Inicio',
              ordenable: true,
              render: (f) => api.fechaHora(f.inicio),
            },
            { id: 'fin', titulo: 'Fin', ordenable: true, render: (f) => api.fechaHora(f.fin) },
            { id: 'alcance', titulo: 'Alcance', render: (f) => (f.paraTodos ? 'Todos' : 'Grupos') },
            {
              id: 'estado',
              titulo: 'Estado',
              render: (f) => (
                <Badge tono={f.activo ? 'correcto' : 'peligro'}>
                  {f.activo ? 'Activo' : 'Eliminado'}
                </Badge>
              ),
            },
            {
              id: 'acciones',
              titulo: 'Acciones',
              render: (f) => (
                <div className="flex gap-2">
                  <Button icono="ver" variante="texto" onClick={() => cambiar('ver', String(f.id))}>
                    Ver
                  </Button>
                  {!empleado && (
                    <>
                      <Button
                        icono="editar"
                        variante="texto"
                        disabled={
                          !f.activo || (tipo === 'eventos' && f.inicio <= api.horaGuatemala())
                        }
                        motivoDeshabilitado="Solo se editan publicaciones activas y eventos futuros."
                        onClick={() => setForm({ id: f.id })}
                      >
                        Editar
                      </Button>
                      <Button
                        icono="eliminar"
                        variante="texto"
                        disabled={!f.activo}
                        onClick={() => {
                          setBorrar(f);
                          setMotivo('');
                        }}
                      >
                        Eliminar
                      </Button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {form && (
        <ComunicacionFormulario
          key={`${tipo}:${form.id ?? 'nuevo'}`}
          tipo={tipo}
          {...form}
          onCerrar={() => setForm(undefined)}
        />
      )}
      {ver && <Detalle tipo={tipo} id={ver} onCerrar={() => cambiar('ver', '')} />}
      <Modal
        abierto={!!borrar}
        titulo="Eliminar publicación"
        onCerrar={() => {
          if (!eliminar.isPending) setBorrar(undefined);
        }}
      >
        <FormDraftNotice draft={draft} />
        <p className="my-4">
          Se retirará «{borrar?.titulo}» del portal y de la campana. Se conservará su auditoría.
        </p>
        <TextAreaField
          name="motivo"
          label="Motivo"
          hint="Explica la eliminación, entre 10 y 500 caracteres."
          value={motivo}
          onValueChange={setMotivo}
          required
          maxLength={500}
        />
        <Button
          icono="eliminar"
          disabled={motivo.trim().length < 10 || eliminar.isPending}
          onClick={() => setConfirmar(true)}
        >
          Revisar eliminación
        </Button>
      </Modal>
      <ConfirmModal
        abierto={confirmar}
        titulo="Confirmar eliminación"
        descripcion={`Eliminar ${borrar?.titulo}. Motivo: ${motivo}`}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => eliminar.mutate()}
        cargando={eliminar.isPending}
      />
    </>
  );
}
function Detalle({ tipo, id, onCerrar }: { tipo: api.Tipo; id: number; onCerrar: () => void }) {
  const q = useQuery({
    queryKey: ['comunicacion', tipo, id],
    queryFn: ({ signal }) => api.detalle(tipo, id, signal),
  });
  return (
    <Modal abierto titulo="Publicación" onCerrar={onCerrar}>
      <HelpButton />
      {q.isPending ? (
        <Skeleton />
      ) : q.error ? (
        <p role="alert">{q.error.message}</p>
      ) : (
        q.data && (
          <article data-tour="comunicacion-detalle" className="my-5">
            <h2>{q.data.titulo}</h2>
            <p className="text-secundario my-4">
              {api.fechaHora(q.data.inicio)} – {api.fechaHora(q.data.fin)}
              {tipo === 'eventos' && ` · ${q.data.lugar}`}
            </p>
            <p className="texto-publicacion">{q.data.contenido}</p>
            {q.data.destinatarios.length > 0 && (
              <p className="campo-hint mt-4">
                Destinatarios:{' '}
                {q.data.destinatarios.map((d) => `${d.tipo}: ${d.nombre}`).join(' · ')}
              </p>
            )}
          </article>
        )
      )}
    </Modal>
  );
}
function Agenda({
  empleado,
  onCrear,
  onVer,
}: {
  empleado: boolean;
  onCrear: (s: string) => void;
  onVer: (id: number) => void;
}) {
  const hoy = api.horaGuatemala().slice(0, 10),
    [mes, setMes] = useState(new Date(`${hoy}T12:00:00`)),
    [dia, setDia] = useState(hoy);
  const desde = iso(new Date(mes.getFullYear(), mes.getMonth(), 1, 12)),
    hasta = iso(new Date(mes.getFullYear(), mes.getMonth() + 1, 0, 12));
  const q = useQuery({
    queryKey: ['comunicacion', 'agenda', desde, hasta],
    queryFn: async ({ signal }) => {
      const filtros = {
        desde,
        hasta,
        limite: '100',
        activo: '1',
        direccion: 'asc',
        ordenarPor: 'inicio',
      };
      const primera = await api.listar('eventos', filtros, signal);
      if (primera.total > 2000)
        throw new Error(
          'Hay más de 2,000 eventos en el mes. Usa el listado con filtros para consultarlos.',
        );
      const filas = [...primera.registros];
      for (let pagina = 2; filas.length < primera.total; pagina++)
        filas.push(
          ...(await api.listar('eventos', { ...filtros, pagina: String(pagina) }, signal))
            .registros,
        );
      return filas;
    },
  });
  const delDia =
    q.data?.filter((e) => e.inicio.slice(0, 10) <= dia && e.fin.slice(0, 10) >= dia) ?? [];
  return (
    <Card className="mb-6" data-tour="calendario-eventos">
      <div className="agenda-grid">
        <div>
          <h2>Calendario de eventos</h2>
          <DayPicker
            mode="single"
            locale={es}
            month={mes}
            onMonthChange={setMes}
            selected={new Date(`${dia}T12:00:00`)}
            onSelect={(d) => {
              if (d) setDia(iso(d));
            }}
            modifiers={{
              evento: (d) =>
                !!q.data?.some(
                  (e) => e.inicio.slice(0, 10) <= iso(d) && e.fin.slice(0, 10) >= iso(d),
                ),
            }}
            modifiersClassNames={{ evento: 'dia-feriado' }}
          />
          <p className="campo-hint">
            Los días marcados tienen eventos. Selecciona uno para ver la agenda.
          </p>
        </div>
        <div>
          <h3>Agenda del {api.fechaHora(dia)}</h3>
          {q.isPending ? (
            <Skeleton />
          ) : q.error ? (
            <EmptyState
              titulo="No se pudo cargar la agenda"
              descripcion={q.error.message}
              accion={
                <Button icono="actualizar" onClick={() => void q.refetch()}>
                  Reintentar
                </Button>
              }
            />
          ) : delDia.length ? (
            delDia.map((e) => (
              <article key={e.id} className="comunicacion-resumen">
                <strong>{e.titulo}</strong>
                <p>
                  {api.fechaHora(e.inicio)} – {api.fechaHora(e.fin)}
                </p>
                <p>{e.lugar}</p>
                <Button icono="ver" variante="texto" onClick={() => onVer(e.id)}>
                  Ver evento
                </Button>
              </article>
            ))
          ) : (
            <p className="my-5 text-secundario">Sin eventos para este día.</p>
          )}
          {!empleado && (
            <Button
              icono="crear"
              disabled={dia < hoy}
              motivoDeshabilitado="Los eventos nuevos deben comenzar en el futuro."
              onClick={() => onCrear(dia)}
            >
              Crear evento en esta fecha
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
