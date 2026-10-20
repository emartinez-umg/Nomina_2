import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Card } from '../../../components/ui/Card';
import { tokens } from '../../../styles/tokens';
import type { z } from 'zod';
import type { rhSchema } from '../api/tableros';
import { fechaHora } from '../../comunicacion/api/comunicacion';
import { moneda } from '../../../lib/validadores';
import { useReducedMotion } from 'framer-motion';
type Rh = z.infer<typeof rhSchema>;
export function RhGraficas({
  departamentos,
  evolucion,
}: {
  departamentos: Rh['departamentos'];
  evolucion: Rh['evolucion'];
}) {
  const reducir = useReducedMotion();
  // Solo la escala del gráfico usa Number; los importes de API y etiquetas conservan decimales.
  const datos = evolucion.map((p) => ({
    ...p,
    etiqueta: fechaHora(p.inicio),
    brutoGrafica: p.bruto === null ? null : Number(p.bruto),
    netoGrafica: p.neto === null ? null : Number(p.neto),
  }));
  return (
    <div className="tablero-dos" data-tour="graficas">
      <Card>
        <h2>Empleados por departamento</h2>
        {departamentos.length ? (
          <>
            <div className="grafica-tablero">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departamentos} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    isAnimationActive={!reducir}
                    dataKey="cantidad"
                    name="Empleados activos"
                    fill={tokens.colores.primario}
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details>
              <summary>Ver datos de la gráfica</summary>
              <ul>
                {departamentos.map((d) => (
                  <li key={d.nombre}>
                    {d.nombre}: {d.cantidad}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <p className="my-6 text-secundario">Registra empleados para ver su distribución.</p>
        )}
      </Card>
      <Card>
        <h2>Evolución de nómina</h2>
        <p className="campo-hint">
          Últimos seis periodos existentes · versión actual; abiertos son provisionales
        </p>
        {datos.length ? (
          <>
            <div className="grafica-tablero">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={datos} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(n) => `Q${Number(n) / 1000}k`} width={65} />
                  <Tooltip formatter={(v) => moneda(String(v ?? 0))} />
                  <Legend />
                  <Line
                    isAnimationActive={!reducir}
                    type="monotone"
                    dataKey="brutoGrafica"
                    name="Bruto"
                    stroke={tokens.colores.marca}
                    strokeWidth={3}
                    connectNulls={false}
                  />
                  <Line
                    isAnimationActive={!reducir}
                    type="monotone"
                    dataKey="netoGrafica"
                    name="Neto"
                    stroke={tokens.colores.primario}
                    strokeWidth={3}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <details>
              <summary>Ver importes exactos y estados</summary>
              <ul>
                {evolucion.map((p) => (
                  <li key={p.id}>
                    {fechaHora(p.inicio)} · {p.estado}: bruto{' '}
                    {p.bruto === null ? 'sin calcular' : moneda(p.bruto)}, neto{' '}
                    {p.neto === null ? 'sin calcular' : moneda(p.neto)}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <p className="my-6 text-secundario">
            Crea y calcula periodos en Planilla para ver su evolución.
          </p>
        )}
      </Card>
    </div>
  );
}
