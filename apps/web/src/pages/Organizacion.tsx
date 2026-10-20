import { MODALIDADES, NIVEL_LABEL, type EstadoPaso } from '@pesv/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router';
import { CuadriculaPasos } from '../components/CuadriculaPasos';
import { api, ApiError } from '../lib/api';
import { guardarOrganizacionActiva, leerOrganizacionActiva } from '../lib/organizacion-activa';

export function Organizacion() {
  const id = leerOrganizacionActiva();
  const detalle = useQuery({
    queryKey: ['organizacion', id],
    queryFn: () => api.organizacion(id!),
    enabled: !!id,
  });
  const pasos = useQuery({ queryKey: ['pasos', id], queryFn: () => api.pasos(id!), enabled: !!id });

  if (!id) return <Navigate to="/clasificacion" replace />;

  if (detalle.isPending || pasos.isPending) {
    return <p className="text-gris">Cargando la organización…</p>;
  }

  const error = detalle.error ?? pasos.error;
  if (error) {
    const noExiste = error instanceof ApiError && (error.status === 404 || error.status === 403);
    return (
      <div role="alert" className="flex max-w-xl flex-col gap-3">
        <h1 className="text-2xl font-extrabold text-noche">
          {noExiste ? 'No encontramos esta organización' : 'No pudimos cargar la organización'}
        </h1>
        <p className="text-gris">
          {noExiste
            ? 'Puede que se haya registrado en otro entorno. Regístrala de nuevo.'
            : error.message}
        </p>
        <div className="flex gap-3">
          {noExiste ? (
            <Link
              to="/clasificacion"
              onClick={() => guardarOrganizacionActiva(null)}
              className="rounded-lg bg-senal px-5 py-3 font-bold text-noche"
            >
              Registrar organización
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                void detalle.refetch();
                void pasos.refetch();
              }}
              className="rounded-lg bg-senal px-5 py-3 font-bold text-noche"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    );
  }

  const { organizacion, clasificacion, resumen } = detalle.data!;
  const estados: Partial<Record<number, EstadoPaso>> = Object.fromEntries(
    pasos.data!.map((p) => [p.numero, p.estado]),
  );
  const modalidad = MODALIDADES.find((m) => m.id === organizacion.modalityId)?.nombre;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-noche">
          {organizacion.name}
        </h1>
        <ul className="flex flex-wrap gap-2 text-[13px] font-semibold">
          <li className="rounded-full bg-noche px-3 py-1 text-white">
            Nivel{' '}
            {clasificacion ? NIVEL_LABEL[clasificacion.level].toLowerCase() : 'sin clasificar'}
          </li>
          <li className="rounded-full bg-white px-3 py-1 ring-1 ring-linea">
            NIT {organizacion.nit}
          </li>
          <li className="rounded-full bg-white px-3 py-1 ring-1 ring-linea">
            {organizacion.misionalidad === 1
              ? 'Misionalidad 1: transporte'
              : 'Misionalidad 2: otra actividad'}
          </li>
          {modalidad && organizacion.misionalidad === 1 && (
            <li className="rounded-full bg-white px-3 py-1 ring-1 ring-linea">{modalidad}</li>
          )}
          {clasificacion && (
            <li className="rounded-full bg-white px-3 py-1 ring-1 ring-linea">
              {clasificacion.vehicles} vehículos y {clasificacion.drivers} conductores
            </li>
          )}
        </ul>
      </header>

      <section aria-label="Resumen de cumplimiento" className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-6 ring-1 ring-linea">
          <p className="text-sm font-semibold text-gris">Cumplimiento PESV</p>
          <p className="text-[40px] font-extrabold leading-none text-noche">
            {resumen.porcentajeCumplimiento} %
          </p>
          <div
            className="h-2 rounded-full bg-papel"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={resumen.porcentajeCumplimiento}
            aria-label="Cumplimiento PESV"
          >
            <div
              className="h-2 rounded-full bg-via"
              style={{ width: `${resumen.porcentajeCumplimiento}%` }}
            />
          </div>
          <p className="text-[13px] text-gris">
            {resumen.hechos} de {resumen.aplicables} pasos aplicables completos
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-6 ring-1 ring-linea">
          <p className="text-sm font-semibold text-gris">Por hacer</p>
          <p className="text-[40px] font-extrabold leading-none text-noche">
            {resumen.pendientes + resumen.enCurso}
          </p>
          <p className="text-[13px] text-gris">
            {resumen.pendientes} pendientes y {resumen.enCurso} en curso
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl bg-noche p-6 text-white">
          <p className="text-sm font-semibold text-[#c9d2de]">Siguiente paso</p>
          <p className="text-lg font-bold leading-snug">Designa al líder del PESV (paso 1)</p>
          <p className="text-[13px] text-[#c9d2de]">
            La carga de evidencias por paso llega en la Fase 1.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="titulo-pasos"
        className="flex flex-col gap-4 rounded-2xl bg-white p-6 ring-1 ring-linea"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="titulo-pasos" className="text-lg font-bold text-noche">
            Estado de los 24 pasos
          </h2>
          <Link
            to="/pasos"
            className="text-sm font-semibold text-[#1d4e89] underline-offset-4 hover:underline"
          >
            Ver qué pide cada paso y su relación con ISO 39001
          </Link>
        </div>
        <CuadriculaPasos estados={estados} />
      </section>
    </div>
  );
}
