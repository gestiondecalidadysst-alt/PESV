import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { ProveedorSesion } from './lib/sesion';

type Respuesta = { status?: number; body?: unknown } | ((init?: RequestInit) => { status?: number; body?: unknown });

/** Simula la API: cada ruta (método + camino) responde lo indicado; lo demás responde 404. */
export function simularApi(rutas: Record<string, Respuesta>) {
  const llamadas: { ruta: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const camino = url.replace(/^\/api/, '').split('?')[0];
      const clave = `${init?.method ?? 'GET'} ${camino}`;
      llamadas.push({ ruta: clave, init });
      const def = rutas[clave];
      if (!def) return new Response(JSON.stringify({ message: 'No encontrado' }), { status: 404 });
      const r = typeof def === 'function' ? def(init) : def;
      if (r.status === -1) throw new TypeError('Failed to fetch');
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
    }),
  );
  return llamadas;
}

export const YO = {
  usuario: { id: 'u1', email: 'lider@ejemplo.co', nombre: 'Laura Líder', esAdminPlataforma: false },
  organizaciones: [{ id: '11111111-1111-4111-8111-111111111111', nombre: 'Empresa Demo', nit: '900123456', roles: ['admin', 'lider_pesv'] }],
};

export function renderizar(elemento: ReactNode, ruta = '/', patron = '*') {
  const router = createMemoryRouter([{ path: patron, element: elemento }], { initialEntries: [ruta] });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProveedorSesion>
        <RouterProvider router={router} />
      </ProveedorSesion>
    </QueryClientProvider>,
  );
}
