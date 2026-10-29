import type { InformeColisiones } from '../api/vacaciones';
import { EstadoBadge } from '../../../components/ui/EstadoBadge';
import { Tooltip } from '../../../components/ui/Tooltip';
import { iconos } from '../../../components/ui/icons';
import { fechaVisible } from '../../../lib/validadores';

export function InsigniaColisiones({ cantidad }: { cantidad: number }) {
  if (!cantidad) return null;
  return (
    <Tooltip
      texto={`${cantidad} solicitudes de otros empleados coinciden en fechas y departamento o centro de trabajo. Revisa el detalle antes de aprobar; la advertencia no bloquea por sí sola.`}
    >
      <span className="badge badge-aviso">⚠ {cantidad} colisiones</span>
    </Tooltip>
  );
}
export function PanelColisiones({
  informe,
  historico = false,
}: {
  informe: InformeColisiones;
  historico?: boolean;
}) {
  const Icono = iconos.advertencia;
  if (!informe.colisiones.length)
    return (
      <p className="campo-hint my-4" data-tour="vacaciones-colisiones">
        No hay colisiones de vacaciones vigentes.
      </p>
    );
  const dias = Math.max(1, informe.lineaTiempo.length);
  const posicion = (fecha: string) =>
    Math.round((Date.parse(fecha) - Date.parse(informe.inicio)) / 86400000);
  return (
    <section
      className="vacaciones-colisiones my-4"
      aria-label={historico ? 'Colisiones al aprobar' : 'Advertencia de colisiones'}
      data-tour="vacaciones-colisiones"
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <Icono aria-hidden="true" size={20} />
        {historico ? 'Colisiones registradas al aprobar' : 'Advertencia de colisiones'}
      </h3>
      <p>
        {informe.colisiones.length}{' '}
        {informe.colisiones.length === 1 ? 'solicitud coincide' : 'solicitudes coinciden'} con este
        rango.{' '}
        {historico
          ? 'Esta copia conserva lo que RRHH confirmó.'
          : 'Puedes aprobar de todos modos si el saldo alcanza.'}
      </p>
      <p className="my-3">
        <strong>
          Máximo de personas ausentes: {informe.ocupacion.maximoAusentes} de{' '}
          {informe.ocupacion.tamanoEquipo}
        </strong>
        {informe.ocupacion.fechaMaximo ? ` el ${fechaVisible(informe.ocupacion.fechaMaximo)}` : ''}.
      </p>
      <p className="campo-hint">
        Equipo: unión del departamento y del centro de trabajo, sin duplicar personas. Incluye esta
        solicitud y las pendientes como ausencias potenciales. Los días coincidentes son naturales;
        no cambian el consumo de saldo.
      </p>
      <ul className="my-4 space-y-4">
        {informe.colisiones.map((c) => (
          <li key={c.idSolicitud}>
            <strong>
              {c.empleado} · {c.codigo}
            </strong>
            <p>
              {c.departamento} · {c.centro ?? 'Sin centro de trabajo'} · {c.tipoCoincidencia}
            </p>
            <p>
              {c.codigoSolicitud} · {fechaVisible(c.inicio)} al {fechaVisible(c.fin)} ·{' '}
              {c.diasCoincidentes}{' '}
              {c.diasCoincidentes === 1 ? 'día coincidente' : 'días coincidentes'} (
              {fechaVisible(c.inicioCoincidencia)} al {fechaVisible(c.finCoincidencia)})
            </p>
            <EstadoBadge estado={c.estado} />
          </li>
        ))}
      </ul>
      <figure aria-label="Línea de tiempo de colisiones">
        <figcaption className="font-semibold">
          Línea de tiempo · {fechaVisible(informe.inicio)} al {fechaVisible(informe.fin)}
        </figcaption>
        <p className="campo-hint">
          Cada barra marca los días coincidentes dentro del rango revisado.
        </p>
        <div className="my-3 space-y-3">
          {informe.colisiones.map((c) => (
            <div key={c.idSolicitud}>
              <p className="text-sm">
                {c.codigo} · {c.empleado} · {fechaVisible(c.inicioCoincidencia)}–
                {fechaVisible(c.finCoincidencia)}
              </p>
              <div className="colision-pista" aria-hidden="true">
                <div
                  className={`colision-barra ${c.estado === 'EN_PROCESO' ? 'colision-pendiente' : ''}`}
                  style={{
                    marginLeft: `${(posicion(c.inicioCoincidencia) * 100) / dias}%`,
                    width: `${(c.diasCoincidentes * 100) / dias}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="campo-hint">Barra sólida: aprobada. Barra con trama: en proceso.</p>
        <details>
          <summary className="cursor-pointer">Ver ocupación por día</summary>
          <div className="table-scroll">
            <table>
              <caption>Personas únicas por día, incluida la solicitud revisada</caption>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Aprobadas</th>
                  <th>En proceso</th>
                  <th>Total potencial</th>
                </tr>
              </thead>
              <tbody>
                {informe.lineaTiempo.map((d) => (
                  <tr key={d.fecha}>
                    <td>{fechaVisible(d.fecha)}</td>
                    <td>{d.aprobadas}</td>
                    <td>{d.enProceso}</td>
                    <td>
                      {d.ausentes} de {informe.ocupacion.tamanoEquipo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </figure>
    </section>
  );
}
