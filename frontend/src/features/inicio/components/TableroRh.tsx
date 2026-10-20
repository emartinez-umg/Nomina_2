import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import * as api from '../api/estadisticas';
import {
  Actualizado,
  Alternador,
  EnlaceDetalle,
  EstadoConsulta,
  NumeroAnimado,
  Pestanas,
  Recuadro,
} from './RhCompartidos';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Tooltip } from '../../../components/ui/Tooltip';
import { Field } from '../../../components/forms/Field';
import { MonthField } from '../../../components/forms/MonthField';
import { fechaVisible, hoyGuatemala, moneda } from '../../../lib/validadores';
import { tokens } from '../../../styles/tokens';
import { iconos } from '../../../components/ui/icons';
import '../dashboard.css';

const frecuencia = { staleTime: 30000, refetchInterval: 60000 };
const grupos = [
  { valor: 'empleado', texto: 'Empleados', icono: 'empleados' },
  { valor: 'departamento', texto: 'Departamentos', icono: 'organizacion' },
] as const;
const metricas = [
  { valor: 'salarioBase', texto: 'Salario base' },
  { valor: 'comisiones', texto: 'Comisiones' },
  { valor: 'horasExtra', texto: 'Horas extra' },
  { valor: 'totalDevengado', texto: 'Total devengado' },
] as const;
const categorias: Record<api.Categoria, { texto: string; sigla: string; color: string }> = {
  IGSS_JUSTIFICADA: { texto: 'IGSS', sigla: 'IG', color: tokens.estadisticas.igss },
  JUSTIFICADA_CON_GOCE: { texto: 'Con goce', sigla: 'CG', color: tokens.estadisticas.conGoce },
  JUSTIFICADA_SIN_GOCE: { texto: 'Sin goce', sigla: 'SG', color: tokens.estadisticas.sinGoce },
  SIN_JUSTIFICAR: {
    texto: 'Sin justificación',
    sigla: 'SJ',
    color: tokens.estadisticas.sinJustificacion,
  },
};
function TopRemuneraciones() {
  const [agrupar, setAgrupar] = useState<api.Agrupacion>('empleado'),
    [metrica, setMetrica] = useState<api.Metrica>('totalDevengado'),
    [mes, setMes] = useState(hoyGuatemala().slice(0, 7));
  const reducir = useReducedMotion();
  const q = useQuery({
    queryKey: ['tablero-rh', 'remuneraciones', agrupar, metrica, mes],
    queryFn: ({ signal }) => api.remuneraciones({ agrupar, metrica, mes }, signal),
    ...frecuencia,
  });
  return (
    <Recuadro
      titulo="Top 5 de remuneraciones"
      icono="planilla"
      orden={0}
      tour="rh-remuneraciones"
      pie={<Actualizado fecha={q.data?.actualizadoEn} cargando={q.isFetching} />}
    >
      <Alternador
        etiqueta="Agrupar remuneraciones"
        valor={agrupar}
        opciones={grupos}
        onChange={setAgrupar}
      />
      <div className="rh-controles">
        <Field
          id="rh-metrica"
          label="Métrica"
          hint="Importes efectivamente devengados en pagos confirmados del mes; no incluye anticipos ni prestaciones."
          tipo="select"
        >
          <select
            id="rh-metrica"
            aria-describedby="rh-metrica-hint"
            value={metrica}
            onChange={(e) => setMetrica(api.metricaSchema.parse(e.target.value))}
          >
            {metricas.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.texto}
              </option>
            ))}
          </select>
        </Field>
        <MonthField
          name="rh-mes"
          label="Mes de remuneraciones"
          hint="Elige el mes y año de los pagos confirmados que deseas comparar."
          value={mes}
          onValueChange={(v) => {
            if (v) setMes(v);
          }}
        />
      </div>
      <EstadoConsulta consulta={q}>
        {(d) =>
          !d.registros.length ? (
            <EmptyState
              icono="planilla"
              titulo="Sin pagos para esta métrica"
              descripcion="Elige otro mes o revisa los pagos confirmados en Planilla."
              accion={<EnlaceDetalle to="/planilla">Revisar planilla</EnlaceDetalle>}
            />
          ) : (
            <ol className="rh-barras" aria-label="Ranking de remuneraciones">
              {d.registros.map((r) => {
                const [anio, numeroMes] = d.mes.split('-');
                const to = `/planilla?${new URLSearchParams({ historial: '1', anio: anio!, mes: String(Number(numeroMes)), [d.agrupar === 'empleado' ? 'idEmpleado' : 'idDepartamento']: String(r.id) })}`;
                return (
                  <li key={`${d.agrupar}:${d.metrica}:${r.id}`}>
                    <Link
                      to={to}
                      className="rh-fila-barra"
                      aria-label={`${r.posicion}. ${r.nombre}: ${moneda(r.valor)}. Ver pagos`}
                    >
                      <span className="rh-posicion">{r.posicion}</span>
                      <span className="rh-barra-datos">
                        <span className="rh-barra-etiqueta">
                          <strong>{r.nombre}</strong>
                          <span className="rh-importe">
                            <NumeroAnimado valor={r.valor} dinero />
                          </span>
                        </span>
                        <span className="rh-pista" aria-hidden="true">
                          <motion.span
                            className="rh-barra-monto"
                            style={{
                              width: `${(Number(r.valor) / Number(d.registros[0]!.valor)) * 100}%`,
                            }}
                            initial={reducir ? false : { scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{
                              duration: reducir ? 0 : 0.6,
                              delay: reducir ? 0 : r.posicion * 0.04,
                            }}
                          />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )
        }
      </EstadoConsulta>
      <p className="rh-nota">
        Pagos confirmados · {metricas.find((m) => m.valor === metrica)?.texto} · GTQ
      </p>
    </Recuadro>
  );
}
function Inasistencias() {
  const [agrupar, setAgrupar] = useState<api.Agrupacion>('empleado'),
    [periodo, setPeriodo] = useState<api.Periodo>('mes');
  const hoy = hoyGuatemala(),
    reducir = useReducedMotion();
  const q = useQuery({
    queryKey: ['tablero-rh', 'inasistencias', agrupar, periodo, hoy],
    queryFn: ({ signal }) => api.inasistencias({ agrupar, periodo, fecha: hoy }, signal),
    ...frecuencia,
  });
  return (
    <Recuadro
      titulo="Inasistencias"
      icono="ausencias"
      orden={1}
      tour="rh-inasistencias"
      pie={<Actualizado fecha={q.data?.actualizadoEn} cargando={q.isFetching} />}
    >
      <div className="rh-controles rh-controles-ausencias">
        <Alternador
          etiqueta="Agrupar inasistencias"
          valor={agrupar}
          opciones={grupos}
          onChange={setAgrupar}
        />
        <Field
          id="rh-periodo"
          label="Periodo de inasistencias"
          hint="Mes, trimestre o año que contiene hoy. Solo cuenta ausencias aprobadas y activas."
          tipo="select"
        >
          <select
            id="rh-periodo"
            aria-describedby="rh-periodo-hint"
            value={periodo}
            onChange={(e) => setPeriodo(api.periodoSchema.parse(e.target.value))}
          >
            <option value="mes">Mes actual</option>
            <option value="trimestre">Trimestre actual</option>
            <option value="anio">Año actual</option>
          </select>
        </Field>
      </div>
      <EstadoConsulta consulta={q}>
        {(d) => (
          <>
            <p className="rh-nota">
              {fechaVisible(d.inicio)} – {fechaVisible(d.fin)} ·{' '}
              <strong>{d.totalDias} días en total</strong>
            </p>
            {!d.registros.length ? (
              <EmptyState
                icono="calendario"
                titulo="Sin inasistencias aprobadas"
                descripcion="Prueba otro periodo o consulta los registros de ausencias."
                accion={
                  <EnlaceDetalle to="/novedades/ausencias">Consultar ausencias</EnlaceDetalle>
                }
              />
            ) : (
              <ol className="rh-barras" aria-label="Ranking de inasistencias">
                {d.registros.map((r) => {
                  const detalle = r.categorias
                    .map((c) => `${categorias[c.categoria].texto}: ${c.dias} días`)
                    .join(' · ');
                  const to = `/novedades/ausencias?${new URLSearchParams({ [d.agrupar === 'empleado' ? 'idEmpleado' : 'idDepartamento']: String(r.id), desde: d.inicio, hasta: d.fin, estado: 'APROBADA' })}`;
                  return (
                    <li key={`${d.agrupar}:${d.periodo}:${r.id}`}>
                      <Tooltip texto={detalle}>
                        <Link
                          to={to}
                          className="rh-fila-barra"
                          aria-label={`${r.posicion}. ${r.nombre}: ${r.totalDias} días. ${detalle}. Ver ausencias`}
                        >
                          <span className="rh-posicion">{r.posicion}</span>
                          <span className="rh-barra-datos">
                            <span className="rh-barra-etiqueta">
                              <strong>{r.nombre}</strong>
                              <span>{r.totalDias} días</span>
                            </span>
                            <motion.span
                              className="rh-pila"
                              aria-hidden="true"
                              style={{
                                width: `${(Number(r.totalDias) / Number(d.registros[0]!.totalDias)) * 100}%`,
                              }}
                              initial={reducir ? false : { scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              transition={{ duration: reducir ? 0 : 0.6 }}
                            >
                              {r.categorias
                                .filter((c) => Number(c.dias) > 0)
                                .map((c) => (
                                  <span
                                    key={c.categoria}
                                    className={`rh-segmento rh-${c.categoria}`}
                                    style={{
                                      width: `${(Number(c.dias) / Number(r.totalDias)) * 100}%`,
                                      backgroundColor: categorias[c.categoria].color,
                                    }}
                                  />
                                ))}
                            </motion.span>
                          </span>
                        </Link>
                      </Tooltip>
                    </li>
                  );
                })}
              </ol>
            )}
            <ul className="rh-leyenda" aria-label="Totales de días por categoría">
              {d.categorias.map((c) => (
                <li key={c.categoria}>
                  <span
                    className={`rh-muestra rh-${c.categoria}`}
                    style={{ backgroundColor: categorias[c.categoria].color }}
                    aria-hidden="true"
                  >
                    {categorias[c.categoria].sigla}
                  </span>
                  <span>
                    {categorias[c.categoria].texto}
                    <strong>{c.dias} días</strong>
                  </span>
                </li>
              ))}
            </ul>
            <p className="rh-nota">Top 5 · Leyenda: todos los registros, incluso fuera del top.</p>
          </>
        )}
      </EstadoConsulta>
    </Recuadro>
  );
}
function Vacaciones() {
  const [pestana, setPestana] = useState<'enCurso' | 'proximas'>('enCurso'),
    [dias, setDias] = useState(30),
    [pagina, setPagina] = useState(1);
  const q = useQuery({
    queryKey: ['tablero-rh', 'vacaciones', dias, pagina],
    queryFn: ({ signal }) => api.vacaciones(dias, pagina, signal),
    ...frecuencia,
  });
  return (
    <Recuadro
      titulo="Vacaciones"
      icono="calendario"
      orden={2}
      tour="rh-vacaciones"
      pie={<Actualizado fecha={q.data?.actualizadoEn} cargando={q.isFetching} />}
    >
      <EstadoConsulta consulta={q}>
        {(d) => (
          <>
            <div className="rh-destacado">
              <iconos.empleados aria-hidden="true" size={20} />
              <strong>
                <NumeroAnimado valor={d.ausentesHoy} />
              </strong>
              <span>{d.ausentesHoy === 1 ? 'persona ausente hoy' : 'personas ausentes hoy'}</span>
            </div>
            <Pestanas
              etiqueta="Estado de vacaciones"
              valor={pestana}
              opciones={[
                { valor: 'enCurso', texto: `En curso (${d.totalEnCurso})`, icono: 'tiempo' },
                { valor: 'proximas', texto: `Próximas (${d.totalProximas})`, icono: 'calendario' },
              ]}
              onChange={(v) => {
                setPestana(v);
                setPagina(1);
              }}
            >
              {pestana === 'proximas' && (
                <Field
                  id="rh-horizonte"
                  label="Próximas vacaciones"
                  hint="Vacaciones aprobadas que empiezan desde mañana dentro del plazo elegido."
                  tipo="select"
                >
                  <select
                    id="rh-horizonte"
                    value={dias}
                    aria-describedby="rh-horizonte-hint"
                    onChange={(e) => {
                      setDias(Number(e.target.value));
                      setPagina(1);
                    }}
                  >
                    {[30, 60, 90].map((n) => (
                      <option value={n} key={n}>
                        {n} días
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {!d[pestana].length ? (
                <EmptyState
                  icono="calendario"
                  titulo={
                    pestana === 'enCurso'
                      ? 'Sin vacaciones en curso'
                      : `Sin vacaciones en los próximos ${dias} días`
                  }
                  descripcion="Consulta la bandeja para revisar solicitudes pendientes o aprobadas."
                  accion={<EnlaceDetalle to="/vacaciones">Revisar vacaciones</EnlaceDetalle>}
                />
              ) : (
                <ol className="rh-linea-tiempo" aria-label="Personas de vacaciones">
                  {d[pestana].map((v) => (
                    <li key={v.id}>
                      <Link
                        to={`/vacaciones?${new URLSearchParams({ empleado: String(v.idEmpleado), estado: '', desde: v.inicio, hasta: v.fin })}`}
                      >
                        <strong>{v.nombre}</strong>
                        <span className="rh-chips">
                          <span>
                            {fechaVisible(v.inicio)} – {fechaVisible(v.fin)}
                          </span>
                          <span>{v.diasLaborales} días laborales</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
              {((pestana === 'enCurso' ? d.totalEnCurso : d.totalProximas) > d.limite ||
                pagina > 1) && (
                <nav className="rh-paginacion" aria-label="Páginas de vacaciones">
                  <Button
                    icono="anterior"
                    variante="texto"
                    disabled={pagina === 1}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <span>Página {pagina}</span>
                  <Button
                    icono="siguiente"
                    variante="texto"
                    disabled={
                      pagina * d.limite >=
                      (pestana === 'enCurso' ? d.totalEnCurso : d.totalProximas)
                    }
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </nav>
              )}
            </Pestanas>
            <p className="rh-nota">
              Ausentes hoy: solo días laborales; excluye descansos y feriados.
            </p>
          </>
        )}
      </EstadoConsulta>
    </Recuadro>
  );
}
function Celebraciones() {
  const [pestana, setPestana] = useState<'cumpleanos' | 'aniversarios'>('cumpleanos'),
    reducir = useReducedMotion();
  const q = useQuery({
    queryKey: ['tablero-rh', 'celebraciones'],
    queryFn: ({ signal }) => api.celebraciones(signal),
    ...frecuencia,
  });
  return (
    <Recuadro
      titulo="Cumpleaños y aniversarios"
      icono="celebracion"
      orden={3}
      tour="rh-celebraciones"
      pie={<Actualizado fecha={q.data?.actualizadoEn} cargando={q.isFetching} />}
    >
      <p className="rh-nota">Hoy y los próximos 30 días · Celebremos a nuestro equipo</p>
      <Pestanas
        etiqueta="Tipo de celebración"
        valor={pestana}
        opciones={[
          { valor: 'cumpleanos', texto: 'Cumpleaños', icono: 'celebracion' },
          { valor: 'aniversarios', texto: 'Aniversarios', icono: 'aniversario' },
        ]}
        onChange={setPestana}
      >
        <EstadoConsulta consulta={q}>
          {(d) =>
            !d[pestana].length ? (
              <EmptyState
                icono="celebracion"
                titulo="Sin celebraciones próximas"
                descripcion="Aquí verás las celebraciones del equipo dentro de los próximos 30 días."
                accion={<EnlaceDetalle to="/empleados">Consultar equipo</EnlaceDetalle>}
              />
            ) : (
              <ul className="rh-celebraciones" aria-label="Próximas celebraciones">
                {d[pestana].map((c) => (
                  <motion.li
                    key={c.idEmpleado}
                    className={c.esHoy ? 'rh-celebracion-hoy' : ''}
                    animate={c.esHoy && !reducir ? { scale: [1, 1.015, 1] } : { scale: 1 }}
                    transition={{ duration: reducir ? 0 : 1.2, repeat: reducir ? 0 : 1 }}
                  >
                    <Link to={`/empleados/${c.idEmpleado}`}>
                      <span className="rh-dia">
                        <span>{c.fecha.slice(8, 10)}</span>
                        <small>
                          {new Intl.DateTimeFormat('es-GT', {
                            month: 'short',
                            timeZone: 'America/Guatemala',
                          }).format(new Date(`${c.fecha}T12:00:00-06:00`))}
                        </small>
                      </span>
                      <span>
                        <strong>{c.nombre}</strong>
                        <small>
                          {'anios' in c
                            ? `${c.anios} ${c.anios === 1 ? 'año' : 'años'} en el equipo`
                            : 'Cumpleaños'}
                        </small>
                      </span>
                      {c.esHoy && (
                        <span className="rh-hoy">
                          <iconos.celebracion size={15} aria-hidden="true" />
                          ¡Hoy!
                        </span>
                      )}
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )
          }
        </EstadoConsulta>
      </Pestanas>
    </Recuadro>
  );
}
export function TableroRh() {
  return (
    <div className="rh-cuatro" role="region" aria-label="Estadísticas de Recursos Humanos">
      <TopRemuneraciones />
      <Inasistencias />
      <Vacaciones />
      <Celebraciones />
    </div>
  );
}
