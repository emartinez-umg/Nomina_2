import { FormGrid } from '../../../components/forms/FormGrid';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { usePageHelp, HelpButton } from '../../../components/help/HelpProvider';
import { useSession } from '../../../app/session';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { TextField, DateField, NumberField, SelectField } from '../../../components/forms';
import { solicitar } from '../../../lib/http';
import { useToast } from '../../../components/ui/Toast';
import { auditoriaFila } from '../../inicio/api/tableros';
import type { AuditoriaFila } from '../../inicio/api/tableros';
import { fechaHora, qs } from '../../comunicacion/api/comunicacion';
import { descargar } from '../../empleados/api/empleados';
import { ayudaAuditoria } from '../help/pasos';
export function AuditoriaPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaAuditoria, usuario?.rol);
  const [params, setParams] = useSearchParams(),
    [filtros, setFiltros] = useState(true),
    [detalle, setDetalle] = useState<AuditoriaFila>(),
    toast = useToast();
  const q = Object.fromEntries(
    [
      'usuario',
      'rol',
      'entidad',
      'accion',
      'idEntidad',
      'ip',
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
    queryKey: ['auditoria', q],
    queryFn: ({ signal }) =>
      solicitar(
        `/auditoria?${qs(q)}`,
        z.object({
          registros: z.array(auditoriaFila),
          total: z.number(),
          pagina: z.number(),
          limite: z.number(),
        }),
        { signal },
      ),
  });
  const csv = useMutation({
    mutationFn: () => solicitar(`/auditoria/exportar?${qs(q)}`, z.string()),
    onSuccess: (s) => descargar(s, 'bitacora.csv'),
    onError: (e) => toast(e.message, 'peligro'),
  });
  return (
    <>
      <h1>Bitácora de auditoría</h1>
      <p className="my-4 text-secundario">
        Acciones registradas por el sistema. Solo ADMIN puede consultar esta información.
      </p>
      <Card data-tour="auditoria-filtros" className="mb-5">
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
          <FormGrid className="mt-5">
            <NumberField
              name="usuario"
              label="ID de usuario"
              hint="Identificador del actor, visible en el tablero de administración."
              value={q.usuario!}
              onValueChange={(v) => cambiar('usuario', v)}
              min="1"
              decimales={0}
            />
            <SelectField
              name="rol"
              label="Rol"
              hint="Rol del actor al realizar la acción."
              value={q.rol!}
              onValueChange={(v) => cambiar('rol', v)}
              opciones={[
                { value: '', label: 'Todos' },
                { value: 'ADMIN', label: 'ADMIN' },
                { value: 'RH', label: 'RH' },
                { value: 'EMPLEADO', label: 'EMPLEADO' },
              ]}
            />
            {(['entidad', 'accion', 'ip'] as const).map((k) => (
              <TextField
                key={k}
                name={k}
                label={k === 'entidad' ? 'Entidad' : k === 'accion' ? 'Acción' : 'IP'}
                hint={
                  k === 'entidad'
                    ? 'Nombre exacto de tabla, por ejemplo ANUNCIOS.'
                    : k === 'accion'
                      ? 'Acción exacta, por ejemplo CREAR.'
                      : 'Dirección IP exacta registrada por el servidor.'
                }
                placeholder={k === 'entidad' ? 'ANUNCIOS' : k === 'accion' ? 'CREAR' : '127.0.0.1'}
                maxLength={k === 'ip' ? 45 : 60}
                value={q[k]!}
                onValueChange={(v) => cambiar(k, v)}
              />
            ))}
            <NumberField
              name="idEntidad"
              label="ID del recurso"
              hint="Identificador del recurso afectado, combinado con la entidad."
              value={q.idEntidad!}
              onValueChange={(v) => cambiar('idEntidad', v)}
              min="1"
              decimales={0}
            />
            <DateField
              name="desde"
              label="Desde"
              hint="Primer día de la consulta, incluido."
              value={q.desde!}
              onValueChange={(v) => cambiar('desde', v)}
            />
            <DateField
              name="hasta"
              label="Hasta"
              hint="Último día completo en Guatemala, incluido."
              {...(q.desde ? { min: q.desde } : {})}
              value={q.hasta!}
              onValueChange={(v) => cambiar('hasta', v)}
            />
          </FormGrid>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(q)
            .filter(([k, v]) => v && !['pagina', 'ordenarPor', 'direccion'].includes(k))
            .map(([k, v]) => (
              <Button key={k} icono="cancelar" variante="texto" onClick={() => cambiar(k, '')}>
                {k}: {v}
              </Button>
            ))}
        </div>
      </Card>
      <Card data-tour="auditoria-listado">
        <Table
          titulo="Acciones auditadas"
          filas={consulta.data?.registros ?? []}
          clave={(f) => f.id}
          pagina={consulta.data?.pagina ?? 1}
          limite={consulta.data?.limite ?? 20}
          total={consulta.data?.total ?? 0}
          cargando={consulta.isPending}
          {...(consulta.error ? { error: consulta.error.message } : {})}
          onReintentar={() => void consulta.refetch()}
          orden={{
            campo: q.ordenarPor || 'fecha',
            direccion: q.direccion === 'asc' ? 'asc' : 'desc',
          }}
          onPagina={(p) => cambiar('pagina', String(p))}
          onOrden={(campo, direccion) => {
            const p = new URLSearchParams(params);
            p.set('ordenarPor', campo);
            p.set('direccion', direccion);
            p.delete('pagina');
            setParams(p);
          }}
          columnas={[
            { id: 'id', titulo: 'ID', ordenable: true, render: (f) => f.id },
            { id: 'fecha', titulo: 'Fecha', ordenable: true, render: (f) => fechaHora(f.fecha) },
            {
              id: 'usuario',
              titulo: 'Usuario / rol',
              render: (f) => `${f.idUsuario ?? 'Sistema'} · ${f.rol ?? 'Sistema'}`,
            },
            { id: 'accion', titulo: 'Acción', render: (f) => f.accion },
            {
              id: 'entidad',
              titulo: 'Entidad',
              render: (f) => `${f.entidad} · ${f.idEntidad ?? '—'}`,
            },
            { id: 'motivo', titulo: 'Motivo', render: (f) => f.motivo ?? '—' },
            {
              id: 'ver',
              titulo: 'Detalle',
              render: (f) => (
                <Button icono="ver" variante="texto" onClick={() => setDetalle(f)}>
                  Ver cambios
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        abierto={!!detalle}
        titulo={`Acción ${detalle?.id ?? ''}`}
        onCerrar={() => setDetalle(undefined)}
      >
        <HelpButton />
        {detalle && (
          <section data-tour="auditoria-detalle" className="my-5">
            <p>
              {detalle.accion} · {detalle.entidad} · {fechaHora(detalle.fecha)}
            </p>
            <p>IP: {detalle.ip ?? 'No registrada'}</p>
            <p>Motivo: {detalle.motivo ?? 'No aplica'}</p>
            <h3 className="mt-4">Valores anteriores</h3>
            <pre className="auditoria-json">{JSON.stringify(detalle.antes, null, 2)}</pre>
            <h3>Valores nuevos</h3>
            <pre className="auditoria-json">{JSON.stringify(detalle.despues, null, 2)}</pre>
            <p className="campo-hint">
              La auditoría excluye contraseñas, tokens y datos sensibles.
            </p>
          </section>
        )}
      </Modal>
    </>
  );
}
