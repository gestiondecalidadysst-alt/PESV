import { zodResolver } from '@hookform/resolvers/zod';
import {
  ESTADOS_INDICADOR,
  formatoIndicador,
  FRECUENCIAS,
  indicadorSchema,
  metaPesvSchema,
  PASOS_PESV,
  TIPOS_INDICADOR,
  UNIDADES_INDICADOR,
  type CalculoIndicador,
  type EstadoIndicador,
  type Frecuencia,
  type IndicadorInput,
  type MetaPesvInput,
  type Sentido,
  type TipoIndicador,
  type UnidadIndicador,
} from '@pesv/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { GraficaLinea } from '../components/graficas';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Casilla, Cifra, Encabezado, Pagina, Pestanas, Selector, Subtitulo, Tabla, Tarjeta, Vacio, td, th } from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';

interface Periodo {
  id: string;
  etiqueta: string;
  desde: string;
  hasta: string;
  futuro: boolean;
  enCurso: boolean;
  valor: number | null;
  numerador: number | null;
  denominador: number | null;
  detalle: string | null;
  origen: 'calculado' | 'registrado' | 'manual' | null;
  estado: EstadoIndicador | null;
  analisis: string | null;
  accionId: string | null;
}

interface Indicador {
  id: string;
  calculo: CalculoIndicador | null;
  automatico: boolean;
  nombre: string;
  objetivo: string | null;
  tipo: TipoIndicador;
  formula: string;
  unidad: UnidadIndicador;
  frecuencia: Frecuencia;
  sentido: Sentido;
  meta: number;
  alerta: number | null;
  fuente: string | null;
  responsable: string | null;
  pasoNumero: number | null;
  activo: boolean;
  periodos: Periodo[];
  ultimo: { periodo: string; etiqueta: string; valor: number; estado: EstadoIndicador | null; enCurso: boolean } | null;
  sinAnalizar: string[];
}

interface Tablero {
  anio: number;
  indicadores: Indicador[];
  resumen: { total: number; cumplen: number; enRiesgo: number; noCumplen: number; sinDato: number; porAnalizar: number };
  plantillasDisponibles: { calculo: CalculoIndicador; nombre: string; tipo: TipoIndicador; paso: number; frecuencia: Frecuencia }[];
}

interface Meta {
  id: string;
  anio: number;
  objetivo: string;
  indicadorId: string | null;
  indicador: string | null;
  unidad: UnidadIndicador;
  meta: number;
  sentido: Sentido;
  valorActual: number | null;
  detalle: string | null;
  automatica: boolean;
  estado: EstadoIndicador | null;
}

const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? '—';
const enlaceBoton = 'inline-flex min-h-10 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea';
const signo = (s: Sentido) => (s === 'menor_o_igual' ? '≤' : '≥');

function Estado({ e }: { e: EstadoIndicador | null }) {
  if (!e) return <span className="text-[12px] text-gris">Sin dato</span>;
  const c = ESTADOS_INDICADOR[e];
  return <span className="inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold" style={{ background: c.fondo, color: c.color }}>{c.nombre}</span>;
}

