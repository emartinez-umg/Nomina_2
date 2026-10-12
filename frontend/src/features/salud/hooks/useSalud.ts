import { useQuery } from '@tanstack/react-query';
import { consultarSalud } from '../api/salud';

export function useSalud() {
  return useQuery({
    queryKey: ['salud'],
    queryFn: ({ signal }) => consultarSalud(signal),
    refetchInterval: 30000,
  });
}
