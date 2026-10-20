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

let organizacionActiva: string | null = null;
let alExpirarSesion: (() => void) | null = null;

/** La sesión fija la organización activa; todas las peticiones la envían en el encabezado. */
export function fijarOrganizacion(id: string | null) {
  organizacionActiva = id;
}
export function alPerderSesion(fn: () => void) {
  alExpirarSesion = fn;
}
export const urlApi = (ruta: string) =>
  `${BASE}${ruta}${organizacionActiva ? `${ruta.includes('?') ? '&' : '?'}org=${organizacionActiva}` : ''}`;

async function solicitar<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const esFormulario = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      credentials: 'include',
      ...init,
      headers: {
        ...(esFormulario || !init.body ? {} : { 'content-type': 'application/json' }),
        ...(organizacionActiva ? { 'x-organization-id': organizacionActiva } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
  }
  if (res.status === 204) return undefined as T;
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !ruta.startsWith('/auth/')) alExpirarSesion?.();
    const mensaje = Array.isArray(cuerpo.message) ? cuerpo.message.join('. ') : cuerpo.message;
    throw new ApiError(res.status, mensaje ?? 'El servidor no pudo completar la solicitud.', cuerpo.errores);
  }
  return cuerpo as T;
}

export const api = {
  get: <T>(ruta: string) => solicitar<T>(ruta),
  post: <T>(ruta: string, datos?: unknown) =>
    solicitar<T>(ruta, { method: 'POST', body: datos instanceof FormData ? datos : datos === undefined ? undefined : JSON.stringify(datos) }),
  put: <T>(ruta: string, datos: unknown) => solicitar<T>(ruta, { method: 'PUT', body: JSON.stringify(datos) }),
  patch: <T>(ruta: string, datos: unknown) => solicitar<T>(ruta, { method: 'PATCH', body: JSON.stringify(datos) }),
  delete: <T = void>(ruta: string) => solicitar<T>(ruta, { method: 'DELETE' }),
};

/** Mensaje legible de cualquier error de una petición. */
export function mensajeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.errores.length ? `${error.message}: ${error.errores.map((e) => e.mensaje).join('. ')}` : error.message;
  }
  return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}
