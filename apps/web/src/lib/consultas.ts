import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api } from './api';
import { useSesion } from './sesion';

/** Consulta de la organización activa; la clave incluye la organización para no mezclar datos. */
export function useConsulta<T>(
  clave: (string | number | undefined)[],
  ruta: string,
  opciones: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> = {},
) {
  const { organizacion } = useSesion();
  return useQuery<T>({
    queryKey: ['org', organizacion?.id, ...clave],
    queryFn: () => api.get<T>(ruta),
    enabled: !!organizacion && (opciones.enabled ?? true),
    ...opciones,
  });
}

/** Acción que, al terminar bien, refresca los datos de la organización activa. */
export function useAccion<TEntrada, TSalida = unknown>(
  fn: (entrada: TEntrada) => Promise<TSalida>,
  opciones: { alTerminar?: (salida: TSalida, entrada: TEntrada) => void } = {},
) {
  const queryClient = useQueryClient();
  const { organizacion } = useSesion();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (salida, entrada) => {
      await queryClient.invalidateQueries({ queryKey: ['org', organizacion?.id] });
      opciones.alTerminar?.(salida, entrada);
    },
  });
}
