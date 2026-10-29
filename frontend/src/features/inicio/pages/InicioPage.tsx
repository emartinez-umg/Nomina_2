import { EstadoBadge } from '../../../components/ui/EstadoBadge';
import { etiquetaCodigo } from '../../../lib/estados';
import { nombreUsuario } from '../../../lib/nombre';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { useSession } from '../../../app/session';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Badge } from '../../../components/ui/Badge';
import { iconos } from '../../../components/ui/icons';
import type { NombreIcono } from '../../../components/ui/icons';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaInicio } from '../help/pasos';
import { consultar } from '../api/tableros';
import type { AuditoriaFila } from '../api/tableros';
import { fechaHora } from '../../comunicacion/api/comunicacion';
import type { Fila } from '../../comunicacion/api/comunicacion';
import { lazy, Suspense } from 'react';
const RhGraficas = lazy(() => import('./RhGraficas').then((m) => ({ default: m.RhGraficas })));
import { moneda } from '../../../lib/validadores';
import { hoyGuatemala, fechaVisible } from '../../../lib/validadores';
import { TableroRh } from '../components/TableroRh';
import { Tooltip } from '../../../components/ui/Tooltip';
export function Indicador({
  titulo,
  valor,
  icono,
  detalle,
  definicion,
  parcial,
}: {
  titulo: string;
  valor: string | number;
  icono: NombreIcono;
  detalle?: string;
  definicion?: string;
  parcial?: boolean;
}) {
  const I = iconos[icono];
  return (
    <Card className="indicador">
      <I aria-hidden="true" />
      <div>
        <p>
          {titulo}{' '}
          {definicion && (
            <Tooltip texto={definicion}>
              <iconos.informacion
                aria-label={`Definición de ${titulo}`}
                className="inline h-4 w-4"
              />
            </Tooltip>
          )}
        </p>
        <strong>{valor}</strong>
        {detalle && <small>{detalle}</small>}
        {parcial && <Badge tono="aviso">Parcial: solo anticipo</Badge>}
      </div>
    </Card>
  );
}
export function ResumenComunicaciones({
  tipo,
  filas,
  total,
}: {
  tipo: 'anuncios' | 'eventos';
  filas: Fila[];
  total: number;
}) {
  const nav = useNavigate();
  return (
    <Card data-tour={tipo}>
      <div className="flex justify-between items-center gap-3">
        <h2>{tipo === 'anuncios' ? 'Anuncios' : 'Próximos eventos'}</h2>
        <Button icono="ver" variante="texto" onClick={() => nav(`/mis-gestiones/${tipo}`)}>
          Ver todos ({total})
        </Button>
      </div>
      {!filas.length ? (
        <EmptyState
          icono={tipo === 'anuncios' ? 'notificaciones' : 'calendario'}
          titulo={tipo === 'anuncios' ? 'Sin anuncios vigentes' : 'Sin eventos próximos'}
          descripcion="Aquí aparecerán las publicaciones dirigidas a ti."
        />
      ) : (
        filas.map((f) => (
          <article className="comunicacion-resumen" key={f.id}>
            <h3>{f.titulo}</h3>
            <p className="text-secundario text-sm">
              {fechaHora(f.inicio)} · {fechaHora(f.fin)}
              {f.lugar.trim() && ` · ${f.lugar}`}
            </p>
            <p className="texto-publicacion">
              {f.contenido.length > 260 ? `${f.contenido.slice(0, 260)}…` : f.contenido}
            </p>
            <Button
              icono="ver"
              variante="texto"
              onClick={() => nav(`/mis-gestiones/${tipo}?ver=${f.id}`)}
            >
              Leer publicación
            </Button>
          </article>
        ))
      )}
    </Card>
  );
}
export function BitacoraResumen({ filas }: { filas: AuditoriaFila[] }) {
  return (
    <div className="table-scroll" role="region" aria-label="Bitácora reciente" tabIndex={0}>
      <table>
        <caption className="sr-only">Últimas acciones auditadas</caption>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Actor / rol</th>
            <th>Acción</th>
            <th>Entidad</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td>{fechaHora(f.fecha)}</td>
              <td>
                {f.idUsuario ?? 'Sistema'} · {f.rol ?? 'Sistema'}
              </td>
              <td>{etiquetaCodigo(f.accion)}</td>
              <td>
                {etiquetaCodigo(f.entidad)} · {f.idEntidad ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const gestiones: { titulo: string; icono: NombreIcono; ruta: string }[] = [
  { titulo: 'Boletas de pago', icono: 'planilla', ruta: '/mis-gestiones/boletas' },
  ...[
    ['Constancia laboral', 'CONSTANCIA_LABORAL'],
    ['Certificado IGSS', 'CERTIFICADO_IGSS'],
    ['Constancia INTECAP', 'CONSTANCIA_INTECAP'],
    ['Gafete', 'GAFETE'],
    ['Parqueo', 'PARQUEO'],
  ].map(([titulo, tipo]) => ({
    titulo: titulo!,
    icono: 'documento' as const,
    ruta: `/mis-gestiones/solicitudes?nueva=${tipo}`,
  })),
  { titulo: 'Vacaciones', icono: 'calendario', ruta: '/mis-gestiones/vacaciones' },
  { titulo: 'Actualizar mis datos', icono: 'usuario', ruta: '/mis-gestiones/datos' },
];
export function InicioPage() {
  const cache = useQueryClient();
  const estadisticasConsultando = useIsFetching({ queryKey: ['tablero-rh'] });
  const { usuario } = useSession(),
    nav = useNavigate();
  usePageHelp(ayudaInicio, usuario?.rol);
  const q = useQuery({
    queryKey: ['tablero', usuario?.rol],
    refetchInterval: 60000,
    queryFn: ({ signal }) => consultar(usuario!.rol, signal),
    enabled: !!usuario,
  });
  const titulo =
    usuario?.rol === 'EMPLEADO'
      ? 'Mis gestiones'
      : usuario?.rol === 'RH'
        ? 'Recursos Humanos'
        : 'Administración';
  return (
    <>
      <div className="flex justify-between gap-3 items-start">
        <div>
          {usuario?.rol === 'RH' ? (
            <>
              <h1 className="rh-saludo">Hola, {nombreUsuario(usuario)}</h1>
              <p className="rh-fecha">
                {new Intl.DateTimeFormat('es-GT', {
                  weekday: 'long',
                  timeZone: 'America/Guatemala',
                }).format(new Date(`${hoyGuatemala()}T12:00:00-06:00`))}
                , {fechaVisible(hoyGuatemala())}
              </p>
            </>
          ) : (
            <h1>{titulo}</h1>
          )}
        </div>
        <Button
          icono="actualizar"
          variante="secundario"
          cargando={q.isFetching || (usuario?.rol === 'RH' && estadisticasConsultando > 0)}
          onClick={() => {
            void q.refetch();
            void cache.invalidateQueries({ queryKey: ['tablero-rh'] });
          }}
        >
          Actualizar
        </Button>
      </div>
      <Breadcrumbs items={[{ titulo: 'Nómina' }, { titulo }]} />
      {usuario?.rol === 'RH' && <TableroRh />}
      {q.isPending ? (
        <Skeleton lineas={8} />
      ) : q.error ? (
        <EmptyState
          titulo="No se pudo cargar el tablero"
          descripcion={q.error.message}
          accion={
            <Button icono="actualizar" onClick={() => void q.refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : (
        q.data &&
        (() => {
          const d = q.data;
          return (
            <>
              {d.rol !== 'RH' && (
                <div className="banda-informativa">
                  <iconos.informacion aria-hidden="true" />
                  <span>
                    Bienvenido, {usuario ? nombreUsuario(usuario) : ''} · Datos al{' '}
                    {fechaHora(d.ahora)} (Guatemala)
                  </span>
                </div>
              )}
              {d.rol === 'RH' ? (
                <>
                  <section
                    data-tour="indicadores"
                    className="indicadores-grid"
                    aria-label="Indicadores de Recursos Humanos"
                  >
                    <Indicador
                      titulo="Empleados activos"
                      valor={d.indicadores.activos}
                      icono="empleados"
                    />
                    <Indicador
                      titulo="Nómina bruta del mes"
                      valor={d.nominaMes.calculada ? moneda(d.nominaMes.ingresos) : 'Sin calcular'}
                      icono="planilla"
                      detalle={d.nominaMes.mes.split('-').reverse().join('/')}
                      parcial={d.nominaMes.parcial}
                      definicion="Ingresos devengados del mes, después de ausencias sin goce y antes de deducciones. El pago ya incluye lo anticipado: no se suma el anticipo otra vez. Si falta el pago de algún empleado, se incluye solo su anticipo y se marca parcial."
                    />
                    <Indicador
                      titulo="Nómina neta del mes"
                      valor={d.nominaMes.calculada ? moneda(d.nominaMes.neto) : 'Sin calcular'}
                      icono="planilla"
                      parcial={d.nominaMes.parcial}
                      definicion="Suma del neto del anticipo y del neto del pago mensual. Incluye las deducciones reales (IGSS, ISR y otros); Anticipo ya pagado es un neteo y no un descuento. Excluye Bono 14 y Aguinaldo."
                    />
                    <Indicador
                      titulo="Aportes patronales"
                      valor={d.nominaMes.calculada ? moneda(d.nominaMes.patronal) : 'Sin calcular'}
                      icono="planilla"
                      detalle="IGSS, IRTRA e INTECAP informativos"
                    />
                    <Indicador
                      titulo="Solicitudes pendientes"
                      valor={d.indicadores.solicitudes}
                      icono="documento"
                      detalle="Incluye solicitudes de vacaciones"
                    />
                    <Indicador
                      titulo="Vacaciones por aprobar"
                      valor={d.indicadores.vacaciones}
                      icono="calendario"
                    />
                    <Indicador
                      titulo="Altas del mes"
                      valor={d.indicadores.altas}
                      icono="crear"
                      detalle="Ingresos efectivos hasta hoy"
                    />
                    <Indicador
                      titulo="Bajas del mes"
                      valor={d.indicadores.bajas}
                      icono="usuario"
                      detalle="Egresos efectivos hasta hoy"
                    />
                  </section>
                  <section
                    data-tour="accesos"
                    className="accesos-rapidos"
                    aria-label="Accesos rápidos"
                  >
                    {[
                      ['Empleados', '/empleados', 'empleados'],
                      ['Planilla', '/planilla', 'planilla'],
                      ['Solicitudes', '/solicitudes', 'documento'],
                      ['Vacaciones', '/vacaciones', 'calendario'],
                      ['Publicar anuncio', '/comunicacion/anuncios', 'notificaciones'],
                      ['Agenda de eventos', '/comunicacion/eventos', 'calendario'],
                    ].map(([t, r, i]) => (
                      <Button key={r} icono={i as NombreIcono} onClick={() => nav(r!)}>
                        {t}
                      </Button>
                    ))}
                  </section>
                  <Suspense fallback={<Skeleton lineas={6} />}>
                    <RhGraficas departamentos={d.departamentos} evolucion={d.evolucion} />
                  </Suspense>
                  <div className="my-6">
                    <Card data-tour="alertas">
                      <h2>Alertas operativas</h2>
                      {!d.periodo && (
                        <p className="alerta-tablero">
                          No existe una quincena para hoy. Abre Planilla para crearla.
                        </p>
                      )}
                      {d.alertas.length ? (
                        d.alertas.map((a) => (
                          <article className="alerta-tablero" key={`${a.tipo}:${a.id}`}>
                            <iconos.error aria-hidden="true" />
                            <div>
                              <strong>{a.mensaje}</strong>
                              <p>{fechaHora(a.fecha)}</p>
                              <Button
                                icono="ver"
                                variante="texto"
                                onClick={() =>
                                  nav(
                                    a.tipo === 'PERIODO'
                                      ? '/planilla'
                                      : a.tipo === 'SIN_JEFE'
                                        ? '/catalogos/jefaturas'
                                        : a.tipo === 'SIN_JEFATURA'
                                          ? '/empleados?sinJefatura=1'
                                          : `/empleados/${a.id}`,
                                  )
                                }
                              >
                                Revisar
                              </Button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="my-4 text-secundario">
                          Sin alertas de periodos, contratos, perfiles incompletos o jefaturas.
                        </p>
                      )}
                      <p className="campo-hint">
                        Hasta 50 alertas: periodos abiertos, contratos por vencer o vencidos y
                        empleados sin salario, sin jefatura activa y jefaturas sin jefe activo.
                      </p>
                    </Card>
                  </div>
                </>
              ) : d.rol === 'EMPLEADO' ? (
                <>
                  <section data-tour="indicadores" className="indicadores-grid portal-indicadores">
                    <Indicador
                      titulo="Vacaciones disponibles"
                      valor={
                        d.saldo.disponible === null ? 'Por revisar' : `${d.saldo.disponible} días`
                      }
                      icono="calendario"
                      detalle={
                        d.saldo.mensaje ??
                        `Acumulados: ${d.saldo.acumulado} · Tomados/aprobados: ${d.saldo.tomados} · Solicitables: ${d.saldo.solicitables} días completos`
                      }
                    />
                    <Indicador
                      titulo="Última boleta"
                      valor={d.ultimaBoleta ? moneda(d.ultimaBoleta.neto) : 'Aún no disponible'}
                      icono="planilla"
                      detalle={
                        d.ultimaBoleta
                          ? `${fechaHora(d.ultimaBoleta.inicio)} – ${fechaHora(d.ultimaBoleta.fin)} · Neto`
                          : 'Aparece cuando RRHH cierra la nómina'
                      }
                    />
                  </section>
                  <section
                    className="gestiones-grid mb-6"
                    data-tour="accesos"
                    aria-label="Gestiones disponibles"
                  >
                    {gestiones.map((a) => {
                      const I = iconos[a.icono];
                      return (
                        <Card key={a.titulo} className="gestiones-tarjeta">
                          <I aria-hidden="true" className="h-10 w-10 text-primario" />
                          <h2>{a.titulo}</h2>
                          <Button icono="siguiente" onClick={() => nav(a.ruta)}>
                            {a.ruta.includes('?nueva=') ? 'Solicitar' : 'Abrir'}
                          </Button>
                        </Card>
                      );
                    })}
                  </section>
                  <div className="tablero-dos">
                    <ResumenComunicaciones
                      tipo="anuncios"
                      filas={d.anuncios.registros}
                      total={d.anuncios.total}
                    />
                    <ResumenComunicaciones
                      tipo="eventos"
                      filas={d.eventos.registros}
                      total={d.eventos.total}
                    />
                  </div>
                </>
              ) : (
                <>
                  <section
                    className="indicadores-grid"
                    data-tour="indicadores"
                    aria-label="Indicadores de administración"
                  >
                    {d.usuarios.map((u) => (
                      <Indicador
                        key={u.rol}
                        titulo={`Usuarios ${u.rol}`}
                        valor={u.activos}
                        icono="empleados"
                        detalle={`${u.total} registrados · ${u.total - u.activos} inactivos`}
                      />
                    ))}
                    <Indicador
                      titulo="Sesiones activas"
                      valor={d.sistema.sesionesActivas}
                      icono="seguridad"
                    />
                  </section>
                  <Card data-tour="sistema" className="mb-6">
                    <h2>Estado del sistema</h2>
                    <div className="flex flex-wrap gap-4 my-4">
                      <EstadoBadge
                        estado={
                          d.sistema.objetosInvalidos || d.sistema.migracionesPendientes
                            ? 'REQUIERE_REVISION'
                            : 'OPERATIVO'
                        }
                      />
                      <span>
                        Oracle {d.sistema.baseDatos.toLowerCase()} · modo {d.sistema.modo} · esquema
                        V{String(d.sistema.version ?? 0).padStart(3, '0')}
                      </span>
                    </div>
                    <p>
                      {d.sistema.objetosInvalidos} objetos inválidos ·{' '}
                      {d.sistema.migracionesPendientes} migraciones sin completar
                    </p>
                    <Button icono="salud" variante="texto" onClick={() => nav('/salud')}>
                      Consultar conectividad
                    </Button>
                  </Card>
                  <Card data-tour="sesiones" className="mb-6">
                    <h2>Sesiones recientes</h2>
                    <div
                      className="table-scroll"
                      role="region"
                      aria-label="Sesiones recientes"
                      tabIndex={0}
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Persona</th>
                            <th>Rol</th>
                            <th>Última actividad</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.sesiones.map((s) => (
                            <tr key={s.id}>
                              <td>{s.usuario}</td>
                              <td>{etiquetaCodigo(s.rol)}</td>
                              <td>{fechaHora(s.fecha)}</td>
                              <td>
                                <EstadoBadge estado={s.vigente ? 'ACTIVA' : 'FINALIZADA'} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  <Card data-tour="bitacora">
                    <div className="flex justify-between gap-3 items-center">
                      <h2>Bitácora reciente</h2>
                      <Button icono="buscar" onClick={() => nav('/admin/bitacora')}>
                        Consultar bitácora
                      </Button>
                    </div>
                    <BitacoraResumen filas={d.bitacora} />
                  </Card>
                </>
              )}
            </>
          );
        })()
      )}
    </>
  );
}
