import {
  CAMPOS_PROGRAMA,
  INSTANCIAS_REVISION,
  MESES,
  RESULTADOS_PRUEBA,
  TIPOS_EQUIPO_VELOCIDAD,
  TIPOS_PROGRAMA,
  TIPOS_PRUEBA_SUSTANCIAS,
  type CampoPrograma,
  type TipoProgramaId,
} from '@pesv/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { RequisitosPaso } from '../components/RequisitosPaso';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Casilla, Cifra, Encabezado, Insignia, Pagina, Pestanas, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fecha, td, th } from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { Conductor, Vehiculo } from '../lib/tipos';

interface Actividad { id: string; anio: number; titulo: string; responsable: string; meses: number[]; estado: string; presupuesto: number | null }
interface Programa {
  id: string;
  tipo: TipoProgramaId;
  nombre: string;
  lineamientos: string | null;
  alcance: string | null;
  inicio: string | null;
  duracionMeses: number | null;
  lineaBase: string | null;
  objetivos: string | null;
  factores: string | null;
  responsable: string | null;
  presupuesto: number | null;
  seguimiento: string | null;
  elementos: string[];
  indicadorIds: string[];
  riesgoIds: string[];
  actualizadoEl: string | null;
  divulgadoEl: string | null;
  divulgacion: string | null;
  vigente: boolean;
  completo: boolean;
  avance: number;
  camposFaltantes: CampoPrograma[];
  elementosFaltantes: string[];
  actividades: Actividad[];
}
interface Equipo { id: string; tipo: string; nombre: string; serial: string | null; vehiculoId: string | null; placa: string | null; calibradoEl: string | null; calibracionVence: string | null; notas: string | null; activo: boolean; estado: 'vigente' | 'por_vencer' | 'vencido' | 'sin_calibracion' | 'inactivo' }
interface Datos {
  hoy: string;
  faltantes: TipoProgramaId[];
  programas: Programa[];
  indicadores: { id: string; nombre: string; calculo: string | null }[];
  riesgos: { id: string; peligro: string }[];
  revisiones: { id: string; periodo: string; fecha: string; instancia: string; participantes: string; conclusiones: string }[];
  trimestrePendiente: string | null;
  reuniones: { id: string; fecha: string }[];
  velocidad: { vehiculosActivos: number; vehiculosCubiertos: number; equipos: Equipo[] };
  sustancias: { conductores: number; aleatorias: number; positivas: number; alcohol: number; sustancias: number };
}
interface Prueba { id: string; conductor: string; documento: string; tipo: string; metodo: string | null; fecha: string; resultado: string; accionId: string | null; notas: string | null }

const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? id ?? '—';
const enlace = 'inline-flex min-h-10 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea';
const ESTADO_EQUIPO = {
  vigente: { texto: 'Calibración vigente', tono: 'exito' },
  por_vencer: { texto: 'Vence en 30 días', tono: 'aviso' },
  vencido: { texto: 'Calibración vencida', tono: 'peligro' },
  sin_calibracion: { texto: 'Sin calibración', tono: 'peligro' },
  inactivo: { texto: 'Inactivo', tono: 'neutro' },
} as const;
const texto = (v: string) => (v.trim() ? v.trim() : undefined);

