import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { Cargando } from './components/ui';
import './index.css';
import { PantallaError } from './components/PantallaError';
import { escucharErroresGlobales } from './lib/errores';
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
const Mantenimiento = cargar(() => import('./pages/Mantenimiento'), 'Mantenimiento');
const Siniestros = cargar(() => import('./pages/Siniestros'), 'Siniestros');
const SiniestroDetalle = cargar(() => import('./pages/Siniestros'), 'SiniestroDetalle');
const Comite = cargar(() => import('./pages/Comite'), 'Comite');
const ReunionComite = cargar(() => import('./pages/Comite'), 'ReunionComite');
const Planificacion = cargar(() => import('./pages/Planificacion'), 'Planificacion');
const MatrizRiesgos = cargar(() => import('./pages/MatrizRiesgos'), 'MatrizRiesgos');
const Desplazamientos = cargar(() => import('./pages/Desplazamientos'), 'Desplazamientos');
const Acciones = cargar(() => import('./pages/Acciones'), 'Acciones');
const Vigia = cargar(() => import('./pages/Vigia'), 'Vigia');
const Auditorias = cargar(() => import('./pages/Auditorias'), 'Auditorias');
const AuditoriaDetalle = cargar(() => import('./pages/Auditorias'), 'AuditoriaDetalle');
const Riesgo = cargar(() => import('./pages/Riesgo'), 'Riesgo');
const Iso = cargar(() => import('./pages/Riesgo'), 'Iso');
const Suscripcion = cargar(() => import('./pages/Plataforma'), 'Suscripcion');
const Plataforma = cargar(() => import('./pages/Plataforma'), 'Plataforma');
const Recuperar = cargar(() => import('./pages/Cuenta'), 'Recuperar');
const Restablecer = cargar(() => import('./pages/Cuenta'), 'Restablecer');
const MiCuenta = cargar(() => import('./pages/Cuenta'), 'MiCuenta');
const Notificaciones = cargar(() => import('./pages/Notificaciones'), 'Notificaciones');
const FormatoDocumentos = cargar(() => import('./pages/FormatoDocumentos'), 'FormatoDocumentos');

const conCarga = (pagina: ReactNode) => <Suspense fallback={<Cargando />}>{pagina}</Suspense>;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/** Exige sesión; sin organización, lleva a registrar una. */
function RequiereSesion() {
  const { cargando, yo } = useSesion();
  const ubicacion = useLocation();
  if (cargando) return <div className="p-8"><Cargando /></div>;
  if (!yo) return <Navigate to="/ingresar" replace state={{ desde: `${ubicacion.pathname}${ubicacion.search}` }} />;
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
    errorElement: <PantallaError />,
    children: [
      { path: 'ingresar', element: conCarga(<Ingresar />) },
      { path: 'registro', element: conCarga(<Registro />) },
      { path: 'recuperar', element: conCarga(<Recuperar />) },
    ],
  },
  // Enlace de recuperación o de invitación: funciona con o sin sesión iniciada.
  { path: 'restablecer', element: conCarga(<Restablecer />), errorElement: <PantallaError /> },
  {
    element: <RequiereSesion />,
    errorElement: <PantallaError />,
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
          { path: 'mantenimiento', element: conCarga(<Mantenimiento />) },
          { path: 'siniestros', element: conCarga(<Siniestros />) },
          { path: 'siniestros/:id', element: conCarga(<SiniestroDetalle />) },
          { path: 'desplazamientos', element: conCarga(<Desplazamientos />) },
          { path: 'comite', element: conCarga(<Comite />) },
          { path: 'comite/:id', element: conCarga(<ReunionComite />) },
          { path: 'matriz-riesgos', element: conCarga(<MatrizRiesgos />) },
          { path: 'planificacion', element: conCarga(<Planificacion />) },
          { path: 'acciones', element: conCarga(<Acciones />) },
          { path: 'vigia', element: conCarga(<Vigia />) },
          { path: 'auditorias', element: conCarga(<Auditorias />) },
          { path: 'auditorias/:id', element: conCarga(<AuditoriaDetalle />) },
          { path: 'riesgo', element: conCarga(<Riesgo />) },
          { path: 'iso39001', element: conCarga(<Iso />) },
          { path: 'configuracion/suscripcion', element: conCarga(<Suscripcion />) },
          { path: 'plataforma', element: conCarga(<Plataforma />) },
          { path: 'configuracion/ia', element: conCarga(<ConfigIa />) },
          { path: 'configuracion/integraciones', element: conCarga(<Integraciones />) },
          { path: 'configuracion/miembros', element: conCarga(<Miembros />) },
          { path: 'configuracion/notificaciones', element: conCarga(<Notificaciones />) },
          { path: 'configuracion/formato', element: conCarga(<FormatoDocumentos />) },
          { path: 'mi-cuenta', element: conCarga(<MiCuenta />) },
          { path: 'organizaciones/nueva', element: conCarga(<NuevaOrganizacion />) },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

escucharErroresGlobales();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ProveedorSesion>
        <RouterProvider router={router} />
      </ProveedorSesion>
    </QueryClientProvider>
  </StrictMode>,
);
