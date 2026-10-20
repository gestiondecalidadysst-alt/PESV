import { zodResolver } from '@hookform/resolvers/zod';
import { cambiarClaveSchema, recuperarSchema, restablecerSchema, type CambiarClaveInput, type RecuperarInput, type RestablecerInput } from '@pesv/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Aviso, Boton, Campo, Cargando, Encabezado, Pagina, Subtitulo, Tarjeta } from '../components/ui';
import { api } from '../lib/api';
import { useSesion } from '../lib/sesion';
import type { Yo } from '../lib/tipos';
import { MarcoAcceso } from './Ingresar';

const enlace = 'font-semibold text-[#1d4e89] underline-offset-4 hover:underline';
const AYUDA_CLAVE = 'Mínimo 10 caracteres, con letras y números.';

export function Recuperar() {
  const { register, handleSubmit, formState: { errors } } = useForm<RecuperarInput>({ resolver: zodResolver(recuperarSchema) });
  const enviar = useMutation({ mutationFn: (d: RecuperarInput) => api.post<{ mensaje: string }>('/auth/recuperar', d) });
  return (
    <MarcoAcceso titulo="Recupera tu contraseña" descripcion="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva.">
      {enviar.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Aviso tono="exito">{enviar.data.mensaje}</Aviso>
          <p className="text-sm text-gris">El enlace vence en una hora. Si no llega en unos minutos, vuelve a pedirlo o consulta al administrador de tu organización.</p>
        </div>
      ) : (
        <form noValidate onSubmit={handleSubmit((d) => enviar.mutate(d))} className="flex flex-col gap-4">
          <Campo id="email" etiqueta="Correo" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          <Aviso error={enviar.error} />
          <Boton type="submit" className="h-12 text-[15px]" cargando={enviar.isPending}>Enviar enlace</Boton>
        </form>
      )}
      <Link to="/ingresar" className={`text-sm ${enlace}`}>Volver a ingresar</Link>
    </MarcoAcceso>
  );
}

/** Crear contraseña desde un enlace de recuperación o de invitación. */
export function Restablecer() {
  const [parametros] = useSearchParams();
  const token = parametros.get('token') ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const enlaceValido = useQuery({
    queryKey: ['enlace', token],
    queryFn: () => api.get<{ email: string; nombre: string; proposito: 'recuperacion' | 'invitacion' }>(`/auth/enlace?token=${encodeURIComponent(token)}`),
    enabled: token.length > 0,
    retry: false,
  });
  const { register, handleSubmit, formState: { errors } } = useForm<RestablecerInput>({ resolver: zodResolver(restablecerSchema), values: { token, password: '', confirmacion: '' } });
  const guardar = useMutation({
    mutationFn: (d: RestablecerInput) => api.post<Yo>('/auth/restablecer', d),
    onSuccess: (yo) => {
      queryClient.setQueryData(['yo'], yo);
      navigate('/', { replace: true });
    },
  });

  if (!token || enlaceValido.isError) {
    return (
      <MarcoAcceso titulo="El enlace no es válido" descripcion="Venció o ya se usó. Los enlaces de recuperación duran una hora y las invitaciones, siete días.">
        <Link to="/recuperar" className={enlace}>Pedir un enlace nuevo</Link>
      </MarcoAcceso>
    );
  }
  if (enlaceValido.isPending) return <div className="p-8"><Cargando /></div>;
  const invitacion = enlaceValido.data.proposito === 'invitacion';
  return (
    <MarcoAcceso
      titulo={invitacion ? `Bienvenida o bienvenido, ${enlaceValido.data.nombre}` : 'Crea una nueva contraseña'}
      descripcion={invitacion ? `Crea la contraseña de tu cuenta (${enlaceValido.data.email}) para entrar a la plataforma.` : `Para la cuenta ${enlaceValido.data.email}. Al guardarla se cierran las sesiones abiertas en otros dispositivos.`}
    >
      <form noValidate onSubmit={handleSubmit((d) => guardar.mutate(d))} className="flex flex-col gap-4">
        <Campo id="password" etiqueta="Nueva contraseña" type="password" autoComplete="new-password" ayuda={AYUDA_CLAVE} error={errors.password?.message} {...register('password')} />
        <Campo id="confirmacion" etiqueta="Repite la contraseña" type="password" autoComplete="new-password" error={errors.confirmacion?.message} {...register('confirmacion')} />
        <Aviso error={guardar.error} />
        <Boton type="submit" className="h-12 text-[15px]" cargando={guardar.isPending}>{invitacion ? 'Crear contraseña y entrar' : 'Guardar y entrar'}</Boton>
      </form>
    </MarcoAcceso>
  );
}

/** Datos de la cuenta, cambio de contraseña y cierre de sesiones. */
export function MiCuenta() {
  const { yo } = useSesion();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CambiarClaveInput>({ resolver: zodResolver(cambiarClaveSchema) });
  const cambiar = useMutation({ mutationFn: (d: CambiarClaveInput) => api.post<{ mensaje: string }>('/auth/cambiar-clave', d), onSuccess: () => reset() });
  const cerrar = useMutation({ mutationFn: () => api.post<{ mensaje: string }>('/auth/cerrar-sesiones') });
  if (!yo) return null;
  return (
    <Pagina ancho="max-w-3xl">
      <Encabezado titulo="Mi cuenta" descripcion={`${yo.usuario.nombre} · ${yo.usuario.email}`} />
      <Tarjeta>
        <Subtitulo>Cambiar contraseña</Subtitulo>
        <form noValidate onSubmit={handleSubmit((d) => cambiar.mutate(d))} className="flex flex-col gap-4">
          <Campo id="actual" etiqueta="Contraseña actual" type="password" autoComplete="current-password" error={errors.actual?.message} {...register('actual')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="nueva" etiqueta="Nueva contraseña" type="password" autoComplete="new-password" ayuda={AYUDA_CLAVE} error={errors.password?.message} {...register('password')} />
            <Campo id="confirmar" etiqueta="Repite la nueva contraseña" type="password" autoComplete="new-password" error={errors.confirmacion?.message} {...register('confirmacion')} />
          </div>
          <Aviso error={cambiar.error} />
          {cambiar.isSuccess && <Aviso tono="exito">{cambiar.data.mensaje}</Aviso>}
          <Boton type="submit" className="self-start" cargando={cambiar.isPending}>Cambiar contraseña</Boton>
        </form>
      </Tarjeta>
      <Tarjeta>
        <Subtitulo>Sesiones</Subtitulo>
        <p className="text-sm">Si dejaste la sesión abierta en otro equipo o perdiste un celular, cierra todas las sesiones menos esta.</p>
        <Aviso error={cerrar.error} />
        {cerrar.isSuccess && <Aviso tono="exito">{cerrar.data.mensaje}</Aviso>}
        <Boton variante="secundario" className="self-start" cargando={cerrar.isPending} onClick={() => cerrar.mutate()}>Cerrar sesión en los demás dispositivos</Boton>
      </Tarjeta>
    </Pagina>
  );
}
