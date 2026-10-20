import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Layout } from './components/Layout';
import './index.css';
import { leerOrganizacionActiva } from './lib/organizacion-activa';

const Clasificacion = lazy(() =>
  import('./pages/Clasificacion').then((m) => ({ default: m.Clasificacion })),
);
const Organizacion = lazy(() =>
  import('./pages/Organizacion').then((m) => ({ default: m.Organizacion })),
);
const Pasos = lazy(() => import('./pages/Pasos').then((m) => ({ default: m.Pasos })));

const cargando = <p className="text-gris">Cargando…</p>;
const conCarga = (pagina: React.ReactNode) => <Suspense fallback={cargando}>{pagina}</Suspense>;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function Inicio() {
  return <Navigate to={leerOrganizacionActiva() ? '/organizacion' : '/clasificacion'} replace />;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Inicio /> },
      { path: 'clasificacion', element: conCarga(<Clasificacion />) },
      { path: 'organizacion', element: conCarga(<Organizacion />) },
      { path: 'pasos', element: conCarga(<Pasos />) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
