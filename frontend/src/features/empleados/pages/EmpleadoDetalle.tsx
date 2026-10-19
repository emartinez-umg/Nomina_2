import { RestablecerEmpleadoModal } from './RestablecerEmpleadoModal';
import { useDraftValues } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { detalle, reglas, pestana, salario, baja } from '../api/empleados';
import type { Empleado, Reglas } from '../api/empleados';
import { secciones } from '../api/formulario';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Tabs } from '../../../components/ui/Tabs';
import { Modal } from '../../../components/ui/Modal';
import { Table } from '../../../components/ui/Table';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { DateField, TextAreaField, MoneyField, FormErrorSummary } from '../../../components/forms';
import { usePageHelp, HelpButton } from '../../../components/help/HelpProvider';
import { useSession } from '../../../app/session';
import { useToast } from '../../../components/ui/Toast';
import { ErrorApi } from '../../../lib/http';
import { fechaValida, fechaVisible } from '../../../lib/validadores';
import { formatoMoneda } from '../../../components/forms/MoneyField';
import { ayudaEmpleados, ayudaCambio } from '../help/pasos';
const ayuda = ayudaEmpleados('detalle');
const tabs = [
  { id: 'resumen', titulo: 'Resumen', icono: 'usuario' as const },
  { id: 'salario', titulo: 'Salario', icono: 'planilla' as const },
  { id: 'descuentos', titulo: 'Descuentos', icono: 'planilla' as const },
  { id: 'vacaciones', titulo: 'Vacaciones', icono: 'calendario' as const },
  { id: 'documentos', titulo: 'Documentos', icono: 'documento' as const },
  { id: 'historial', titulo: 'Historial', icono: 'tiempo' as const },
];
export function EmpleadoDetallePage() {
  const id = Number(useParams().id),
    nav = useNavigate(),
    { usuario } = useSession();
  const [accion, setAccion] = useState<'salario' | 'baja' | null>(null);
  const ayudaActual = useMemo(() => (accion ? ayudaCambio(accion) : ayuda), [accion]);
  usePageHelp(ayudaActual, usuario?.rol);
  const d = useQuery({
    queryKey: ['empleados', 'detalle', String(id)],
    queryFn: ({ signal }) => detalle(id, signal),
  });
  const r = useQuery({
    queryKey: ['empleados', 'reglas'],
    queryFn: ({ signal }) => reglas(signal),
  });
  const [restableciendo, setRestableciendo] = useState(false);
  const [tab, setTab] = useState('resumen');
  if (d.isPending || r.isPending) return <Skeleton lineas={8} />;
  const error = d.error ?? r.error;
  if (error)
    return (
      <EmptyState
        titulo="No se pudo consultar el expediente"
        descripcion={error.message}
        accion={
          <Button
            icono="actualizar"
            onClick={() => {
              void d.refetch();
              void r.refetch();
            }}
          >
            Reintentar
          </Button>
        }
      />
    );
  const empleado = d.data!;
  return (
    <>
      <h1>
        {empleado.nombres} {empleado.apellidos}
      </h1>
      <p className="my-3">
        {empleado.codigo} · {empleado.estado} ·{' '}
        {empleado.usuario ? `Usuario: ${empleado.usuario}` : 'Sin usuario generado'}
      </p>

      <div className="my-5 flex flex-wrap gap-3">
        <Button icono="anterior" variante="secundario" onClick={() => nav('/empleados')}>
          Volver
        </Button>
        <Button
          icono="editar"
          disabled={empleado.estado === 'EGRESADO'}
          title={
            empleado.estado === 'EGRESADO'
              ? 'El expediente egresado se conserva para consulta.'
              : 'Editar expediente'
          }
          onClick={() => nav(`/empleados/${id}/editar`)}
        >
          Editar
        </Button>
        <span data-tour="empleado-restablecer">
          <Button
            icono="seguridad"
            disabled={!empleado.idUsuario || empleado.estado === 'EGRESADO'}
            title="Genera una contraseña nueva, exige cambiarla y cierra las sesiones del empleado."
            onClick={() => setRestableciendo(true)}
          >
            Restablecer contraseña
          </Button>
        </span>
        <span data-tour="empleado-salario">
          <Button
            icono="planilla"
            disabled={empleado.estado === 'EGRESADO'}
            title={
              empleado.estado === 'EGRESADO'
                ? 'No se cambia salario tras el egreso.'
                : 'Registrar nueva vigencia'
            }
            onClick={() => setAccion('salario')}
          >
            Cambiar salario
          </Button>
        </span>
        <span data-tour="empleado-baja">
          <Button
            icono="eliminar"
            variante="peligro"
            disabled={empleado.estado === 'EGRESADO'}
            title={
              empleado.estado === 'EGRESADO'
                ? 'El empleado ya está egresado.'
                : 'Registrar egreso y desactivar acceso'
            }
            onClick={() => nav(`/prestaciones?empleado=${id}`)}
          >
            Liquidar y dar de baja
          </Button>
        </span>
      </div>
      <Card>
        <div data-tour="empleado-tabs">
          <Tabs
            valor={tab}
            onCambiar={setTab}
            items={tabs.map((t) => ({
              ...t,
              contenido:
                tab === t.id ? (
                  t.id === 'resumen' ? (
                    <Resumen empleado={empleado} />
                  ) : (
                    <Registros key={t.id} id={id} tipo={t.id} />
                  )
                ) : null,
            }))}
          />
        </div>
      </Card>
      {restableciendo && (
        <RestablecerEmpleadoModal empleado={empleado} cerrar={() => setRestableciendo(false)} />
      )}
      {accion && (
        <Accion empleado={empleado} reglas={r.data!} tipo={accion} cerrar={() => setAccion(null)} />
      )}
    </>
  );
}
function Resumen({ empleado: e }: { empleado: Empleado }) {
  return (
    <div data-tour="empleado-resumen">
      {secciones.map((s) => (
        <section className="my-6" key={s.titulo}>
          <h2>{s.titulo}</h2>
          <dl className="form-grid my-3">
            {s.campos.map((f) => (
              <div
                key={f.nombre}
                className={f.ancho === 'ancho' ? 'col-span-12' : 'col-span-12 md:col-span-4'}
              >
                <dt className="text-sm text-secundario">{f.label}</dt>
                <dd>
                  {e[f.nombre] == null
                    ? 'Sin registro'
                    : f.nombre === 'sexo'
                      ? e[f.nombre] === 'F'
                        ? 'Femenino'
                        : 'Masculino'
                      : f.tipo === 'dinero'
                        ? `Q ${formatoMoneda(String(e[f.nombre]))}`
                        : f.tipo === 'fecha'
                          ? fechaVisible(String(e[f.nombre]))
                          : f.nombre === 'idDepartamento'
                            ? String(e.departamento)
                            : f.nombre === 'idPuesto'
                              ? String(e.puesto)
                              : String(e[f.nombre + 'Etiqueta'] ?? e[f.nombre])}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {e.fechaEgreso && (
        <p>
          Egreso: {fechaVisible(String(e.fechaEgreso))}. Motivo: {String(e.motivoEgreso)}
        </p>
      )}
    </div>
  );
}
function Registros({ id, tipo }: { id: number; tipo: string }) {
  const [pagina, setPagina] = useState(1);
  const q = useQuery({
    queryKey: ['empleados', 'pestana', id, tipo, pagina],
    queryFn: ({ signal }) => pestana(id, tipo, pagina, signal),
  });
  return (
    <div className="mt-5">
      {tipo === 'vacaciones' && (
        <p className="campo-hint mb-4">
          Movimientos registrados en el kardex. La acumulación y autorización se gestionan en su
          módulo.
        </p>
      )}
      <Table
        columnas={Object.keys(q.data?.registros[0] ?? {}).map((k) => ({
          id: k,
          titulo: k,
          render: (r: Record<string, string | null>) =>
            r[k] && /^\d{4}-\d{2}-\d{2}$/.test(r[k]!) ? fechaVisible(r[k]!) : (r[k] ?? '—'),
        }))}
        filas={q.data?.registros ?? []}
        clave={(_r) => q.data!.registros.indexOf(_r)}
        pagina={pagina}
        limite={50}
        total={q.data?.total ?? 0}
        orden={{ campo: '', direccion: 'desc' }}
        onOrden={() => {}}
        onPagina={setPagina}
        cargando={q.isPending}
        {...(q.error ? { error: q.error.message } : {})}
        onReintentar={() => void q.refetch()}
      />
    </div>
  );
}
function Accion({
  empleado: e,
  reglas: r,
  tipo,
  cerrar,
}: {
  empleado: Empleado;
  reglas: Reglas;
  tipo: 'salario' | 'baja';
  cerrar: () => void;
}) {
  const cliente = useQueryClient(),
    toast = useToast();
  const { campo, draft } = useDraftValues(
    `empleado-${tipo}`,
    e.id,
    {
      importe: '',
      fecha: r.hoy,
      motivo: '',
    },
    true,
    {
      alDescartar: () => {
        setRevision(false);
        setError('');
        setCampos({});
      },
    },
  );
  const [importe, setImporte] = campo('importe');
  const [fecha, setFecha] = campo('fecha');
  const [motivo, setMotivo] = campo('motivo');
  const [revision, setRevision] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState(''),
    [campos, setCampos] = useState<Record<string, string[]>>({});
  const reglaSalario = useQuery({
    queryKey: ['empleados', 'reglas', fecha],
    queryFn: ({ signal }) => reglas(signal, fecha),
    enabled: tipo === 'salario' && fechaValida(fecha),
  });
  const minimo = reglaSalario.data?.salarioMinimo ?? (fecha === r.hoy ? r.salarioMinimo : null);
  const monto = importe.replace(/,/g, '');
  const fechaKey = tipo === 'salario' ? 'fechaEfectiva' : 'fechaEgreso';
  const bajo = minimo && /^\d+(\.\d{1,2})?$/.test(monto) && new Decimal(monto).lt(minimo);
  return (
    <Modal
      abierto
      titulo={tipo === 'salario' ? 'Cambiar salario' : 'Dar de baja al empleado'}
      onCerrar={() => {
        if (!ocupado) cerrar();
      }}
    >
      <FormDraftNotice draft={draft} />
      <div className="my-4 flex justify-end">
        <HelpButton />
      </div>
      <form
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          setError('');
          setCampos({});
          if (
            !fechaValida(fecha) ||
            fecha < String(e.fechaIngreso) ||
            (r.ultimoCierre && fecha <= r.ultimoCierre)
          ) {
            setError('Selecciona una fecha válida desde el ingreso y posterior al último cierre.');
            return;
          }
          if (motivo.trim().length < 5) {
            setError('Explica el motivo con al menos 5 caracteres.');
            return;
          }
          if (
            tipo === 'salario' &&
            (!/^\d{1,10}(\.\d{1,2})?$/.test(monto) || new Decimal(monto).lte(0))
          ) {
            setError('Ingresa un salario mayor a cero con hasta 2 decimales.');
            return;
          }
          setRevision(true);
        }}
      >
        <div className="form-grid">
          {tipo === 'salario' && (
            <div className="col-span-12 md:col-span-6" data-tour="empleado-cambio-salario">
              <MoneyField
                name="salarioBase"
                label="Nuevo salario mensual"
                hint="Monto en Q, mayor a cero. El salario actual se mantiene hasta la nueva vigencia."
                value={importe}
                onValueChange={(v) => {
                  setImporte(v);
                  setRevision(false);
                }}
                error={campos.salarioBase?.join(' ')}
                required
                disabled={ocupado}
              />
            </div>
          )}
          <div className="col-span-12 md:col-span-6" data-tour="empleado-cambio-fecha">
            <DateField
              name={fechaKey}
              label={tipo === 'salario' ? 'Fecha efectiva' : 'Fecha de egreso'}
              hint="dd/mm/aaaa. No puede afectar periodos cerrados."
              value={fecha}
              onValueChange={(v) => {
                setFecha(v);
                setRevision(false);
              }}
              min={String(e.fechaIngreso)}
              deshabilitar={(v) => !!r.ultimoCierre && v <= r.ultimoCierre}
              error={campos[fechaKey]?.join(' ')}
              required
              disabled={ocupado}
            />
          </div>
          <div className="col-span-12" data-tour="empleado-cambio-motivo">
            <TextAreaField
              name="motivo"
              label="Motivo"
              hint="Explica la decisión con 5–500 caracteres. Queda auditada con tu usuario."
              value={motivo}
              onValueChange={(v) => {
                setMotivo(v);
                setRevision(false);
              }}
              maxLength={500}
              required
              disabled={ocupado}
            />
          </div>
        </div>
        {tipo === 'salario' &&
          (bajo || !minimo || reglaSalario.error || reglaSalario.isFetching) && (
            <p className="alerta my-4">
              {reglaSalario.isFetching
                ? 'Consultando el mínimo vigente…'
                : reglaSalario.error
                  ? `No se pudo consultar el mínimo: ${reglaSalario.error.message}`
                  : bajo
                    ? `Advertencia: menor al mínimo parametrizado de Q ${minimo}. Verifica la categoría legal aplicable.`
                    : 'Sin mínimo parametrizado. Configura SALARIO_MINIMO_MENSUAL en Parámetros legales.'}
            </p>
          )}
        <FormErrorSummary mensajes={Object.values(campos).flat()} mensajeServidor={error} />
        {revision && (
          <div className="alerta my-4">
            {tipo === 'salario'
              ? `Confirma el cambio: anterior Q ${String(e.salarioBase ?? 'Sin vigencia')} → nuevo Q ${importe}, efectivo el ${fechaVisible(fecha)}.`
              : `Confirma la baja el ${fechaVisible(fecha)}. Se desactivará el usuario y se cerrarán sus sesiones.`}
            <p>Motivo: {motivo}</p>
          </div>
        )}
        <div className="my-5 flex justify-end gap-3" data-tour="empleado-cambio-confirmar">
          <Button
            icono="cancelar"
            variante="secundario"
            disabled={ocupado}
            onClick={cerrar}
            cancelarFormulario
          >
            Cancelar
          </Button>
          {!revision ? (
            <Button type="submit" icono="ver">
              Revisar cambio
            </Button>
          ) : (
            <Button
              icono="aprobar"
              variante={tipo === 'baja' ? 'peligro' : 'primario'}
              cargando={ocupado}
              onClick={() => {
                if (ocupado) return;
                setOcupado(true);
                void (
                  tipo === 'salario'
                    ? salario(e.id, {
                        salarioBase: monto,
                        fechaEfectiva: fecha,
                        motivo,
                        confirmado: true,
                      })
                    : baja(e.id, { fechaEgreso: fecha, motivo, confirmado: true })
                )
                  .then(async (guardado) => {
                    draft.limpiar();
                    if (Array.isArray(guardado.advertencias))
                      for (const aviso of guardado.advertencias) toast(aviso, 'peligro');
                    await cliente.invalidateQueries({ queryKey: ['empleados'] });
                    toast('Cambio guardado y auditado.');
                    cerrar();
                  })
                  .catch((err) => {
                    setError((err as Error).message);
                    if (err instanceof ErrorApi) setCampos(err.campos ?? {});
                    setRevision(false);
                  })
                  .finally(() => setOcupado(false));
              }}
            >
              Confirmar {tipo === 'salario' ? 'salario' : 'baja'}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
