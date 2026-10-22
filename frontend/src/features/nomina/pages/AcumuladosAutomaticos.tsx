import type { EstimacionFiscal } from '../api/nomina';
import { fechaVisible } from '../../../lib/validadores';
import { moneda } from '../../novedades/pages/NovedadesPage';

export function AcumuladosAutomaticos({
  estimaciones,
}: {
  estimaciones: { empleado: string; estimacion: EstimacionFiscal }[];
}) {
  if (!estimaciones.length) return null;
  return (
    <section className="banda-informativa my-4" data-tour="nomina-acumulados">
      <div className="min-w-0 w-full">
        <h3>Acumulados fiscales automáticos</h3>
        <p>
          Se completó la historia faltante de {estimaciones.length} empleado(s) con sus salarios e
          incentivo, fechas de ingreso y parámetros vigentes. Las aperturas y los pagos registrados
          tienen prioridad.
        </p>
        <p className="campo-hint">
          Estimación para el proyecto académico: el ISR anterior es teórico. Se reconstruyen solo
          salario e incentivo; las novedades del pago actual se calculan aparte.
        </p>
        <details className="mt-3">
          <summary>Ver desglose de acumulados calculados</summary>
          <div className="table-scroll my-3">
            <table>
              <caption>Importes estimados anteriores al periodo actual</caption>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Desde / hasta</th>
                  <th>Renta gravada</th>
                  <th>IGSS</th>
                  <th>ISR teórico</th>
                </tr>
              </thead>
              <tbody>
                {estimaciones.map(({ empleado, estimacion: e }) => (
                  <tr key={empleado}>
                    <td>{empleado}</td>
                    <td>
                      {fechaVisible(e.periodos[0]!.inicio)} al{' '}
                      {fechaVisible(e.periodos.at(-1)!.fin)}
                    </td>
                    <td className="whitespace-nowrap">{moneda(e.renta)}</td>
                    <td className="whitespace-nowrap">{moneda(e.igss)}</td>
                    <td className="whitespace-nowrap">{moneda(e.isr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {estimaciones.length === 1 && (
            <div className="table-scroll my-3">
              <table>
                <caption>Periodos estimados a partir del salario</caption>
                <thead>
                  <tr>
                    <th>Periodo</th>
                    <th>Renta gravada</th>
                    <th>IGSS</th>
                    <th>ISR teórico</th>
                  </tr>
                </thead>
                <tbody>
                  {estimaciones[0]!.estimacion.periodos.map((p) => (
                    <tr key={p.inicio}>
                      <td>
                        {fechaVisible(p.inicio)} al {fechaVisible(p.fin)}
                      </td>
                      <td>{moneda(p.renta)}</td>
                      <td>{moneda(p.igss)}</td>
                      <td>{moneda(p.isr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </div>
    </section>
  );
}