/** Paso 8: programas de gestión de riesgos críticos y factores de desempeño. */
export function Programas() {
  const { puede } = useSesion();
  const consulta = useConsulta<Datos>(['programas'], '/org/programas');
  const [pestana, setPestana] = useState<'programas' | 'velocidad' | 'sustancias' | 'revision'>('programas');
  const iniciar = useAccion(() => api.post('/org/programas/iniciar'));
  const evidencia = useAccion(() => api.post('/org/programas/evidencia'));
  const d = consulta.data;

  return (
    <Pagina ancho="max-w-6xl">
      <Encabezado
        titulo="Programas de riesgo crítico"
        descripcion="Paso 8 · Los cinco programas que exige la Resolución 40595 (velocidad segura, fatiga, distracción, cero alcohol y sustancias, actores viales vulnerables) con su contenido mínimo, sus factores de desempeño, su actualización anual y la revisión trimestral."
        acciones={
          <div className="flex flex-wrap gap-2">
            <a href={urlApi('/org/programas/exportar')} className={enlace}>PDF</a>
            {puede('gestionar_pesv') && !!d?.programas.length && <Boton variante="secundario" cargando={evidencia.isPending} onClick={() => evidencia.mutate(undefined)}>Evidencia del paso 8</Boton>}
          </div>
        }
      />
      {evidencia.isSuccess && <Aviso tono="exito">Los programas quedaron como evidencia del paso 8, pendiente de aprobación.</Aviso>}
      <Aviso error={consulta.error ?? evidencia.error ?? iniciar.error} />
      {consulta.isPending || !d ? <Cargando /> : (
        <>
          {d.faltantes.length > 0 && (
            <Tarjeta>
              <p className="font-bold text-noche">Faltan {d.faltantes.length} de los 5 programas obligatorios</p>
              <p className="text-sm text-gris">{d.faltantes.map((t) => nombreDe(TIPOS_PROGRAMA, t)).join(' · ')}. Se crean con los factores de desempeño que propone la norma; luego completas su contenido.</p>
              {puede('gestionar_pesv') && <Boton className="self-start" cargando={iniciar.isPending} onClick={() => iniciar.mutate(undefined)}>Crear los programas obligatorios</Boton>}
            </Tarjeta>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra etiqueta="Programas completos" valor={`${d.programas.filter((p) => p.tipo !== 'otro' && p.completo).length} de 5`} barra={(d.programas.filter((p) => p.tipo !== 'otro' && p.completo).length / 5) * 100} detalle="Con los 14 campos y los elementos de la norma" />
            <Cifra etiqueta="Cobertura del programa de velocidad" valor={d.velocidad.vehiculosActivos ? `${Math.round((d.velocidad.vehiculosCubiertos / d.velocidad.vehiculosActivos) * 100)} %` : '—'} detalle={`${d.velocidad.vehiculosCubiertos} de ${d.velocidad.vehiculosActivos} vehículos con equipo`} />
            <Cifra etiqueta="Pruebas aleatorias (12 meses)" valor={d.sustancias.aleatorias} detalle={d.sustancias.positivas ? `${d.sustancias.positivas} positivas` : 'Ninguna positiva'} />
            <Cifra etiqueta="Revisión trimestral" valor={d.trimestrePendiente ? 'Pendiente' : 'Al día'} detalle={d.trimestrePendiente ? `Falta la del trimestre ${d.trimestrePendiente}` : d.revisiones[0] ? `Última: ${d.revisiones[0].periodo}` : 'Sin trimestres exigibles aún'} />
          </div>
          <RequisitosPaso numero={8} />
          <Pestanas
            valor={pestana}
            alCambiar={setPestana}
            opciones={[
              { id: 'programas', nombre: 'Programas' },
              { id: 'velocidad', nombre: 'Equipos de velocidad' },
              { id: 'sustancias', nombre: 'Alcohol y sustancias' },
              { id: 'revision', nombre: 'Revisión trimestral' },
            ]}
          />
          {pestana === 'programas' && <ListaProgramas datos={d} />}
          {pestana === 'velocidad' && <Velocidad datos={d} />}
          {pestana === 'sustancias' && <Sustancias datos={d} />}
          {pestana === 'revision' && <Revision datos={d} />}
        </>
      )}
    </Pagina>
  );
}

function ListaProgramas({ datos }: { datos: Datos }) {
  const { puede } = useSesion();
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  if (!datos.programas.length) return <Vacio titulo="Aún no hay programas">Crea los cinco programas obligatorios con el botón de arriba.</Vacio>;
  return (
    <div className="flex flex-col gap-4">
      {datos.programas.map((p) =>
        editando === p.id ? (
          <EditorPrograma key={p.id} programa={p} datos={datos} alTerminar={() => setEditando(null)} />
        ) : (
          <TarjetaPrograma key={p.id} programa={p} datos={datos} alEditar={() => setEditando(p.id)} />
        ),
      )}
      {puede('gestionar_pesv') && (nuevo ? <EditorPrograma datos={datos} alTerminar={() => setNuevo(false)} /> : <Boton variante="secundario" className="self-start" onClick={() => setNuevo(true)}>Agregar otro programa</Boton>)}
    </div>
  );
}

function TarjetaPrograma({ programa: p, datos, alEditar }: { programa: Programa; datos: Datos; alEditar: () => void }) {
  const { puede } = useSesion();
  const [actividad, setActividad] = useState(false);
  const [actualizar, setActualizar] = useState(false);
  const tipo = TIPOS_PROGRAMA.find((t) => t.id === p.tipo)!;
  const quitar = useAccion(() => api.delete(`/org/programas/${p.id}`));
  const indicadores = datos.indicadores.filter((i) => p.indicadorIds.includes(i.id));
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-lg font-bold text-noche">{p.nombre}</p>
          <p className="text-[13px] text-gris">{tipo.obligatorio ? 'Obligatorio · paso 8' : 'Programa adicional'}{p.responsable ? ` · Responsable: ${p.responsable}` : ''}{p.inicio ? ` · Inicia ${fecha(p.inicio)}${p.duracionMeses ? `, ${p.duracionMeses} meses` : ''}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Insignia tono={p.completo ? 'exito' : 'aviso'}>{p.completo ? 'Contenido completo' : `${p.avance} % del contenido`}</Insignia>
          <Insignia tono={p.vigente ? 'exito' : 'neutro'}>{p.vigente ? `Actualizado ${fecha(p.actualizadoEl)}` : 'Sin actualización anual'}</Insignia>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-papel"><div className="h-full rounded-full bg-via" style={{ width: `${p.avance}%` }} /></div>
      {!p.completo && (
        <p className="text-[13px] text-alerta">
          Falta: {[...p.camposFaltantes.map((c) => nombreDe(CAMPOS_PROGRAMA, c)), ...p.elementosFaltantes.map((e) => `confirmar «${tipo.elementos.find((x) => x.id === e)?.texto.replace(/\.$/, '')}»`)].join(' · ')}
        </p>
      )}
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {p.objetivos && <div><dt className="font-semibold text-gris">Objetivos y metas</dt><dd className="whitespace-pre-line">{p.objetivos}</dd></div>}
        {p.factores && <div><dt className="font-semibold text-gris">Factores de desempeño</dt><dd className="whitespace-pre-line">{p.factores}</dd></div>}
        {indicadores.length > 0 && <div><dt className="font-semibold text-gris">Indicadores</dt><dd>{indicadores.map((i) => i.nombre).join(' · ')}</dd></div>}
        {p.lineaBase && <div><dt className="font-semibold text-gris">Línea base</dt><dd>{p.lineaBase}</dd></div>}
      </dl>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Actividades y cronograma</p>
        {p.actividades.length ? (
          <ul className="flex flex-col text-sm">
            {p.actividades.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 border-t border-linea py-1.5 first:border-t-0">
                <span>{a.titulo} <span className="text-gris">· {a.responsable}</span></span>
                <span className="text-[13px] text-gris">{a.anio}: {a.meses.map((m) => MESES[m - 1]).join(', ')} · {a.estado}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gris">Sin actividades. Cada actividad va al plan de trabajo, donde se le hace el seguimiento mensual.</p>}
        <Link to="/plan-trabajo" className="self-start text-[13px] font-semibold text-[#1d4e89] underline-offset-4 hover:underline">Seguimiento en el plan de trabajo</Link>
      </div>
      {puede('gestionar_pesv') && (
        <div className="flex flex-wrap gap-2 border-t border-linea pt-3">
          <Boton variante="secundario" onClick={alEditar}>Editar ficha</Boton>
          <Boton variante="secundario" onClick={() => setActividad(!actividad)}>Agregar actividad</Boton>
          <Boton variante="secundario" onClick={() => setActualizar(!actualizar)}>Registrar actualización y divulgación</Boton>
          {!tipo.obligatorio && <Boton variante="texto" cargando={quitar.isPending} onClick={() => quitar.mutate(undefined)}>Retirar</Boton>}
        </div>
      )}
      {actividad && <NuevaActividad programa={p} alTerminar={() => setActividad(false)} />}
      {actualizar && <Actualizacion programa={p} hoy={datos.hoy} alTerminar={() => setActualizar(false)} />}
      <Aviso error={quitar.error} />
    </Tarjeta>
  );
}

function EditorPrograma({ programa: p, datos, alTerminar }: { programa?: Programa; datos: Datos; alTerminar: () => void }) {
  const [v, setV] = useState({
    tipo: (p?.tipo ?? 'otro') as TipoProgramaId,
    nombre: p?.nombre ?? '',
    lineamientos: p?.lineamientos ?? '',
    alcance: p?.alcance ?? '',
    inicio: p?.inicio ?? '',
    duracionMeses: p?.duracionMeses ? String(p.duracionMeses) : '',
    lineaBase: p?.lineaBase ?? '',
    objetivos: p?.objetivos ?? '',
    factores: p?.factores ?? '',
    responsable: p?.responsable ?? '',
    presupuesto: p?.presupuesto != null ? String(p.presupuesto) : '',
    seguimiento: p?.seguimiento ?? '',
    elementos: p?.elementos ?? [],
    indicadorIds: p?.indicadorIds ?? [],
    riesgoIds: p?.riesgoIds ?? [],
  });
  const tipo = TIPOS_PROGRAMA.find((t) => t.id === v.tipo)!;
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const alternar = (k: 'elementos' | 'indicadorIds' | 'riesgoIds', id: string) => setV({ ...v, [k]: v[k].includes(id) ? v[k].filter((x) => x !== id) : [...v[k], id] });
  const guardar = useAccion(
    () => {
      const cuerpo = {
        tipo: v.tipo,
        nombre: v.nombre,
        lineamientos: texto(v.lineamientos),
        alcance: texto(v.alcance),
        inicio: v.inicio || null,
        duracionMeses: v.duracionMeses ? Number(v.duracionMeses) : null,
        lineaBase: texto(v.lineaBase),
        objetivos: texto(v.objetivos),
        factores: texto(v.factores),
        responsable: texto(v.responsable),
        presupuesto: v.presupuesto ? Number(v.presupuesto) : null,
        seguimiento: texto(v.seguimiento),
        elementos: v.elementos,
        indicadorIds: v.indicadorIds,
        riesgoIds: v.riesgoIds,
      };
      return p ? api.put(`/org/programas/${p.id}`, cuerpo) : api.post('/org/programas', cuerpo);
    },
    { alTerminar },
  );
  const id = p?.id ?? 'nuevo';
  return (
    <Tarjeta>
      <Subtitulo>{p ? `Ficha: ${p.nombre}` : 'Nuevo programa'}</Subtitulo>
      <p className="text-[13px] text-gris">Contenido mínimo del paso 8: nombre, lineamientos, alcance, inicio, duración, línea base, objetivos y metas, indicadores, factores de desempeño, actividades, responsables, presupuesto, cronograma y seguimiento.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo id={`${id}-nombre`} etiqueta="Nombre" value={v.nombre} onChange={set('nombre')} className="md:col-span-2" />
        <AreaTexto id={`${id}-lin`} etiqueta="Lineamientos" value={v.lineamientos} onChange={set('lineamientos')} ayuda="Reglas del programa: límites, prohibiciones, procedimientos." />
        <AreaTexto id={`${id}-alc`} etiqueta="Límites o alcance" value={v.alcance} onChange={set('alcance')} ayuda="A quién y a qué desplazamientos aplica." />
        <Campo id={`${id}-ini`} type="date" etiqueta="Fecha de inicio" value={v.inicio} onChange={set('inicio')} />
        <Campo id={`${id}-dur`} type="number" min={1} max={120} etiqueta="Duración (meses)" value={v.duracionMeses} onChange={set('duracionMeses')} />
        <AreaTexto id={`${id}-lb`} etiqueta="Línea base" value={v.lineaBase} onChange={set('lineaBase')} ayuda="Situación inicial medida (por ejemplo, % de excesos del año anterior)." />
        <AreaTexto id={`${id}-obj`} etiqueta="Objetivos y metas" value={v.objetivos} onChange={set('objetivos')} />
        <AreaTexto id={`${id}-fac`} etiqueta="Factores de desempeño" value={v.factores} onChange={set('factores')} ayuda={tipo.factoresSugeridos.length ? `La norma propone: ${tipo.factoresSugeridos.join('; ')}.` : undefined} />
        <AreaTexto id={`${id}-seg`} etiqueta="Mecanismos de seguimiento" value={v.seguimiento} onChange={set('seguimiento')} />
        <Campo id={`${id}-resp`} etiqueta="Responsable" value={v.responsable} onChange={set('responsable')} />
        <Campo id={`${id}-pre`} type="number" min={0} etiqueta="Presupuesto (COP)" value={v.presupuesto} onChange={set('presupuesto')} />
      </div>
      {tipo.elementos.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-semibold">Elementos que exige la norma para este programa</legend>
          {tipo.elementos.map((e) => <Casilla key={e.id} etiqueta={e.texto} checked={v.elementos.includes(e.id)} onChange={() => alternar('elementos', e.id)} />)}
          <p className="text-[13px] text-gris">Marca cada uno cuando el programa lo contemple en sus lineamientos y actividades.</p>
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-semibold">Indicadores del programa</legend>
        {datos.indicadores.length ? datos.indicadores.map((i) => <Casilla key={i.id} etiqueta={i.nombre} checked={v.indicadorIds.includes(i.id)} onChange={() => alternar('indicadorIds', i.id)} />) : <p className="text-sm text-gris">Primero crea indicadores en <Link to="/indicadores" className="text-[#1d4e89] underline">Indicadores y metas</Link>.</p>}
      </fieldset>
      {datos.riesgos.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-semibold">Riesgos de la matriz que atiende</legend>
          <div className="grid gap-x-4 sm:grid-cols-2">{datos.riesgos.map((r) => <Casilla key={r.id} etiqueta={r.peligro} checked={v.riesgoIds.includes(r.id)} onChange={() => alternar('riesgoIds', r.id)} />)}</div>
        </fieldset>
      )}
      <div className="flex gap-2">
        <Boton cargando={guardar.isPending} disabled={v.nombre.trim().length < 3} onClick={() => guardar.mutate(undefined)}>Guardar ficha</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
      <Aviso error={guardar.error} />
    </Tarjeta>
  );
}

function NuevaActividad({ programa, alTerminar }: { programa: Programa; alTerminar: () => void }) {
  const [v, setV] = useState({ titulo: '', responsable: programa.responsable ?? '', anio: String(new Date().getFullYear()), meses: [] as number[], presupuesto: '' });
  const crear = useAccion(() => api.post(`/org/programas/${programa.id}/actividades`, { anio: Number(v.anio), titulo: v.titulo, responsable: v.responsable, meses: v.meses, presupuesto: v.presupuesto ? Number(v.presupuesto) : null, fase: 'hacer' }), { alTerminar });
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-[#f5f7fa] p-4">
      <div className="grid gap-3 md:grid-cols-[2fr_1.2fr_0.6fr_1fr]">
        <Campo id={`act-${programa.id}`} etiqueta="Actividad" value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} />
        <Campo id={`actr-${programa.id}`} etiqueta="Responsable" value={v.responsable} onChange={(e) => setV({ ...v, responsable: e.target.value })} />
        <Campo id={`acta-${programa.id}`} type="number" etiqueta="Año" value={v.anio} onChange={(e) => setV({ ...v, anio: e.target.value })} />
        <Campo id={`actp-${programa.id}`} type="number" min={0} etiqueta="Presupuesto (COP)" value={v.presupuesto} onChange={(e) => setV({ ...v, presupuesto: e.target.value })} />
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Meses programados</legend>
        <div className="flex flex-wrap gap-1">
          {MESES.map((m, i) => (
            <button key={m} type="button" aria-pressed={v.meses.includes(i + 1)} onClick={() => setV({ ...v, meses: v.meses.includes(i + 1) ? v.meses.filter((x) => x !== i + 1) : [...v.meses, i + 1] })} className="min-h-9 min-w-11 rounded-lg px-2 text-sm font-semibold ring-1 ring-linea aria-pressed:bg-noche aria-pressed:text-white">
              {m}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <Boton cargando={crear.isPending} disabled={v.titulo.trim().length < 3 || v.responsable.trim().length < 3 || !v.meses.length} onClick={() => crear.mutate(undefined)}>Agregar al plan de trabajo</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
      <Aviso error={crear.error} />
    </div>
  );
}

function Actualizacion({ programa, hoy, alTerminar }: { programa: Programa; hoy: string; alTerminar: () => void }) {
  const [v, setV] = useState({ fecha: hoy, divulgacion: '' });
  const enviar = useAccion(() => api.post(`/org/programas/${programa.id}/actualizacion`, v), { alTerminar });
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-[#f5f7fa] p-4">
      <p className="text-[13px] text-gris">La norma exige actualizar el programa y sus factores de desempeño al menos una vez al año y divulgarlo a todos los colaboradores.</p>
      <div className="grid gap-3 md:grid-cols-[1fr_3fr]">
        <Campo id={`upd-${programa.id}`} type="date" etiqueta="Fecha" max={hoy} value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} />
        <Campo id={`div-${programa.id}`} etiqueta="¿Cómo se divulgó?" placeholder="Inducción, correo a todos, cartelera…" value={v.divulgacion} onChange={(e) => setV({ ...v, divulgacion: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <Boton cargando={enviar.isPending} disabled={v.divulgacion.trim().length < 3} onClick={() => enviar.mutate(undefined)}>Registrar</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
      <Aviso error={enviar.error} />
    </div>
  );
}

function Velocidad({ datos }: { datos: Datos }) {
  const { puede } = useSesion();
  const vehiculos = useConsulta<Vehiculo[]>(['vehiculos'], '/org/vehiculos');
  const [editando, setEditando] = useState<Equipo | 'nuevo' | null>(null);
  const equipos = datos.velocidad.equipos;
  return (
    <div className="flex flex-col gap-4">
      <Tarjeta>
        <Subtitulo acciones={puede('gestionar_pesv') && !editando ? <Boton variante="secundario" onClick={() => setEditando('nuevo')}>Registrar equipo</Boton> : undefined}>Equipos de medición de la velocidad</Subtitulo>
        <p className="text-sm text-gris">El programa de velocidad exige equipos o mecanismos de medición con su calibración. Un equipo asignado a un vehículo lo incluye en el programa (indicador de cobertura).</p>
        {editando && <EditorEquipo equipo={editando === 'nuevo' ? undefined : editando} vehiculos={vehiculos.data ?? []} alTerminar={() => setEditando(null)} />}
        {equipos.length ? (
          <Tabla minimo="40rem">
            <thead><tr><th className={th}>Equipo</th><th className={th}>Vehículo</th><th className={th}>Calibrado</th><th className={th}>Vence</th><th className={th}>Estado</th><th className={th}><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {equipos.map((e) => (
                <tr key={e.id}>
                  <td className={td}><span className="font-semibold">{e.nombre}</span><br /><span className="text-[13px] text-gris">{nombreDe(TIPOS_EQUIPO_VELOCIDAD, e.tipo)}{e.serial ? ` · ${e.serial}` : ''}</span></td>
                  <td className={td}>{e.placa ?? '—'}</td>
                  <td className={td}>{fecha(e.calibradoEl)}</td>
                  <td className={td}>{fecha(e.calibracionVence)}</td>
                  <td className={td}><Insignia tono={ESTADO_EQUIPO[e.estado].tono}>{ESTADO_EQUIPO[e.estado].texto}</Insignia></td>
                  <td className={td}>{puede('gestionar_pesv') && <Boton variante="texto" onClick={() => setEditando(e)}>Editar</Boton>}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        ) : !editando && <Vacio titulo="Sin equipos registrados">Registra los GPS, tacógrafos, computadores de a bordo o radares con los que controlas la velocidad.</Vacio>}
      </Tarjeta>
    </div>
  );
}

function EditorEquipo({ equipo, vehiculos, alTerminar }: { equipo?: Equipo; vehiculos: Vehiculo[]; alTerminar: () => void }) {
  const [v, setV] = useState({ tipo: equipo?.tipo ?? 'gps', nombre: equipo?.nombre ?? '', serial: equipo?.serial ?? '', vehiculoId: equipo?.vehiculoId ?? '', calibradoEl: equipo?.calibradoEl ?? '', calibracionVence: equipo?.calibracionVence ?? '', notas: equipo?.notas ?? '', activo: equipo?.activo ?? true });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const guardar = useAccion(() => {
    const cuerpo = { ...v, serial: texto(v.serial), notas: texto(v.notas), vehiculoId: v.vehiculoId || null, calibradoEl: v.calibradoEl || null, calibracionVence: v.calibracionVence || null };
    return equipo ? api.put(`/org/programas/equipos/${equipo.id}`, cuerpo) : api.post('/org/programas/equipos', cuerpo);
  }, { alTerminar });
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-[#f5f7fa] p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Selector id="eq-tipo" etiqueta="Tipo" value={v.tipo} onChange={set('tipo')}>{TIPOS_EQUIPO_VELOCIDAD.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</Selector>
        <Campo id="eq-nombre" etiqueta="Nombre o referencia" value={v.nombre} onChange={set('nombre')} />
        <Campo id="eq-serial" etiqueta="Serial" value={v.serial} onChange={set('serial')} />
        <Selector id="eq-veh" etiqueta="Vehículo" value={v.vehiculoId} onChange={set('vehiculoId')}>
          <option value="">Sin asignar</option>
          {vehiculos.map((x) => <option key={x.id} value={x.id}>{x.placa}</option>)}
        </Selector>
        <Campo id="eq-cal" type="date" etiqueta="Fecha de calibración" value={v.calibradoEl} onChange={set('calibradoEl')} />
        <Campo id="eq-ven" type="date" etiqueta="Vence la calibración" value={v.calibracionVence} onChange={set('calibracionVence')} />
      </div>
      <Casilla etiqueta="Equipo activo" checked={v.activo} onChange={(e) => setV({ ...v, activo: e.target.checked })} />
      <div className="flex gap-2">
        <Boton cargando={guardar.isPending} disabled={v.nombre.trim().length < 2} onClick={() => guardar.mutate(undefined)}>Guardar</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
      <Aviso error={guardar.error} />
    </div>
  );
}

function Sustancias({ datos }: { datos: Datos }) {
  const { puede } = useSesion();
  const s = datos.sustancias;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Cifra etiqueta="Pruebas aleatorias (12 meses)" valor={s.aleatorias} detalle={`${s.positivas} positivas en el periodo`} />
        <Cifra etiqueta="Control anual de alcohol (sangre)" valor={`${s.alcohol} de ${s.conductores}`} barra={s.conductores ? (s.alcohol / s.conductores) * 100 : 0} detalle="Conductores activos con control vigente" />
        <Cifra etiqueta="Control anual de sustancias (orina)" valor={`${s.sustancias} de ${s.conductores}`} barra={s.conductores ? (s.sustancias / s.conductores) * 100 : 0} detalle="Conductores activos con control vigente" />
      </div>
      {puede('datos_sensibles') ? <RegistroPruebas hoy={datos.hoy} /> : (
        <Aviso tono="info">El detalle por persona es un dato sensible de salud (Ley 1581 de 2012): solo lo ven el administrador y el líder del PESV.</Aviso>
      )}
    </div>
  );
}

function RegistroPruebas({ hoy }: { hoy: string }) {
  const pruebas = useConsulta<Prueba[]>(['programas', 'pruebas'], '/org/programas/pruebas');
  const conductores = useConsulta<Conductor[]>(['conductores'], '/org/conductores');
  const [v, setV] = useState({ conductorId: '', tipo: 'alcohol_aleatoria', fecha: hoy, resultado: 'negativo', metodo: '', notas: '', consentimiento: false });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const registrar = useAccion(() => api.post<{ accionId: string | null }>('/org/programas/pruebas', { ...v, metodo: texto(v.metodo), notas: texto(v.notas) }), {
    alTerminar: () => setV({ ...v, conductorId: '', metodo: '', notas: '', consentimiento: false }),
  });
  return (
    <>
      <Tarjeta>
        <Subtitulo>Registrar una prueba</Subtitulo>
        <div className="grid gap-3 md:grid-cols-3">
          <Selector id="pr-cond" etiqueta="Conductor" value={v.conductorId} onChange={set('conductorId')}>
            <option value="">Elige</option>
            {(conductores.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.documento}</option>)}
          </Selector>
          <Selector id="pr-tipo" etiqueta="Prueba" value={v.tipo} onChange={set('tipo')}>{TIPOS_PRUEBA_SUSTANCIAS.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</Selector>
          <Campo id="pr-fecha" type="date" max={hoy} etiqueta="Fecha" value={v.fecha} onChange={set('fecha')} />
          <Selector id="pr-res" etiqueta="Resultado" value={v.resultado} onChange={set('resultado')}>{RESULTADOS_PRUEBA.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</Selector>
          <Campo id="pr-met" etiqueta="Método o laboratorio" value={v.metodo} onChange={set('metodo')} />
          <Campo id="pr-not" etiqueta="Observaciones" value={v.notas} onChange={set('notas')} />
        </div>
        <Casilla etiqueta="El colaborador autorizó la prueba y el tratamiento de este dato sensible" descripcion="Ley 1581 de 2012. Sin autorización no se registra." checked={v.consentimiento} onChange={(e) => setV({ ...v, consentimiento: e.target.checked })} />
        {v.resultado === 'positivo' && <p className="text-[13px] text-alerta">Un resultado positivo abre una acción correctiva del programa en el plan de acción.</p>}
        <Boton className="self-start" cargando={registrar.isPending} disabled={!v.conductorId || !v.consentimiento} onClick={() => registrar.mutate(undefined)}>Registrar prueba</Boton>
        {registrar.data?.accionId && <Aviso tono="info">Se abrió una acción correctiva en el <Link to="/acciones" className="underline">plan de acción</Link>.</Aviso>}
        <Aviso error={registrar.error} />
      </Tarjeta>
      <Tarjeta>
        <Subtitulo>Pruebas registradas</Subtitulo>
        {pruebas.isPending ? <Cargando /> : pruebas.data?.length ? (
          <Tabla minimo="40rem">
            <thead><tr><th className={th}>Fecha</th><th className={th}>Conductor</th><th className={th}>Prueba</th><th className={th}>Resultado</th></tr></thead>
            <tbody>
              {pruebas.data.map((p) => (
                <tr key={p.id}>
                  <td className={td}>{fecha(p.fecha)}</td>
                  <td className={td}>{p.conductor}<br /><span className="text-[13px] text-gris">{p.documento}</span></td>
                  <td className={td}>{nombreDe(TIPOS_PRUEBA_SUSTANCIAS, p.tipo)}{p.metodo ? <><br /><span className="text-[13px] text-gris">{p.metodo}</span></> : null}</td>
                  <td className={td}><Insignia tono={p.resultado === 'positivo' ? 'peligro' : p.resultado === 'negativo' ? 'exito' : 'neutro'}>{nombreDe(RESULTADOS_PRUEBA, p.resultado)}</Insignia></td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        ) : <Vacio titulo="Sin pruebas registradas" />}
        <Aviso error={pruebas.error} />
      </Tarjeta>
    </>
  );
}

function Revision({ datos }: { datos: Datos }) {
  const { puede } = useSesion();
  const anteriorDe = (fechaIso: string) => {
    const anio = Number(fechaIso.slice(0, 4));
    const t = Math.floor((Number(fechaIso.slice(5, 7)) - 1) / 3) + 1;
    return t === 1 ? `${anio - 1}-T4` : `${anio}-T${t - 1}`;
  };
  const [v, setV] = useState({ periodo: datos.trimestrePendiente ?? anteriorDe(datos.hoy), fecha: datos.hoy, instancia: 'comite', reunionId: '', participantes: '', conclusiones: '' });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const guardar = useAccion(() => api.post('/org/programas/revisiones', { ...v, reunionId: v.reunionId || null }), { alTerminar: () => setV({ ...v, participantes: '', conclusiones: '' }) });
  return (
    <div className="flex flex-col gap-4">
      {puede('gestionar_pesv') && (
        <Tarjeta>
          <Subtitulo>Registrar la revisión del trimestre</Subtitulo>
          <p className="text-sm text-gris">El paso 8 pide analizar y evaluar cada trimestre los resultados de los programas en el comité de seguridad vial. En el nivel básico, sin comité obligatorio, la registra el líder con la dirección.</p>
          <div className="grid gap-3 md:grid-cols-4">
            <Campo id="rv-per" etiqueta="Trimestre" value={v.periodo} onChange={set('periodo')} placeholder="2026-T3" />
            <Campo id="rv-fec" type="date" max={datos.hoy} etiqueta="Fecha" value={v.fecha} onChange={set('fecha')} />
            <Selector id="rv-ins" etiqueta="Instancia" value={v.instancia} onChange={set('instancia')}>{INSTANCIAS_REVISION.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</Selector>
            <Selector id="rv-reu" etiqueta="Reunión del comité" value={v.reunionId} onChange={set('reunionId')}>
              <option value="">Sin reunión asociada</option>
              {datos.reuniones.map((r) => <option key={r.id} value={r.id}>{fecha(r.fecha)}</option>)}
            </Selector>
          </div>
          <Campo id="rv-par" etiqueta="Participantes" value={v.participantes} onChange={set('participantes')} />
          <AreaTexto id="rv-con" etiqueta="Análisis y conclusiones" value={v.conclusiones} onChange={set('conclusiones')} ayuda="Resultado de cada programa frente a su meta, factores de desempeño y decisiones." />
          <Boton className="self-start" cargando={guardar.isPending} disabled={v.conclusiones.trim().length < 10 || v.participantes.trim().length < 3} onClick={() => guardar.mutate(undefined)}>Guardar revisión</Boton>
          <Aviso error={guardar.error} />
        </Tarjeta>
      )}
      <Tarjeta>
        <Subtitulo>Revisiones registradas</Subtitulo>
        {datos.revisiones.length ? (
          <ul className="flex flex-col">
            {datos.revisiones.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 border-t border-linea py-3 first:border-t-0">
                <p className="font-semibold">{r.periodo} <span className="font-normal text-gris">· {fecha(r.fecha)} · {nombreDe(INSTANCIAS_REVISION, r.instancia)}</span></p>
                <p className="text-sm whitespace-pre-line">{r.conclusiones}</p>
                <p className="text-[13px] text-gris">Participantes: {r.participantes}</p>
              </li>
            ))}
          </ul>
        ) : <Vacio titulo="Sin revisiones registradas" />}
      </Tarjeta>
    </div>
  );
}
