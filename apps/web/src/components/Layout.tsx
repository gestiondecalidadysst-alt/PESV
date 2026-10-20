import type { Permiso } from '@pesv/shared';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useSesion } from '../lib/sesion';
import { Logo } from '../pages/Registro';

const enlace = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2.5 text-sm transition-colors ${
    isActive
      ? 'bg-asfalto font-semibold text-white shadow-[inset_3px_0_0_var(--color-senal)]'
      : 'text-[#c9d2de] hover:bg-asfalto/60 hover:text-white'
  }`;

export interface Seccion {
  ruta: string;
  nombre: string;
  permiso: Permiso | null;
  grupo: 'Gestión' | 'Operación' | 'Verificación' | 'Configuración';
  fin?: boolean;
}

/** Menú principal; cada entrada aparece solo si el rol tiene el permiso. */
export const SECCIONES: Seccion[] = [
  { ruta: '/', nombre: 'Inicio', permiso: 'ver', grupo: 'Gestión', fin: true },
  { ruta: '/pasos', nombre: 'Los 24 pasos', permiso: 'ver', grupo: 'Gestión' },
  { ruta: '/copiloto', nombre: 'Copiloto IA', permiso: 'ver', grupo: 'Gestión' },
  { ruta: '/comite', nombre: 'Comité de seguridad vial', permiso: 'ver', grupo: 'Gestión' },
  { ruta: '/planificacion', nombre: 'Planificación', permiso: 'ver', grupo: 'Gestión' },
  { ruta: '/acciones', nombre: 'Acciones y compromisos', permiso: 'ver', grupo: 'Gestión' },
  { ruta: '/flota', nombre: 'Flota y conductores', permiso: 'ver', grupo: 'Operación' },
  { ruta: '/preoperacional', nombre: 'Preoperacional', permiso: 'inspeccionar', grupo: 'Operación' },
  { ruta: '/mantenimiento', nombre: 'Mantenimiento', permiso: 'ver', grupo: 'Operación' },
  { ruta: '/desplazamientos', nombre: 'Desplazamientos', permiso: 'ver', grupo: 'Operación' },
  { ruta: '/siniestros', nombre: 'Siniestros', permiso: 'ver', grupo: 'Operación' },
  { ruta: '/vigia', nombre: 'Reporte VIGIA 2', permiso: 'ver', grupo: 'Verificación' },
  { ruta: '/configuracion/miembros', nombre: 'Miembros y roles', permiso: 'ver', grupo: 'Configuración' },
  { ruta: '/configuracion/ia', nombre: 'Proveedor de IA', permiso: 'configurar', grupo: 'Configuración' },
  { ruta: '/configuracion/integraciones', nombre: 'Integraciones n8n', permiso: 'configurar', grupo: 'Configuración' },
];

export function Layout() {
  const { yo, organizacion, elegirOrganizacion, puede, salir } = useSesion();
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const visibles = SECCIONES.filter((s) => s.permiso === null || puede(s.permiso));
  const grupos = [...new Set(visibles.map((s) => s.grupo))];

  return (
    <div className="flex min-h-screen flex-wrap">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <nav aria-label="Menú principal" className="flex-[1_1_100%] bg-noche px-4 py-4 lg:max-w-72 lg:flex-[1_1_16rem] lg:py-6">
        <div className="flex items-center justify-between lg:mb-5">
          <Logo claro />
          <button
            type="button"
            aria-expanded={menuAbierto}
            aria-controls="menu-secciones"
            onClick={() => setMenuAbierto((v) => !v)}
            className="h-11 rounded-lg px-3 text-sm font-semibold text-white ring-1 ring-asfalto lg:hidden"
          >
            {menuAbierto ? 'Cerrar menú' : 'Menú'}
          </button>
        </div>
        <div
          id="menu-secciones"
          className={`${menuAbierto ? 'flex' : 'hidden'} flex-col gap-1 pt-4 lg:flex lg:pt-0`}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) setMenuAbierto(false);
          }}
        >
          {yo && yo.organizaciones.length > 1 ? (
            <label className="flex flex-col gap-1 px-2 pb-3">
              <span className="text-xs font-semibold text-[#8c99ab]">Organización</span>
              <select
                value={organizacion?.id ?? ''}
                onChange={(e) => {
                  elegirOrganizacion(e.target.value);
                  navigate('/');
                }}
                className="h-11 rounded-lg bg-asfalto px-3 text-sm font-semibold text-white"
              >
                {yo.organizaciones.map((o) => (
                  <option key={o.id} value={o.id}>{o.nombre}</option>
                ))}
              </select>
            </label>
          ) : (
            organizacion && <p className="px-3 pb-3 text-sm font-semibold text-white">{organizacion.nombre}</p>
          )}

          {grupos.map((g) => (
            <div key={g} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 pt-3 text-xs font-semibold text-[#8c99ab]">{g}</p>
              {visibles
                .filter((s) => s.grupo === g)
                .map((s) => (
                  <NavLink key={s.ruta} to={s.ruta} end={s.fin} className={enlace}>
                    {s.nombre}
                  </NavLink>
                ))}
            </div>
          ))}
          <NavLink to="/organizaciones/nueva" className={enlace}>Registrar otra organización</NavLink>

          {yo && (
            <div className="mt-4 flex flex-col gap-2 border-t border-asfalto px-3 pt-4">
              <p className="text-sm font-semibold text-white">{yo.usuario.nombre}</p>
              <p className="break-all text-xs text-[#8c99ab]">{yo.usuario.email}</p>
              <button
                type="button"
                onClick={async () => {
                  await salir();
                  navigate('/ingresar');
                }}
                className="mt-1 min-h-10 self-start rounded-lg px-3 text-sm font-semibold text-[#c9d2de] ring-1 ring-asfalto hover:text-white"
              >
                Salir
              </button>
            </div>
          )}
        </div>
      </nav>
      <main id="contenido" className="min-w-0 flex-[999_1_35rem] px-5 py-7 sm:px-8 lg:px-10">
        <Outlet />
      </main>
    </div>
  );
}
