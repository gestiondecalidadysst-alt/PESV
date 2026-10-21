import { zodResolver } from '@hookform/resolvers/zod';
import { decisionSchema, miembroComiteSchema, type DecisionInput, type MiembroComiteInput } from '@pesv/shared';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import type { z } from 'zod';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Casilla, Encabezado, Insignia, Pagina, Pestanas, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fechaHora, td, th } from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import { ListaAcciones, type Accion } from './Acciones';
import { NuevaAccion } from '../components/NuevaAccion';

type RolComite = 'presidente' | 'secretario' | 'lider_pesv' | 'integrante';
const ROL_COMITE: Record<RolComite, string> = { presidente: 'Presidente', secretario: 'Secretario', lider_pesv: 'Líder PESV', integrante: 'Integrante' };
type EstadoReunion = 'programada' | 'en_curso' | 'cerrada' | 'firmada';
const ESTADO_REUNION: Record<EstadoReunion, { texto: string; tono: 'neutro' | 'aviso' | 'exito' | 'info' }> = {
  programada: { texto: 'Programada', tono: 'neutro' },
  en_curso: { texto: 'En curso', tono: 'aviso' },
  cerrada: { texto: 'Cerrada · firmas pendientes', tono: 'info' },
  firmada: { texto: 'Acta firmada', tono: 'exito' },
};

interface MiembroComite {
  id: string;
  usuarioId: string | null;
  nombre: string;
  cargo: string | null;
  rolComite: RolComite;
  activo: boolean;
}
interface ResumenReunion {
  id: string;
  fecha: string;
  lugar: string | null;
  tipo: 'ordinaria' | 'extraordinaria';
  estado: EstadoReunion;
  quorumRequerido: number;
  presentes: number;
}
interface Punto {
  id: string;
  titulo: string;
  notas: string;
  origen?: string;
}
interface Reunion extends ResumenReunion {
  agenda: Punto[];
  transcripcion: string | null;
  hayQuorum: boolean;
  tieneActa: boolean;
  asistencia: { miembroId: string; usuarioId: string | null; nombre: string; cargo: string | null; rolComite: RolComite; presente: boolean; llegada: string | null; firmadoEn: string | null }[];
  decisiones: { id: string; puntoId: string | null; texto: string; votosAFavor: number; votosEnContra: number; abstenciones: number; aprobada: boolean }[];
  compromisos: Accion[];
}

export function Comite() {
  const [pestana, setPestana] = useState<'reuniones' | 'integrantes'>('reuniones');
  return (
    <Pagina>
      <Encabezado
        titulo="Comité de seguridad vial"
        descripcion="Paso 2 del PESV. Programa las reuniones con una agenda armada con los pendientes, toma el acta en vivo y ciérrala con quórum y firmas."
      />
      <Pestanas valor={pestana} alCambiar={setPestana} opciones={[{ id: 'reuniones', nombre: 'Reuniones' }, { id: 'integrantes', nombre: 'Integrantes' }]} />
      {pestana === 'reuniones' ? <Reuniones /> : <Integrantes />}
    </Pagina>
  );
}

