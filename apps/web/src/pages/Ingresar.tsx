import { zodResolver } from '@hookform/resolvers/zod';
import { ingresoSchema, type IngresoInput } from '@pesv/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { Aviso, Boton, Campo } from '../components/ui';
import { api } from '../lib/api';
import type { Yo } from '../lib/tipos';
import { Logo } from '../components/Logo';

const enlace = 'font-semibold text-[#1d4e89] underline-offset-4 hover:underline';

/** Marco de las pantallas de acceso: presentación a la izquierda y formulario a la derecha. */
export function MarcoAcceso({ titulo, descripcion, children }: { titulo: string; descripcion?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-noche lg:grid-cols-[1fr_minmax(28rem,36rem)]">
      <div className="hidden flex-col justify-between p-10 lg:flex">
        <Logo claro />
        <div className="flex max-w-lg flex-col gap-4">
          <p className="text-[40px] font-extrabold leading-tight text-white">El PESV de tu organización, al día y listo para auditoría.</p>
          <p className="text-[17px] leading-relaxed text-[#c9d2de]">
            Los 24 pasos de la Resolución 40595, ISO 39001, la operación diaria de la flota y el reporte a Supertransporte en un solo lugar.
          </p>
        </div>
        <p className="text-sm text-[#8c99ab]">Plataforma de gestión de seguridad vial</p>
      </div>
      <main className="flex flex-col justify-center gap-8 bg-papel px-6 py-10 sm:px-12">
        <div className="lg:hidden"><Logo /></div>
        <div className="flex flex-col gap-2">
          <h1 className="text-[30px] font-extrabold text-noche">{titulo}</h1>
          {descripcion && <p className="text-gris">{descripcion}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}

export function Ingresar() {
  const navigate = useNavigate();
  const ubicacion = useLocation();
  const queryClient = useQueryClient();
  const desde = (ubicacion.state as { desde?: string } | null)?.desde;
  const { register, handleSubmit, formState: { errors } } = useForm<IngresoInput>({ resolver: zodResolver(ingresoSchema) });
  const ingresar = useMutation({
    mutationFn: (datos: IngresoInput) => api.post<Yo>('/auth/ingresar', datos),
    onSuccess: (yo) => {
      queryClient.setQueryData(['yo'], yo);
      // Vuelve a la página que se quería abrir (por ejemplo, desde un correo de notificación).
      navigate(desde && desde.startsWith('/') ? desde : '/', { replace: true });
    },
  });

  return (
    <MarcoAcceso titulo="Ingresa" descripcion="Usa el correo y la contraseña de tu cuenta.">
      <form noValidate onSubmit={handleSubmit((d) => ingresar.mutate(d))} className="flex flex-col gap-4">
        <Campo id="email" etiqueta="Correo" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Campo id="password" etiqueta="Contraseña" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <Link to="/recuperar" className={`self-end text-sm ${enlace}`}>¿Olvidaste tu contraseña?</Link>
        <Aviso error={ingresar.error} />
        <Boton type="submit" className="h-12 text-[15px]" cargando={ingresar.isPending}>Ingresar</Boton>
      </form>
      <p className="text-sm text-gris">
        ¿Tu organización aún no está registrada?{' '}
        <Link to="/registro" className={enlace}>Crea una cuenta</Link>
      </p>
    </MarcoAcceso>
  );
}
