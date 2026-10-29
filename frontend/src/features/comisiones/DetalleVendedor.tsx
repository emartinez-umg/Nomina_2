import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Table } from '../../components/ui/Table';
import { EstadoBadge } from '../../components/ui/EstadoBadge';
import { useSession } from '../../app/session';
import { moneda } from '../../lib/validadores';
import * as api from './api';
import { mesVisible, TendenciaComisiones, DatosTendencia } from './GraficasComisiones';
import { VariacionComisiones } from './IndicadoresComisiones';
export function DetalleVendedor({
  id,
  filtros,
  cerrar,
}: {
  id: number;
  filtros: api.FiltrosComisiones;
  cerrar: () => void;
}) {
  const [pagina, setPagina] = useState(1),
    { usuario } = useSession();
  const consulta = useQuery({
    queryKey: ['comisiones-historial', usuario?.idUsuario, id, filtros, pagina],
    queryFn: ({ signal }) =>
      api.consultar(
        `vendedores/${id}/historial`,
        api.historialSchema,
        { ...filtros, pagina: String(pagina), limite: '10' },
        signal,
      ),
    retry: false,
    staleTime: 0,
    refetchInterval: 60000,
  });
  const d = consulta.error ? undefined : consulta.data;
  return (
    <Card className="com-detalle" data-tour="com-detalle">
      <header className="com-cabecera">
        <h2>Detalle de vendedor{d ? `: ${d.vendedor.nombre}` : ''}</h2>
        <Button icono="cancelar" variante="secundario" onClick={cerrar}>
          Cerrar detalle
        </Button>
      </header>
      {consulta.error ? (
        <EmptyState
          titulo="No se pudo consultar el vendedor"
          descripcion={consulta.error.message}
          accion={
            <Button icono="actualizar" onClick={() => void consulta.refetch()}>
              Reintentar historial
            </Button>
          }
        />
      ) : !d ? (
        <Skeleton lineas={6} />
      ) : (
        <>
          <p>
            {d.vendedor.codigo} · {d.vendedor.departamento} · {d.vendedor.puesto}
          </p>
          <dl className="com-resumen-vendedor">
            <div>
              <dt>Total</dt>
              <dd>{moneda(d.indicadores.total)}</dd>
            </div>
            <div>
              <dt>Promedio mensual</dt>
              <dd>{moneda(d.indicadores.promedioMensual)}</dd>
            </div>
            <div>
              <dt>Mejor mes</dt>
              <dd>
                {d.indicadores.mejorMes
                  ? `${mesVisible(d.indicadores.mejorMes.mes)} · ${moneda(d.indicadores.mejorMes.total)}`
                  : 'Sin registros'}
              </dd>
            </div>
            <div>
              <dt>Peor mes</dt>
              <dd>
                {d.indicadores.peorMes
                  ? `${mesVisible(d.indicadores.peorMes.mes)} · ${moneda(d.indicadores.peorMes.total)}`
                  : 'Sin registros'}
              </dd>
            </div>
            <div>
              <dt>Promedio mensual del equipo</dt>
              <dd>
                {moneda(d.promedioMensualEquipo)} · {d.vendedoresEquipo} vendedores
              </dd>
            </div>
          </dl>
          <p className="campo-hint">
            El promedio del equipo incluye meses vacíos y respeta los filtros elegidos; se compara a
            cada vendedor con el mismo conjunto.
          </p>
          <VariacionComisiones
            valor={d.indicadores.variacionPorcentual}
            sinBase={d.indicadores.sinBaseComparacion}
            comparar={!!d.periodoAnterior}
          />
          <TendenciaComisiones puntos={d.evolucion} equipo />
          <DatosTendencia puntos={d.evolucion} titulo="Evolución del vendedor" equipo />
          <Table
            titulo="Comisiones individuales"
            filas={d.registros}
            clave={(f) => f.id}
            pagina={d.pagina}
            limite={d.limite}
            total={d.total}
            orden={{ campo: 'mes', direccion: 'desc' }}
            onOrden={() => undefined}
            onPagina={setPagina}
            columnas={[
              { id: 'mes', titulo: 'Mes de origen', render: (f) => mesVisible(f.mes) },
              { id: 'monto', titulo: 'Monto', render: (f) => moneda(f.monto) },
              { id: 'descripcion', titulo: 'Descripción', render: (f) => f.descripcion },
              {
                id: 'referencia',
                titulo: 'Referencia',
                render: (f) => f.referencia ?? 'Sin referencia',
              },
              { id: 'estado', titulo: 'Estado', render: (f) => <EstadoBadge estado={f.estado} /> },
            ]}
          />
        </>
      )}
    </Card>
  );
}
