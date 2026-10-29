import { useReducedMotion } from 'framer-motion';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Decimal } from 'decimal.js';
import { tokens } from '../../styles/tokens';
import { moneda } from '../../lib/validadores';
import type { PuntoComisiones, TablaComisiones, RankingComisiones } from './api';
export const mesVisible = (mes: string) =>
  new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${mes}-01T12:00:00Z`),
  );
const colores = [
  tokens.colores.marca,
  tokens.colores.primario,
  tokens.colores.acento,
  tokens.colores.peligro,
  tokens.colores.aviso,
];
export function TendenciaComisiones({
  puntos,
  tabla,
  porVendedor = false,
  equipo = false,
}: {
  puntos: (PuntoComisiones & { promedioEquipo?: string })[];
  tabla?: TablaComisiones;
  porVendedor?: boolean;
  equipo?: boolean;
}) {
  const reducir = useReducedMotion();
  const personas = porVendedor ? (tabla?.registros.slice(0, 5) ?? []) : [];
  const datos = puntos.map((m, i) => ({
    mes: m.mes,
    Total: Number(m.total),
    ...(m.totalAnterior === undefined ? {} : { Anterior: Number(m.totalAnterior) }),
    ...(equipo ? { 'Promedio del equipo': Number(m.promedioEquipo) } : {}),
    ...Object.fromEntries(
      personas.map((p) => [`v${p.idEmpleado}`, Number(p.serie[i]?.total ?? 0)]),
    ),
  }));
  return (
    <div className="com-grafica" aria-hidden="true">
      <ResponsiveContainer width="100%" height={300} minWidth={0}>
        <LineChart
          data={datos}
          margin={{ top: 12, right: 20, bottom: 12, left: 12 }}
          accessibilityLayer={false}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="mes"
            tickFormatter={(m: string) => mesVisible(m).replace(' de ', ' ')}
            minTickGap={32}
          />
          <YAxis
            width={70}
            tickFormatter={(v: number) =>
              new Intl.NumberFormat('es-GT', { notation: 'compact' }).format(v)
            }
          />
          <Tooltip
            formatter={(v) => moneda(String(v))}
            labelFormatter={(m) => mesVisible(String(m))}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="Total"
            name={equipo ? 'Vendedor' : 'Total'}
            stroke={tokens.colores.marca}
            strokeWidth={3}
            dot={{ r: 4 }}
            isAnimationActive={!reducir}
          />
          {puntos[0]?.totalAnterior !== undefined && (
            <Line
              type="monotone"
              dataKey="Anterior"
              name="Periodo anterior"
              stroke={tokens.colores.secundario}
              strokeDasharray="7 4"
              dot={{ r: 3 }}
              isAnimationActive={!reducir}
            />
          )}
          {equipo && (
            <Line
              dataKey="Promedio del equipo"
              stroke={tokens.colores.primario}
              strokeDasharray="3 3"
              strokeWidth={2}
              isAnimationActive={!reducir}
            />
          )}
          {personas.map((p, i) => (
            <Line
              key={p.idEmpleado}
              dataKey={`v${p.idEmpleado}`}
              name={`${i + 1}. ${p.nombre}`}
              stroke={colores[i]!}
              strokeDasharray={`${i + 2} 3`}
              dot={{ r: i + 2 }}
              isAnimationActive={!reducir}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function RankingGrafica({ datos }: { datos: RankingComisiones }) {
  const reducir = useReducedMotion();
  return (
    <div className="com-grafica" aria-hidden="true">
      <ResponsiveContainer width="100%" height={300} minWidth={0}>
        <BarChart
          layout="vertical"
          data={datos.registros
            .slice(0, 10)
            .map((f) => ({ nombre: `${f.posicion}. ${f.nombre}`, total: Number(f.total) }))}
          margin={{ right: 20 }}
          accessibilityLayer={false}
        >
          <XAxis
            type="number"
            tickFormatter={(v: number) =>
              new Intl.NumberFormat('es-GT', { notation: 'compact' }).format(v)
            }
          />
          <YAxis type="category" dataKey="nombre" width={140} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => moneda(String(v))} />
          <Bar
            dataKey="total"
            name="Comisiones (Q)"
            fill={tokens.colores.primario}
            radius={[0, 5, 5, 0]}
            isAnimationActive={!reducir}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
function partesReparto(datos: RankingComisiones) {
  const seleccion = datos.registros.slice(0, 5);
  const resto = new Decimal(datos.totalComisiones).minus(
    seleccion.reduce((s, f) => s.plus(f.total), new Decimal(0)),
  );
  return [
    ...seleccion.map((f) => ({
      nombre: `${f.posicion}. ${f.nombre}`,
      total: f.total,
      porcentaje: f.participacionPorcentual,
    })),
    ...(resto.gt(0)
      ? [
          {
            nombre: 'Resto de vendedores',
            total: resto.toFixed(2),
            porcentaje: resto
              .div(datos.totalComisiones)
              .mul(100)
              .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
              .toFixed(2),
          },
        ]
      : []),
  ];
}
export function DatosReparto({ datos }: { datos: RankingComisiones }) {
  return (
    <details className="com-datos">
      <summary>Ver datos: reparto por vendedor</summary>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Reparto por vendedor">
        <table>
          <caption>Reparto por vendedor · GTQ</caption>
          <thead>
            <tr>
              <th scope="col">Vendedor</th>
              <th scope="col">Total</th>
              <th scope="col">Participación</th>
            </tr>
          </thead>
          <tbody>
            {partesReparto(datos).map((p) => (
              <tr key={p.nombre}>
                <th scope="row">{p.nombre}</th>
                <td>{moneda(p.total)}</td>
                <td>{p.porcentaje}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
export function RepartoGrafica({ datos }: { datos: RankingComisiones }) {
  const reducir = useReducedMotion();
  const partes = partesReparto(datos).map((p) => ({ ...p, total: Number(p.total) }));
  return (
    <div className="com-grafica" aria-hidden="true">
      <ResponsiveContainer width="100%" height={300} minWidth={0}>
        <PieChart accessibilityLayer={false}>
          <Pie
            rootTabIndex={-1}
            data={partes}
            dataKey="total"
            nameKey="nombre"
            innerRadius={55}
            outerRadius={90}
            isAnimationActive={!reducir}
          >
            {partes.map((p, i) => (
              <Cell
                key={p.nombre}
                fill={colores[i % colores.length]!}
                stroke="white"
                strokeWidth={3}
              />
            ))}
          </Pie>
          <Tooltip formatter={(v) => moneda(String(v))} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
export function DatosTendencia({
  puntos,
  titulo,
  equipo = false,
}: {
  puntos: (PuntoComisiones & { promedioEquipo?: string })[];
  titulo: string;
  equipo?: boolean;
}) {
  return (
    <details className="com-datos">
      <summary>Ver datos: {titulo}</summary>
      <div className="table-scroll" role="region" aria-label={titulo} tabIndex={0}>
        <table>
          <caption>{titulo} · GTQ</caption>
          <thead>
            <tr>
              <th scope="col">Mes</th>
              <th scope="col">Total</th>
              {puntos[0]?.totalAnterior !== undefined && (
                <>
                  <th scope="col">Mes anterior equivalente</th>
                  <th scope="col">Total anterior</th>
                </>
              )}
              {equipo && <th scope="col">Promedio del equipo</th>}
            </tr>
          </thead>
          <tbody>
            {puntos.map((m) => (
              <tr key={m.mes}>
                <th scope="row">{mesVisible(m.mes)}</th>
                <td>{moneda(m.total)}</td>
                {m.totalAnterior !== undefined && (
                  <>
                    <td>{mesVisible(m.mesAnterior!)}</td>
                    <td>{moneda(m.totalAnterior)}</td>
                  </>
                )}
                {equipo && <td>{moneda(m.promedioEquipo ?? '0')}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
