import { zodResolver } from '@hookform/resolvers/zod';
import {
  actividadPlanSchema,
  capacitacionSchema,
  metaSchema,
  nivelRiesgo,
  riesgoSchema,
  type ActividadPlanInput,
  type BandaRiesgo,
  type CapacitacionInput,
  type MetaInput,
  type RiesgoInput,
} from '@pesv/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Casilla, Encabezado, Insignia, Pagina, Pestanas, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fecha, td, th } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { Conductor } from '../lib/tipos';

type Pestana = 'riesgos' | 'metas' | 'plan' | 'capacitaciones';
const numero = (v: string) => (v === '' ? null : Number(v));
const entero = (v: string) => (v === '' ? undefined : Number(v));

export function Planificacion() {
  const [pestana, setPestana] = useState<Pestana>('riesgos');
  return (
    <Pagina>
      <Encabezado
        titulo="Planificación"
        descripcion="Matriz de riesgos viales (paso 8), objetivos y metas (pasos 5 y 9), plan anual de trabajo (paso 10) y programa de capacitación (paso 11)."
      />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: 'riesgos', nombre: 'Riesgos' },
          { id: 'metas', nombre: 'Objetivos y metas' },
          { id: 'plan', nombre: 'Plan anual' },
          { id: 'capacitaciones', nombre: 'Capacitaciones' },
        ]}
      />
      {pestana === 'riesgos' && <Riesgos />}
      {pestana === 'metas' && <Metas />}
      {pestana === 'plan' && <PlanAnual />}
      {pestana === 'capacitaciones' && <Capacitaciones />}
    </Pagina>
  );
}

// Riesgos ---------------------------------------------------------------------

interface Riesgo {
  id: string;
  actorVial: RiesgoInput['actorVial'];
  peligro: string;
  descripcion: string;
  probabilidad: number;
  severidad: number;
  inherente: { valor: number; banda: BandaRiesgo };
  controles: string | null;
  probabilidadResidual: number | null;
  severidadResidual: number | null;
  residual: { valor: number; banda: BandaRiesgo } | null;
  responsable: string | null;
  estado: RiesgoInput['estado'];
}
const ACTOR: Record<RiesgoInput['actorVial'], string> = { conductor: 'Conductor', motociclista: 'Motociclista', ciclista: 'Ciclista', peaton: 'Peatón', pasajero: 'Pasajero', todos: 'Todos los actores' };
const TONO_BANDA = { bajo: 'exito', moderado: 'info', alto: 'aviso', extremo: 'peligro' } as const;
const TEXTO_BANDA = { bajo: 'Bajo', moderado: 'Moderado', alto: 'Alto', extremo: 'Extremo' } as const;
const ESCALA = [1, 2, 3, 4, 5];

function Banda({ n }: { n: { valor: number; banda: BandaRiesgo } | null }) {
  if (!n) return <span className="text-gris">—</span>;
  return <Insignia tono={TONO_BANDA[n.banda]}>{TEXTO_BANDA[n.banda]} · {n.valor}</Insignia>;
}