export function Indicadores() {
  const { puede } = useSesion();
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') === 'metas' ? 'metas' : 'tablero';
  const [anio, setAnio] = useState(new Date().getFullYear());
  const datos = useConsulta<Tablero>(['indicadores', anio], `/org/indicadores?anio=${anio}`, { placeholderData: (p) => p });
  const evidencia = useAccion(() => api.post(`/org/indicadores/evidencia?anio=${anio}`));
  const actual = new Date().getFullYear();
  const gestiona = puede('gestionar_pesv');

  return (
    <Pagina ancho="max-w-7xl">
      <Encabezado
        titulo="Indicadores y metas"
        descripcion="Pasos 7 y 20 · Indicadores con ficha técnica que se miden solos con los datos de la plataforma (o se registran a mano), su análisis por periodo y las metas del PESV con su seguimiento. Un resultado que no cumple se atiende con una acción de mejora."
        acciones={
          <div className="flex flex-wrap items-end gap-2">
            <Selector id="in-anio" etiqueta="Año" className="w-28" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
              {[actual, actual - 1, actual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
            </Selector>
            <a href={urlApi(`/org/indicadores/exportar?anio=${anio}`)} className={enlaceBoton}>PDF</a>
            <a href={urlApi(`/org/indicadores/exportar?anio=${anio}&formato=xlsx`)} className={enlaceBoton}>Excel</a>
            {gestiona && !!datos.data?.indicadores.length && <Boton variante="secundario" cargando={evidencia.isPending} onClick={() => evidencia.mutate(undefined)}>Evidencia del paso 20</Boton>}
          </div>
        }
      />
      {evidencia.isSuccess && <Aviso tono="exito">El tablero quedó como evidencia del paso 20, pendiente de aprobación. <Link to="/pasos/20" className="font-semibold underline">Ver el paso 20</Link></Aviso>}
      <Aviso error={evidencia.error ?? datos.error} />
      <Pestanas
        valor={vista}
        alCambiar={(v) => setParams(v === 'metas' ? { vista: 'metas' } : {})}
        opciones={[{ id: 'tablero', nombre: 'Indicadores' }, { id: 'metas', nombre: 'Objetivos y metas' }]}
      />
      {!datos.data ? <Cargando /> : vista === 'tablero' ? <TableroIndicadores datos={datos.data} gestiona={gestiona} /> : <Metas anio={anio} indicadores={datos.data.indicadores} gestiona={gestiona} />}
    </Pagina>
  );
}

// Tablero ------------------------------------------------------------------------------

function TableroIndicadores({ datos, gestiona }: { datos: Tablero; gestiona: boolean }) {
  const [nuevo, setNuevo] = useState(false);
  const [plantillas, setPlantillas] = useState(false);
  const [filtro, setFiltro] = useState<{ tipo: string; estado: string }>({ tipo: '', estado: '' });
  const r = datos.resumen;
  const lista = datos.indicadores.filter(
    (i) => (!filtro.tipo || i.tipo === filtro.tipo) && (!filtro.estado || (filtro.estado === 'sin_dato' ? !i.ultimo : filtro.estado === 'analizar' ? i.sinAnalizar.length > 0 : i.ultimo?.estado === filtro.estado)),
  );

  if (datos.indicadores.length === 0) {
    return (
      <>
        <Vacio titulo="Aún no hay indicadores">
          Empieza con los indicadores sugeridos del PESV: se miden solos con la información que ya registras (plan de trabajo, formación, inspecciones, mantenimiento, siniestros, matriz y acciones). Luego ajusta sus metas.
        </Vacio>
        {gestiona && <ElegirPlantillas disponibles={datos.plantillasDisponibles} alTerminar={() => undefined} todas />}
      </>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra etiqueta="Cumplen la meta" valor={r.cumplen} detalle={`De ${r.total} indicadores activos, en su último periodo medido`} />
        <Cifra etiqueta="En riesgo" valor={r.enRiesgo} detalle="Entre la meta y el umbral de alerta" />
        <Cifra etiqueta="No cumplen" valor={r.noCumplen} detalle={r.sinDato ? `${r.sinDato} sin datos aún` : 'Todos tienen datos'} />
        <Cifra etiqueta="Periodos por analizar" valor={r.porAnalizar} detalle="Resultados que no cumplen sin análisis ni acción" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {gestiona && !nuevo && <Boton onClick={() => { setNuevo(true); setPlantillas(false); }}>Nuevo indicador</Boton>}
        {gestiona && datos.plantillasDisponibles.length > 0 && !plantillas && <Boton variante="secundario" onClick={() => { setPlantillas(true); setNuevo(false); }}>Agregar sugeridos ({datos.plantillasDisponibles.length})</Boton>}
        <Selector id="in-tipo" etiqueta="Tipo" className="w-40" value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })}>
          <option value="">Todos</option>
          {TIPOS_INDICADOR.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </Selector>
        <Selector id="in-estado" etiqueta="Estado" className="w-48" value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value })}>
          <option value="">Todos</option>
          <option value="no_cumple">No cumplen</option>
          <option value="en_riesgo">En riesgo</option>
          <option value="cumple">Cumplen</option>
          <option value="sin_dato">Sin dato</option>
          <option value="analizar">Por analizar</option>
        </Selector>
      </div>
      {plantillas && <ElegirPlantillas disponibles={datos.plantillasDisponibles} alTerminar={() => setPlantillas(false)} />}
      {nuevo && <FormularioIndicador alTerminar={() => setNuevo(false)} />}

      <div className="grid gap-4 lg:grid-cols-2">
        {lista.map((i) => <TarjetaIndicador key={i.id} i={i} anio={datos.anio} gestiona={gestiona} />)}
      </div>
      {lista.length === 0 && <p className="text-sm text-gris">Ningún indicador coincide con el filtro.</p>}
    </>
  );
}

