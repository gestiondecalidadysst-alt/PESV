import { zodResolver } from '@hookform/resolvers/zod';
import {
  clasificar,
  crearOrganizacionSchema,
  MODALIDADES,
  NIVEL_LABEL,
  OBLIGACION,
  RADIOS_ACCION,
  registroSchema,
  type EstadoPaso,
  type RegistroInput,
  type ResultadoClasificacion,
} from '@pesv/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { CuadriculaPasos } from '../components/CuadriculaPasos';
import { Aviso, Boton, Campo, Casilla, Encabezado, Pagina, Selector } from '../components/ui';
import { api } from '../lib/api';
import { guardarOrganizacionElegida, useSesion } from '../lib/sesion';

const RADIO_LABEL: Record<(typeof RADIOS_ACCION)[number], string> = {
  municipal: 'Municipal',
  departamental: 'Departamental',
  nacional: 'Nacional',
  internacional: 'Internacional',
};

const nuevaSchema = z.object({ organizacion: crearOrganizacionSchema });
type Formulario = RegistroInput;

/** Registro de cuenta nueva (modo "registro") o de otra organización con la sesión activa (modo "nueva"). */
function FormularioOrganizacion({ modo }: { modo: 'registro' | 'nueva' }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { elegirOrganizacion } = useSesion();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<Formulario>({
    resolver: zodResolver((modo === 'registro' ? registroSchema : nuevaSchema) as typeof registroSchema),
    defaultValues: { organizacion: { nombre: '', nit: '', clasificacion: { misionalidad: 2, modalidadId: 'no_transporte' } } },
  });

  const misionalidad = useWatch({ control, name: 'organizacion.clasificacion.misionalidad' });
  const vehiculos = useWatch({ control, name: 'organizacion.clasificacion.vehiculos' });
  const conductores = useWatch({ control, name: 'organizacion.clasificacion.conductores' });
  const modalidadId = useWatch({ control, name: 'organizacion.clasificacion.modalidadId' });
  const voluntaria = useWatch({ control, name: 'organizacion.adopcionVoluntaria' });
  const modalidades = MODALIDADES.filter((m) => m.misionalidad === Number(misionalidad));

  useEffect(() => {
    if (!modalidades.some((m) => m.id === modalidadId)) setValue('organizacion.clasificacion.modalidadId', modalidades[0]?.id);
  }, [misionalidad]); // eslint-disable-line react-hooks/exhaustive-deps

  const resultado = useMemo<ResultadoClasificacion | null>(() => {
    const v = Number(vehiculos);
    const c = Number(conductores);
    if (!Number.isInteger(v) || !Number.isInteger(c) || v < 0 || c < 0) return null;
    return clasificar({ misionalidad: Number(misionalidad) as 1 | 2, vehiculos: v, conductores: c, modalidadId });
  }, [misionalidad, vehiculos, conductores, modalidadId]);

  const enviar = useMutation({
    mutationFn: async (datos: Formulario) =>
      modo === 'registro'
        ? (await api.post<{ organizacionId: string }>('/auth/registro', datos)).organizacionId
        : (await api.post<{ organizacion: { id: string } }>('/organizations', datos.organizacion)).organizacion.id,
    onSuccess: async (organizacionId) => {
      guardarOrganizacionElegida(organizacionId);
      await queryClient.invalidateQueries({ queryKey: ['yo'] });
      elegirOrganizacion(organizacionId);
      navigate('/');
    },
  });

  const e = errors.organizacion;
  return (
    <div className="flex flex-wrap items-start gap-8">
      <form noValidate onSubmit={handleSubmit((d) => enviar.mutate(d))} className="flex min-w-0 flex-[1_1_24rem] flex-col gap-7">
        {modo === 'registro' && (
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-3 text-lg font-bold text-noche">Tu cuenta</legend>
            <Campo id="nombre" etiqueta="Tu nombre" autoComplete="name" error={errors.nombre?.message} {...register('nombre')} />
            <div className="flex flex-wrap gap-4">
              <Campo id="email" etiqueta="Correo" type="email" autoComplete="email" className="flex-[1_1_14rem]" error={errors.email?.message} {...register('email')} />
              <Campo
                id="password"
                etiqueta="Contraseña"
                type="password"
                autoComplete="new-password"
                className="flex-[1_1_14rem]"
                ayuda="Mínimo 10 caracteres, con letras y números."
                error={errors.password?.message}
                {...register('password')}
              />
            </div>
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-lg font-bold text-noche">Datos de la organización</legend>
          <Campo id="org-nombre" etiqueta="Razón social" autoComplete="organization" error={e?.nombre?.message} {...register('organizacion.nombre')} />
          <div className="flex flex-wrap gap-4">
            <Campo id="nit" etiqueta="NIT sin dígito de verificación" inputMode="numeric" placeholder="900123456" className="flex-[1_1_12rem]" error={e?.nit?.message} {...register('organizacion.nit')} />
            <Selector id="radio" etiqueta="Radio de acción" className="flex-[1_1_12rem]" {...register('organizacion.radioAccion', { setValueAs: (v) => v || undefined })}>
              <option value="">Sin definir</option>
              {RADIOS_ACCION.map((r) => (
                <option key={r} value={r}>{RADIO_LABEL[r]}</option>
              ))}
            </Selector>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-lg font-bold text-noche">¿A qué se dedica?</legend>
          <Controller
            control={control}
            name="organizacion.clasificacion.misionalidad"
            render={({ field }) => (
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  { valor: 2, titulo: 'Otra actividad', texto: 'Tiene vehículos o conductores, pero el transporte no es su negocio.' },
                  { valor: 1, titulo: 'Transporte', texto: 'Presta servicio de transporte de carga o de pasajeros.' },
                ] as const).map((op) => (
                  <label key={op.valor} className="flex cursor-pointer gap-3 rounded-xl border border-linea bg-white p-4 has-[:checked]:border-noche has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-noche)]">
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
            <Selector id="modalidad" etiqueta="Modalidad de transporte" error={e?.clasificacion?.modalidadId?.message} {...register('organizacion.clasificacion.modalidadId')}>
              {modalidades.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </Selector>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-lg font-bold text-noche">Flota y conductores</legend>
          <div className="flex flex-wrap gap-4">
            <Campo
              id="vehiculos"
              etiqueta="Vehículos"
              type="number"
              min={0}
              inputMode="numeric"
              className="flex-[1_1_12rem]"
              ayuda="Propios, de contratistas o de terceros a su servicio, con o sin motor."
              error={e?.clasificacion?.vehiculos?.message}
              {...register('organizacion.clasificacion.vehiculos', { valueAsNumber: true })}
            />
            <Campo
              id="conductores"
              etiqueta="Conductores"
              type="number"
              min={0}
              inputMode="numeric"
              className="flex-[1_1_12rem]"
              ayuda="Toda persona que conduce para la organización, sin importar su cargo."
              error={e?.clasificacion?.conductores?.message}
              {...register('organizacion.clasificacion.conductores', { valueAsNumber: true })}
            />
          </div>
        </fieldset>

        {resultado && !resultado.obligada && (
          <Casilla
            etiqueta="Quiero implementar el PESV de forma voluntaria"
            descripcion="Se aplican los 18 pasos del nivel básico. No reportarás a Supertransporte mientras no estés obligada."
            {...register('organizacion.adopcionVoluntaria')}
          />
        )}
        <Aviso error={enviar.error} />
        <div className="flex flex-wrap items-center gap-4">
          <Boton type="submit" className="h-12 px-6 text-[15px]" cargando={enviar.isPending} disabled={resultado !== null && !resultado.obligada && !voluntaria}>
            {modo === 'registro' ? 'Crear cuenta' : 'Registrar organización'}
          </Boton>
          {modo === 'registro' && (
            <p className="text-sm text-gris">
              ¿Ya tienes cuenta? <Link to="/ingresar" className="font-semibold text-[#1d4e89] underline-offset-4 hover:underline">Ingresa</Link>
            </p>
          )}
        </div>
      </form>
      <ResultadoEnVivo resultado={resultado} />
    </div>
  );
}

function ResultadoEnVivo({ resultado }: { resultado: ResultadoClasificacion | null }) {
  const estados: Partial<Record<number, EstadoPaso>> = {};
  resultado?.pasosAplicables.forEach((n) => (estados[n] = 'pendiente'));
  return (
    <aside aria-live="polite" aria-label="Resultado de la clasificación" className="flex min-w-0 flex-[1_1_22rem] flex-col gap-5 rounded-2xl bg-white p-6 ring-1 ring-linea lg:sticky lg:top-6">
      {!resultado && (
        <p className="text-[15px] leading-relaxed text-gris">
          Escribe cuántos vehículos y conductores tiene la organización y aquí verás su nivel y los pasos que le aplican.
        </p>
      )}
      {resultado && !resultado.obligada && (
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-extrabold text-noche">No está obligada</p>
          <p className="text-[15px] leading-relaxed text-gris">
            El PESV es obligatorio con más de {OBLIGACION.vehiculosMayorA} vehículos o con {OBLIGACION.conductoresDesde} o más conductores. Aun así puedes
            adoptarlo de forma voluntaria con los pasos del nivel básico; si la flota crece, la plataforma te propone reclasificar.
          </p>
        </div>
      )}
      {resultado?.obligada && resultado.nivel && (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-gris">Nivel</p>
            <p className="text-[44px] font-extrabold leading-none tracking-tight text-noche">{NIVEL_LABEL[resultado.nivel]}</p>
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

export function Registro() {
  return (
    <div className="min-h-screen bg-papel px-5 py-8 sm:px-8 lg:px-10">
      <Pagina>
        <Logo />
        <Encabezado
          titulo="Crea tu cuenta y clasifica tu organización"
          descripcion="Con la flota y los conductores calculamos tu nivel según la Resolución 40595 de 2022 y activamos solo los pasos que te aplican."
        />
        <FormularioOrganizacion modo="registro" />
      </Pagina>
    </div>
  );
}

export function NuevaOrganizacion() {
  return (
    <Pagina>
      <Encabezado
        titulo="Registrar otra organización"
        descripcion="Quedarás como administrador y líder PESV. Puedes cambiar entre organizaciones desde el menú."
      />
      <FormularioOrganizacion modo="nueva" />
    </Pagina>
  );
}

export function Logo({ claro }: { claro?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 self-start">
      <span aria-hidden="true" className="grid size-8 rotate-45 place-items-center rounded-md bg-senal">
        <span className="-rotate-45 text-sm font-extrabold text-noche">P</span>
      </span>
      <span className={`text-lg font-bold ${claro ? 'text-white' : 'text-noche'}`}>PESV</span>
    </Link>
  );
}
