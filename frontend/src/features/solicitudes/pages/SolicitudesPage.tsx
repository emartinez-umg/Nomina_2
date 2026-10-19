import { FormGrid } from '../../../components/forms/FormGrid';
import { CampoCodigo } from '../../../components/forms/CampoCodigo';
import { useFormDraft } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSession } from '../../../app/session';
import { usePageHelp, HelpButton } from '../../../components/help/HelpProvider';
import { ayudaSolicitudes } from '../help/pasos';
import * as api from '../api/solicitudes';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Table } from '../../../components/ui/Table';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Modal, ConfirmModal } from '../../../components/ui/Modal';
import {
  SelectField,
  TextField,
  TextAreaField,
  DateField,
  FormErrorSummary,
} from '../../../components/forms';
import { ReferenciaNovedad } from '../../novedades/pages/CampoNovedad';
import { useToast } from '../../../components/ui/Toast';
import { iconos } from '../../../components/ui/icons';
import { fechaVisible } from '../../../lib/validadores';
import { descargar } from '../../empleados/api/empleados';
import { SolicitudDetalle } from './SolicitudDetalle';
import { Plantillas } from './Plantillas';
export function Estado({ estado }: { estado: string }) {
  return (
    <Badge
      tono={estado === 'RECHAZADA' ? 'peligro' : estado === 'EN_PROCESO' ? 'aviso' : 'correcto'}
    >
      {api.nombresEstado[estado] ?? estado}
    </Badge>
  );
}
const etiquetasFiltro: Record<string, string> = {
  tipo: 'Tipo',
  estado: 'Estado',
  buscar: 'Búsqueda',
  desde: 'Desde',
  hasta: 'Hasta',
};
export function SolicitudesPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaSolicitudes, usuario?.rol);
  const empleado = usuario?.rol === 'EMPLEADO',
    nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [nueva, setNueva] = useState<string | undefined>(() => {
      const tipo = params.get('nueva');
      return tipo && api.nombresTipo[tipo] && tipo !== 'ACTUALIZACION_DATOS' ? tipo : undefined;
    }),
    [plantillas, setPlantillas] = useState(false),
    [filtros, setFiltros] = useState(false);
  const id = Number(params.get('solicitud')) || null;
  const q = Object.fromEntries(
    [
      'tipo',
      'estado',
      'idEmpleado',
      'buscar',
      'desde',
      'hasta',
      'pagina',
      'ordenarPor',
      'direccion',
    ].map((k) => [k, params.get(k) ?? '']),
  );
  const cambiar = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k !== 'pagina') p.delete('pagina');
    setParams(p);
  };
  const consulta = useQuery({
    queryKey: ['solicitudes', q],
    queryFn: ({ signal }) => api.listar(q, signal),
  });
  const toast = useToast();
  const exportar = useMutation({
    mutationFn: () => api.exportar(q),
    onSuccess: (csv) => descargar(csv, 'solicitudes.csv'),
    onError: (e) => toast(e.message, 'peligro'),
  });
  const ver = (id: number) => cambiar('solicitud', String(id));
  const opciones = Object.entries(api.nombresTipo).map(([value, label]) => ({ value, label }));
  return (
    <>
      <h1>{empleado ? 'Mis gestiones' : 'Solicitudes de empleados'}</h1>
      <p className="mb-6 text-secundario">
        {empleado
          ? 'Solicita tus documentos y da seguimiento a cada gestión.'
          : 'Revisa, resuelve y entrega las gestiones del personal.'}
      </p>
      {empleado ? (
        <section
          data-tour="gestiones-accesos"
          className="gestiones-grid mb-6"
          aria-label="Gestiones disponibles"
        >
          {[
            {
              titulo: 'Boletas de pago',
              icono: 'planilla' as const,
              ruta: '/mis-gestiones/boletas',
            },
            {
              titulo: 'Vacaciones',
              icono: 'calendario' as const,
              ruta: '/mis-gestiones/vacaciones',
            },
            ...opciones
              .filter((o) => o.value !== 'ACTUALIZACION_DATOS')
              .map((o) => ({ titulo: o.label, icono: 'documento' as const, tipo: o.value })),
            {
              titulo: 'Actualizar mis datos',
              icono: 'usuario' as const,
              ruta: '/mis-gestiones/datos',
            },
          ].map((a) => {
            const I = iconos[a.icono];
            return (
              <Card key={a.titulo} className="gestiones-tarjeta">
                <I className="h-10 w-10 text-primario" aria-hidden="true" />
                <h2>{a.titulo}</h2>
                <Button
                  icono="siguiente"
                  onClick={() => ('ruta' in a ? nav(a.ruta) : setNueva(a.tipo))}
                >
                  {'ruta' in a ? 'Abrir' : 'Solicitar'}
                </Button>
              </Card>
            );
          })}
        </section>
      ) : (
        <div className="mb-5">
          <Button icono="editar" onClick={() => setPlantillas(true)}>
            Plantillas de documentos
          </Button>
        </div>
      )}
      <Card data-tour="solicitudes-filtros" className="mb-5">
        <div className="flex flex-wrap gap-3 mb-4">
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
          <Button icono="exportar" cargando={exportar.isPending} onClick={() => exportar.mutate()}>
            Exportar CSV
          </Button>
        </div>
        <FormGrid>
          <TextField
            name="buscar"
            label={empleado ? 'Buscar código de solicitud' : 'Buscar empleado o solicitud'}
            hint="Nombre o código del empleado o de la solicitud."
            placeholder="Nombre, EMP… o SOL…"
            value={q.buscar!}
            onValueChange={(v) => cambiar('buscar', v)}
            maxLength={200}
          />
        </FormGrid>
        {filtros && (
          <FormGrid className="mt-4">
            <SelectField
              name="tipo"
              label="Tipo"
              hint="Combina el tipo con el estado y fechas."
              value={q.tipo!}
              opciones={opciones}
              onValueChange={(v) => cambiar('tipo', v)}
            />
            <SelectField
              name="estado"
              label="Estado"
              hint="En proceso, aprobada, rechazada o entregada."
              value={q.estado!}
              opciones={Object.entries(api.nombresEstado).map(([value, label]) => ({
                value,
                label,
              }))}
              onValueChange={(v) => cambiar('estado', v)}
            />
            {!empleado && (
              <ReferenciaNovedad
                referencia="empleados"
                name="idEmpleado"
                label="Empleado"
                hint="Busca y selecciona un expediente real."
                value={q.idEmpleado!}
                onValueChange={(v) => cambiar('idEmpleado', v)}
              />
            )}
            <DateField
              name="desde"
              label="Desde"
              hint="Fecha inicial de creación, inclusive."
              value={q.desde!}
              {...(q.hasta ? { max: q.hasta } : {})}
              onValueChange={(v) => cambiar('desde', v)}
            />
            <DateField
              name="hasta"
              label="Hasta"
              hint="Fecha final de creación, inclusive."
              value={q.hasta!}
              {...(q.desde ? { min: q.desde } : {})}
              onValueChange={(v) => cambiar('hasta', v)}
            />
          </FormGrid>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(q)
            .filter(([k, v]) => v && !['pagina', 'ordenarPor', 'direccion'].includes(k))
            .map(([k, v]) => (
              <Button key={k} icono="cancelar" variante="texto" onClick={() => cambiar(k, '')}>
                {k === 'idEmpleado'
                  ? 'Empleado seleccionado'
                  : `${etiquetasFiltro[k] ?? k}: ${api.nombresTipo[v] ?? api.nombresEstado[v] ?? fechaVisible(v)}`}
              </Button>
            ))}
        </div>
      </Card>
      <Card data-tour="solicitudes-listado">
        <h2 className="mb-4">{empleado ? 'Mis solicitudes' : 'Bandeja de RRHH'}</h2>
        <div className={empleado ? 'hidden md:block' : ''}>
          <Table
            titulo="Solicitudes"
            filas={consulta.data?.registros ?? []}
            clave={(s) => s.id}
            pagina={consulta.data?.pagina ?? 1}
            limite={20}
            total={consulta.data?.total ?? 0}
            orden={{
              campo: q.ordenarPor || 'fecha',
              direccion: q.direccion === 'asc' ? 'asc' : 'desc',
            }}
            onPagina={(p) => cambiar('pagina', String(p))}
            onOrden={(k, d) => {
              const p = new URLSearchParams(params);
              p.set('ordenarPor', k);
              p.set('direccion', d);
              p.delete('pagina');
              setParams(p);
            }}
            cargando={consulta.isPending}
            {...(consulta.error ? { error: consulta.error.message } : {})}
            onReintentar={() => void consulta.refetch()}
            columnas={[
              { id: 'codigo', titulo: 'Solicitud', ordenable: true, render: (s) => s.codigo },
              { id: 'empleado', titulo: 'Empleado', ordenable: true, render: (s) => s.empleado },
              { id: 'tipo', titulo: 'Gestión', ordenable: true, render: (s) => s.nombreTipo },
              {
                id: 'fecha',
                titulo: 'Fecha',
                ordenable: true,
                render: (s) => fechaVisible(s.fecha),
              },
              {
                id: 'estado',
                titulo: 'Estado',
                ordenable: true,
                render: (s) => <Estado estado={s.estado} />,
              },
              {
                id: 'acciones',
                titulo: 'Detalle y documento',
                render: (s) => (
                  <Button icono="ver" variante="texto" onClick={() => ver(s.id)}>
                    Ver solicitud
                  </Button>
                ),
              },
            ]}
          />
        </div>
        {empleado && (
          <div className="md:hidden" aria-busy={consulta.isPending}>
            {consulta.isPending ? (
              <Skeleton lineas={5} />
            ) : consulta.error ? (
              <>
                <p role="alert">{consulta.error.message}</p>
                <Button icono="actualizar" onClick={() => void consulta.refetch()}>
                  Reintentar
                </Button>
              </>
            ) : (
              <>
                {!consulta.data?.registros.length && (
                  <EmptyState
                    titulo="Sin solicitudes"
                    descripcion="Elige una gestión en las tarjetas superiores para empezar."
                  />
                )}
                {consulta.data?.registros.map((s) => (
                  <article key={s.id} className="border-b border-borde py-4">
                    <h3>
                      {s.nombreTipo} · #{s.id}
                    </h3>
                    <p>{fechaVisible(s.fecha)}</p>
                    <Estado estado={s.estado} />
                    <div className="mt-3">
                      <Button icono="ver" onClick={() => ver(s.id)}>
                        Ver solicitud{s.estado === 'ENTREGADA' && s.generaPdf ? ' y descargar' : ''}
                      </Button>
                    </div>
                  </article>
                ))}
                <div className="flex flex-wrap gap-3 mt-5">
                  <p>{consulta.data?.total ?? 0} solicitudes</p>
                  <Button
                    icono="anterior"
                    disabled={Number(q.pagina || 1) <= 1}
                    onClick={() => cambiar('pagina', String(Number(q.pagina) - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    icono="siguiente"
                    disabled={Number(q.pagina || 1) * 20 >= (consulta.data?.total ?? 0)}
                    onClick={() => cambiar('pagina', String(Number(q.pagina || 1) + 1))}
                  >
                    Siguiente
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>
      {nueva && <Nueva tipo={nueva} onCerrar={() => setNueva(undefined)} />}
      {id && (
        <SolicitudDetalle
          key={id}
          id={id}
          empleado={empleado}
          onCerrar={() => cambiar('solicitud', '')}
        />
      )}
      {plantillas && <Plantillas onCerrar={() => setPlantillas(false)} />}
    </>
  );
}
function Nueva({ tipo, onCerrar }: { tipo: string; onCerrar: () => void }) {
  const cache = useQueryClient(),
    toast = useToast(),
    [confirmar, setConfirmar] = useState(false);
  const f = useForm<{ observaciones: string; vehiculo: string; placa: string }>({
    resolver: zodResolver(
      z.object({
        observaciones: z.string().max(1000),
        vehiculo: z
          .string()
          .refine(
            (v) => tipo !== 'PARQUEO' || ['CARRO', 'MOTO'].includes(v),
            'Selecciona Carro o Moto.',
          ),
        placa: z.string().max(12),
      }),
    ),
    defaultValues: { observaciones: '', vehiculo: '', placa: '' },
    mode: 'onBlur',
  });
  const draft = useFormDraft(`solicitud-${tipo}`, undefined, {
    form: f,
    version: 9,
    alDescartar: () => setConfirmar(false),
  });
  const m = useMutation({
    mutationFn: () =>
      api.crear({
        tipo,
        observaciones: f.getValues('observaciones'),
        confirmado: true,
        ...(tipo === 'PARQUEO'
          ? { vehiculo: f.getValues('vehiculo'), placa: f.getValues('placa') }
          : {}),
      }),
    onSuccess: () => {
      draft.limpiar();
      toast('Solicitud enviada. RRHH recibió una notificación.');
      void cache.invalidateQueries({ queryKey: ['solicitudes'] });
      void cache.invalidateQueries({ queryKey: ['notificaciones'] });
      onCerrar();
    },
    onError: () => setConfirmar(false),
  });
  return (
    <>
      <Modal
        abierto
        titulo={`Solicitar ${api.nombresTipo[tipo]}`}
        onCerrar={() => {
          if (!m.isPending) onCerrar();
        }}
      >
        <form data-tour="solicitudes-nueva" onSubmit={f.handleSubmit(() => setConfirmar(true))}>
          <FormDraftNotice draft={draft} />
          <CampoCodigo entidad="solicitudes" />
          <HelpButton />
          <p className="my-4">
            RRHH revisará tu solicitud y te avisará de cada cambio.{' '}
            {tipo === 'PARQUEO' &&
              'Al aprobarse, comienza la suscripción mensual completa de Carro o Moto. Consulta la tarifa con RRHH y solicita la baja desde Mi parqueo.'}
          </p>
          <FormGrid>
            {tipo === 'PARQUEO' && (
              <>
                <div className="contents">
                  <Controller
                    control={f.control}
                    name="vehiculo"
                    render={({ field, fieldState }) => (
                      <SelectField
                        name={field.name}
                        label="Tipo de vehículo"
                        hint="Carro o Moto determina la tarifa mensual vigente al aprobar."
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        error={fieldState.error?.message}
                        opciones={[
                          { value: 'CARRO', label: 'Carro' },
                          { value: 'MOTO', label: 'Moto' },
                        ]}
                        required
                      />
                    )}
                  />
                </div>
                <div className="contents">
                  <Controller
                    control={f.control}
                    name="placa"
                    render={({ field }) => (
                      <TextField
                        name={field.name}
                        label="Placa (opcional)"
                        hint="Letras, números y guion; hasta 12 caracteres."
                        value={field.value}
                        onValueChange={(v) =>
                          field.onChange(v.toUpperCase().replace(/[^A-Z0-9-]/g, ''))
                        }
                        maxLength={12}
                      />
                    )}
                  />
                </div>
              </>
            )}
            <Controller
              control={f.control}
              name="observaciones"
              render={({ field: { ref: _ref, ...field }, fieldState }) => (
                <TextAreaField
                  {...field}
                  label="Observaciones"
                  hint="Explica el propósito o los detalles de tu solicitud. No incluyas contraseñas."
                  placeholder="Necesito la constancia para…"
                  onValueChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          </FormGrid>
          <FormErrorSummary mensajes={[]} mensajeServidor={m.error?.message} />
          <Button icono="correo" type="submit" cargando={m.isPending}>
            Revisar y enviar
          </Button>
        </form>
      </Modal>
      <ConfirmModal
        abierto={confirmar}
        titulo="Enviar solicitud"
        descripcion={`Se enviará tu solicitud de ${api.nombresTipo[tipo]} a RRHH.`}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => m.mutate()}
        cargando={m.isPending}
      />
    </>
  );
}
