import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { reportarError } from '../lib/errores';
import { Logo } from './Logo';

/**
 * Se muestra cuando una pantalla falla al dibujarse. El error se envía al registro de errores de
 * la plataforma. Si falló la carga de una parte de la aplicación (por ejemplo, tras publicar una
 * versión nueva), recargar la página lo resuelve.
 */
export function PantallaError() {
  const error = useRouteError();
  const esRuta = isRouteErrorResponse(error);
  const cargaFallida = error instanceof Error && /dynamically imported module|Failed to fetch dynamically|Importing a module script failed/i.test(error.message);

  useEffect(() => {
    if (!esRuta && !cargaFallida) reportarError(error);
  }, [error, esRuta, cargaFallida]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-papel px-6 text-center">
      <Logo />
      <div className="flex max-w-md flex-col gap-3">
        <h1 className="text-2xl font-extrabold text-noche">{cargaFallida ? 'Hay una versión nueva de la plataforma' : 'Algo salió mal en esta pantalla'}</h1>
        <p className="text-gris">
          {cargaFallida
            ? 'Recarga la página para usar la versión más reciente.'
            : 'Ya quedó registrado para que el equipo lo revise. Recarga la página; si se repite, vuelve al inicio.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => window.location.reload()} className="h-11 rounded-lg bg-senal px-5 font-bold text-noche">
          Recargar
        </button>
        <a href="/" className="inline-flex h-11 items-center rounded-lg px-5 font-semibold text-[#1d4e89] ring-1 ring-linea">
          Ir al inicio
        </a>
      </div>
    </main>
  );
}