function Reuniones() {
  const { puede } = useSesion();
  const reuniones = useConsulta<ResumenReunion[]>(['comite', 'reuniones'], '/org/comite/reuniones');
  const [programando, setProgramando] = useState(false);
  return (
    <>
      {puede('comite') && (programando ? <Programar alTerminar={() => setProgramando(false)} /> : <Boton className="self-start" onClick={() => setProgramando(true)}>Programar reunión</Boton>)}
      {reuniones.isPending ? <Cargando /> : reuniones.data?.length ? (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Fecha</th>
              <th className={th}>Tipo</th>
              <th className={th}>Lugar</th>
              <th className={th}>Quórum</th>
              <th className={th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {reuniones.data.map((r) => (
              <tr key={r.id}>
                <td className={td}><Link to={`/comite/${r.id}`} className="font-semibold text-[#1d4e89] underline-offset-4 hover:underline">{fechaHora(r.fecha)}</Link></td>
                <td className={td}>{r.tipo === 'ordinaria' ? 'Ordinaria' : 'Extraordinaria'}</td>
                <td className={td}>{r.lugar ?? '—'}</td>
                <td className={td}>{r.presentes} de {r.quorumRequerido} requeridos</td>
                <td className={td}><Insignia tono={ESTADO_REUNION[r.estado].tono}>{ESTADO_REUNION[r.estado].texto}</Insignia></td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio titulo="Aún no hay reuniones">El comité debe reunirse al menos cada seis meses. Registra a sus integrantes y programa la primera.</Vacio>
      )}
      <Aviso error={reuniones.error} />
    </>
  );
}

function Programar({ alTerminar }: { alTerminar: () => void }) {
  const navegar = useNavigate();
  const sugerida = useConsulta<Punto[]>(['comite', 'agenda-sugerida'], '/org/comite/agenda-sugerida', { staleTime: 0 });
  const [fecha, setFecha] = useState('');
  const [lugar, setLugar] = useState('');
  const [tipo, setTipo] = useState<'ordinaria' | 'extraordinaria'>('ordinaria');
  const [agenda, setAgenda] = useState<string[] | null>(null);
  const [nuevo, setNuevo] = useState('');
  const puntos = agenda ?? sugerida.data?.map((p) => p.titulo) ?? [];
  const programar = useAccion(
    () => api.post<{ id: string }>('/org/comite/reuniones', { fecha: fecha ? new Date(fecha).toISOString() : '', lugar: lugar || undefined, tipo, agenda: puntos }),
    { alTerminar: (r) => { alTerminar(); void navegar(`/comite/${r.id}`); } },
  );
  return (
    <Tarjeta>
      <Subtitulo>Programar reunión</Subtitulo>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="r-fecha" etiqueta="Fecha y hora" type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <Campo id="r-lugar" etiqueta="Lugar o enlace" value={lugar} onChange={(e) => setLugar(e.target.value)} />
        <Selector id="r-tipo" etiqueta="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
          <option value="ordinaria">Ordinaria</option>
          <option value="extraordinaria">Extraordinaria</option>
        </Selector>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Orden del día</p>
        <p className="text-[13px] text-gris">Sugerido con los pendientes de la organización: siniestros sin revisar, acciones abiertas, alertas de flota e indicadores. Quita o agrega puntos.</p>
        {sugerida.isPending ? <Cargando texto="Armando la agenda…" /> : (
          <ol className="flex flex-col gap-1">
            {puntos.map((p, i) => (
              <li key={`${i}-${p}`} className="flex items-center justify-between gap-3 rounded-lg bg-papel px-3 py-2 text-sm">
                <span>{i + 1}. {p}</span>
                <Boton variante="texto" aria-label={`Quitar el punto ${p}`} onClick={() => setAgenda(puntos.filter((_, j) => j !== i))}>Quitar</Boton>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Campo id="r-nuevo" etiqueta="Agregar punto" className="flex-1" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
          <Boton variante="secundario" disabled={nuevo.trim().length < 3} onClick={() => { setAgenda([...puntos, nuevo.trim()]); setNuevo(''); }}>Agregar</Boton>
        </div>
      </div>
      <Aviso error={programar.error ?? sugerida.error} />
      <div className="flex gap-2">
        <Boton cargando={programar.isPending} disabled={!fecha || puntos.length === 0} onClick={() => programar.mutate(undefined)}>Programar y convocar</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
      <p className="text-[13px] text-gris">Al programar se envía el evento <code>comite.reunion</code> para que n8n convoque a los integrantes.</p>
    </Tarjeta>
  );
}

function Integrantes() {
  const { puede } = useSesion();
  const miembros = useConsulta<MiembroComite[]>(['comite', 'miembros'], '/org/comite/miembros');
  const usuarios = useConsulta<{ id: string; nombre: string; email: string }[]>(['miembros'], '/org/miembros');
  const [editando, setEditando] = useState<MiembroComite | 'nuevo' | null>(null);
  return (
    <>
      {puede('comite') && !editando && <Boton className="self-start" onClick={() => setEditando('nuevo')}>Agregar integrante</Boton>}
      {editando && <FormularioIntegrante key={editando === 'nuevo' ? 'nuevo' : editando.id} miembro={editando === 'nuevo' ? undefined : editando} usuarios={usuarios.data ?? []} alTerminar={() => setEditando(null)} />}
      {miembros.isPending ? <Cargando /> : miembros.data?.length ? (
        <Tabla minimo="36rem">
          <thead>
            <tr>
              <th className={th}>Nombre</th>
              <th className={th}>Cargo</th>
              <th className={th}>Rol en el comité</th>
              <th className={th}>Usuario</th>
              <th className={th}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {miembros.data.map((m) => (
              <tr key={m.id} className={m.activo ? '' : 'opacity-60'}>
                <td className={td}><strong className="text-noche">{m.nombre}</strong>{!m.activo && ' · inactivo'}</td>
                <td className={td}>{m.cargo ?? '—'}</td>
                <td className={td}>{ROL_COMITE[m.rolComite]}</td>
                <td className={td}>{m.usuarioId ? 'Vinculado (puede firmar)' : 'Sin usuario'}</td>
                <td className={td}>{puede('comite') && <Boton variante="texto" onClick={() => setEditando(m)}>Editar</Boton>}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio titulo="Sin integrantes">Incluye al menos al líder del PESV, un representante de la alta dirección y de los conductores.</Vacio>
      )}
      <Aviso error={miembros.error} />
    </>
  );
}

function FormularioIntegrante({ miembro, usuarios, alTerminar }: { miembro?: MiembroComite; usuarios: { id: string; nombre: string; email: string }[]; alTerminar: () => void }) {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<z.input<typeof miembroComiteSchema>, unknown, MiembroComiteInput>({
    resolver: zodResolver(miembroComiteSchema),
    defaultValues: miembro
      ? { usuarioId: miembro.usuarioId, nombre: miembro.nombre, cargo: miembro.cargo ?? '', rolComite: miembro.rolComite, activo: miembro.activo }
      : { rolComite: 'integrante', activo: true },
  });
  const guardar = useAccion((d: MiembroComiteInput) => (miembro ? api.patch(`/org/comite/miembros/${miembro.id}`, d) : api.post('/org/comite/miembros', d)), { alTerminar });
  return (
    <Tarjeta>
      <Subtitulo>{miembro ? 'Editar integrante' : 'Nuevo integrante'}</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Selector
            id="m-usuario"
            etiqueta="Usuario de la plataforma"
            ayuda="Vincúlalo para que pueda registrar su llegada y firmar el acta."
            {...register('usuarioId', { setValueAs: (v) => v || null })}
            onChange={(e) => {
              setValue('usuarioId', e.target.value || null);
              const u = usuarios.find((x) => x.id === e.target.value);
              if (u) setValue('nombre', u.nombre);
            }}
          >
            <option value="">Sin usuario</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.email}</option>)}
          </Selector>
          <Campo id="m-nombre" etiqueta="Nombre" error={errors.nombre?.message} {...register('nombre')} />
          <Campo id="m-cargo" etiqueta="Cargo" {...register('cargo')} />
          <Selector id="m-rol" etiqueta="Rol en el comité" {...register('rolComite')}>
            {Object.entries(ROL_COMITE).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </Selector>
        </div>
        <Casilla etiqueta="Integrante activo (se convoca a las reuniones)" {...register('activo')} />
        <Aviso error={guardar.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={guardar.isPending}>Guardar</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

// Modo reunión ----------------------------------------------------------------

export function ReunionComite() {
  const { id } = useParams();
  const { puede, yo } = useSesion();
  const ia = useConsulta<{ agentes: string[] }>(['ia-estado'], '/org/ia/estado');
  const r = useConsulta<Reunion>(['comite', 'reunion', id], `/org/comite/reuniones/${id}`, {
    // Durante la reunión varias personas escriben a la vez: se refresca cada 5 segundos.
    refetchInterval: (q) => (q.state.data?.estado === 'en_curso' ? 5000 : false),
  });
  const iniciar = useAccion(() => api.post(`/org/comite/reuniones/${id}/iniciar`));
  const llegada = useAccion(() => api.post(`/org/comite/reuniones/${id}/llegada`));
  const asistencia = useAccion((v: { miembroId: string; presente: boolean }) => api.post(`/org/comite/reuniones/${id}/asistencia`, v));

  if (r.isPending) return <Cargando />;
  if (r.error || !r.data) return <Aviso error={r.error} />;
  const d = r.data;
  const enCurso = d.estado === 'en_curso';
  const editable = puede('comite') && (d.estado === 'programada' || enCurso);
  const yoEnComite = d.asistencia.find((a) => a.usuarioId === yo?.usuario.id);

  return (
    <Pagina ancho="max-w-5xl">
      <Link to="/comite" className="self-start text-sm font-semibold text-[#1d4e89] underline-offset-4 hover:underline">Comité</Link>
      <Encabezado
        titulo={`Reunión ${d.tipo} · ${fechaHora(d.fecha)}`}
        descripcion={d.lugar ?? undefined}
        acciones={
          <>
            <Insignia tono={ESTADO_REUNION[d.estado].tono}>{ESTADO_REUNION[d.estado].texto}</Insignia>
            {d.estado === 'programada' && puede('comite') && <Boton cargando={iniciar.isPending} onClick={() => iniciar.mutate(undefined)}>Iniciar reunión</Boton>}
            {d.tieneActa && <a href={urlApi(`/org/comite/reuniones/${d.id}/acta`)} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea">Descargar acta (PDF)</a>}
          </>
        }
      />
      <Aviso error={iniciar.error ?? llegada.error ?? asistencia.error} />

      <Tarjeta>
        <Subtitulo acciones={<Insignia tono={d.hayQuorum ? 'exito' : 'aviso'}>{d.hayQuorum ? 'Hay quórum' : `Faltan ${d.quorumRequerido - d.presentes} para quórum`}</Insignia>}>
          Asistencia · {d.presentes} de {d.asistencia.length} (quórum {d.quorumRequerido})
        </Subtitulo>
        {enCurso && yoEnComite && !yoEnComite.presente && (
          <Boton className="self-start" cargando={llegada.isPending} onClick={() => llegada.mutate(undefined)}>Registrar mi llegada</Boton>
        )}
        <ul className="grid gap-2 sm:grid-cols-2">
          {d.asistencia.map((a) => (
            <li key={a.miembroId} className="flex items-center justify-between gap-3 rounded-lg bg-papel px-3 py-2 text-sm">
              <span>
                <strong className="text-noche">{a.nombre}</strong> · {ROL_COMITE[a.rolComite]}
                {a.firmadoEn && <span className="block text-[13px] text-gris">Firmó el {fechaHora(a.firmadoEn)}</span>}
              </span>
              {editable ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-5 accent-[#1d4e89]" checked={a.presente} onChange={(e) => asistencia.mutate({ miembroId: a.miembroId, presente: e.target.checked })} />
                  Presente
                </label>
              ) : (
                <Insignia tono={a.presente ? 'exito' : 'neutro'}>{a.presente ? 'Presente' : 'Ausente'}</Insignia>
              )}
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>Orden del día y notas</Subtitulo>
        {!enCurso && d.estado === 'programada' && <p className="text-sm text-gris">Inicia la reunión para tomar notas en cada punto.</p>}
        <ol className="flex flex-col gap-4">
          {d.agenda.map((p, i) => <PuntoAgenda key={p.id} reunionId={d.id} punto={p} numero={i + 1} editable={enCurso && puede('comite')} />)}
        </ol>
        {enCurso && puede('comite') && <AgregarPunto reunionId={d.id} />}
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>Decisiones</Subtitulo>
        {d.decisiones.length ? (
          <ul className="flex flex-col gap-2">
            {d.decisiones.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Insignia tono={x.aprobada ? 'exito' : 'peligro'}>{x.aprobada ? 'Aprobada' : 'No aprobada'}</Insignia>
                <span>{x.texto}</span>
                <span className="text-[13px] text-gris">A favor {x.votosAFavor} · en contra {x.votosEnContra} · abstenciones {x.abstenciones}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gris">Sin decisiones registradas.</p>}
        {enCurso && puede('comite') && <NuevaDecision key={d.presentes} reunion={d} />}
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>Compromisos</Subtitulo>
        <ListaAcciones acciones={d.compromisos} />
        {enCurso && puede('comite') && <NuevaAccion ruta={`/org/comite/reuniones/${d.id}/compromisos`} tipoPorDefecto="compromiso" />}
      </Tarjeta>

      {enCurso && puede('comite') && <CierreReunion reunion={d} conIa={!!ia.data?.agentes.includes('copiloto')} />}
      {d.estado === 'cerrada' && yoEnComite?.presente && !yoEnComite.firmadoEn && <FirmarActa reunionId={d.id} />}
      {d.estado === 'cerrada' && (
        <Aviso tono="info">El acta quedó como evidencia del paso 2 y espera la firma de: {d.asistencia.filter((a) => a.presente && !a.firmadoEn).map((a) => a.nombre).join(', ') || 'nadie'}.</Aviso>
      )}
    </Pagina>
  );
}

/** Notas de un punto con guardado automático 1,5 s después de dejar de escribir. */
function PuntoAgenda({ reunionId, punto, numero, editable }: { reunionId: string; punto: Punto; numero: number; editable: boolean }) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const guardar = useAccion((notas: string) => api.patch(`/org/comite/reuniones/${reunionId}/puntos/${punto.id}`, { notas }));
  useEffect(() => () => clearTimeout(temporizador.current), []);
  const valor = borrador ?? punto.notas;
  const programarGuardado = (texto: string) => {
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => guardar.mutate(texto), 1500);
  };
  const estadoGuardado = guardar.isPending ? 'Guardando…' : guardar.error ? 'No se pudo guardar' : borrador !== null && guardar.isSuccess ? 'Guardado' : '';
  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-noche">{numero}. {punto.titulo}</p>
        {estadoGuardado && <span className="text-[13px] text-gris" aria-live="polite">{estadoGuardado}</span>}
      </div>
      {editable ? (
        <AreaTexto
          id={`notas-${punto.id}`}
          etiqueta={`Notas del punto ${numero}`}
          value={valor}
          onChange={(e) => {
            setBorrador(e.target.value);
            programarGuardado(e.target.value);
          }}
          onBlur={() => {
            if (borrador === null) return;
            clearTimeout(temporizador.current);
            guardar.mutate(borrador, { onSuccess: () => setBorrador(null) });
          }}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm">{punto.notas || <span className="text-gris">Sin notas.</span>}</p>
      )}
    </li>
  );
}

function AgregarPunto({ reunionId }: { reunionId: string }) {
  const [titulo, setTitulo] = useState('');
  const agregar = useAccion(() => api.post(`/org/comite/reuniones/${reunionId}/puntos`, { titulo }), { alTerminar: () => setTitulo('') });
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Campo id="nuevo-punto" etiqueta="Punto adicional (proposiciones y varios)" className="flex-1" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <Boton variante="secundario" cargando={agregar.isPending} disabled={titulo.trim().length < 3} onClick={() => agregar.mutate(undefined)}>Agregar punto</Boton>
      <Aviso error={agregar.error} />
    </div>
  );
}

/** Se vuelve a montar cuando cambia la asistencia, para proponer como votos a favor a los presentes. */
function NuevaDecision({ reunion }: { reunion: Reunion }) {
  const numero = (v: string) => (v === '' ? 0 : Number(v));
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof decisionSchema>, unknown, DecisionInput>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { votosAFavor: reunion.presentes, votosEnContra: 0, abstenciones: 0 },
  });
  const crear = useAccion((x: DecisionInput) => api.post(`/org/comite/reuniones/${reunion.id}/decisiones`, x), { alTerminar: () => reset({ votosAFavor: reunion.presentes, votosEnContra: 0, abstenciones: 0 }) });
  return (
    <form noValidate className="flex flex-col gap-3 rounded-xl bg-papel p-4" onSubmit={handleSubmit((x) => crear.mutate({ ...x, puntoId: x.puntoId || undefined }))}>
      {!reunion.hayQuorum && <Aviso tono="info">Sin quórum no se pueden registrar decisiones.</Aviso>}
      <Campo id="d-texto" etiqueta="Decisión" error={errors.texto?.message} {...register('texto')} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Selector id="d-punto" etiqueta="Punto" {...register('puntoId')}>
          <option value="">General</option>
          {reunion.agenda.map((p, i) => <option key={p.id} value={p.id}>{i + 1}. {p.titulo.slice(0, 40)}</option>)}
        </Selector>
        <Campo id="d-favor" etiqueta="A favor" type="number" min={0} {...register('votosAFavor', { setValueAs: numero })} />
        <Campo id="d-contra" etiqueta="En contra" type="number" min={0} {...register('votosEnContra', { setValueAs: numero })} />
        <Campo id="d-abs" etiqueta="Abstenciones" type="number" min={0} {...register('abstenciones', { setValueAs: numero })} />
      </div>
      <Aviso error={crear.error} />
      <Boton type="submit" className="self-start" disabled={!reunion.hayQuorum} cargando={crear.isPending}>Registrar decisión</Boton>
    </form>
  );
}

function CierreReunion({ reunion, conIa }: { reunion: Reunion; conIa: boolean }) {
  const [transcripcion, setTranscripcion] = useState<string | null>(null);
  const [resumen, setResumen] = useState('');
  const guardarTranscripcion = useAccion((texto: string) => api.put(`/org/comite/reuniones/${reunion.id}/transcripcion`, { texto }), { alTerminar: () => setTranscripcion(null) });
  const borrador = useAccion(() => api.post<{ borrador: string }>(`/org/comite/reuniones/${reunion.id}/borrador-acta`), { alTerminar: (r) => setResumen(r.borrador) });
  const cerrar = useAccion(() => api.post(`/org/comite/reuniones/${reunion.id}/cerrar`, { resumen: resumen.trim() || undefined }));
  const valorTranscripcion = transcripcion ?? reunion.transcripcion ?? '';
  return (
    <Tarjeta>
      <Subtitulo>Cerrar la reunión y generar el acta</Subtitulo>
      <AreaTexto
        id="transcripcion"
        etiqueta="Transcripción (opcional)"
        ayuda="Pega la transcripción de la grabación (Meet, Teams o Zoom) para que la IA la use en el borrador."
        value={valorTranscripcion}
        onChange={(e) => setTranscripcion(e.target.value)}
      />
      {transcripcion !== null && <Boton variante="secundario" className="self-start" cargando={guardarTranscripcion.isPending} onClick={() => guardarTranscripcion.mutate(transcripcion)}>Guardar transcripción</Boton>}
      <AreaTexto id="resumen" etiqueta="Desarrollo de la reunión para el acta" ayuda="Si lo dejas vacío, el acta se arma con las notas de cada punto." rows={10} value={resumen} onChange={(e) => setResumen(e.target.value)} />
      <Aviso error={guardarTranscripcion.error ?? borrador.error ?? cerrar.error} />
      {!reunion.hayQuorum && <Aviso tono="info">Para cerrar la reunión se necesitan {reunion.quorumRequerido} integrantes presentes (RN-21).</Aviso>}
      <div className="flex flex-wrap gap-2">
        {conIa && <Boton variante="secundario" cargando={borrador.isPending} onClick={() => borrador.mutate(undefined)}>Redactar borrador con IA</Boton>}
        <Boton cargando={cerrar.isPending} disabled={!reunion.hayQuorum} onClick={() => cerrar.mutate(undefined)}>Cerrar y generar acta</Boton>
      </div>
      <p className="text-[13px] text-gris">Al cerrar, el contenido queda fijo, el acta en PDF pasa como evidencia del paso 2 y empiezan las firmas de los asistentes.</p>
    </Tarjeta>
  );
}

function FirmarActa({ reunionId }: { reunionId: string }) {
  const [password, setPassword] = useState('');
  const firmar = useAccion(() => api.post(`/org/comite/reuniones/${reunionId}/firmar`, { password }), { alTerminar: () => setPassword('') });
  return (
    <Tarjeta>
      <Subtitulo>Firmar el acta</Subtitulo>
      <p className="text-sm">Revisa el PDF y confirma con tu contraseña. Queda registrada la fecha, la hora y la huella del documento.</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Campo id="firma-clave" etiqueta="Tu contraseña" type="password" autoComplete="current-password" className="flex-1" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Boton cargando={firmar.isPending} disabled={!password} onClick={() => firmar.mutate(undefined)}>Firmar acta</Boton>
      </div>
      <Aviso error={firmar.error} />
    </Tarjeta>
  );
}