function ElegirPlantillas({ disponibles, alTerminar, todas }: { disponibles: Tablero['plantillasDisponibles']; alTerminar: () => void; todas?: boolean }) {
  const [elegidas, setElegidas] = useState<Set<CalculoIndicador>>(() => new Set(todas ? disponibles.map((d) => d.calculo) : []));
  const agregar = useAccion(() => api.post('/org/indicadores/plantillas', { calculos: [...elegidas] }), { alTerminar });
  return (
    <Tarjeta>
      <Subtitulo>Indicadores sugeridos del PESV</Subtitulo>
      {TIPOS_INDICADOR.map((t) => {
        const deTipo = disponibles.filter((d) => d.tipo === t.id);
        if (!deTipo.length) return null;
        return (
          <fieldset key={t.id}>
            <legend className="mb-1 text-sm font-bold text-noche">{t.nombre} <span className="font-normal text-gris">· {t.descripcion}</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {deTipo.map((d) => (
                <Casilla
                  key={d.calculo}
                  etiqueta={d.nombre}
                  descripcion={`Paso ${d.paso} · ${nombreDe(FRECUENCIAS, d.frecuencia)}`}
                  checked={elegidas.has(d.calculo)}
                  onChange={(e) => {
                    const n = new Set(elegidas);
                    if (e.target.checked) n.add(d.calculo);
                    else n.delete(d.calculo);
                    setElegidas(n);
                  }}
                />
              ))}
            </div>
          </fieldset>
        );
      })}
      <Aviso error={agregar.error} />
      <div className="flex gap-2">
        <Boton cargando={agregar.isPending} disabled={elegidas.size === 0} onClick={() => agregar.mutate(undefined)}>Agregar {elegidas.size} {elegidas.size === 1 ? 'indicador' : 'indicadores'}</Boton>
        {!todas && <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>}
      </div>
    </Tarjeta>
  );
}

