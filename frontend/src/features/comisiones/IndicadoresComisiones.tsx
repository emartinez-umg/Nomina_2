import { motion, useReducedMotion } from 'framer-motion';
import { NumeroAnimado } from '../inicio/components/RhCompartidos';
import { iconos } from '../../components/ui/icons';
import { Tooltip } from '../../components/ui/Tooltip';
import { moneda } from '../../lib/validadores';
import type { ResumenComisiones } from './api';
import { mesVisible } from './GraficasComisiones';
export function VariacionComisiones({
  valor,
  sinBase,
  comparar,
}: {
  valor: string | null;
  sinBase: boolean;
  comparar: boolean;
}) {
  const Icono =
    iconos[
      valor === null || Number(valor) === 0
        ? 'igual'
        : Number(valor) > 0
          ? 'tendenciaSube'
          : 'tendenciaBaja'
    ];
  return (
    <span className="com-variacion">
      <Icono size={16} aria-hidden="true" />
      {!comparar
        ? 'Comparación desactivada'
        : sinBase
          ? 'Sin base de comparación (anterior Q 0.00)'
          : valor === null
            ? 'Sin comparación'
            : `${Number(valor) > 0 ? 'Aumento' : Number(valor) < 0 ? 'Disminución' : 'Sin cambio'}: ${valor}%`}
    </span>
  );
}
export function IndicadoresComisiones({ datos }: { datos: ResumenComisiones }) {
  const r = datos.indicadores,
    reducir = useReducedMotion();
  const tarjetas = [
    {
      titulo: 'Total de comisiones',
      valor: r.total,
      dinero: true,
      icono: 'planilla',
      hint: 'Suma de comisiones autorizadas por su mes de origen; no exige pago confirmado.',
    },
    {
      titulo: 'Promedio mensual',
      valor: r.promedioMensual,
      dinero: true,
      icono: 'estadisticas',
      hint: 'Total dividido entre todos los meses del rango, incluidos los meses sin comisiones.',
    },
    {
      titulo: 'Mejor mes',
      valor: r.mejorMes?.total ?? '0.00',
      dinero: true,
      icono: 'aniversario',
      hint: 'Mes con mayor total del rango. En empate se muestra el primero.',
      subtitulo: r.mejorMes ? mesVisible(r.mejorMes.mes) : 'Sin comisiones en el rango',
    },
    {
      titulo: 'Vendedores con comisión',
      valor: r.vendedoresConComision,
      dinero: false,
      icono: 'empleados',
      hint: 'Personas con algún registro válido en este rango y estado, independientemente del puesto.',
    },
  ] as const;
  return (
    <section
      data-tour="com-indicadores"
      aria-label="Indicadores de comisiones"
      className="com-indicadores"
    >
      {tarjetas.map((t, i) => {
        const Icono = iconos[t.icono];
        return (
          <motion.section
            className="tarjeta com-indicador"
            key={t.titulo}
            initial={reducir ? false : { y: 10 }}
            animate={{ y: 0 }}
            transition={{ duration: reducir ? 0 : 0.3, delay: reducir ? 0 : i * 0.06 }}
          >
            <span className="rh-icono">
              <Icono aria-hidden="true" size={22} />
            </span>
            <h2>
              {t.titulo}{' '}
              <Tooltip texto={t.hint}>
                <span role="img" aria-label={`Información: ${t.titulo}`}>
                  <iconos.informacion size={15} aria-hidden="true" />
                </span>
              </Tooltip>
            </h2>
            <strong className="com-numero">
              <NumeroAnimado valor={t.valor} dinero={t.dinero} />
            </strong>
            {'subtitulo' in t && <p>{t.subtitulo}</p>}
            {i === 0 && (
              <>
                <VariacionComisiones
                  valor={r.variacionPorcentual}
                  sinBase={r.sinBaseComparacion}
                  comparar={!!datos.periodoAnterior}
                />
                {r.totalAnterior !== null && <small>Anterior: {moneda(r.totalAnterior)}</small>}
              </>
            )}
          </motion.section>
        );
      })}
    </section>
  );
}
