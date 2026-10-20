import { ROL_LABEL, ROLES, type Rol } from '@pesv/shared';
import { useState } from 'react';
import { Aviso, Boton, Cargando, Casilla, Encabezado, Insignia, Pagina, Subtitulo, Tabla, Tarjeta, Vacio, fechaHora, td, th } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';

interface Regla {
  evento: string;
  nombre: string;
  descripcion: string;
  roles: Rol[];
  correos: string[];
  activa: boolean;
}
interface Envio {
  id: number;
  para: string;
  asunto: string;
  estado: 'pendiente' | 'reintentando' | 'enviado' | 'fallido';
  intentos: number;
  error: string | null;
  enviadoEn: string | null;
  creadoEn: string;
}

const TONO_ENVIO = { pendiente: 'neutro', reintentando: 'aviso', enviado: 'exito', fallido: 'peligro' } as const;
const TEXTO_ENVIO = { pendiente: 'Pendiente', reintentando: 'Reintentando', enviado: 'Enviado', fallido: 'Falló' } as const;
const ROLES_NOTIFICABLES = ROLES.filter((r) => r !== 'consultor');

export function Notificaciones() {
  const datos = useConsulta<{ configurado: boolean; remitente: string; reglas: Regla[] }>(['notificaciones'], '/org/notificaciones');
  const historial = useConsulta<Envio[]>(['notificaciones', 'historial'], '/org/notificaciones/historial');
  const prueba = useAccion(() => api.post<{ enviado: boolean; para: string; configurado: boolean; error?: string }>('/org/notificaciones/prueba'));
  return (
    <Pagina ancho="max-w-5xl">
      <Encabezado
        titulo="Notificaciones por correo"
        descripcion="Elige quién recibe un correo con cada alerta de la plataforma. Los mismos eventos se pueden enviar a n8n para WhatsApp u otros canales."
      />
      {datos.isPending ? <Cargando /> : datos.data && (
        <>
          <Tarjeta>
            <Subtitulo acciones={<Insignia tono={datos.data.configurado ? 'exito' : 'aviso'}>{datos.data.configurado ? 'Correo configurado' : 'Correo sin configurar'}</Insignia>}>Servidor de correo</Subtitulo>
            <p className="text-sm">
              {datos.data.configurado
                ? `Los correos salen desde ${datos.data.remitente}.`
                : 'La plataforma aún no tiene servidor de correo (SMTP). Las notificaciones quedan registradas pero no se envían. Pide al administrador de la plataforma que lo configure.'}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Boton variante="secundario" cargando={prueba.isPending} onClick={() => prueba.mutate(undefined)}>Enviarme un correo de prueba</Boton>
              {prueba.data && (
                prueba.data.enviado
                  ? <span className="text-sm text-via">Enviado a {prueba.data.para}. Revisa también la carpeta de spam.</span>
                  : <span className="text-sm text-alerta">{prueba.data.error ? `No se pudo enviar: ${prueba.data.error}` : 'No se envió: falta configurar el servidor de correo.'}</span>
              )}
            </div>
            <Aviso error={prueba.error} />
          </Tarjeta>
          <Tarjeta>
            <Subtitulo>Quién recibe cada alerta</Subtitulo>
            <ul className="flex flex-col">
              {datos.data.reglas.map((r) => <FilaRegla key={r.evento} regla={r} />)}
            </ul>
          </Tarjeta>
        </>
      )}
      <Aviso error={datos.error} />
      <Tarjeta>
        <Subtitulo>Últimos correos</Subtitulo>
        {historial.isPending ? <Cargando /> : historial.data?.length ? (
          <Tabla minimo="44rem">
            <thead>
              <tr>
                <th className={th}>Fecha</th>
                <th className={th}>Para</th>
                <th className={th}>Asunto</th>
                <th className={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {historial.data.map((e) => (
                <tr key={e.id}>
                  <td className={td}>{fechaHora(e.enviadoEn ?? e.creadoEn)}</td>
                  <td className={td}>{e.para}</td>
                  <td className={td}>{e.asunto}</td>
                  <td className={td}>
                    <Insignia tono={TONO_ENVIO[e.estado]}>{TEXTO_ENVIO[e.estado]}</Insignia>
                    {e.error && <span className="block text-[12px] text-gris">{e.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        ) : <Vacio titulo="Aún no se han enviado correos" />}
      </Tarjeta>
    </Pagina>
  );
}

function FilaRegla({ regla }: { regla: Regla }) {
  const [roles, setRoles] = useState<Rol[]>(regla.roles);
  const [correos, setCorreos] = useState(regla.correos.join(', '));
  const [activa, setActiva] = useState(regla.activa);
  const lista = correos.split(/[,;\s]+/).map((c) => c.trim().toLowerCase()).filter(Boolean);
  const cambios = activa !== regla.activa || roles.join() !== regla.roles.join() || lista.join() !== regla.correos.join();
  const guardar = useAccion(() => api.put('/org/notificaciones', { evento: regla.evento, roles, correos: lista, activa }));
  return (
    <li className="flex flex-col gap-3 border-t border-linea py-4 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="font-bold text-noche">{regla.nombre}</p>
          <p className="text-[13px] text-gris">{regla.descripcion}</p>
        </div>
        <Casilla etiqueta="Enviar correo" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
      </div>
      {activa && (
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
            <legend className="sr-only">Roles que reciben {regla.nombre}</legend>
            {ROLES_NOTIFICABLES.map((r) => (
              <Casilla key={r} etiqueta={ROL_LABEL[r]} checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} />
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Otros correos (separados por coma)</span>
            <input className="rounded-lg border border-linea px-3 py-2" value={correos} onChange={(e) => setCorreos(e.target.value)} placeholder="seguridad@empresa.co" />
          </label>
        </div>
      )}
      <Aviso error={guardar.error} />
      {cambios && <Boton className="self-start" cargando={guardar.isPending} onClick={() => guardar.mutate(undefined)}>Guardar cambios</Boton>}
      {guardar.isSuccess && !cambios && <span className="text-sm text-via">Guardado</span>}
    </li>
  );
}
