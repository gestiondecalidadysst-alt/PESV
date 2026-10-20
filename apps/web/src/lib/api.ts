import type {
  CrearOrganizacionInput,
  EstadoPaso,
  Fase,
  Nivel,
  ResultadoClasificacion,
} from '@pesv/shared';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errores: { campo: string; mensaje: string }[] = [],
  ) {
    super(message);
  }
}

async function solicitar<T>(
  ruta: string,
  init: RequestInit & { organizacionId?: string } = {},
): Promise<T> {
  const { organizacionId, headers, ...resto } = init;
  let res: Response;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      ...resto,
      headers: {
        'content-type': 'application/json',
        ...(organizacionId ? { 'x-organization-id': organizacionId } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.',
    );
  }
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mensaje = Array.isArray(cuerpo.message) ? cuerpo.message.join('. ') : cuerpo.message;
    throw new ApiError(
      res.status,
      mensaje ?? 'El servidor no pudo completar la solicitud.',
      cuerpo.errores,
    );
  }
  return cuerpo as T;
}

export interface Organizacion {
  id: string;
  name: string;
  nit: string;
  misionalidad: 1 | 2;
  modalityId: string | null;
  actionRadius: string | null;
  createdAt: string;
}

export interface Clasificacion {
  vehicles: number;
  drivers: number;
  level: Nivel;
  levelByVehicles: Nivel | null;
  levelByDrivers: Nivel | null;
  reportsToSupertransporte: boolean;
  applicableSteps: number[];
  createdAt: string;
}

export interface DetalleOrganizacion {
  organizacion: Organizacion;
  clasificacion: Clasificacion | null;
  resumen: {
    aplicables: number;
    hechos: number;
    enCurso: number;
    pendientes: number;
    porcentajeCumplimiento: number;
  };
}

export interface EstadoDePaso {
  numero: number;
  fase: Fase;
  nombre: string;
  estado: EstadoPaso;
  clausulasIso: string[];
}

export const api = {
  crearOrganizacion: (datos: CrearOrganizacionInput) =>
    solicitar<{ organizacion: Organizacion; resultado: ResultadoClasificacion }>('/organizations', {
      method: 'POST',
      body: JSON.stringify(datos),
    }),
  organizacion: (id: string) =>
    solicitar<DetalleOrganizacion>(`/organizations/${id}`, { organizacionId: id }),
  pasos: (id: string) =>
    solicitar<EstadoDePaso[]>(`/organizations/${id}/steps`, { organizacionId: id }),
};