function Riesgos() {
  const { puede } = useSesion();
  const riesgos = useConsulta<Riesgo[]>(['riesgos'], '/org/riesgos');
  const [editando, setEditando] = useState<Riesgo | 'nuevo' | null>(null);
  return (
    <>
      {puede('gestionar_pesv') && !editando && <Boton className="self-start" onClick={() => setEditando('nuevo')}>Identificar riesgo</Boton>}
      {editando && <FormularioRiesgo key={editando === 'nuevo' ? 'nuevo' : editando.id} riesgo={editando === 'nuevo' ? undefined : editando} alTerminar={() => setEditando(null)} />}
      {riesgos.isPending ? <Cargando /> : riesgos.data?.length ? (
        <Tabla minimo="56rem">
          <thead>
            <tr>
              <th className={th}>Peligro</th>
              <th className={th}>Actor vial</th>
              <th className={th}>Inherente</th>
              <th className={th}>Controles</th>
              <th className={th}>Residual</th>
              <th className={th}>Estado</th>
              <th className={th}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {riesgos.data.map((r) => (
              <tr key={r.id}>
                <td className={td}><strong className="text-noche">{r.peligro}</strong><span className="block text-[13px] text-gris">{r.descripcion}</span></td>
                <td className={td}>{ACTOR[r.actorVial]}</td>
                <td className={td}><Banda n={r.inherente} /></td>
                <td className={td}>{r.controles ?? <span className="text-gris">Sin controles</span>}</td>
                <td className={td}><Banda n={r.residual} /></td>
                <td className={td}>{r.estado}</td>
                <td className={td}>{puede('gestionar_pesv') && <Boton variante="texto" onClick={() => setEditando(r)}>Editar</Boton>}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio titulo="Sin riesgos identificados">Identifica los riesgos de cada actor vial con probabilidad y severidad de 1 a 5.</Vacio>
      )}
      <Aviso error={riesgos.error} />
    </>
  );
}

function FormularioRiesgo({ riesgo, alTerminar }: { riesgo?: Riesgo; alTerminar: () => void }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<z.input<typeof riesgoSchema>, unknown, RiesgoInput>({
    resolver: zodResolver(riesgoSchema),
    defaultValues: riesgo
      ? { ...riesgo, controles: riesgo.controles ?? '', responsable: riesgo.responsable ?? '' }
      : { actorVial: 'conductor', probabilidad: 3, severidad: 3, estado: 'abierto' },
  });
  const [p, s, pr, sr] = useWatch({ control, name: ['probabilidad', 'severidad', 'probabilidadResidual', 'severidadResidual'] });
  const guardar = useAccion((d: RiesgoInput) => (riesgo ? api.patch(`/org/riesgos/${riesgo.id}`, d) : api.post('/org/riesgos', d)), { alTerminar });
  const escala = (id: string, etiqueta: string, campo: 'probabilidad' | 'severidad' | 'probabilidadResidual' | 'severidadResidual', opcional = false) => (
    <Selector id={id} etiqueta={etiqueta} {...register(campo, { setValueAs: opcional ? (v) => (v === '' ? null : Number(v)) : Number })}>
      {opcional && <option value="">Sin evaluar</option>}
      {ESCALA.map((n) => <option key={n} value={n}>{n}</option>)}
    </Selector>
  );
  return (
    <Tarjeta>
      <Subtitulo>{riesgo ? 'Editar riesgo' : 'Nuevo riesgo vial'}</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Selector id="rg-actor" etiqueta="Actor vial" {...register('actorVial')}>
            {Object.entries(ACTOR).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </Selector>
          <Campo id="rg-peligro" etiqueta="Peligro" placeholder="Ej.: fatiga en recorridos largos" error={errors.peligro?.message} {...register('peligro')} />
        </div>
        <AreaTexto id="rg-desc" etiqueta="Descripción del riesgo" error={errors.descripcion?.message} {...register('descripcion')} />
        <div className="grid gap-4 sm:grid-cols-3">
          {escala('rg-p', 'Probabilidad (1–5)', 'probabilidad')}
          {escala('rg-s', 'Severidad (1–5)', 'severidad')}
          <div className="flex flex-col justify-end pb-2"><Banda n={nivelRiesgo(Number(p), Number(s))} /></div>
        </div>
        <AreaTexto id="rg-ctrl" etiqueta="Controles" ayuda="Jerarquía: eliminar, sustituir, controles de ingeniería, administrativos, elementos de protección." {...register('controles')} />
        <div className="grid gap-4 sm:grid-cols-3">
          {escala('rg-pr', 'Probabilidad residual', 'probabilidadResidual', true)}
          {escala('rg-sr', 'Severidad residual', 'severidadResidual', true)}
          <div className="flex flex-col justify-end pb-2"><Banda n={pr && sr ? nivelRiesgo(Number(pr), Number(sr)) : null} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="rg-resp" etiqueta="Responsable" {...register('responsable')} />
          <Selector id="rg-estado" etiqueta="Estado" {...register('estado')}>
            <option value="abierto">Abierto</option>
            <option value="controlado">Controlado</option>
            <option value="cerrado">Cerrado</option>
          </Selector>
        </div>
        <Aviso error={guardar.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={guardar.isPending}>Guardar riesgo</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

// Metas -----------------------------------------------------------------------

interface Meta {
  id: string;
  anio: number;
  objetivo: string;
  indicador: string;
  meta: number;
  valorActual: number | null;
  sentido: MetaInput['sentido'];
  cumplida: boolean | null;
}

function Metas() {
  const { puede } = useSesion();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const metas = useConsulta<Meta[]>(['metas', anio], `/org/metas?anio=${anio}`);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof metaSchema>, unknown, MetaInput>({
    resolver: zodResolver(metaSchema),
    defaultValues: { anio, sentido: 'menor_o_igual' },
  });
  const crear = useAccion((d: MetaInput) => api.post('/org/metas', d), { alTerminar: () => reset({ anio, sentido: 'menor_o_igual' }) });
  const actualizar = useAccion((m: Meta & { nuevoValor: number | null }) =>
    api.patch(`/org/metas/${m.id}`, { anio: m.anio, objetivo: m.objetivo, indicador: m.indicador, meta: m.meta, sentido: m.sentido, valorActual: m.nuevoValor }),
  );
  return (
    <>
      <SelectorAnio anio={anio} alCambiar={setAnio} />
      {metas.isPending ? <Cargando /> : metas.data?.length ? (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Objetivo</th>
              <th className={th}>Indicador</th>
              <th className={th}>Meta</th>
              <th className={th}>Valor actual</th>
              <th className={th}>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {metas.data.map((m) => (
              <tr key={m.id}>
                <td className={td}>{m.objetivo}</td>
                <td className={td}>{m.indicador}</td>
                <td className={td}>{m.sentido === 'menor_o_igual' ? '≤' : '≥'} {m.meta}</td>
                <td className={td}>
                  {puede('gestionar_pesv') ? (
                    <input
                      type="number"
                      aria-label={`Valor actual de ${m.indicador}`}
                      defaultValue={m.valorActual ?? ''}
                      className="w-24 rounded-lg border border-linea px-2 py-1"
                      onBlur={(e) => {
                        const v = numero(e.target.value);
                        if (v !== m.valorActual) actualizar.mutate({ ...m, nuevoValor: v });
                      }}
                    />
                  ) : (m.valorActual ?? '—')}
                </td>
                <td className={td}>{m.cumplida === null ? <span className="text-gris">Sin medir</span> : <Insignia tono={m.cumplida ? 'exito' : 'peligro'}>{m.cumplida ? 'Cumple' : 'No cumple'}</Insignia>}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio titulo={`Sin metas para ${anio}`}>Define objetivos medibles, por ejemplo reducir los siniestros con lesionados.</Vacio>
      )}
      <Aviso error={metas.error ?? actualizar.error} />
      {puede('gestionar_pesv') && (
        <Tarjeta>
          <Subtitulo>Nueva meta</Subtitulo>
          <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="mt-obj" etiqueta="Objetivo" error={errors.objetivo?.message} {...register('objetivo')} />
              <Campo id="mt-ind" etiqueta="Indicador" error={errors.indicador?.message} {...register('indicador')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <Campo id="mt-anio" etiqueta="Año" type="number" {...register('anio', { setValueAs: Number })} />
              <Selector id="mt-sentido" etiqueta="Se cumple si el valor es" {...register('sentido')}>
                <option value="menor_o_igual">Menor o igual a la meta</option>
                <option value="mayor_o_igual">Mayor o igual a la meta</option>
              </Selector>
              <Campo id="mt-meta" etiqueta="Meta" type="number" step="any" error={errors.meta?.message} {...register('meta', { setValueAs: entero })} />
              <Campo id="mt-actual" etiqueta="Valor actual" type="number" step="any" {...register('valorActual', { setValueAs: numero })} />
            </div>
            <Aviso error={crear.error} />
            <Boton type="submit" className="self-start" cargando={crear.isPending}>Agregar meta</Boton>
          </form>
        </Tarjeta>
      )}
    </>
  );
}

function SelectorAnio({ anio, alCambiar }: { anio: number; alCambiar: (a: number) => void }) {
  const actual = new Date().getFullYear();
  return (
    <Selector id="anio" etiqueta="Año" className="max-w-40" value={anio} onChange={(e) => alCambiar(Number(e.target.value))}>
      {[actual + 1, actual, actual - 1, actual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
    </Selector>
  );
}

// Plan anual ------------------------------------------------------------------

interface Actividad {
  id: string;
  anio: number;
  titulo: string;
  pasoNumero: number | null;
  responsable: string;
  inicio: string;
  fin: string;
  estado: ActividadPlanInput['estado'];
  ejecutadaEl: string | null;
  presupuesto: number | null;
  atrasada: boolean;
}
const ESTADO_ACTIVIDAD = { planeada: 'Planeada', en_curso: 'En curso', ejecutada: 'Ejecutada', cancelada: 'Cancelada' } as const;

function PlanAnual() {
  const { puede } = useSesion();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const plan = useConsulta<Actividad[]>(['plan', anio], `/org/plan?anio=${anio}`);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof actividadPlanSchema>, unknown, ActividadPlanInput>({
    resolver: zodResolver(actividadPlanSchema),
    defaultValues: { anio, estado: 'planeada' },
  });
  const crear = useAccion((d: ActividadPlanInput) => api.post('/org/plan', d), { alTerminar: () => reset({ anio, estado: 'planeada' }) });
  const cambiarEstado = useAccion(({ a, estado }: { a: Actividad; estado: Actividad['estado'] }) =>
    api.patch(`/org/plan/${a.id}`, {
      anio: a.anio,
      titulo: a.titulo,
      pasoNumero: a.pasoNumero,
      responsable: a.responsable,
      inicio: a.inicio,
      fin: a.fin,
      presupuesto: a.presupuesto,
      estado,
      ejecutadaEl: estado === 'ejecutada' ? new Date().toISOString().slice(0, 10) : null,
    }),
  );
  const total = plan.data?.filter((a) => a.estado !== 'cancelada').length ?? 0;
  const ejecutadas = plan.data?.filter((a) => a.estado === 'ejecutada').length ?? 0;
  return (
    <>
      <div className="flex flex-wrap items-end gap-6">
        <SelectorAnio anio={anio} alCambiar={setAnio} />
        {total > 0 && <p className="pb-2 text-sm">Ejecución del plan: <strong>{Math.round((ejecutadas / total) * 100)} %</strong> ({ejecutadas} de {total} actividades)</p>}
      </div>
      {plan.isPending ? <Cargando /> : plan.data?.length ? (
        <Tabla minimo="50rem">
          <thead>
            <tr>
              <th className={th}>Actividad</th>
              <th className={th}>Paso</th>
              <th className={th}>Responsable</th>
              <th className={th}>Fechas</th>
              <th className={th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {plan.data.map((a) => (
              <tr key={a.id}>
                <td className={td}><strong className="text-noche">{a.titulo}</strong>{a.atrasada && <> <Insignia tono="peligro">Atrasada</Insignia></>}</td>
                <td className={td}>{a.pasoNumero ?? '—'}</td>
                <td className={td}>{a.responsable}</td>
                <td className={td}>{fecha(a.inicio)} – {fecha(a.fin)}</td>
                <td className={td}>
                  {puede('gestionar_pesv') ? (
                    <select
                      aria-label={`Estado de ${a.titulo}`}
                      className="rounded-lg border border-linea px-2 py-1"
                      value={a.estado}
                      onChange={(e) => cambiarEstado.mutate({ a, estado: e.target.value as Actividad['estado'] })}
                    >
                      {Object.entries(ESTADO_ACTIVIDAD).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  ) : ESTADO_ACTIVIDAD[a.estado]}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio titulo={`Sin plan para ${anio}`}>Programa las actividades del año con responsable y fechas; el comité revisa su ejecución.</Vacio>
      )}
      <Aviso error={plan.error ?? cambiarEstado.error} />
      {puede('gestionar_pesv') && (
        <Tarjeta>
          <Subtitulo>Nueva actividad</Subtitulo>
          <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="pa-titulo" etiqueta="Actividad" error={errors.titulo?.message} {...register('titulo')} />
              <Campo id="pa-resp" etiqueta="Responsable" error={errors.responsable?.message} {...register('responsable')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-5">
              <Campo id="pa-anio" etiqueta="Año" type="number" {...register('anio', { setValueAs: Number })} />
              <Campo id="pa-paso" etiqueta="Paso PESV" type="number" min={1} max={24} {...register('pasoNumero', { setValueAs: numero })} />
              <Campo id="pa-inicio" etiqueta="Inicio" type="date" error={errors.inicio?.message} {...register('inicio')} />
              <Campo id="pa-fin" etiqueta="Fin" type="date" error={errors.fin?.message} {...register('fin')} />
              <Campo id="pa-ppto" etiqueta="Presupuesto (COP)" type="number" min={0} {...register('presupuesto', { setValueAs: numero })} />
            </div>
            <Aviso error={crear.error} />
            <Boton type="submit" className="self-start" cargando={crear.isPending}>Agregar al plan</Boton>
          </form>
        </Tarjeta>
      )}
    </>
  );
}

// Capacitaciones --------------------------------------------------------------

interface Capacitacion {
  id: string;
  titulo: string;
  tema: string;
  programadaEl: string;
  ejecutadaEl: string | null;
  horas: number | null;
  instructor: string | null;
  estado: CapacitacionInput['estado'];
  asistentes: { id: string; conductorId: string | null; nombre: string; documento: string; asistio: boolean }[];
}

function Capacitaciones() {
  const { puede } = useSesion();
  const capacitaciones = useConsulta<Capacitacion[]>(['capacitaciones'], '/org/capacitaciones');
  const [asistencia, setAsistencia] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof capacitacionSchema>, unknown, CapacitacionInput>({
    resolver: zodResolver(capacitacionSchema),
    defaultValues: { estado: 'programada' },
  });
  const crear = useAccion((d: CapacitacionInput) => api.post('/org/capacitaciones', d), { alTerminar: () => reset({ estado: 'programada' }) });
  return (
    <>
      {capacitaciones.isPending ? <Cargando /> : capacitaciones.data?.length ? (
        <div className="flex flex-col gap-3">
          {capacitaciones.data.map((c) => (
            <Tarjeta key={c.id}>
              <Subtitulo acciones={<Insignia tono={c.estado === 'ejecutada' ? 'exito' : c.estado === 'cancelada' ? 'neutro' : 'aviso'}>{c.estado === 'ejecutada' ? 'Ejecutada' : c.estado === 'cancelada' ? 'Cancelada' : 'Programada'}</Insignia>}>
                {c.titulo}
              </Subtitulo>
              <p className="text-sm text-gris">{c.tema} · {fecha(c.programadaEl)}{c.horas ? ` · ${c.horas} h` : ''}{c.instructor ? ` · ${c.instructor}` : ''}</p>
              <p className="text-sm">{c.asistentes.filter((a) => a.asistio).length} asistentes registrados</p>
              {puede('gestionar_pesv') && (asistencia === c.id ? (
                <Asistentes capacitacion={c} alTerminar={() => setAsistencia(null)} />
              ) : (
                <Boton variante="texto" className="self-start" onClick={() => setAsistencia(c.id)}>Registrar asistencia</Boton>
              ))}
            </Tarjeta>
          ))}
        </div>
      ) : (
        <Vacio titulo="Sin capacitaciones">Programa la formación en seguridad vial; cada conductor debe tener su registro de asistencia.</Vacio>
      )}
      <Aviso error={capacitaciones.error} />
      {puede('gestionar_pesv') && (
        <Tarjeta>
          <Subtitulo>Programar capacitación</Subtitulo>
          <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="cp-titulo" etiqueta="Título" error={errors.titulo?.message} {...register('titulo')} />
              <Campo id="cp-tema" etiqueta="Tema" error={errors.tema?.message} {...register('tema')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <Campo id="cp-fecha" etiqueta="Fecha" type="date" error={errors.programadaEl?.message} {...register('programadaEl')} />
              <Campo id="cp-horas" etiqueta="Horas" type="number" step="0.5" min={0} {...register('horas', { setValueAs: numero })} />
              <Campo id="cp-inst" etiqueta="Instructor" {...register('instructor')} />
              <Selector id="cp-estado" etiqueta="Estado" {...register('estado')}>
                <option value="programada">Programada</option>
                <option value="ejecutada">Ejecutada</option>
                <option value="cancelada">Cancelada</option>
              </Selector>
            </div>
            <Aviso error={crear.error} />
            <Boton type="submit" className="self-start" cargando={crear.isPending}>Programar</Boton>
          </form>
        </Tarjeta>
      )}
    </>
  );
}

function Asistentes({ capacitacion, alTerminar }: { capacitacion: Capacitacion; alTerminar: () => void }) {
  const conductores = useConsulta<Conductor[]>(['conductores'], '/org/conductores');
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(capacitacion.asistentes.filter((a) => a.asistio && a.conductorId).map((a) => a.conductorId!)));
  const guardar = useAccion(
    () =>
      api.put(`/org/capacitaciones/${capacitacion.id}/asistentes`, {
        asistentes: (conductores.data ?? []).filter((c) => marcados.has(c.id)).map((c) => ({ conductorId: c.id, nombre: c.nombre, documento: c.documento, asistio: true })),
      }),
    { alTerminar },
  );
  if (conductores.isPending) return <Cargando />;
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-papel p-4">
      <p className="text-sm font-semibold">Conductores que asistieron</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(conductores.data ?? []).map((c) => (
          <Casilla
            key={c.id}
            etiqueta={c.nombre}
            checked={marcados.has(c.id)}
            onChange={(e) => {
              const n = new Set(marcados);
              if (e.target.checked) n.add(c.id);
              else n.delete(c.id);
              setMarcados(n);
            }}
          />
        ))}
      </div>
      <Aviso error={guardar.error} />
      <div className="flex gap-2">
        <Boton cargando={guardar.isPending} disabled={marcados.size === 0} onClick={() => guardar.mutate(undefined)}>Guardar asistencia</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
    </div>
  );
}
