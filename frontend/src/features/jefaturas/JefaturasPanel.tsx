import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { solicitar } from '../../lib/http';
import { listar as listarEmpleados } from '../empleados/api/empleados';
import { listarTodos } from '../catalogos/api/listarTodos';
import { Referencia } from '../catalogos/pages/CampoEditor';
import { SelectField, TextField, TextAreaField, FormErrorSummary } from '../../components/forms';
import { FormGrid } from '../../components/forms/FormGrid';
import { useFormDraft } from '../../hooks/useFormDraft';
import { FormDraftNotice } from '../../components/forms/FormDraftNotice';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal, ConfirmModal } from '../../components/ui/Modal';
import { Table } from '../../components/ui/Table';
export const resumenJefaturas = (signal?: AbortSignal) =>
  solicitar(
    '/catalogos/jefaturas/resumen',
    z.object({ total: z.number(), sinJefatura: z.number(), sinJefe: z.number() }),
    { signal },
  );
export function JefaturasPanel({ crear, asignar }: { crear: () => void; asignar: () => void }) {
  const q = useQuery({
    queryKey: ['catalogos', 'jefaturas', 'resumen'],
    queryFn: ({ signal }) => resumenJefaturas(signal),
  });
  if (q.error)
    return (
      <p role="alert">
        {q.error.message}
        <Button icono="actualizar" onClick={() => void q.refetch()}>
          Reintentar alertas
        </Button>
      </p>
    );
  if (!q.data) return <p role="status">Consultando jefaturas…</p>;
  return (
    <Card className="my-4" data-tour="jefaturas-configurar">
      <h2>{q.data.total === 0 ? 'Configurar jefaturas' : 'Organización del equipo'}</h2>
      <p className="my-3">
        {q.data.sinJefatura} empleado(s) sin jefatura activa · {q.data.sinJefe} jefatura(s) sin jefe
        activo.
      </p>
      {q.data.total === 0 && (
        <ol className="my-4 list-inside list-decimal">
          <li>Crea una jefatura con nombre y departamento. Su código se asigna automáticamente.</li>
          <li>
            Elige al jefe activo y, si corresponde, una jefatura superior. Puedes completar el
            responsable después.
          </li>
          <li>
            Selecciona empleados y asígnalos en bloque. Revisa su jefe inmediato en las fichas.
          </li>
        </ol>
      )}
      <div className="flex flex-wrap gap-3">
        {q.data.total === 0 && (
          <Button icono="crear" onClick={crear}>
            Configurar jefaturas
          </Button>
        )}
        <Button
          icono="empleados"
          data-tour="jefaturas-asignar"
          disabled={!q.data.total}
          motivoDeshabilitado={!q.data.total ? 'Crea primero una jefatura.' : undefined}
          onClick={asignar}
        >
          Asignar empleados
        </Button>
      </div>
    </Card>
  );
}
const campoDepartamento = {
  nombre: 'idDepartamento',
  etiqueta: 'Departamento',
  tipo: 'referencia' as const,
  referencia: 'departamentos' as const,
  hint: 'Filtra empleados por departamento.',
};
export function AsignarJefatura({
  cerrar,
  inicial = '',
}: {
  cerrar: () => void;
  inicial?: string;
}) {
  const toast = useToast(),
    cliente = useQueryClient();
  const [pagina, setPagina] = useState(1),
    [confirmar, setConfirmar] = useState(false),
    [ocupado, setOcupado] = useState(false);
  const form = useForm({
    defaultValues: {
      idJefatura: inicial,
      departamento: '',
      centro: '',
      buscar: '',
      seleccion: '[]',
      motivo: '',
    },
  });
  const d = form.watch();
  const draft = useFormDraft('asignacion-jefaturas', undefined, {
    form,
    version: 1,
    alDescartar: () => setConfirmar(false),
  });
  const ids: number[] = (() => {
    try {
      const v: unknown = JSON.parse(d.seleccion);
      return z.array(z.number().int().positive()).max(500).parse(v);
    } catch {
      return [];
    }
  })();
  const set = (key: keyof typeof d, value: string) => {
    form.clearErrors();
    form.setValue(key, value, { shouldDirty: true });
    setConfirmar(false);
  };
  const catalogo = useQuery({
    queryKey: ['catalogos', 'asignacion-jefaturas'],
    queryFn: ({ signal }) => listarTodos('jefaturas', { activo: '1' }, signal),
  });
  const destino = catalogo.data?.find((j) => String(j.id) === d.idJefatura);
  const q = useQuery({
    queryKey: ['empleados', 'asignacion-jefaturas', d.departamento, d.centro, d.buscar, pagina],
    queryFn: ({ signal }) =>
      listarEmpleados(
        {
          estado: 'ACTIVO',
          ...(d.departamento ? { idDepartamento: d.departamento } : {}),
          ...(d.centro ? { idCentroTrabajo: d.centro } : {}),
          ...(d.buscar ? { nombre: d.buscar } : {}),
          pagina: String(pagina),
        },
        signal,
      ),
  });
  const centros = useQuery({
    queryKey: ['catalogos', 'centros-asignacion'],
    queryFn: ({ signal }) => listarTodos('centros-trabajo', { activo: '1' }, signal),
  });
  const elegir = (valores: number[]) =>
    set('seleccion', JSON.stringify([...new Set(valores)].slice(0, 500)));
  const guardar = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await solicitar(
        '/catalogos/jefaturas/asignaciones',
        z.object({ asignados: z.number(), sinCambios: z.number() }),
        {
          method: 'POST',
          body: {
            idJefatura: Number(d.idJefatura),
            empleados: ids,
            motivo: d.motivo.trim(),
            confirmado: true,
          },
        },
      );
      draft.limpiar();
      await Promise.all([
        cliente.invalidateQueries({ queryKey: ['empleados'] }),
        cliente.invalidateQueries({ queryKey: ['catalogos'] }),
        cliente.invalidateQueries({ queryKey: ['tableros'] }),
      ]);
      toast(
        `${r.asignados} empleado(s) asignados; ${r.sinCambios} sin cambios. Auditoría registrada.`,
      );
      cerrar();
    } catch (e) {
      form.setError('root', { message: (e as Error).message });
      setConfirmar(false);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal
      abierto
      titulo="Asignar jefatura a empleados"
      onCerrar={() => {
        if (!ocupado) cerrar();
      }}
    >
      <form
        noValidate
        onSubmit={form.handleSubmit(() => {
          if (ocupado) return;
          form.clearErrors();
          if (!destino) form.setError('idJefatura', { message: 'Selecciona una jefatura activa.' });
          else if (!ids.length)
            form.setError('seleccion', { message: 'Selecciona al menos un empleado.' });
          else if (d.motivo.trim().length < 5)
            form.setError('motivo', { message: 'Explica el motivo con al menos 5 caracteres.' });
          else setConfirmar(true);
        })}
      >
        <fieldset disabled={ocupado}>
          <legend className="sr-only">Asignación masiva de jefatura</legend>
          <FormDraftNotice draft={draft} />
          <FormErrorSummary mensajes={Object.values(form.formState.errors).map((e) => e.message)} />
          <div data-tour="jefaturas-destino">
            <SelectField
              name="idJefatura"
              label="Jefatura de destino"
              required
              hint="Reemplaza la jefatura anterior. Cada empleado pertenece a una sola jefatura y debe ser del mismo departamento. Máximo 500 por operación."
              value={d.idJefatura}
              opciones={
                catalogo.data?.map((j) => ({
                  value: String(j.id),
                  label: `${j.nombre} · ${j.idDepartamentoEtiqueta}`,
                })) ?? []
              }
              error={catalogo.error?.message ?? form.formState.errors.idJefatura?.message}
              onValueChange={(v) => {
                set('idJefatura', v);
                elegir([]);
                const j = catalogo.data?.find((j) => String(j.id) === v);
                set('departamento', j ? String(j.idDepartamento) : '');
                setPagina(1);
              }}
            />
          </div>
          <div data-tour="jefaturas-seleccion">
            <FormGrid className="my-4">
              <Referencia
                campo={campoDepartamento}
                name="departamento"
                label="Departamento"
                hint="Filtra el listado. Solo se pueden asignar empleados del departamento de destino."
                value={d.departamento}
                onValueChange={(v) => {
                  set('departamento', v);
                  setPagina(1);
                }}
              />
              <SelectField
                name="centro"
                label="Centro de trabajo"
                hint="Limita el listado a un centro. La selección se conserva entre páginas y filtros."
                value={d.centro}
                onValueChange={(v) => {
                  set('centro', v);
                  setPagina(1);
                }}
                opciones={
                  centros.data?.map((c) => ({ value: String(c.id), label: String(c.nombre) })) ?? []
                }
                error={centros.error?.message}
              />
              <TextField
                name="buscar"
                label="Buscar empleado"
                hint="Busca por nombre o código dentro de los filtros elegidos."
                value={d.buscar}
                maxLength={200}
                onValueChange={(v) => {
                  set('buscar', v);
                  setPagina(1);
                }}
              />
            </FormGrid>
            <p role="status">
              {ids.length} empleado(s) seleccionados. Cambiar filtros conserva la selección; cambiar
              destino la limpia.
            </p>
            <div className="my-3 flex gap-3">
              <Button
                icono="aprobar"
                variante="secundario"
                disabled={!destino || q.isFetching}
                onClick={() =>
                  elegir([
                    ...ids,
                    ...(q.data?.registros
                      .filter((e) => e.idDepartamento === destino?.idDepartamento)
                      .map((e) => e.id) ?? []),
                  ])
                }
              >
                Seleccionar página
              </Button>
              <Button icono="cancelar" variante="texto" onClick={() => elegir([])}>
                Limpiar selección
              </Button>
            </div>
            <Table
              filas={q.data?.registros ?? []}
              clave={(e) => e.id}
              pagina={pagina}
              limite={20}
              total={q.data?.total ?? 0}
              onPagina={setPagina}
              orden={{ campo: 'nombre', direccion: 'asc' }}
              onOrden={() => {}}
              cargando={q.isPending}
              {...(q.error ? { error: q.error.message } : {})}
              onReintentar={() => void q.refetch()}
              columnas={[
                {
                  id: 'seleccion',
                  titulo: 'Seleccionar',
                  render: (e) => (
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${e.nombre}`}
                      title={
                        e.idDepartamento !== destino?.idDepartamento
                          ? 'El empleado debe pertenecer al departamento de destino.'
                          : 'Seleccionar empleado'
                      }
                      disabled={
                        ocupado ||
                        !destino ||
                        e.idDepartamento !== destino.idDepartamento ||
                        (ids.length >= 500 && !ids.includes(e.id))
                      }
                      checked={ids.includes(e.id)}
                      onChange={(ev) =>
                        elegir(ev.target.checked ? [...ids, e.id] : ids.filter((id) => id !== e.id))
                      }
                    />
                  ),
                },
                { id: 'nombre', titulo: 'Empleado', render: (e) => `${e.codigo} · ${e.nombre}` },
                {
                  id: 'jefe',
                  titulo: 'Jefe inmediato actual',
                  render: (e) => e.jefeInmediato ?? 'Sin jefe asignado',
                },
              ]}
            />
          </div>
          <div className="my-4" data-tour="jefaturas-confirmar">
            <TextAreaField
              name="motivo"
              label="Motivo de asignación"
              required
              hint="Explica por qué asignas o trasladas estos empleados. Se audita la jefatura anterior y nueva de cada persona; si una falla, no se cambia ninguna."
              value={d.motivo}
              maxLength={500}
              onValueChange={(v) => set('motivo', v)}
              error={form.formState.errors.motivo?.message}
            />
            <div className="my-4 flex gap-3">
              <Button icono="guardar" type="submit" cargando={ocupado}>
                Revisar asignación
              </Button>
              <Button icono="cancelar" variante="secundario" onClick={() => draft.cancelar(cerrar)}>
                Cancelar
              </Button>
            </div>
          </div>
        </fieldset>
      </form>
      {confirmar && (
        <ConfirmModal
          abierto
          titulo="Confirmar asignación de jefatura"
          descripcion={`Se asignarán ${ids.length} empleados a «${destino?.nombre}». Se reemplaza su jefatura anterior y se registra el motivo. La selección incluye empleados de otras páginas o filtros.`}
          cargando={ocupado}
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() => void guardar()}
        />
      )}
    </Modal>
  );
}
