import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { estadoEmpresa } from '../api/empresa';
export function AvisoEmpresa({
  firma = false,
  empleado = false,
}: {
  firma?: boolean;
  empleado?: boolean;
}) {
  const q = useQuery({
    queryKey: ['empresa', 'estado'],
    queryFn: ({ signal }) => estadoEmpresa(signal),
    staleTime: 30000,
  });
  if (q.error)
    return (
      <p role="alert" className="resumen-error">
        No se pudo verificar la configuración de empresa. Al generar un PDF se validará nuevamente:{' '}
        {q.error.message}
      </p>
    );
  if (!q.data) return null;
  const texto = !q.data.configurada
    ? q.data.mensaje
    : firma && !q.data.firmante
      ? 'Para aprobar o emitir documentos, ADMIN debe vincular tu usuario a tu ficha de empleado. Completa nombres, apellidos y puesto activo en Personal → Empleados.'
      : null;
  return texto ? (
    <div role="alert" data-tour="empresa-aviso" className="resumen-error my-4">
      {texto}
      {!empleado && (
        <p>
          <Link to="/catalogos/empresa">Abrir Configuración de empresa</Link>
        </p>
      )}
    </div>
  ) : null;
}

export function useBloqueoFirma() {
  const q = useQuery({
    queryKey: ['empresa', 'estado'],
    queryFn: ({ signal }) => estadoEmpresa(signal),
    staleTime: 30000,
  });
  if (!q.data) return undefined;
  if (!q.data.configurada) return q.data.mensaje ?? 'Completa Configuración de empresa.';
  if (!q.data.firmante)
    return 'Vincula tu usuario a una ficha de empleado con nombre completo y puesto activo.';
  return undefined;
}
