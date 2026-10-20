import type { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ALCANCES_TOKEN, EVENTOS, tokenApiSchema, webhookSchema, type TokenApiInput, type WebhookInput } from '@pesv/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Aviso, Boton, Campo, Cargando, Casilla, Encabezado, Insignia, Pagina, Subtitulo, Tabla, Tarjeta, Vacio, fechaHora, td, th } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';

interface Webhook { id: string; nombre: string; url: string; eventos: string[]; activo: boolean }
interface Entrega { id: number; evento: string; destino: string; estado: 'pendiente' | 'entregado' | 'reintentando' | 'fallido'; intentos: number; codigo: number | null; respuesta: string | null; creadoEn: string }
interface Token { id: string; nombre: string; prefijo: string; alcances: string[]; ultimoUso: string | null; creadoEn: string }

const nombreEvento = (id: string) => EVENTOS.find((e) => e.id === id)?.nombre ?? id;
const TONO_ENTREGA = { pendiente: 'neutro', entregado: 'exito', reintentando: 'aviso', fallido: 'peligro' } as const;
const TEXTO_ENTREGA = { pendiente: 'Pendiente', entregado: 'Entregado', reintentando: 'Reintentando', fallido: 'Fallido' } as const;

function SecretoUnaVez({ titulo, valor, ayuda }: { titulo: string; valor: string; ayuda: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-senal-suave p-4 text-senal-tinta">
      <p className="font-bold">{titulo}</p>
      <code className="break-all rounded bg-white px-2 py-1.5 text-sm text-tinta">{valor}</code>
      <p className="text-sm">{ayuda}</p>
      <Boton variante="secundario" className="self-start" onClick={async () => { await navigator.clipboard.writeText(valor); setCopiado(true); }}>
        {copiado ? 'Copiado' : 'Copiar'}
      </Boton>
    </div>
  );
}

