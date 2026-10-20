import { zodResolver } from '@hookform/resolvers/zod';
import { invitarMiembroSchema, ROL_LABEL, ROLES, type InvitarMiembroInput } from '@pesv/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Aviso, Boton, Campo, Cargando, Casilla, Encabezado, Insignia, Pagina, Subtitulo, Tarjeta, fechaHora } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { Miembro } from '../lib/tipos';

const DESCRIPCION_ROL: Record<string, string> = {
  admin: 'Todo, incluida la configuración de IA e integraciones.',
  lider_pesv: 'Gestiona los pasos, aprueba evidencias y administra miembros.',
  comite: 'Consulta todo, gestiona siniestros y el comité.',
  conductor: 'Solo registra preoperacionales desde el celular.',
  mantenimiento: 'Gestiona la flota y el mantenimiento.',
  auditor: 'Consulta todo y registra auditorías.',
  consultor: 'Como el líder PESV, sin administrar miembros.',
};

export function Miembros() {
  const { yo, puede } = useSesion();
  const miembros = useConsulta<Miembro[]>(['miembros'], '/org/miembros');
  const [invitando, setInvitando] = useState(false);
  const quitar = useAccion((id: string) => api.delete(`/org/miembros/${id}`));

  return (
    <Pagina ancho="max-w-4xl">
      <Encabezado
        titulo="Miembros y roles"
        descripcion="Cada persona ve y hace solo lo que permite su rol en esta organización."
        acciones={puede('gestionar_miembros') && !invitando && <Boton onClick={() => setInvitando(true)}>Agregar miembro</Boton>}
      />
      {invitando && <Invitar alTerminar={() => setInvitando(false)} />}
      <Tarjeta>
        <Subtitulo>Personas con acceso</Subtitulo>
        {miembros.isPending ? <Cargando /> : (
          <ul className="flex flex-col">
            {miembros.data?.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 border-t border-linea py-3 first:border-t-0">
                <span className="flex min-w-0 flex-[1_1_16rem] flex-col">
                  <span className="font-semibold">{m.nombre}{m.id === yo?.usuario.id && ' (tú)'}</span>
                  <span className="break-all text-[13px] text-gris">{m.email} · último ingreso: {m.ultimoIngreso ? fechaHora(m.ultimoIngreso) : 'nunca'}</span>
                </span>
                <span className="flex flex-wrap gap-1">{m.roles.map((r) => <Insignia key={r} tono={r === 'admin' ? 'oscuro' : 'neutro'}>{ROL_LABEL[r as keyof typeof ROL_LABEL] ?? r}</Insignia>)}</span>
                {puede('gestionar_miembros') && m.id !== yo?.usuario.id && (
                  <Boton variante="peligro" onClick={() => { if (confirm(`¿Quitar a ${m.nombre} de la organización?`)) quitar.mutate(m.id); }}>Quitar</Boton>
                )}
              </li>
            ))}
          </ul>
        )}
        <Aviso error={miembros.error ?? quitar.error} />
      </Tarjeta>
    </Pagina>
  );
}

function Invitar({ alTerminar }: { alTerminar: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<InvitarMiembroInput>({ resolver: zodResolver(invitarMiembroSchema), defaultValues: { roles: ['conductor'] } });
  const invitar = useAccion((d: InvitarMiembroInput) => api.post<{ cuentaNueva: boolean }>('/org/miembros', d), { alTerminar });
  return (
    <Tarjeta>
      <Subtitulo>Agregar miembro</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => invitar.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="m-nombre" etiqueta="Nombre" error={errors.nombre?.message} {...register('nombre')} />
          <Campo id="m-email" etiqueta="Correo" type="email" error={errors.email?.message} {...register('email')} />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Roles</legend>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {ROLES.map((r) => <Casilla key={r} etiqueta={ROL_LABEL[r]} descripcion={DESCRIPCION_ROL[r]} value={r} {...register('roles')} />)}
          </div>
          {errors.roles && <p className="text-[13px] text-alerta">{errors.roles.message}</p>}
        </fieldset>
        <Campo
          id="m-clave"
          etiqueta="Contraseña temporal"
          type="password"
          autoComplete="new-password"
          ayuda="Solo si la persona aún no tiene cuenta. Compártela por un canal seguro y pídele que la cambie."
          error={errors.passwordTemporal?.message}
          {...register('passwordTemporal', { setValueAs: (v) => v || undefined })}
        />
        <Aviso error={invitar.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={invitar.isPending}>Agregar</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
