import { useQuery, useQueryClient } from '@tanstack/react-query';
import { definiciones, detalle, restricciones } from '../../catalogos/api/catalogos';
import { CatalogoFormulario } from '../../catalogos/pages/CatalogoFormulario';
import { Modal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Button } from '../../../components/ui/Button';
export function EditarUmbralVacaciones({ id, onCerrar }: { id: number; onCerrar: () => void }) {
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: ['catalogos', 'umbral-vacaciones', id],
    queryFn: async () => {
      const [catalogos, actual, reglas] = await Promise.all([
        definiciones(),
        detalle('parametros-legales', id),
        restricciones(),
      ]);
      const cat = catalogos.find((c) => c.slug === 'parametros-legales');
      if (!cat) throw new Error('No se encontró el catálogo de parámetros legales.');
      return {
        cat: {
          ...cat,
          campos: cat.campos.map((f) =>
            f.nombre === 'valor'
              ? {
                  ...f,
                  hint: 'Días disponibles que deben superarse para alertar. Mayor que cero; 15.00 no alerta y 15.25 sí con umbral 15.',
                }
              : f,
          ),
        },
        actual,
        cierre: reglas.ultimoCierre,
      };
    },
  });
  if (q.data)
    return (
      <CatalogoFormulario
        {...q.data}
        onCerrar={onCerrar}
        onGuardado={() => {
          void cache.invalidateQueries({ queryKey: ['vacaciones', 'saldos'] });
          void cache.invalidateQueries({ queryKey: ['tablero'] });
        }}
      />
    );
  return (
    <Modal abierto titulo="Configurar alerta de vacaciones" onCerrar={onCerrar}>
      {q.error ? (
        <EmptyState
          titulo="No se pudo cargar el parámetro"
          descripcion={q.error.message}
          accion={
            <Button icono="actualizar" onClick={() => void q.refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : (
        <Skeleton lineas={6} />
      )}
    </Modal>
  );
}
