import { zodResolver } from '@hookform/resolvers/zod';
import {
  clasificar,
  crearOrganizacionSchema,
  MODALIDADES,
  NIVEL_LABEL,
  OBLIGACION,
  RADIOS_ACCION,
  type CrearOrganizacionInput,
  type EstadoPaso,
  type ResultadoClasificacion,
} from '@pesv/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch, type FieldError } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { CuadriculaPasos } from '../components/CuadriculaPasos';
import { api, ApiError } from '../lib/api';
import { guardarOrganizacionActiva } from '../lib/organizacion-activa';

const RADIO_LABEL: Record<(typeof RADIOS_ACCION)[number], string> = {
  municipal: 'Municipal',
  departamental: 'Departamental',
  nacional: 'Nacional',
  internacional: 'Internacional',
};

const campo =
  'h-12 w-full rounded-lg border border-[#d5dae1] bg-white px-3.5 text-[15px] text-tinta placeholder:text-gris/70 aria-[invalid=true]:border-alerta';

function Error({ error }: { error?: FieldError }) {
  if (!error?.message) return null;
  return <p className="text-[13px] font-medium text-alerta">{error.message}</p>;
}

export function Clasificacion() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CrearOrganizacionInput>({
    resolver: zodResolver(crearOrganizacionSchema),
    defaultValues: {
      nombre: '',
      nit: '',
      clasificacion: { misionalidad: 2, modalidadId: 'no_transporte' },
    },
  });

  const misionalidad = useWatch({ control, name: 'clasificacion.misionalidad' });
  const vehiculos = useWatch({ control, name: 'clasificacion.vehiculos' });
  const conductores = useWatch({ control, name: 'clasificacion.conductores' });
  const modalidadId = useWatch({ control, name: 'clasificacion.modalidadId' });

  const modalidades = MODALIDADES.filter((m) => m.misionalidad === Number(misionalidad));

  useEffect(() => {
    if (!modalidades.some((m) => m.id === modalidadId)) {
      setValue('clasificacion.modalidadId', modalidades[0]?.id);
    }
  }, [misionalidad]); // eslint-disable-line react-hooks/exhaustive-deps

  const resultado = useMemo<ResultadoClasificacion | null>(() => {
    const v = Number(vehiculos);
    const c = Number(conductores);
    if (!Number.isInteger(v) || !Number.isInteger(c) || v < 0 || c < 0) return null;
    return clasificar({
      misionalidad: Number(misionalidad) as 1 | 2,
      vehiculos: v,
      conductores: c,
      modalidadId,
    });
  }, [misionalidad, vehiculos, conductores, modalidadId]);

  const crear = useMutation({
    mutationFn: api.crearOrganizacion,
    onSuccess: ({ organizacion }) => {
      guardarOrganizacionActiva(organizacion.id);
      navigate('/organizacion');
    },
  });

  const errorApi = crear.error instanceof ApiError ? crear.error : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-noche">
          Clasifica tu organización
        </h1>
        <p className="text-[15px] leading-relaxed text-gris">
          Con la flota y los conductores calculamos tu nivel según la Resolución 40595 de 2022 y
          activamos solo los pasos que te aplican.
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-8">
        <form
          noValidate
          onSubmit={handleSubmit((datos) => crear.mutate(datos))}
          className="flex min-w-0 flex-[1_1_24rem] flex-col gap-7"
        >
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-3 text-lg font-bold text-noche">Datos de la organización</legend>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nombre" className="text-sm font-semibold">
                Razón social
              </label>
              <input
                id="nombre"
                className={campo}
                autoComplete="organization"
                aria-invalid={!!errors.nombre}
                {...register('nombre')}
              />
              <Error error={errors.nombre} />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1.5">
                <label htmlFor="nit" className="text-sm font-semibold">
                  NIT sin dígito de verificación
                </label>
                <input
                  id="nit"
                  inputMode="numeric"
                  placeholder="900123456"
                  className={campo}
                  aria-invalid={!!errors.nit}
                  {...register('nit')}
                />
                <Error error={errors.nit} />
              </div>
              <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1.5">
                <label htmlFor="radio" className="text-sm font-semibold">
                  Radio de acción
                </label>
                <select
                  id="radio"
                  className={campo}
                  {...register('radioAccion', { setValueAs: (v) => v || undefined })}
                >
                  <option value="">Sin definir</option>
                  {RADIOS_ACCION.map((r) => (
                    <option key={r} value={r}>
                      {RADIO_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-lg font-bold text-noche">¿A qué se dedica?</legend>
            <Controller
              control={control}
              name="clasificacion.misionalidad"
              render={({ field }) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        valor: 2,
                        titulo: 'Otra actividad',
                        texto:
                          'Tiene vehículos o conductores, pero el transporte no es su negocio.',
                      },
                      {
                        valor: 1,
                        titulo: 'Transporte',
                        texto: 'Presta servicio de transporte de carga o de pasajeros.',
                      },
                    ] as const
                  ).map((op) => (
                    <label
                      key={op.valor}
                      className="flex cursor-pointer gap-3 rounded-xl border border-linea bg-white p-4 has-[:checked]:border-noche has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-noche)]"
                    >
                      <input
                        type="radio"
                        name={field.name}
                        value={op.valor}
                        checked={field.value === op.valor}
                        onChange={() => field.onChange(op.valor)}
                        onBlur={field.onBlur}
                        className="mt-1 size-4 accent-noche"
                      />
                      <span className="flex flex-col gap-1">
                        <span className="font-bold text-noche">{op.titulo}</span>
                        <span className="text-[13px] leading-snug text-gris">{op.texto}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            />
            {Number(misionalidad) === 1 && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="modalidad" className="text-sm font-semibold">
                  Modalidad de transporte
                </label>
                <select
                  id="modalidad"
                  className={campo}
                  aria-invalid={!!errors.clasificacion?.modalidadId}
                  {...register('clasificacion.modalidadId')}
                >
                  {modalidades.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
                <Error error={errors.clasificacion?.modalidadId} />
              </div>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-3 text-lg font-bold text-noche">Flota y conductores</legend>
            <div className="flex flex-wrap gap-4">
              <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1.5">
                <label htmlFor="vehiculos" className="text-sm font-semibold">
                  Vehículos
                </label>
                <input
                  id="vehiculos"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className={campo}
                  aria-describedby="ayuda-vehiculos"
                  aria-invalid={!!errors.clasificacion?.vehiculos}
                  {...register('clasificacion.vehiculos', { valueAsNumber: true })}
                />
                <p id="ayuda-vehiculos" className="text-[13px] text-gris">
                  Propios, de contratistas o de terceros a su servicio, con o sin motor.
                </p>
                <Error error={errors.clasificacion?.vehiculos} />
              </div>
              <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1.5">
                <label htmlFor="conductores" className="text-sm font-semibold">
                  Conductores
                </label>
                <input
                  id="conductores"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className={campo}
                  aria-describedby="ayuda-conductores"
                  aria-invalid={!!errors.clasificacion?.conductores}
                  {...register('clasificacion.conductores', { valueAsNumber: true })}
                />
                <p id="ayuda-conductores" className="text-[13px] text-gris">
                  Toda persona que conduce para la organización, sin importar su cargo.
                </p>
                <Error error={errors.clasificacion?.conductores} />
              </div>
            </div>
          </fieldset>

          {errorApi && (
            <div
              role="alert"
              className="rounded-lg border border-alerta/30 bg-alerta-suave px-4 py-3 text-sm text-alerta"
            >
              <p className="font-semibold">{errorApi.message}</p>
              {errorApi.errores.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {errorApi.errores.map((e) => (
                    <li key={e.campo + e.mensaje}>{e.mensaje}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={crear.isPending || (resultado !== null && !resultado.obligada)}
            className="h-12 self-start rounded-lg bg-senal px-6 text-[15px] font-bold text-noche transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {crear.isPending ? 'Registrando…' : 'Registrar organización'}
          </button>
        </form>

        <ResultadoEnVivo resultado={resultado} />
      </div>
    </div>
  );
}

function ResultadoEnVivo({ resultado }: { resultado: ResultadoClasificacion | null }) {
  const estados: Partial<Record<number, EstadoPaso>> = {};
  resultado?.pasosAplicables.forEach((n) => (estados[n] = 'pendiente'));

  return (
    <aside
      aria-live="polite"
      aria-label="Resultado de la clasificación"
      className="flex min-w-0 flex-[1_1_22rem] flex-col gap-5 rounded-2xl bg-white p-6 ring-1 ring-linea lg:sticky lg:top-6"
    >
      {!resultado && (
        <p className="text-[15px] leading-relaxed text-gris">
          Escribe cuántos vehículos y conductores tiene la organización y aquí verás su nivel y los
          pasos que le aplican.
        </p>
      )}
      {resultado && !resultado.obligada && (
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-extrabold text-noche">No está obligada</p>
          <p className="text-[15px] leading-relaxed text-gris">
            El PESV es obligatorio con más de {OBLIGACION.vehiculosMayorA} vehículos o con{' '}
            {OBLIGACION.conductoresDesde} o más conductores. Si la flota crece, vuelve a
            clasificarla.
          </p>
        </div>
      )}
      {resultado?.obligada && resultado.nivel && (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-gris">Nivel</p>
            <p className="text-[44px] font-extrabold leading-none tracking-tight text-noche">
              {NIVEL_LABEL[resultado.nivel]}
            </p>
            <p className="mt-2 text-[15px] text-tinta">
              <strong>{resultado.pasosAplicables.length} de 24 pasos</strong> aplican.{' '}
              {resultado.criterioDeterminante === 'ambos'
                ? 'Lo definen tanto los vehículos como los conductores.'
                : `Lo definen los ${resultado.criterioDeterminante === 'vehiculos' ? 'vehículos' : 'conductores'}.`}
            </p>
            <p className="text-[13px] text-gris">
              {resultado.reportaSupertransporte
                ? 'Reporta su avance a Supertransporte en el módulo PESV de VIGIA 2.'
                : 'Esta modalidad no reporta en el módulo PESV de Supertransporte.'}
            </p>
          </div>
          <CuadriculaPasos estados={estados} etiquetaPendiente="Aplica" resaltarPendientes />
        </>
      )}
    </aside>
  );
}
