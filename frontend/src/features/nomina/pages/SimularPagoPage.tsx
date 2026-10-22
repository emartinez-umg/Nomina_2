import { FormGrid } from '../../../components/forms/FormGrid';
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { ConfirmModal } from '../../../components/ui/Modal';
import { SelectField, FormErrorSummary } from '../../../components/forms';
import { MonthField } from '../../../components/forms/MonthField';
import { ReferenciaNovedad } from '../../novedades/pages/CampoNovedad';
import { moneda } from '../../novedades/pages/NovedadesPage';
import { hoyGuatemala, fechaVisible } from '../../../lib/validadores';
import { AvisoEmpresa, useBloqueoFirma } from '../../empresa/pages/AvisoEmpresa';
import { useToast } from '../../../components/ui/Toast';
import { ayudaSimular } from '../help/simular';
import * as api from '../api/nomina';
import { AcumuladosAutomaticos } from './AcumuladosAutomaticos';
export function SimularPagoPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaSimular, usuario?.rol);
  return <SimuladorPago />;
}
export function SimuladorPago({ prestaciones = false }: { prestaciones?: boolean }) {
  const nav = useNavigate(),
    client = useQueryClient(),
    toast = useToast(),
    bloqueo = useBloqueoFirma();
  const [mes, setMes] = useState(
      prestaciones
        ? `${hoyGuatemala().slice(0, 4)}-${Number(hoyGuatemala().slice(5, 7)) >= 12 ? '12' : '07'}`
        : hoyGuatemala().slice(0, 7),
    ),
    [tipo, setTipo] = useState<api.ObjetivoPago['tipoPago']>(
      prestaciones
        ? Number(hoyGuatemala().slice(5, 7)) >= 12
          ? 'AGUINALDO'
          : 'BONO_14'
        : 'ANTICIPO',
    ),
    [objetivo, setObjetivo] = useState<api.ObjetivoPago['objetivo']>('TODOS'),
    [id, setId] = useState(''),
    [departamentoId, setDepartamentoId] = useState(''),
    [r, setR] = useState<api.Simulacion>(),
    [confirmado, setConfirmado] = useState(false),
    [dialogo, setDialogo] = useState(false),
    [error, setError] = useState(''),
    [pagina, setPagina] = useState(1),
    [pagados, setPagados] = useState<number[]>([]);
  const anual = tipo === 'BONO_14' || tipo === 'AGUINALDO';
  const nombreTipo = {
    ANTICIPO: 'Anticipo quincenal',
    PAGO: 'Pago del mes',
    BONO_14: 'Bono 14',
    AGUINALDO: 'Aguinaldo',
  }[tipo];
  const body: api.ObjetivoPago = {
    mes,
    tipoPago: tipo,
    objetivo,
    ...(objetivo === 'EMPLEADO' && id ? { idEmpleado: Number(id) } : {}),
    ...(objetivo === 'DEPARTAMENTO' && id ? { idDepartamento: Number(id) } : {}),
  };
  const invalidar = () => {
    setR(undefined);
    setConfirmado(false);
    setPagados([]);
    setPagina(1);
    setError('');
  };
  const simulacion = useMutation({
    mutationFn: () => api.simular(body),
    onSuccess: (data) => {
      setR(data);
      setConfirmado(false);
      setPagina(1);
      setError('');
    },
    onError: (e) => {
      setR(undefined);
      setError(e.message);
    },
  });
  useEffect(() => {
    if (prestaciones && mes <= hoyGuatemala().slice(0, 7)) simulacion.mutate();
    // La primera consulta precalcula sin guardar. Cambios posteriores requieren revisión explícita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pago = useMutation({
    mutationFn: () => api.pagar(body, r!.hash),
    onSuccess: (data) => {
      setPagados(data.pagados);
      setR(undefined);
      setConfirmado(false);
      setDialogo(false);
      toast(data.mensaje);
      void client.invalidateQueries({ queryKey: ['prestaciones'] });
      void client.invalidateQueries({ queryKey: ['nomina'] });
      void client.invalidateQueries({ queryKey: ['novedades'] });
      void client.invalidateQueries({ queryKey: ['notificaciones'] });
      void client.invalidateQueries({ queryKey: ['tableros'] });
    },
    onError: (e) => {
      setDialogo(false);
      setConfirmado(false);
      setR(undefined);
      setError(e.message);
    },
  });
  const descarga = useMutation({
    mutationFn: async (id?: number) => {
      const d =
        id !== undefined
          ? await api.previewPago(body, id)
          : await api.zipPagos(
              mes,
              objetivo === 'DEPARTAMENTO' ? idString() : '',
              objetivo === 'EMPLEADO' ? idString() : '',
            );
      api.descargar(d, id !== undefined);
    },
    onError: (e) => setError(e.message),
  });
  function idString() {
    return id;
  }
  const ocupado = simulacion.isPending || pago.isPending;
  return (
    <>
      {prestaciones ? <h2>Prestaciones automáticas · revisión y pago</h2> : <h1>Simular pago</h1>}
      <AvisoEmpresa />
      <Card>
        <section data-tour="pago-objetivo">
          <FormGrid>
            <SelectField
              name="tipoPago"
              label="Tipo de pago"
              hint="Anticipo: día 15. Pago: fin de mes. Bono 14: julio. Aguinaldo: diciembre; promedio con comisiones y horas extra."
              value={tipo}
              disabled={ocupado}
              onValueChange={(v) => {
                invalidar();
                setTipo(v as typeof tipo);
                if (v === 'BONO_14' || v === 'AGUINALDO')
                  setMes(`${mes.slice(0, 4)}-${v === 'BONO_14' ? '07' : '12'}`);
              }}
              opciones={[
                ...(!prestaciones
                  ? [
                      { value: 'ANTICIPO', label: 'Anticipo' },
                      { value: 'PAGO', label: 'Pago del mes' },
                    ]
                  : []),
                { value: 'BONO_14', label: 'Bono 14' },
                { value: 'AGUINALDO', label: 'Aguinaldo' },
              ]}
              required
            />
            <div className="contents">
              <MonthField
                name="mes"
                label="Mes del pago"
                hint="Mes actual o anterior. La fecha de pago no cambia por fines de semana."
                value={mes}
                max={hoyGuatemala().slice(0, 7)}
                disabled={ocupado}
                required
                onValueChange={(v) => {
                  invalidar();
                  setMes(v);
                }}
              />
            </div>
            <SelectField
              name="objetivo"
              label="Objetivo"
              hint="Calcula para un empleado, un departamento o todos los empleados del mes."
              value={objetivo}
              disabled={ocupado}
              onValueChange={(v) => {
                invalidar();
                setObjetivo(v as typeof objetivo);
                setId('');
                setDepartamentoId('');
              }}
              opciones={[
                { value: 'TODOS', label: 'Todos' },
                { value: 'DEPARTAMENTO', label: 'Un departamento' },
                { value: 'EMPLEADO', label: 'Un empleado' },
              ]}
              required
            />
            {objetivo !== 'TODOS' && (
              <ReferenciaNovedad
                referencia="departamentos"
                name="departamentoObjetivo"
                label="Departamento"
                hint={
                  objetivo === 'EMPLEADO'
                    ? 'Opcional: limita la búsqueda de empleados a este departamento.'
                    : 'Selecciona el departamento que se calculará.'
                }
                value={objetivo === 'DEPARTAMENTO' ? id : departamentoId}
                disabled={ocupado}
                onValueChange={(v) => {
                  invalidar();
                  if (objetivo === 'DEPARTAMENTO') setId(v);
                  else setDepartamentoId(v);
                }}
              />
            )}
            {objetivo === 'EMPLEADO' && (
              <ReferenciaNovedad
                referencia="empleados"
                departamentoId={departamentoId}
                soloActivos={false}
                name="objetivoId"
                label="Empleado"
                hint="Selecciona el empleado del pago; cambiarlo requiere simular de nuevo."
                value={id}
                disabled={ocupado}
                onValueChange={(v) => {
                  invalidar();
                  setId(v);
                }}
              />
            )}
          </FormGrid>
          <p className="campo-hint">
            {anual
              ? 'Cálculo desde contratación: promedio mensual × días / 365, máximo 100 %. Exención hasta el límite vigente; excedente incorporado al ISR del pago mensual. Revisa la historia completa antes de confirmar.'
              : 'Selecciona empleado, departamento o todos y revisa los importes antes de pagar.'}
          </p>
        </section>
        <div data-tour="pago-simular" className="flex flex-wrap gap-3 mt-4">
          <Button
            icono="buscar"
            cargando={simulacion.isPending}
            disabled={ocupado || !mes || (objetivo !== 'TODOS' && !id)}
            onClick={() => {
              setConfirmado(false);
              simulacion.mutate();
            }}
          >
            Simular
          </Button>
          <Button icono="ver" variante="secundario" onClick={() => nav('/planilla')}>
            Planilla e historial
          </Button>
        </div>
        <FormErrorSummary mensajes={[error]} />
      </Card>
      {r && (
        <Card>
          <section data-tour="pago-resultados">
            <p>
              SIMULACIÓN · {nombreTipo} · Fecha informativa: {fechaVisible(r.fechaPago)}
            </p>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 my-4">
              {(['ingresos', 'descuentos', 'neto', 'patronal'] as const).map((k) => (
                <div key={k} className="banda-informativa">
                  <div>
                    <p>
                      {
                        {
                          ingresos: 'Ingresos',
                          descuentos: 'Descuentos',
                          neto: 'Neto a pagar',
                          patronal: 'Aporte patronal',
                        }[k]
                      }
                    </p>
                    <strong>{moneda(r.totales[k])}</strong>
                  </div>
                </div>
              ))}
            </div>
            <Table
              titulo="Resultados de simulación"
              filas={r.registros.slice((pagina - 1) * 10, pagina * 10)}
              total={r.registros.length}
              pagina={pagina}
              limite={10}
              clave={(f) => f.idEmpleado}
              onPagina={setPagina}
              orden={{ campo: 'empleado', direccion: 'asc' }}
              onOrden={() => {}}
              columnas={[
                {
                  id: 'empleado',
                  titulo: 'Empleado',
                  render: (f) => (
                    <>
                      {f.empleado}
                      {f.resultado?.componentes?.map((c) => (
                        <p key={c.concepto} className="campo-hint">
                          {c.formula} = {moneda(c.monto)}. Exento: {moneda(c.exento)}; gravado:{' '}
                          {moneda(c.gravado)}.
                        </p>
                      ))}
                      <p className="campo-hint">{f.departamento}</p>
                    </>
                  ),
                },
                {
                  id: 'devengado',
                  titulo: 'Devengado',
                  render: (f) => (
                    <span className="whitespace-nowrap">
                      {f.resultado ? moneda(f.resultado.devengado) : '—'}
                    </span>
                  ),
                },
                {
                  id: 'neto',
                  titulo: 'Neto',
                  render: (f) => (
                    <span className="whitespace-nowrap">
                      {f.resultado ? moneda(f.resultado.neto) : 'Bloqueado'}
                    </span>
                  ),
                },
                {
                  id: 'alertas',
                  titulo: 'Alertas',
                  render: (f) =>
                    f.alertas.length ? (
                      <ul>
                        {f.alertas.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    ) : (
                      'Sin alertas'
                    ),
                },
                {
                  id: 'preview',
                  titulo: 'Boleta',
                  render: (f) => (
                    <Button
                      icono="ver"
                      variante="secundario"
                      disabled={!f.resultado || descarga.isPending}
                      motivoDeshabilitado="Resuelve las alertas de este empleado para ver su simulación."
                      onClick={() => descarga.mutate(f.idEmpleado)}
                    >
                      Vista previa
                    </Button>
                  ),
                },
              ]}
            />
          </section>
          <AcumuladosAutomaticos
            estimaciones={r.registros.flatMap((f) =>
              f.resultado?.estimacionFiscal
                ? [{ empleado: f.empleado, estimacion: f.resultado.estimacionFiscal }]
                : [],
            )}
          />
          <section data-tour="pago-verificacion" className="my-5">
            <h2>Lista de verificación previa a pagar</h2>
            <ul className="my-3">
              {Object.entries(r.verificacion).map(([k, v]) => (
                <li key={k}>
                  {
                    {
                      horasExtra: 'Empleados con horas extra',
                      comisiones: 'Empleados con comisiones',
                      consumos: 'Empleados con consumos',
                      ausencias: 'Empleados con ausencias',
                      retroactivas: 'Empleados con novedades de meses anteriores',
                      conAlertas: 'Empleados con alertas',
                    }[k]
                  }
                  : <strong>{v}</strong>
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={confirmado}
                disabled={ocupado}
                onChange={(e) => setConfirmado(e.target.checked)}
              />
              {anual
                ? 'Confirmo que la historia salarial, comisiones y horas extra del ciclo están completas'
                : 'Confirmo que las novedades del mes están completas'}
            </label>
            <p className="campo-hint">
              Revisa también los acumulados automáticos, cuando aparezcan. Se pagarán{' '}
              {r.registros.filter((f) => f.resultado).length} empleados. Los bloqueados conservan
              sus novedades pendientes.
            </p>
          </section>
          <div data-tour="pago-confirmar">
            <Button
              icono="aprobar"
              disabled={
                !confirmado || ocupado || !r.registros.some((f) => f.resultado) || !!bloqueo
              }
              motivoDeshabilitado={
                bloqueo ||
                'Simula, resuelve los bloqueos y confirma que las novedades están completas.'
              }
              onClick={() => setDialogo(true)}
            >
              Confirmar y pagar
            </Button>
          </div>
        </Card>
      )}
      <Card>
        <section data-tour="pago-descargas">
          {pagados.length > 0 && (
            <p role="status">
              Pagados: {pagados.length}. Las boletas ya están en el portal del empleado.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {pagados.map((n) => (
              <Button
                key={n}
                icono="exportar"
                variante="secundario"
                onClick={() =>
                  void api
                    .boleta(n)
                    .then((d) => api.descargar(d))
                    .catch((e) => setError((e as Error).message))
                }
              >
                Boleta {n}
              </Button>
            ))}
            <Button
              icono="exportar"
              variante="secundario"
              cargando={descarga.isPending}
              disabled={!mes || (objetivo !== 'TODOS' && !id)}
              onClick={() => descarga.mutate(undefined)}
            >
              ZIP de boletas por departamento
            </Button>
          </div>
          <p className="campo-hint">
            ZIP del mes y objetivo seleccionados, organizado en carpetas por departamento. Cada PDF
            lleva el periodo y el código del empleado en su nombre; las boletas regulares incluyen
            dos copias en una hoja carta. Revisión, aprobación y cierre disponibles en Planilla.
          </p>
        </section>
      </Card>
      <ConfirmModal
        abierto={dialogo}
        titulo="Confirmar pago de nómina"
        descripcion={`Se pagará ${nombreTipo} ${mes}, objetivo ${objetivo.toLowerCase()}. Neto total ${moneda(r?.totales.neto ?? '0')}. ${anual ? 'Se registrará la prestación y su exención' : 'Se aplicarán novedades y cuotas'}, se archivarán boletas y se notificará a los empleados. ADMIN puede revertir con motivo antes del cierre.`}
        cargando={pago.isPending}
        onCancelar={() => {
          if (!pago.isPending) setDialogo(false);
        }}
        onConfirmar={() => {
          if (confirmado && r && !pago.isPending) pago.mutate();
        }}
      />
    </>
  );
}
