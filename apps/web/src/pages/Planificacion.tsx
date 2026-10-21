import { zodResolver } from '@hookform/resolvers/zod';
import { metaSchema, type MetaInput } from '@pesv/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { Aviso, Boton, Campo, Cargando, Encabezado, Insignia, Pagina, Selector, Subtitulo, Tabla, Tarjeta, Vacio, td, th } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';

const numero = (v: string) => (v === '' ? null : Number(v));
const entero = (v: string) => (v === '' ? undefined : Number(v));

export function Planificacion() {
  return (
    <Pagina>
      <Encabezado
        titulo="Objetivos y metas"
        descripcion={<>Paso 7 · Objetivos del PESV con su indicador y meta para el año. Las actividades del <Link to="/plan-trabajo" className="font-semibold text-[#1d4e89] underline">plan de trabajo</Link> se relacionan con estas metas.</>}
      />
      <Metas />
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
