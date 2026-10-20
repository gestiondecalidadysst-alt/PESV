import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { leerOrganizacionActiva } from '../lib/organizacion-activa';

const enlace = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2.5 text-sm transition-colors ${
    isActive
      ? 'bg-asfalto font-semibold text-white shadow-[inset_3px_0_0_var(--color-senal)]'
      : 'text-[#c9d2de] hover:bg-asfalto/60 hover:text-white'
  }`;

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-3 pb-1 pt-4 text-xs font-semibold text-[#8c99ab]">{titulo}</p>
      {children}
    </div>
  );
}

function Proximamente({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-[#8c99ab]">
      {children}
      <span className="rounded bg-asfalto px-1.5 py-0.5 text-[10px] font-semibold text-[#c9d2de]">
        Fase 1
      </span>
    </span>
  );
}

export function Layout() {
  // Se vuelve a leer en cada navegación para reflejar una organización recién registrada.
  useLocation();
  const tieneOrganizacion = Boolean(leerOrganizacionActiva());
  const [menuAbierto, setMenuAbierto] = useState(false);
  return (
    <div className="flex min-h-screen flex-wrap">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>
      <nav
        aria-label="Menú principal"
        className="flex-[1_1_100%] bg-noche px-4 py-4 lg:max-w-72 lg:flex-[1_1_15rem] lg:py-6"
      >
        <div className="flex items-center justify-between lg:mb-4">
          <NavLink to="/" className="flex items-center gap-2.5 px-2">
            <span
              aria-hidden="true"
              className="grid size-8 rotate-45 place-items-center rounded-md bg-senal"
            >
              <span className="-rotate-45 text-sm font-extrabold text-noche">P</span>
            </span>
            <span className="text-lg font-bold text-white">PESV</span>
          </NavLink>
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
          className={`${menuAbierto ? 'block' : 'hidden'} lg:block`}
          onClick={(e) => {
            // En celular, el menú se cierra al elegir una sección.
            if ((e.target as HTMLElement).closest('a')) setMenuAbierto(false);
          }}
        >
          <Grupo titulo="Gestión">
            {tieneOrganizacion && (
              <NavLink to="/organizacion" className={enlace}>
                Mi organización
              </NavLink>
            )}
            <NavLink to="/clasificacion" className={enlace}>
              {tieneOrganizacion ? 'Registrar otra organización' : 'Clasificar mi organización'}
            </NavLink>
            <NavLink to="/pasos" className={enlace}>
              Los 24 pasos
            </NavLink>
          </Grupo>
          <Grupo titulo="Operación">
            <Proximamente>Flota y conductores</Proximamente>
            <Proximamente>Preoperacionales</Proximamente>
            <Proximamente>Siniestros</Proximamente>
          </Grupo>
          <Grupo titulo="Configuración">
            <Proximamente>Proveedor de IA</Proximamente>
            <Proximamente>Integraciones n8n</Proximamente>
          </Grupo>
        </div>
      </nav>
      <main id="contenido" className="min-w-0 flex-[999_1_35rem] px-5 py-7 sm:px-8 lg:px-10">
        <Outlet />
      </main>
    </div>
  );
}
