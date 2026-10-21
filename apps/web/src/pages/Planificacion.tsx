import { zodResolver } from '@hookform/resolvers/zod';
import {
  capacitacionSchema,
  metaSchema,
  type CapacitacionInput,
  type MetaInput,
} from '@pesv/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { Aviso, Boton, Campo, Cargando, Casilla, Encabezado, Insignia, Pagina, Pestanas, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fecha, td, th } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { Conductor } from '../lib/tipos';

type Pestana = 'metas' | 'capacitaciones';
const numero = (v: string) => (v === '' ? null : Number(v));
const entero = (v: string) => (v === '' ? undefined : Number(v));

export function Planificacion() {
  const [pestana, setPestana] = useState<Pestana>('metas');
  return (
    <Pagina>
      <Encabezado
        titulo="Planificación"
        descripcion={<>Objetivos y metas (paso 7) y plan anual de formación (paso 10). La matriz de riesgos (paso 6) y el plan de trabajo (paso 9) tienen su propia sección: <Link to="/matriz-riesgos" className="font-semibold text-[#1d4e89] underline">Matriz de riesgos</Link> y <Link to="/plan-trabajo" className="font-semibold text-[#1d4e89] underline">Plan de trabajo</Link>.</>}
      />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: 'metas', nombre: 'Objetivos y metas' },
          { id: 'capacitaciones', nombre: 'Capacitaciones' },
        ]}
      />
      {pestana === 'metas' && <Metas />}
      {pestana === 'capacitaciones' && <Capacitaciones />}
    </Pagina>
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