function TarjetaIndicador({ i, anio, gestiona }: { i: Indicador; anio: number; gestiona: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const formato = (v: number) => formatoIndicador(v, i.unidad);
  if (editando) return <div className="lg:col-span-2"><FormularioIndicador indicador={i} alTerminar={() => setEditando(false)} /></div>;
  return (
    <Tarjeta className={`${abierta ? 'lg:col-span-2' : ''} ${i.activo ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-noche">{i.nombre}</p>
          <p className="text-[13px] text-gris">
            {nombreDe(TIPOS_INDICADOR, i.tipo)} · {nombreDe(FRECUENCIAS, i.frecuencia)}{i.pasoNumero ? ` · paso ${i.pasoNumero}` : ''} · {i.automatico ? 'medición automática' : 'registro manual'}{i.activo ? '' : ' · inactivo'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold leading-none text-noche tabular-nums">{i.ultimo ? formato(i.ultimo.valor) : '—'}</p>
          <p className="mt-1 text-[12px] text-gris">{i.ultimo ? `${i.ultimo.etiqueta}${i.ultimo.enCurso ? ' (en curso)' : ''} · ` : ''}meta {signo(i.sentido)} {formato(i.meta)}</p>
          <div className="mt-1"><Estado e={i.ultimo?.estado ?? null} /></div>
        </div>
      </div>
      <GraficaLinea
        titulo={`Resultado ${anio}`}
        categorias={i.periodos.map((p) => p.etiqueta)}
        series={[{ nombre: i.nombre, valores: i.periodos.map((p) => p.valor) }]}
        meta={{ nombre: `Meta (${signo(i.sentido)} ${formato(i.meta)})`, valores: i.periodos.map(() => i.meta) }}
        formato={formato}
        enteros={i.unidad === 'numero'}
        ancho={abierta ? 900 : 560}
      />
      {i.sinAnalizar.length > 0 && <Aviso>{i.sinAnalizar.length === 1 ? 'Un periodo no cumple' : `${i.sinAnalizar.length} periodos no cumplen`} y no tiene análisis ni acción.</Aviso>}
      <div className="flex flex-wrap items-center gap-1 border-t border-linea pt-3">
        <Boton variante="texto" aria-expanded={abierta} onClick={() => { setAbierta(!abierta); setPeriodo(null); }}>{abierta ? 'Cerrar' : 'Resultados y ficha'}</Boton>
        <a href={urlApi(`/org/indicadores/${i.id}/ficha?anio=${anio}`)} className="px-3 text-sm font-semibold text-[#1d4e89] underline-offset-2 hover:underline">Ficha técnica (PDF)</a>
        {gestiona && <Boton variante="texto" className="ml-auto" onClick={() => setEditando(true)}>Editar ficha</Boton>}
      </div>
      {abierta && (
        <div className="flex flex-col gap-4">
          <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-papel p-4 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Fórmula</dt><dd>{i.formula}</dd></div>
            {i.objetivo && <div className="sm:col-span-2"><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Objetivo</dt><dd>{i.objetivo}</dd></div>}
            <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Meta y alerta</dt><dd>{signo(i.sentido)} {formato(i.meta)}{i.alerta != null ? ` · alerta en ${formato(i.alerta)}` : ''}</dd></div>
            <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Fuente</dt><dd>{i.fuente ?? '—'}</dd></div>
            <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Responsable</dt><dd>{i.responsable ?? '—'}</dd></div>
            <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Unidad</dt><dd>{nombreDe(UNIDADES_INDICADOR, i.unidad)}</dd></div>
          </dl>
          <Tabla minimo="44rem">
            <thead>
              <tr>
                <th className={th}>Periodo</th>
                <th className={`${th} text-right`}>Resultado</th>
                <th className={th}>Estado</th>
                <th className={th}>Detalle y análisis</th>
                <th className={th}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {i.periodos.map((p) => (
                <tr key={p.id} className={periodo?.id === p.id ? 'bg-papel/60' : undefined}>
                  <td className={td}>{p.etiqueta}{p.enCurso && <span className="block text-[12px] text-gris">En curso (parcial)</span>}</td>
                  <td className={`${td} text-right tabular-nums`}><strong>{p.futuro ? '' : formatoIndicador(p.valor, i.unidad)}</strong></td>
                  <td className={td}>{p.futuro ? <span className="text-[12px] text-gris">Aún no empieza</span> : <Estado e={p.estado} />}</td>
                  <td className={td}>
                    {p.detalle && <span className="block text-[13px] text-gris">{p.detalle}</span>}
                    {p.origen === 'registrado' && <span className="block text-[12px] text-gris">Valor registrado (fijo)</span>}
                    {p.analisis && <span className="block text-[13px]">{p.analisis}</span>}
                    {p.accionId && <Link to="/acciones" className="text-[13px] font-semibold text-[#1d4e89] underline">Acción de mejora registrada</Link>}
                  </td>
                  <td className={td}>{gestiona && !p.futuro && <Boton variante="texto" onClick={() => setPeriodo(periodo?.id === p.id ? null : p)}>{p.origen === 'calculado' || !p.origen ? (i.automatico ? 'Analizar' : 'Registrar') : 'Actualizar'}</Boton>}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          {periodo && <PanelPeriodo key={periodo.id} i={i} p={periodo} alTerminar={() => setPeriodo(null)} />}
        </div>
      )}
    </Tarjeta>
  );
}

function PanelPeriodo({ i, p, alTerminar }: { i: Indicador; p: Periodo; alTerminar: () => void }) {
  const [analisis, setAnalisis] = useState(p.analisis ?? '');
  const [modo, setModo] = useState<'razon' | 'valor'>(i.unidad === 'numero' ? 'valor' : p.numerador != null || p.valor == null ? 'razon' : 'valor');
  const [numerador, setNumerador] = useState(p.numerador != null ? String(p.numerador) : '');
  const [denominador, setDenominador] = useState(p.denominador != null ? String(p.denominador) : '');
  const [valor, setValor] = useState(p.valor != null ? String(p.valor) : '');
  const [accion, setAccion] = useState({ descripcion: '', responsable: i.responsable ?? '', fechaLimite: '', tipo: 'correctiva' });
  const [conAccion, setConAccion] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);
  const guardar = useAccion(() => {
    const cuerpo: Record<string, unknown> = { analisis: analisis.trim() || undefined };
    if (!i.automatico) {
      if (modo === 'razon') Object.assign(cuerpo, { numerador: Number(numerador), denominador: Number(denominador) });
      else cuerpo.valor = Number(valor);
    }
    return api.put(`/org/indicadores/${i.id}/resultados/${p.id}`, cuerpo);
  }, { alTerminar: () => (conAccion ? undefined : alTerminar()) });
  const crearAccion = useAccion(() => api.post(`/org/indicadores/${i.id}/resultados/${p.id}/accion`, accion), { alTerminar });
  const quitar = useAccion(() => api.delete(`/org/indicadores/${i.id}/resultados/${p.id}`), { alTerminar });
  const listo = i.automatico || (modo === 'razon' ? numerador !== '' && denominador !== '' : valor !== '');

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-papel p-4">
      <p className="font-semibold text-noche">{i.automatico ? 'Análisis' : 'Resultado'} de {p.etiqueta} {p.id.slice(0, 4)}</p>
      {i.automatico ? (
        <p className="text-sm text-gris">
          Valor calculado: <strong className="text-tinta">{formatoIndicador(p.valor, i.unidad)}</strong>{p.detalle ? ` (${p.detalle})` : ''}. Al guardar, el valor queda fijo con su análisis aunque después cambien los datos.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          {i.unidad !== 'numero' && (
            <Selector id={`pp-modo-${i.id}`} etiqueta="Registrar como" className="w-48" value={modo} onChange={(e) => setModo(e.target.value as 'razon' | 'valor')}>
              <option value="razon">Numerador y denominador</option>
              <option value="valor">Resultado directo</option>
            </Selector>
          )}
          {modo === 'razon' && i.unidad !== 'numero' ? (
            <>
              <Campo id={`pp-num-${i.id}`} etiqueta="Numerador" type="number" min={0} className="w-36" value={numerador} onChange={(e) => setNumerador(e.target.value)} />
              <Campo id={`pp-den-${i.id}`} etiqueta="Denominador" type="number" min={0} className="w-36" value={denominador} onChange={(e) => setDenominador(e.target.value)} />
            </>
          ) : (
            <Campo id={`pp-val-${i.id}`} etiqueta={`Resultado (${nombreDe(UNIDADES_INDICADOR, i.unidad).toLowerCase()})`} type="number" step="any" className="w-44" value={valor} onChange={(e) => setValor(e.target.value)} />
          )}
        </div>
      )}
      <AreaTexto id={`pp-an-${i.id}`} etiqueta="Análisis del resultado" placeholder="¿Qué explica el resultado? ¿Qué causas se identificaron?" value={analisis} onChange={(e) => setAnalisis(e.target.value)} />
      {(p.estado === 'no_cumple' || p.estado === 'en_riesgo') && !p.accionId && (
        <Casilla etiqueta="Registrar una acción de mejora para este resultado" descripcion="Queda en el plan de acción con responsable y fecha." checked={conAccion} onChange={(e) => setConAccion(e.target.checked)} />
      )}
      {conAccion && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo id={`pp-ad-${i.id}`} etiqueta="Acción" className="sm:col-span-2" value={accion.descripcion} onChange={(e) => setAccion({ ...accion, descripcion: e.target.value })} />
          <Campo id={`pp-ar-${i.id}`} etiqueta="Responsable" value={accion.responsable} onChange={(e) => setAccion({ ...accion, responsable: e.target.value })} />
          <Campo id={`pp-af-${i.id}`} etiqueta="Fecha límite" type="date" min={hoy} value={accion.fechaLimite} onChange={(e) => setAccion({ ...accion, fechaLimite: e.target.value })} />
        </div>
      )}
      <Aviso error={guardar.error ?? crearAccion.error ?? quitar.error} />
      <div className="flex flex-wrap gap-2">
        <Boton
          cargando={guardar.isPending || crearAccion.isPending}
          disabled={!listo || (conAccion && (accion.descripcion.trim().length < 5 || accion.responsable.trim().length < 3 || !accion.fechaLimite))}
          onClick={async () => {
            await guardar.mutateAsync(undefined);
            if (conAccion) crearAccion.mutate(undefined);
          }}
        >
          Guardar
        </Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        {(p.origen === 'registrado' || p.origen === 'manual') && <Boton variante="texto" className="ml-auto" cargando={quitar.isPending} onClick={() => quitar.mutate(undefined)}>{i.automatico ? 'Volver al valor calculado' : 'Borrar resultado'}</Boton>}
      </div>
    </div>
  );
}

function FormularioIndicador({ indicador: i, alTerminar }: { indicador?: Indicador; alTerminar: () => void }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<z.input<typeof indicadorSchema>, unknown, IndicadorInput>({
    resolver: zodResolver(indicadorSchema),
    defaultValues: i
      ? { nombre: i.nombre, objetivo: i.objetivo ?? '', tipo: i.tipo, formula: i.formula, unidad: i.unidad, frecuencia: i.frecuencia, sentido: i.sentido, meta: i.meta, alerta: i.alerta, fuente: i.fuente ?? '', responsable: i.responsable ?? '', pasoNumero: i.pasoNumero, activo: i.activo }
      : { tipo: 'gestion', unidad: 'porcentaje', frecuencia: 'trimestral', sentido: 'mayor_o_igual', activo: true, pasoNumero: 20, alerta: null },
  });
  const frecuencia = useWatch({ control, name: 'frecuencia' });
  const guardar = useAccion((d: IndicadorInput) => (i ? api.put(`/org/indicadores/${i.id}`, d) : api.post('/org/indicadores', d)), { alTerminar });
  const eliminar = useAccion(() => api.delete(`/org/indicadores/${i!.id}`), { alTerminar });
  const numero = (v: unknown) => (v === '' || v == null ? null : Number(v));
  const automatico = !!i?.automatico;
  return (
    <Tarjeta>
      <Subtitulo>{i ? 'Ficha técnica del indicador' : 'Nuevo indicador'}</Subtitulo>
      {automatico && <Aviso tono="info">Este indicador se mide solo con los datos de la plataforma: su fórmula y su unidad son fijas. Puedes ajustar la meta, la alerta, la frecuencia y el responsable.</Aviso>}
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="if-nombre" etiqueta="Nombre" className="sm:col-span-2" error={errors.nombre?.message} {...register('nombre')} />
          <Selector id="if-tipo" etiqueta="Tipo" {...register('tipo')}>
            {TIPOS_INDICADOR.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </Selector>
        </div>
        <AreaTexto id="if-objetivo" etiqueta="Objetivo" {...register('objetivo')} />
        <AreaTexto id="if-formula" etiqueta="Fórmula" readOnly={automatico} error={errors.formula?.message} {...register('formula')} />
        <div className="grid gap-4 sm:grid-cols-4">
          {automatico ? (
            <>
              <input type="hidden" {...register('unidad')} />
              <Campo id="if-unidad" etiqueta="Unidad" readOnly value={nombreDe(UNIDADES_INDICADOR, i!.unidad)} />
            </>
          ) : (
            <Selector id="if-unidad" etiqueta="Unidad" {...register('unidad')}>
              {UNIDADES_INDICADOR.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </Selector>
          )}
          <Selector id="if-frecuencia" etiqueta="Frecuencia" ayuda={i && frecuencia !== i.frecuencia ? 'Al cambiarla se borran los resultados registrados.' : undefined} {...register('frecuencia')}>
            {FRECUENCIAS.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </Selector>
          <Selector id="if-sentido" etiqueta="Se cumple si el resultado es" {...register('sentido')}>
            <option value="mayor_o_igual">Mayor o igual a la meta</option>
            <option value="menor_o_igual">Menor o igual a la meta</option>
          </Selector>
          <Selector id="if-paso" etiqueta="Paso del PESV" {...register('pasoNumero', { setValueAs: numero })}>
            <option value="">Sin paso</option>
            {PASOS_PESV.map((p) => <option key={p.numero} value={p.numero}>{p.numero}. {p.nombre}</option>)}
          </Selector>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo id="if-meta" etiqueta="Meta" type="number" step="any" error={errors.meta?.message} {...register('meta', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })} />
          <Campo id="if-alerta" etiqueta="Umbral de alerta (opcional)" type="number" step="any" error={errors.alerta?.message} ayuda="Entre la meta y este valor el indicador queda en riesgo." {...register('alerta', { setValueAs: numero })} />
          <Campo id="if-fuente" etiqueta="Fuente de información" {...register('fuente')} />
          <Campo id="if-resp" etiqueta="Responsable de medir" {...register('responsable')} />
        </div>
        {i && <Casilla etiqueta="Indicador activo" {...register('activo')} />}
        <Aviso error={guardar.error ?? eliminar.error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={guardar.isPending}>Guardar</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
          {i && <Boton variante="peligro" className="ml-auto" cargando={eliminar.isPending} onClick={() => window.confirm(`¿Eliminar «${i.nombre}» y sus resultados registrados?`) && eliminar.mutate(undefined)}>Eliminar</Boton>}
        </div>
      </form>
    </Tarjeta>
  );
}

// Metas --------------------------------------------------------------------------------

function Metas({ anio, indicadores, gestiona }: { anio: number; indicadores: Indicador[]; gestiona: boolean }) {
  const metas = useConsulta<Meta[]>(['metas', anio], `/org/metas?anio=${anio}`);
  const [editando, setEditando] = useState<Meta | 'nueva' | null>(null);
  return (
    <>
      <p className="max-w-3xl text-sm text-gris">
        Cada objetivo del PESV tiene una meta medible para el año. Si la conectas a un indicador, el resultado se actualiza solo (acumulado del año para los automáticos); si no, registras el valor a mano.
      </p>
      {gestiona && !editando && <Boton className="self-start" onClick={() => setEditando('nueva')}>Nueva meta</Boton>}
      {editando && <FormularioMeta key={editando === 'nueva' ? 'nueva' : editando.id} meta={editando === 'nueva' ? undefined : editando} anio={anio} indicadores={indicadores} alTerminar={() => setEditando(null)} />}
      {metas.isPending ? <Cargando /> : metas.data?.length ? (
        <Tabla minimo="52rem">
          <thead>
            <tr>
              <th className={th}>Objetivo</th>
              <th className={th}>Indicador</th>
              <th className={`${th} text-right`}>Meta</th>
              <th className={`${th} text-right`}>Resultado</th>
              <th className={th}>Estado</th>
              <th className={th}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {metas.data.map((m) => (
              <tr key={m.id}>
                <td className={td}><strong className="text-noche">{m.objetivo}</strong></td>
                <td className={td}>{m.indicador ?? '—'}<span className="block text-[12px] text-gris">{m.automatica ? 'Conectada a un indicador' : 'Registro manual'}</span></td>
                <td className={`${td} text-right tabular-nums`}>{signo(m.sentido)} {formatoIndicador(m.meta, m.unidad)}</td>
                <td className={`${td} text-right tabular-nums`}><strong>{formatoIndicador(m.valorActual, m.unidad)}</strong>{m.detalle && <span className="block text-[12px] font-normal text-gris">{m.detalle}</span>}</td>
                <td className={td}><Estado e={m.estado} /></td>
                <td className={td}>{gestiona && <Boton variante="texto" onClick={() => setEditando(m)}>Editar</Boton>}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio titulo={`Sin metas para ${anio}`}>Define objetivos medibles, por ejemplo «cero víctimas fatales» o «reducir los siniestros con lesionados».</Vacio>
      )}
      <Aviso error={metas.error} />
    </>
  );
}

function FormularioMeta({ meta: m, anio, indicadores, alTerminar }: { meta?: Meta; anio: number; indicadores: Indicador[]; alTerminar: () => void }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<z.input<typeof metaPesvSchema>, unknown, MetaPesvInput>({
    resolver: zodResolver(metaPesvSchema),
    defaultValues: m
      ? { anio: m.anio, objetivo: m.objetivo, indicadorId: m.indicadorId, indicador: m.automatica ? '' : (m.indicador ?? ''), meta: m.meta, sentido: m.sentido, valorActual: m.automatica ? null : m.valorActual }
      : { anio, indicadorId: null, sentido: 'menor_o_igual', valorActual: null },
  });
  const indicadorId = useWatch({ control, name: 'indicadorId' });
  const elegido = indicadores.find((x) => x.id === indicadorId);
  const guardar = useAccion((d: MetaPesvInput) => (m ? api.patch(`/org/metas/${m.id}`, d) : api.post('/org/metas', d)), { alTerminar });
  const eliminar = useAccion(() => api.delete(`/org/metas/${m!.id}`), { alTerminar });
  const numero = (v: unknown) => (v === '' || v == null ? null : Number(v));
  return (
    <Tarjeta>
      <Subtitulo>{m ? 'Editar meta' : `Nueva meta ${anio}`}</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <input type="hidden" {...register('anio', { valueAsNumber: true })} />
        <Campo id="mf-obj" etiqueta="Objetivo" placeholder="Ej.: Reducir los siniestros viales con lesionados" error={errors.objetivo?.message} {...register('objetivo')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Selector id="mf-ind" etiqueta="Indicador que la mide" {...register('indicadorId', { setValueAs: (v) => v || null })}>
            <option value="">Otro (registro manual)</option>
            {indicadores.filter((x) => x.activo).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </Selector>
          {!elegido && <Campo id="mf-texto" etiqueta="¿Cómo se mide?" placeholder="Ej.: Simulacros realizados en el año" error={errors.indicador?.message} {...register('indicador')} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="mf-meta" etiqueta={`Meta del año${elegido ? ` (${nombreDe(UNIDADES_INDICADOR, elegido.unidad).toLowerCase()})` : ''}`} type="number" step="any" error={errors.meta?.message} {...register('meta', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })} />
          {elegido ? (
            <p className="self-end pb-3 text-sm text-gris">Se cumple si el resultado es {elegido.sentido === 'menor_o_igual' ? 'menor o igual' : 'mayor o igual'} a la meta.</p>
          ) : (
            <>
              <Selector id="mf-sentido" etiqueta="Se cumple si el valor es" {...register('sentido')}>
                <option value="menor_o_igual">Menor o igual a la meta</option>
                <option value="mayor_o_igual">Mayor o igual a la meta</option>
              </Selector>
              <Campo id="mf-actual" etiqueta="Valor actual" type="number" step="any" {...register('valorActual', { setValueAs: numero })} />
            </>
          )}
        </div>
        <Aviso error={guardar.error ?? eliminar.error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={guardar.isPending}>Guardar</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
          {m && <Boton variante="peligro" className="ml-auto" cargando={eliminar.isPending} onClick={() => window.confirm('¿Eliminar esta meta?') && eliminar.mutate(undefined)}>Eliminar</Boton>}
        </div>
      </form>
    </Tarjeta>
  );
}