export function Integraciones() {
  const webhooks = useConsulta<Webhook[]>(['webhooks'], '/org/integraciones/webhooks');
  const entregas = useConsulta<Entrega[]>(['entregas'], '/org/integraciones/entregas', { refetchInterval: 15_000 });
  const [secreto, setSecreto] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const probar = useAccion(() => api.post('/org/integraciones/prueba'));
  const eliminar = useAccion((id: string) => api.delete(`/org/integraciones/webhooks/${id}`));
  const regenerar = useAccion((id: string) => api.post<{ secreto: string }>(`/org/integraciones/webhooks/${id}/secreto`), { alTerminar: (r) => setSecreto(r.secreto) });

  return (
    <Pagina ancho="max-w-5xl">
      <Encabezado
        titulo="Integraciones con n8n"
        descripcion="La plataforma envía eventos firmados a tu n8n y n8n puede consultar o crear registros con un token. Así armas alertas por WhatsApp, correos e informes sin programar."
      />

      <Tarjeta>
        <Subtitulo acciones={!creando && <Boton onClick={() => setCreando(true)}>Agregar webhook</Boton>}>Webhooks (plataforma → n8n)</Subtitulo>
        {secreto && <SecretoUnaVez titulo="Secreto de firma" valor={secreto} ayuda="Guárdalo en n8n para verificar el encabezado x-pesv-firma (HMAC-SHA256 de «timestamp.cuerpo»). No se volverá a mostrar." />}
        {creando && <FormularioWebhook alTerminar={(s) => { setCreando(false); if (s) setSecreto(s); }} />}
        {webhooks.isPending ? <Cargando /> : webhooks.data?.length ? (
          <ul className="flex flex-col">
            {webhooks.data.map((w) => (
              <li key={w.id} className="flex flex-col gap-2 border-t border-linea py-4 first:border-t-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-noche">{w.nombre}</span>
                  {w.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia>Pausado</Insignia>}
                </div>
                <code className="break-all text-[13px] text-gris">{w.url}</code>
                <p className="text-[13px]">{w.eventos.map(nombreEvento).join(' · ')}</p>
                <div className="flex flex-wrap gap-2">
                  <Boton variante="secundario" cargando={regenerar.isPending} onClick={() => regenerar.mutate(w.id)}>Regenerar secreto</Boton>
                  <Boton variante="peligro" onClick={() => { if (confirm(`¿Eliminar el webhook «${w.nombre}»?`)) eliminar.mutate(w.id); }}>Eliminar</Boton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          !creando && <Vacio titulo="Sin webhooks">Crea un webhook en n8n (nodo Webhook, método POST) y pega aquí su URL.</Vacio>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-linea pt-4">
          <Boton variante="secundario" cargando={probar.isPending} onClick={() => probar.mutate(undefined)} disabled={!webhooks.data?.length}>Enviar evento de prueba</Boton>
          {probar.isSuccess && <span className="text-sm text-via">Evento enviado. Revisa la bitácora.</span>}
        </div>
        <Aviso error={probar.error ?? eliminar.error ?? regenerar.error} />
      </Tarjeta>

      <Tokens />

      <Tarjeta>
        <Subtitulo>Bitácora de envíos</Subtitulo>
        {entregas.data?.length ? (
          <Tabla minimo="48rem">
            <thead>
              <tr>
                <th className={th}>Fecha</th>
                <th className={th}>Evento</th>
                <th className={th}>Destino</th>
                <th className={th}>Estado</th>
                <th className={th}>Respuesta</th>
              </tr>
            </thead>
            <tbody>
              {entregas.data.map((e) => (
                <tr key={e.id}>
                  <td className={td}>{fechaHora(e.creadoEn)}</td>
                  <td className={td}>{nombreEvento(e.evento)}</td>
                  <td className={td}>{e.destino}</td>
                  <td className={td}><Insignia tono={TONO_ENTREGA[e.estado]}>{TEXTO_ENTREGA[e.estado]}</Insignia> <span className="text-gris">{e.intentos} de 5</span></td>
                  <td className={`${td} text-gris`}>{e.codigo ?? '—'} {e.respuesta?.slice(0, 80)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        ) : (
          <Vacio titulo="Aún no hay envíos">Cuando ocurra un evento suscrito, aparecerá aquí con su resultado.</Vacio>
        )}
      </Tarjeta>
    </Pagina>
  );
}

function FormularioWebhook({ alTerminar }: { alTerminar: (secreto?: string) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof webhookSchema>, unknown, WebhookInput>({
    resolver: zodResolver(webhookSchema),
    defaultValues: { activo: true, eventos: ['preoperacional.falla', 'documento.por_vencer', 'documento.vencido'] },
  });
  const crear = useAccion((d: WebhookInput) => api.post<{ secreto: string }>('/org/integraciones/webhooks', d), { alTerminar: (r) => alTerminar(r.secreto) });
  return (
    <form noValidate className="flex flex-col gap-4 rounded-xl bg-papel p-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="w-nombre" etiqueta="Nombre" placeholder="Alertas por WhatsApp" error={errors.nombre?.message} {...register('nombre')} />
        <Campo id="w-url" etiqueta="URL del webhook de n8n" placeholder="https://tu-n8n/webhook/pesv" error={errors.url?.message} {...register('url')} />
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Eventos que se envían</legend>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {EVENTOS.filter((e) => e.id !== 'prueba').map((e) => (
            <Casilla key={e.id} etiqueta={e.nombre} descripcion={e.descripcion} value={e.id} {...register('eventos')} />
          ))}
        </div>
        {errors.eventos && <p className="text-[13px] text-alerta">{errors.eventos.message}</p>}
      </fieldset>
      <Aviso error={crear.error} />
      <div className="flex gap-2">
        <Boton type="submit" cargando={crear.isPending}>Crear webhook</Boton>
        <Boton variante="secundario" onClick={() => alTerminar()}>Cancelar</Boton>
      </div>
    </form>
  );
}

function Tokens() {
  const tokens = useConsulta<Token[]>(['tokens'], '/org/integraciones/tokens');
  const [token, setToken] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<TokenApiInput>({ resolver: zodResolver(tokenApiSchema), defaultValues: { alcances: ['leer'] } });
  const crear = useAccion((d: TokenApiInput) => api.post<{ token: string }>('/org/integraciones/tokens', d), { alTerminar: (r) => { setToken(r.token); reset(); } });
  const revocar = useAccion((id: string) => api.delete(`/org/integraciones/tokens/${id}`));
  return (
    <Tarjeta>
      <Subtitulo>Tokens de API (n8n → plataforma)</Subtitulo>
      <p className="text-sm text-gris">En n8n usa un nodo HTTP Request con el encabezado <code>Authorization: Bearer &lt;token&gt;</code>. Cada token solo tiene los permisos que elijas y se puede revocar en cualquier momento.</p>
      {token && <SecretoUnaVez titulo="Token de API" valor={token} ayuda="Cópialo ahora: por seguridad solo guardamos una huella y no se volverá a mostrar." />}
      <form noValidate className="flex flex-col gap-3 rounded-xl bg-papel p-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
        <Campo id="t-nombre" etiqueta="Nombre del token" placeholder="n8n informes" error={errors.nombre?.message} {...register('nombre')} />
        <div className="flex flex-wrap gap-x-6">
          {ALCANCES_TOKEN.map((a) => <Casilla key={a.id} etiqueta={a.nombre} value={a.id} {...register('alcances')} />)}
        </div>
        <Aviso error={crear.error} />
        <Boton type="submit" className="self-start" cargando={crear.isPending}>Crear token</Boton>
      </form>
      {tokens.data && tokens.data.length > 0 && (
        <ul className="flex flex-col">
          {tokens.data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 border-t border-linea py-3">
              <span className="flex min-w-0 flex-[1_1_16rem] flex-col">
                <span className="font-semibold">{t.nombre} <code className="text-[13px] text-gris">{t.prefijo}…</code></span>
                <span className="text-[13px] text-gris">{t.alcances.join(', ')} · último uso: {t.ultimoUso ? fechaHora(t.ultimoUso) : 'nunca'}</span>
              </span>
              <Boton variante="peligro" onClick={() => { if (confirm(`¿Revocar el token «${t.nombre}»? Las integraciones que lo usen dejarán de funcionar.`)) revocar.mutate(t.id); }}>Revocar</Boton>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
