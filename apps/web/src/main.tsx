import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { Cargando } from './components/ui';
import './index.css';
import { ProveedorSesion, useSesion } from './lib/sesion';

const cargar = <T extends Record<string, unknown>>(fn: () => Promise<T>, nombre: keyof T) =>
  lazy(() => fn().then((m) => ({ default: m[nombre] as React.ComponentType })));

const Ingresar = cargar(() => import('./pages/Ingresar'), 'Ingresar');
const Registro = cargar(() => import('./pages/Registro'), 'Registro');
const NuevaOrganizacion = cargar(() => import('./pages/Registro'), 'NuevaOrganizacion');
const Inicio = cargar(() => import('./pages/Inicio'), 'Inicio');
const Pasos = cargar(() => import('./pages/Pasos'), 'Pasos');
const PasoDetalle = cargar(() => import('./pages/PasoDetalle'), 'PasoDetalle');
const Norma = cargar(() => import('./pages/Norma'), 'Norma');
const Flota = cargar(() => import('./pages/Flota'), 'Flota');
const Preoperacional = cargar(() => import('./pages/Preoperacional'), 'Preoperacional');
const Copiloto = cargar(() => import('./pages/Copiloto'), 'Copiloto');
const ConfigIa = cargar(() => import('./pages/ConfigIa'), 'ConfigIa');
const Integraciones = cargar(() => import('./pages/Integraciones'), 'Integraciones');
const Miembros = cargar(() => import('./pages/Miembros'), 'Miembros');

const conCarga = (pagina: ReactNode) => <Suspense fallback={<Cargando />}>{pagina}</Suspense>;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/** Exige sesión; sin organización, lleva a registrar una. */
function RequiereSesion() {
  const { cargando, yo } = useSesion();
  const ubicacion = useLocation();
  if (cargando) return <div className="p-8"><Cargando /></div>;
  if (!yo) return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname }} />;
  if (yo.organizaciones.length === 0 && ubicacion.pathname !== '/organizaciones/nueva') {
    return <Navigate to="/organizaciones/nueva" replace />;
  }
  return <Outlet />;
}

function SoloSinSesion() {
  const { cargando, yo } = useSesion();
  if (cargando) return <div className="p-8"><Cargando /></div>;
  return yo ? <Navigate to="/" replace /> : <Outlet />;
}

const router = createBrowserRouter([
  {
    element: <SoloSinSesion />,
    children: [
      { path: 'ingresar', element: conCarga(<Ingresar />) },
      { path: 'registro', element: conCarga(<Registro />) },
    ],
  },
  {
    element: <RequiereSesion />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: conCarga(<Inicio />) },
          { path: 'pasos', element: conCarga(<Pasos />) },
          { path: 'pasos/:numero', element: conCarga(<PasoDetalle />) },
          { path: 'norma', element: conCarga(<Norma />) },
          { path: 'flota', element: conCarga(<Flota />) },
          { path: 'preoperacional', element: conCarga(<Preoperacional />) },
          { path: 'copiloto', element: conCarga(<Copiloto />) },
          { path: 'configuracion/ia', element: conCarga(<ConfigIa />) },
          { path: 'configuracion/integraciones', element: conCarga(<Integraciones />) },
          { path: 'configuracion/miembros', element: conCarga(<Miembros />) },
          { path: 'organizaciones/nueva', element: conCarga(<NuevaOrganizacion />) },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ProveedorSesion>
        <RouterProvider router={router} />
      </ProveedorSesion>
    </QueryClientProvider>
  </StrictMode>,
);
