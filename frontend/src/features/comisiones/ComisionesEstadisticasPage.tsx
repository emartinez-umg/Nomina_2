import type { CSSProperties } from 'react';
import { tokens } from '../../styles/tokens';
import { useRef, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { Decimal } from 'decimal.js';
import { useSession } from '../../app/session';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { iconos } from '../../components/ui/icons';
import { usePageHelp } from '../../components/help/HelpProvider';
import { moneda } from '../../lib/validadores';
import { descargar } from '../nomina/api/nomina';
import { Actualizado } from '../inicio/components/RhCompartidos';
import * as api from './api';
import { FiltrosComisiones, filtrosIniciales, validarFiltrosComisiones } from './FiltrosComisiones';
import { IndicadoresComisiones, VariacionComisiones } from './IndicadoresComisiones';
import {
  mesVisible,
  TendenciaComisiones,
  RankingGrafica,
  RepartoGrafica,
  DatosReparto,
  DatosTendencia,
} from './GraficasComisiones';
import { DetalleVendedor } from './DetalleVendedor';
import { ayudaComisiones } from './help/pasos';
import '../inicio/dashboard.css';
import './comisiones.css';
export function ComisionesEstadisticasPage() {
  const { usuario, reintentar } = useSession(),
    [params, setParams] = useSearchParams();
  const equipo = usuario?.rol === 'EMPLEADO';
  const inicial = filtrosIniciales();
  const filtros: api.FiltrosComisiones = {
    ...inicial,
    ...Object.fromEntries(
      [...params].filter(([k]) =>
        ['desde', 'hasta', 'estado', 'comparar', 'idDepartamento', 'vendedores'].includes(k),
      ),
    ),
  };
  const errorFiltros = validarFiltrosComisiones(filtros);
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);
  const campo = params.get('ordenarPor') ?? 'total',
    direccion = params.get('direccion') === 'asc' ? 'asc' : 'desc';
  const [seleccionado, setSeleccionado] = useState<number>(),
    [porVendedor, setPorVendedor] = useState(false);
  const detalleRef = useRef<HTMLDivElement>(null),
    client = useQueryClient();
  usePageHelp(ayudaComisiones, usuario?.rol);
  const listado = {
    ...filtros,
    pagina: String(pagina),
    limite: '20',
    ordenarPor: campo,
    direccion,
  };
  const consulta = useQuery({
    queryKey: ['comisiones-panel', usuario?.idUsuario, usuario?.permisosEquipo, listado],
    queryFn: async ({ signal }) => {
      const [resumen, tendencia, ranking, tabla] = await Promise.all([
        api.consultar('resumen', api.resumenSchema, filtros, signal),
        api.consultar('tendencia', api.tendenciaSchema, filtros, signal),
        api.consultar('ranking', api.rankingSchema, listado, signal),
        api.consultar('tabla', api.tablaSchema, listado, signal),
      ]);
      return { resumen, tendencia, ranking, tabla };
    },
    enabled: !errorFiltros,
    retry: false,
    staleTime: 0,
    refetchInterval: 60000,
  });
  const exportacion = useMutation({
    mutationFn: (formato: 'csv' | 'excel') => api.exportar(filtros, formato),
    onSuccess: (d) => descargar(d),
  });
  // Un error de permisos retira todos los datos previos, también el detalle independiente.
  const d = consulta.error || errorFiltros ? undefined : consulta.data;
  const filtroClave = JSON.stringify(filtros);
  const { reset: restablecerExportacion } = exportacion;
  useEffect(() => {
    setSeleccionado(undefined);
    restablecerExportacion();
  }, [filtroClave, restablecerExportacion]);
  const abrir = (id: number) => {
    setSeleccionado(id);
    window.setTimeout(() => {
      detalleRef.current?.focus();
      detalleRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, 0);
  };
  const actualizar = () => {
    void client.invalidateQueries({ queryKey: ['comisiones-panel'] });
    void client.invalidateQueries({ queryKey: ['comisiones-opciones'] });
    void client.invalidateQueries({ queryKey: ['comisiones-historial'] });
  };
  const aplicar = (q: api.FiltrosComisiones) => {
    setParams(q);
    setSeleccionado(undefined);
  };
  const periodoTexto = errorFiltros
    ? 'el rango elegido'
    : filtros.desde === filtros.hasta
      ? mesVisible(filtros.desde)
      : `${mesVisible(filtros.desde)} a ${mesVisible(filtros.hasta)}`;
  return (
    <div
      className="com-pagina"
      style={
        {
          '--com-marca': tokens.colores.marca,
          '--com-primario': tokens.colores.primario,
          '--com-suave': tokens.colores.suave,
          '--com-informacion': tokens.colores.informacion,
          '--com-secundario': tokens.colores.secundario,
        } as CSSProperties
      }
    >
      <header className="com-cabecera">
        <div>
          <p className="campo-hint">
            {equipo ? 'Mis gestiones / Mi equipo' : 'Inicio / Estadísticas'}
          </p>
          <h1>Estadísticas de comisiones</h1>
          <p className="text-secundario">
            Tendencia e historial de las comisiones por su mes de origen.
          </p>
        </div>
        <Button
          icono="actualizar"
          variante="secundario"
          cargando={consulta.isFetching}
          onClick={actualizar}
        >
          Actualizar
        </Button>
      </header>
      <FiltrosComisiones
        key={filtroClave}
        aplicados={filtros}
        aplicar={aplicar}
        bloqueado={!!consulta.error}
      />
      {errorFiltros ? (
        <EmptyState titulo="Revisa el rango de consulta" descripcion={errorFiltros} />
      ) : consulta.error ? (
        <EmptyState
          titulo="Estadísticas no disponibles"
          descripcion={consulta.error.message}
          accion={
            <Button
              icono="actualizar"
              onClick={() => {
                actualizar();
                reintentar();
              }}
            >
              Reintentar estadísticas
            </Button>
          }
        />
      ) : !d ? (
        <div role="status" aria-label="Cargando comisiones">
          <Skeleton lineas={10} />
        </div>
      ) : (
        <>
          <section
            className="com-alcance"
            data-tour="com-alcance"
            aria-label="Alcance de la consulta"
          >
            <iconos.empleados aria-hidden="true" />
            <strong>
              {d.resumen.alcance.tipo === 'EQUIPO'
                ? `Equipo: tus jefaturas autorizadas, ${d.resumen.alcance.personas} personas`
                : 'Alcance: toda la empresa'}
            </strong>
            <span>{periodoTexto}</span>
            <Actualizado fecha={d.resumen.actualizadoEn} cargando={consulta.isFetching} />
          </section>
          <IndicadoresComisiones datos={d.resumen} />
          {d.resumen.periodoAnterior && (
            <p className="campo-hint">
              Comparación: {mesVisible(d.resumen.periodoAnterior.desde)} a{' '}
              {mesVisible(d.resumen.periodoAnterior.hasta)}.
            </p>
          )}
          <div className="com-acciones" data-tour="com-exportar">
            <Button
              icono="exportar"
              variante="secundario"
              cargando={exportacion.isPending}
              onClick={() => exportacion.mutate('csv')}
            >
              Exportar CSV
            </Button>
            <Button
              icono="exportar"
              variante="secundario"
              cargando={exportacion.isPending}
              onClick={() => exportacion.mutate('excel')}
            >
              Exportar Excel
            </Button>
            <span className="campo-hint">
              Incluye todos los vendedores y meses filtrados, también fuera de esta página.
            </span>
          </div>
          {exportacion.error && (
            <p role="alert" className="campo-error">
              {exportacion.error.message}
            </p>
          )}
          {!d.resumen.indicadores.vendedoresConComision ? (
            <Card>
              <EmptyState
                icono="estadisticas"
                titulo={`Sin comisiones registradas en ${periodoTexto}`}
                descripcion="Prueba otro rango, estado o departamento. Solo se cuentan comisiones autorizadas; no necesitas haber confirmado un pago."
                accion={
                  usuario?.rol === 'RH' ? (
                    <Link className="enlace-icono" to="/novedades/comisiones/nuevo">
                      <iconos.crear aria-hidden="true" />
                      Cargar comisiones
                    </Link>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <>
              <Card data-tour="com-tendencia">
                <header className="com-cabecera">
                  <h2>Tendencia mensual</h2>
                  <label className="com-interruptor">
                    <input
                      type="checkbox"
                      checked={porVendedor}
                      onChange={(e) => setPorVendedor(e.target.checked)}
                    />
                    Mostrar por vendedor
                  </label>
                </header>
                {porVendedor && (
                  <p className="campo-hint">
                    Hasta cinco vendedores de la página actual. La matriz inferior muestra todos sus
                    importes. Total y comparación abarcan el conjunto completo.
                  </p>
                )}
                <TendenciaComisiones
                  puntos={d.tendencia.registros}
                  tabla={d.tabla}
                  porVendedor={porVendedor}
                />
                <DatosTendencia puntos={d.tendencia.registros} titulo="Tendencia mensual" />
              </Card>
              <div className="com-graficas">
                <Card data-tour="com-ranking">
                  <h2>Ranking de vendedores</h2>
                  <p className="campo-hint">
                    Diez primeras filas de esta página según el orden elegido. Consulta todos los
                    valores en la tabla inferior.
                  </p>
                  <RankingGrafica datos={d.ranking} />
                  <details className="com-datos">
                    <summary>Ver datos: ranking y reparto</summary>
                    <Table
                      titulo="Ranking y reparto de vendedores"
                      filas={d.ranking.registros}
                      clave={(f) => f.idEmpleado}
                      pagina={d.ranking.pagina}
                      limite={d.ranking.limite}
                      total={d.ranking.total}
                      orden={{ campo, direccion }}
                      onPagina={(p) =>
                        setParams({ ...filtros, pagina: String(p), ordenarPor: campo, direccion })
                      }
                      onOrden={(c, dir) => setParams({ ...filtros, ordenarPor: c, direccion: dir })}
                      columnas={[
                        {
                          id: 'nombre',
                          titulo: 'Vendedor',
                          ordenable: true,
                          render: (f) => (
                            <Button
                              icono="ver"
                              variante="texto"
                              onClick={() => abrir(f.idEmpleado)}
                            >
                              {f.nombre}
                            </Button>
                          ),
                        },
                        {
                          id: 'total',
                          titulo: 'Total',
                          ordenable: true,
                          render: (f) => moneda(f.total),
                        },
                        {
                          id: 'participacion',
                          titulo: 'Participación',
                          render: (f) => `${f.participacionPorcentual}%`,
                        },
                        {
                          id: 'variacion',
                          titulo: 'Variación',
                          render: (f) => (
                            <VariacionComisiones
                              valor={f.variacionPorcentual}
                              sinBase={f.sinBaseComparacion}
                              comparar={!!d.resumen.periodoAnterior}
                            />
                          ),
                        },
                      ]}
                    />
                  </details>
                </Card>
                <Card data-tour="com-reparto">
                  <h2>Reparto por vendedor</h2>
                  <p className="campo-hint">
                    Cinco primeras filas y resto de vendedores. Los nombres numerados, montos y
                    tabla identifican cada parte.
                  </p>
                  <RepartoGrafica datos={d.ranking} />
                  <DatosReparto datos={d.ranking} />
                  <p>
                    Total del conjunto: <strong>{moneda(d.ranking.totalComisiones)}</strong>.
                    Porcentajes exactos en «Ver datos: ranking y reparto».
                  </p>
                </Card>
              </div>
              <Card data-tour="com-matriz">
                <h2>Vendedor × mes</h2>
                <p className="campo-hint">
                  Mayor intensidad indica mayor importe; cada celda incluye el monto exacto. Los
                  totales mensuales incluyen todas las páginas. Pulsa un vendedor para ver su
                  historial.
                </p>
                <Table
                  titulo="Matriz mensual de comisiones"
                  filas={d.tabla.registros}
                  clave={(f) => f.idEmpleado}
                  pagina={d.tabla.pagina}
                  limite={d.tabla.limite}
                  total={d.tabla.total}
                  orden={{ campo, direccion }}
                  onPagina={(p) =>
                    setParams({ ...filtros, pagina: String(p), ordenarPor: campo, direccion })
                  }
                  onOrden={(c, dir) => setParams({ ...filtros, ordenarPor: c, direccion: dir })}
                  columnas={[
                    {
                      id: 'nombre',
                      titulo: 'Vendedor',
                      ordenable: true,
                      render: (f) => (
                        <>
                          <Button icono="ver" variante="texto" onClick={() => abrir(f.idEmpleado)}>
                            {f.nombre}
                          </Button>
                          <small className="block">
                            {f.codigo} · {f.departamento}
                          </small>
                        </>
                      ),
                    },
                    ...d.tabla.meses.map((mes, i) => ({
                      id: mes,
                      titulo: mesVisible(mes),
                      render: (f: api.TablaComisiones['registros'][number]) => {
                        const valor = f.serie[i]!.total;
                        const intensidad = new Decimal(d.tabla.totalesMensuales[i]!.total).isZero()
                          ? 0
                          : new Decimal(valor).div(d.tabla.totalesMensuales[i]!.total).toNumber();
                        return (
                          <span
                            className="com-calor"
                            data-nivel={
                              intensidad === 0
                                ? 0
                                : intensidad < 0.34
                                  ? 1
                                  : intensidad < 0.67
                                    ? 2
                                    : 3
                            }
                          >
                            {moneda(valor)}
                          </span>
                        );
                      },
                    })),
                    {
                      id: 'total',
                      titulo: 'Total',
                      ordenable: true,
                      render: (f) => <strong>{moneda(f.total)}</strong>,
                    },
                    {
                      id: 'promedioMensual',
                      titulo: 'Promedio mensual',
                      ordenable: true,
                      render: (f) => moneda(f.promedioMensual),
                    },
                  ]}
                />
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Totales de todos los vendedores"
                >
                  <table>
                    <caption>Totales de todos los vendedores · GTQ</caption>
                    <thead>
                      <tr>
                        {d.tabla.meses.map((m) => (
                          <th key={m} scope="col">
                            {mesVisible(m)}
                          </th>
                        ))}
                        <th scope="col">Total del rango</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {d.tabla.totalesMensuales.map((m) => (
                          <td key={m.mes}>{moneda(m.total)}</td>
                        ))}
                        <td>
                          <strong>{moneda(d.tabla.totalComisiones)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
              {seleccionado && (
                <div ref={detalleRef} tabIndex={-1} aria-label="Historial seleccionado">
                  <DetalleVendedor
                    key={`${filtroClave}:${seleccionado}`}
                    id={seleccionado}
                    filtros={filtros}
                    cerrar={() => setSeleccionado(undefined)}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
