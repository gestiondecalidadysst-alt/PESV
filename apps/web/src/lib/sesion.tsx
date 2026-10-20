import { tienePermiso, type Permiso } from '@pesv/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { alPerderSesion, api, ApiError, fijarOrganizacion } from './api';
import type { Membresia, Yo } from './tipos';

const CLAVE_ORG = 'pesv.organizacionActiva';

function leerGuardada(): string | null {
  try {
    return localStorage.getItem(CLAVE_ORG);
  } catch {
    return null;
  }
}
function guardar(id: string | null) {
  try {
    if (id) localStorage.setItem(CLAVE_ORG, id);
    else localStorage.removeItem(CLAVE_ORG);
  } catch {
    // Sin almacenamiento disponible: la elección dura solo esta sesión.
  }
}

interface Sesion {
  cargando: boolean;
  yo: Yo | null;
  organizacion: Membresia | null;
  elegirOrganizacion: (id: string) => void;
  puede: (permiso: Permiso) => boolean;
  refrescar: () => Promise<unknown>;
  salir: () => Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [elegida, setElegida] = useState<string | null>(leerGuardada);
  const consulta = useQuery({
    queryKey: ['yo'],
    queryFn: async () => {
      try {
        return await api.get<Yo>('/auth/yo');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
  });

  const yo = consulta.data ?? null;
  const organizacion = useMemo(() => {
    if (!yo) return null;
    return yo.organizaciones.find((o) => o.id === elegida) ?? yo.organizaciones[0] ?? null;
  }, [yo, elegida]);

  // Se fija en el cliente HTTP durante el render para que las consultas hijas ya la usen.
  fijarOrganizacion(organizacion?.id ?? null);

  useEffect(() => {
    alPerderSesion(() => queryClient.setQueryData(['yo'], null));
  }, [queryClient]);

  const elegirOrganizacion = useCallback(
    (id: string) => {
      guardar(id);
      setElegida(id);
      fijarOrganizacion(id);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'yo' });
    },
    [queryClient],
  );

  const salir = useCallback(async () => {
    await api.post('/auth/salir').catch(() => undefined);
    queryClient.clear();
    queryClient.setQueryData(['yo'], null);
  }, [queryClient]);

  const valor: Sesion = {
    cargando: consulta.isPending,
    yo,
    organizacion,
    elegirOrganizacion,
    puede: (p) => !!organizacion && tienePermiso(organizacion.roles, p),
    refrescar: () => consulta.refetch(),
    salir,
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return s;
}

export function guardarOrganizacionElegida(id: string) {
  guardar(id);
}
