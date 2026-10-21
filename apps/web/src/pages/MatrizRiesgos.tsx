import { zodResolver } from '@hookform/resolvers/zod';
import {
  ACTORES_VIALES,
  FACTORES_RIESGO_VIAL,
  JERARQUIA_CONTROLES,
  METODOLOGIAS_RIESGO,
  NIVELES_CONSECUENCIA,
  NIVELES_DEFICIENCIA,
  NIVELES_EXPOSICION,
  NIVELES_RIESGO_5X5,
  NIVELES_RIESGO_GTC45,
  PELIGROS_SUGERIDOS,
  PROBABILIDADES_5X5,
  SEVERIDADES_5X5,
  TIPOS_DESPLAZAMIENTO,
  evaluarRiesgo,
  medidaSchema,
  riesgoViaSchema,
  type EvaluacionRiesgo,
  type FactorRiesgoVial,
  type JerarquiaControl,
  type MedidaInput,
  type MetodologiaRiesgo,
  type RiesgoViaInput,
} from '@pesv/shared';
import { Fragment, useMemo, useState } from 'react';
import { useForm, useWatch, type UseFormRegister } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Casilla, Cifra, Encabezado, Insignia, Pagina, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fecha, td, th } from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';

// Tipos de la API ----------------------------------------------------------------------

type DatosEvaluacion = { deficiencia: number | null; exposicion: number | null; consecuencia: number | null; probabilidad: number | null; severidad: number | null };

interface Medida {
  id: string;
  riesgoId: string;
  jerarquia: JerarquiaControl;
  descripcion: string;
  responsable: string | null;
  fechaLimite: string | null;
  estado: MedidaInput['estado'];
  actividadPlanId: string | null;
}

interface Riesgo {
  id: string;
  metodologia: MetodologiaRiesgo;
  proceso: string | null;
  actividad: string | null;
  cargo: string | null;
  rutinaria: boolean;
  tipoDesplazamiento: RiesgoViaInput['tipoDesplazamiento'];
  actorVial: RiesgoViaInput['actorVial'];
  factor: FactorRiesgoVial | null;
  peligro: string;
  descripcion: string | null;
  efectos: string | null;
  expuestos: number | null;
  controlFuente: string | null;
  controlMedio: string | null;
  controlIndividuo: string | null;
  inherenteDatos: DatosEvaluacion;
  residualDatos: DatosEvaluacion;
  inherente: EvaluacionRiesgo | null;
  residual: EvaluacionRiesgo | null;
  peorConsecuencia: string | null;
  requisitoLegal: boolean;
  referenciaLegal: string | null;
  responsable: string | null;
  estado: RiesgoViaInput['estado'];
  identificadoEl: string;
  medidas: Medida[];
}

interface Matriz {
  metodologia: MetodologiaRiesgo;
  riesgos: Riesgo[];
  resumen: { total: number; criticos: number; otraMetodologia: number; medidasPendientes: number; porNivel: { nivel: string; inherente: number; residual: number }[] };
}

const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? '—';
const ESTADO_RIESGO = { abierto: 'Abierto', controlado: 'Controlado', cerrado: 'Cerrado' } as const;
const ESTADO_MEDIDA = { pendiente: 'Pendiente', en_curso: 'En curso', implementada: 'Implementada' } as const;
const enlaceBoton = 'inline-flex min-h-10 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea';

/** Insignia con el color del nivel; el texto siempre dice el nivel (no depende solo del color). */
export function NivelRiesgo({ e, compacto }: { e: EvaluacionRiesgo | null; compacto?: boolean }) {
  if (!e) return <span className="text-gris">—</span>;
  const etiqueta = e.metodologia === 'gtc45' ? `Nivel ${e.nivel}` : e.nivel;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold whitespace-nowrap"
      style={{ background: e.fondo, color: e.color }}
      title={`${e.detalle} · ${e.aceptabilidad}`}
    >
      {etiqueta}
      <span className="font-semibold opacity-80">· {e.valor}</span>
      {!compacto && <span className="sr-only">, {e.aceptabilidad}</span>}
    </span>
  );
}

// Página -------------------------------------------------------------------------------

export function MatrizRiesgos() {
  const { puede } = useSesion();
  const matriz = useConsulta<Matriz>(['matriz'], '/org/matriz');
  const [editando, setEditando] = useState<Riesgo | 'nuevo' | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [filtroCelda, setFiltroCelda] = useState<{ fila: number; columna: number; etiqueta: string } | null>(null);
  const [vista, setVista] = useState<'inherente' | 'residual'>('inherente');
  const evidencia = useAccion(() => api.post<{ evidenciaId: string }>('/org/matriz/evidencia'));

  if (matriz.isPending) return <Pagina><Cargando /></Pagina>;
  if (!matriz.data) return <Pagina><Aviso error={matriz.error} /></Pagina>;
  const { metodologia, riesgos, resumen } = matriz.data;
  const gestiona = puede('gestionar_pesv');
  const visibles = filtroCelda ? riesgos.filter((r) => celdaDe(r, metodologia, vista)?.join() === [filtroCelda.fila, filtroCelda.columna].join()) : riesgos;

  return (
    <Pagina ancho="max-w-7xl">
      <Encabezado
        titulo="Matriz de riesgos viales"
        descripcion="Paso 6 · Identificación de peligros, evaluación y control de los riesgos viales. Los riesgos críticos alimentan los programas del paso 8 y sus medidas pasan al plan de trabajo (paso 9)."
        acciones={
          <div className="flex flex-wrap gap-2">
            <a href={urlApi('/org/matriz/exportar?formato=pdf')} className={enlaceBoton}>Descargar PDF</a>
            <a href={urlApi('/org/matriz/exportar?formato=xlsx')} className={enlaceBoton}>Descargar Excel</a>
            {gestiona && riesgos.length > 0 && (
              <Boton variante="secundario" cargando={evidencia.isPending} onClick={() => evidencia.mutate(undefined)}>Guardar como evidencia del paso 6</Boton>
            )}
          </div>
        }
      />
      {evidencia.isSuccess && (
        <Aviso tono="exito">
          La matriz quedó como evidencia del paso 6, pendiente de aprobación. <Link to="/pasos/6" className="font-semibold underline">Ver el paso 6</Link>
        </Aviso>
      )}
      <Aviso error={evidencia.error} />

      <Metodologia actual={metodologia} puedeCambiar={gestiona} otra={resumen.otraMetodologia} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra etiqueta="Riesgos activos" valor={resumen.total} detalle="Abiertos o controlados" />
        <Cifra etiqueta="Riesgos críticos" valor={resumen.criticos} detalle={metodologia === 'gtc45' ? 'Niveles I y II: requieren programa (paso 8)' : 'Alto y extremo: requieren programa (paso 8)'} />
        <Cifra etiqueta="Medidas pendientes" valor={resumen.medidasPendientes} detalle="Sin implementar" />
        <DistribucionNiveles resumen={resumen} metodologia={metodologia} />
      </div>

      {riesgos.length > 0 && (
        <MapaCalor
          riesgos={riesgos}
          metodologia={metodologia}
          vista={vista}
          alCambiarVista={(v) => { setVista(v); setFiltroCelda(null); }}
          seleccion={filtroCelda}
          alElegir={setFiltroCelda}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {gestiona && !editando && <Boton onClick={() => setEditando('nuevo')}>Identificar peligro</Boton>}
        {filtroCelda && (
          <span className="flex items-center gap-2 text-sm text-gris">
            Mostrando {visibles.length} de {riesgos.length} · {filtroCelda.etiqueta}
            <Boton variante="texto" onClick={() => setFiltroCelda(null)}>Quitar filtro</Boton>
          </span>
        )}
      </div>
      {editando && (
        <FormularioRiesgo
          key={editando === 'nuevo' ? 'nuevo' : editando.id}
          riesgo={editando === 'nuevo' ? undefined : editando}
          metodologia={editando === 'nuevo' ? metodologia : editando.metodologia}
          alTerminar={() => setEditando(null)}
        />
      )}

      {riesgos.length === 0 ? (
        <Vacio titulo="Aún no hay peligros identificados">
          Identifica los peligros por proceso, actividad y actor vial; evalúalos con la metodología de tu organización y define las medidas de intervención.
        </Vacio>
      ) : (
        <Tabla minimo="64rem">
          <thead>
            <tr>
              <th className={th}>#</th>
              <th className={th}>Peligro</th>
              <th className={th}>Proceso · actividad</th>
              <th className={th}>Actor vial</th>
              <th className={th}>Inherente</th>
              <th className={th}>Medidas</th>
              <th className={th}>Residual</th>
              <th className={th}>Estado</th>
              <th className={th}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <Fragment key={r.id}>
                <tr className={abierto === r.id ? 'bg-papel/60' : undefined}>
                  <td className={td}>{riesgos.indexOf(r) + 1}</td>
                  <td className={td}>
                    <strong className="text-noche">{r.peligro}</strong>
                    <span className="block text-[13px] text-gris">{nombreDe(FACTORES_RIESGO_VIAL, r.factor)}{r.requisitoLegal ? ' · requisito legal' : ''}</span>
                  </td>
                  <td className={td}>{r.proceso ?? '—'}{r.actividad && <span className="block text-[13px] text-gris">{r.actividad}</span>}</td>
                  <td className={td}>{nombreDe(ACTORES_VIALES, r.actorVial)}<span className="block text-[13px] text-gris">{nombreDe(TIPOS_DESPLAZAMIENTO, r.tipoDesplazamiento)}</span></td>
                  <td className={td}>
                    <NivelRiesgo e={r.inherente} />
                    {r.metodologia !== metodologia && <span className="mt-1 block text-[12px] text-gris">Evaluado con {nombreDe(METODOLOGIAS_RIESGO, r.metodologia)}</span>}
                  </td>
                  <td className={td}>
                    {r.medidas.length ? `${r.medidas.filter((m) => m.estado === 'implementada').length} de ${r.medidas.length} implementadas` : <span className={r.inherente?.critico ? 'font-semibold text-alerta' : 'text-gris'}>Sin medidas</span>}
                  </td>
                  <td className={td}><NivelRiesgo e={r.residual} /></td>
                  <td className={td}>{ESTADO_RIESGO[r.estado]}</td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <Boton variante="texto" aria-expanded={abierto === r.id} onClick={() => setAbierto(abierto === r.id ? null : r.id)}>{abierto === r.id ? 'Cerrar' : 'Ver'}</Boton>
                      {gestiona && <Boton variante="texto" onClick={() => { setEditando(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</Boton>}
                    </div>
                  </td>
                </tr>
                {abierto === r.id && (
                  <tr>
                    <td colSpan={9} className="border-t border-linea bg-papel/40 px-4 py-5">
                      <DetalleRiesgo riesgo={r} gestiona={gestiona} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </Tabla>
      )}
      <Aviso error={matriz.error} />
    </Pagina>
  );
}

// Metodología ------------------------------------------------------------------------

function Metodologia({ actual, puedeCambiar, otra }: { actual: MetodologiaRiesgo; puedeCambiar: boolean; otra: number }) {
  const cambiar = useAccion((metodologia: MetodologiaRiesgo) => api.put('/org/matriz/metodologia', { metodologia }));
  const info = METODOLOGIAS_RIESGO.find((m) => m.id === actual)!;
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-gris">Metodología de evaluación</p>
          <p className="text-lg font-bold text-noche">{info.nombre}</p>
          <p className="text-sm text-gris">{info.descripcion}</p>
        </div>
        {puedeCambiar && (
          <div className="w-full max-w-xs">
            <Selector id="mz-metodologia" etiqueta="Cambiar metodología" value={actual} disabled={cambiar.isPending} onChange={(e) => cambiar.mutate(e.target.value as MetodologiaRiesgo)}>
              {METODOLOGIAS_RIESGO.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </Selector>
          </div>
        )}
      </div>
      {otra > 0 && (
        <Aviso tono="info">
          {otra === 1 ? 'Un riesgo conserva' : `${otra} riesgos conservan`} la evaluación con la otra metodología. Edítalos para reevaluarlos con {info.nombre}; mientras tanto se ordenan por su prioridad equivalente.
        </Aviso>
      )}
      <Aviso error={cambiar.error} />
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-[#1d4e89]">Ver los criterios de evaluación</summary>
        <div className="mt-3"><Criterios metodologia={actual} /></div>
      </details>
    </Tarjeta>
  );
}

function Criterios({ metodologia }: { metodologia: MetodologiaRiesgo }) {
  const escalas =
    metodologia === 'gtc45'
      ? [
          { titulo: 'Nivel de deficiencia (ND)', filas: NIVELES_DEFICIENCIA.map((n) => [String(n.valor), n.nombre, n.descripcion]) },
          { titulo: 'Nivel de exposición (NE)', filas: NIVELES_EXPOSICION.map((n) => [String(n.valor), n.nombre, n.descripcion]) },
          { titulo: 'Nivel de consecuencia (NC)', filas: NIVELES_CONSECUENCIA.map((n) => [String(n.valor), n.nombre, n.descripcion]) },
        ]
      : [
          { titulo: 'Probabilidad', filas: PROBABILIDADES_5X5.map((n) => [String(n.valor), n.nombre, n.descripcion]) },
          { titulo: 'Severidad', filas: SEVERIDADES_5X5.map((n) => [String(n.valor), n.nombre, n.descripcion]) },
        ];
  const niveles = metodologia === 'gtc45' ? NIVELES_RIESGO_GTC45 : NIVELES_RIESGO_5X5;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {escalas.map((e) => (
        <div key={e.titulo}>
          <p className="mb-1 font-semibold text-noche">{e.titulo}</p>
          <ul className="flex flex-col gap-1">
            {e.filas.map(([v, n, d]) => (
              <li key={v} className="flex gap-2"><span className="w-10 shrink-0 font-bold text-noche">{v}</span><span><strong>{n}.</strong> <span className="text-gris">{d}</span></span></li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <p className="mb-1 font-semibold text-noche">Nivel de riesgo {metodologia === 'gtc45' ? '(NR = ND × NE × NC)' : '(probabilidad × severidad)'}</p>
        <ul className="flex flex-col gap-1">
          {niveles.map((n) => (
            <li key={n.nivel} className="flex items-start gap-2">
              <span className="w-20 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-bold" style={{ background: n.fondo, color: n.color }}>{metodologia === 'gtc45' ? `${n.nivel} · ≥${n.desde}` : n.nivel}</span>
              <span><strong>{n.aceptabilidad}.</strong> <span className="text-gris">{n.significado}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DistribucionNiveles({ resumen, metodologia }: { resumen: Matriz['resumen']; metodologia: MetodologiaRiesgo }) {
  const niveles = metodologia === 'gtc45' ? NIVELES_RIESGO_GTC45 : NIVELES_RIESGO_5X5;
  const total = resumen.porNivel.reduce((s, n) => s + n.inherente, 0);
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-white p-6 ring-1 ring-linea">
      <p className="text-sm font-semibold text-gris">Riesgos por nivel (inherente)</p>
      {total === 0 ? (
        <p className="text-sm text-gris">Sin riesgos evaluados</p>
      ) : (
        <>
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
            {resumen.porNivel.filter((n) => n.inherente > 0).map((n) => (
              <div key={n.nivel} style={{ flexGrow: n.inherente, background: niveles.find((x) => x.nivel === n.nivel)!.color }} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
            {resumen.porNivel.map((n) => {
              const c = niveles.find((x) => x.nivel === n.nivel)!;
              return (
                <li key={n.nivel} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: c.color }} aria-hidden="true" />
                  <span className="text-gris">{metodologia === 'gtc45' ? `Nivel ${n.nivel}` : n.nivel}</span>
                  <strong className="ml-auto text-noche">{n.inherente}</strong>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

// Mapa de calor --------------------------------------------------------------------

/** Bandas de nivel de probabilidad (ND × NE) de la GTC 45, de mayor a menor. */
const BANDAS_NP = [
  { nombre: 'Muy alto', rango: '24–40', desde: 24, hasta: 40 },
  { nombre: 'Alto', rango: '10–20', desde: 10, hasta: 20 },
  { nombre: 'Medio', rango: '6–8', desde: 6, hasta: 8 },
  { nombre: 'Bajo', rango: '0–4', desde: 0, hasta: 4 },
];
const CONSECUENCIAS = [...NIVELES_CONSECUENCIA].sort((a, b) => a.valor - b.valor);

/** Fila y columna del mapa donde cae un riesgo (solo si se evaluó con la metodología vigente). */
function celdaDe(r: Riesgo, metodologia: MetodologiaRiesgo, vista: 'inherente' | 'residual'): [number, number] | null {
  if (r.metodologia !== metodologia || r.estado === 'cerrado') return null;
  const d = vista === 'inherente' ? r.inherenteDatos : r.residualDatos;
  if (metodologia === 'gtc45') {
    if (d.deficiencia == null || d.exposicion == null || d.consecuencia == null) return null;
    const np = d.deficiencia * d.exposicion;
    return [BANDAS_NP.findIndex((b) => np >= b.desde), CONSECUENCIAS.findIndex((c) => c.valor === d.consecuencia)];
  }
  if (d.probabilidad == null || d.severidad == null) return null;
  return [5 - d.probabilidad, d.severidad - 1];
}

function MapaCalor({
  riesgos,
  metodologia,
  vista,
  alCambiarVista,
  seleccion,
  alElegir,
}: {
  riesgos: Riesgo[];
  metodologia: MetodologiaRiesgo;
  vista: 'inherente' | 'residual';
  alCambiarVista: (v: 'inherente' | 'residual') => void;
  seleccion: { fila: number; columna: number } | null;
  alElegir: (c: { fila: number; columna: number; etiqueta: string } | null) => void;
}) {
  const gtc = metodologia === 'gtc45';
  const filas = gtc ? BANDAS_NP.map((b) => ({ nombre: b.nombre, detalle: `NP ${b.rango}` })) : [...PROBABILIDADES_5X5].reverse().map((p) => ({ nombre: p.nombre, detalle: String(p.valor) }));
  const columnas = gtc ? CONSECUENCIAS.map((c) => ({ nombre: c.nombre, detalle: `NC ${c.valor}` })) : SEVERIDADES_5X5.map((s) => ({ nombre: s.nombre, detalle: String(s.valor) }));
  const conteo = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of riesgos) {
      const c = celdaDe(r, metodologia, vista);
      if (c) m.set(c.join(), (m.get(c.join()) ?? 0) + 1);
    }
    return m;
  }, [riesgos, metodologia, vista]);
  const ubicados = [...conteo.values()].reduce((s, n) => s + n, 0);

  /**
   * Niveles posibles en la celda. En GTC 45 una banda de probabilidad abarca varios valores de NP,
   * así que una celda puede quedar entre dos niveles (como en la tabla de la guía).
   */
  const nivelesCelda = (f: number, c: number) => {
    if (!gtc) return [evaluarRiesgo('matriz5x5', { probabilidad: 5 - f, severidad: c + 1 })!];
    const banda = BANDAS_NP[f]!;
    const nc = CONSECUENCIAS[c]!.valor;
    const alto = evaluarRiesgo('gtc45', { deficiencia: 1, exposicion: banda.hasta, consecuencia: nc })!;
    const bajo = evaluarRiesgo('gtc45', { deficiencia: 1, exposicion: Math.max(banda.desde, 2), consecuencia: nc })!;
    return alto.nivel === bajo.nivel ? [alto] : [alto, bajo];
  };

  return (
    <Tarjeta>
      <Subtitulo
        acciones={
          <div role="tablist" className="flex gap-1 rounded-lg bg-papel p-1">
            {(['inherente', 'residual'] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => alCambiarVista(v)} className="min-h-9 rounded-md px-3 text-sm font-semibold text-gris aria-selected:bg-white aria-selected:text-noche aria-selected:shadow-sm">
                {v === 'inherente' ? 'Riesgo inherente' : 'Riesgo residual'}
              </button>
            ))}
          </div>
        }
      >
        Mapa de calor
      </Subtitulo>
      <p className="-mt-2 text-sm text-gris">
        {ubicados} {ubicados === 1 ? 'riesgo ubicado' : 'riesgos ubicados'}
        {vista === 'residual' ? ' con evaluación residual' : ''}. Elige una celda para filtrar la tabla.
      </p>
      <div className="overflow-x-auto">
        <table className="mx-auto border-separate border-spacing-[3px] text-center text-[13px]" aria-label={`Mapa de calor del riesgo ${vista}`}>
          <thead>
            <tr>
              <th className="px-2 text-left text-[12px] font-semibold text-gris" scope="col">{gtc ? 'Probabilidad ↓ / Consecuencia →' : 'Probabilidad ↓ / Severidad →'}</th>
              {columnas.map((c) => (
                <th key={c.nombre} scope="col" className="w-16 px-1 sm:w-24 pb-1 align-bottom text-[12px] font-semibold text-tinta">
                  {c.nombre}<span className="block font-normal text-gris">{c.detalle}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, f) => (
              <tr key={fila.nombre}>
                <th scope="row" className="px-2 text-left text-[12px] font-semibold text-tinta">
                  {fila.nombre}<span className="block font-normal text-gris">{fila.detalle}</span>
                </th>
                {columnas.map((col, c) => {
                  const niveles = nivelesCelda(f, c);
                  const n = niveles[0]!;
                  const fondo = niveles.length > 1 ? `linear-gradient(135deg, ${n.fondo} 50%, ${niveles[1]!.fondo} 50%)` : n.fondo;
                  const textoNivel = niveles.map((x) => x.nivel).join('–');
                  const cantidad = conteo.get([f, c].join()) ?? 0;
                  const elegida = seleccion?.fila === f && seleccion.columna === c;
                  const nombreNivel = gtc ? `nivel ${textoNivel}` : n.nivel.toLowerCase();
                  const etiqueta = `${fila.nombre} × ${col.nombre} (${nombreNivel})`;
                  return (
                    <td key={col.nombre} className="p-0">
                      <button
                        type="button"
                        disabled={cantidad === 0}
                        aria-pressed={elegida}
                        aria-label={`${etiqueta}: ${cantidad} ${cantidad === 1 ? 'riesgo' : 'riesgos'}`}
                        title={`${etiqueta} · ${cantidad} ${cantidad === 1 ? 'riesgo' : 'riesgos'}`}
                        onClick={() => alElegir(elegida ? null : { fila: f, columna: c, etiqueta })}
                        className="flex h-12 w-16 flex-col sm:h-14 sm:w-24 items-center justify-center rounded-md outline-offset-2 enabled:cursor-pointer enabled:hover:ring-2 enabled:hover:ring-noche/40 aria-pressed:ring-2 aria-pressed:ring-noche"
                        style={{ background: fondo }}
                      >
                        <span className={cantidad ? 'text-lg font-extrabold text-noche' : 'text-sm text-tinta/40'}>{cantidad || '·'}</span>
                        <span className="text-[11px] font-semibold" style={{ color: n.color }}>{textoNivel}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

// Detalle y medidas -----------------------------------------------------------------

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-gris">{titulo}</p>
      <div className="text-sm text-tinta">{children || <span className="text-gris">—</span>}</div>
    </div>
  );
}

function DetalleRiesgo({ riesgo: r, gestiona }: { riesgo: Riesgo; gestiona: boolean }) {
  const eliminar = useAccion(() => api.delete(`/org/matriz/riesgos/${r.id}`));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato titulo="Cargo">{r.cargo}</Dato>
        <Dato titulo="Actividad">{r.actividad ? `${r.actividad} (${r.rutinaria ? 'rutinaria' : 'no rutinaria'})` : null}</Dato>
        <Dato titulo="Expuestos">{r.expuestos != null ? String(r.expuestos) : null}</Dato>
        <Dato titulo="Responsable">{r.responsable}</Dato>
        <Dato titulo="Descripción">{r.descripcion}</Dato>
        <Dato titulo="Efectos posibles">{r.efectos}</Dato>
        <Dato titulo="Peor consecuencia">{r.peorConsecuencia}</Dato>
        <Dato titulo="Requisito legal">{r.requisitoLegal ? r.referenciaLegal || 'Sí' : 'No'}</Dato>
        <Dato titulo="Control en la fuente">{r.controlFuente}</Dato>
        <Dato titulo="Control en el medio">{r.controlMedio}</Dato>
        <Dato titulo="Control en el individuo">{r.controlIndividuo}</Dato>
        <Dato titulo="Evaluación">
          {r.inherente ? <>{r.inherente.detalle}<span className="block text-gris">{r.inherente.significado}</span></> : null}
        </Dato>
      </div>
      <Medidas riesgo={r} gestiona={gestiona} />
      {gestiona && (
        <div className="flex items-center gap-3 border-t border-linea pt-4">
          <Boton
            variante="peligro"
            cargando={eliminar.isPending}
            onClick={() => {
              if (window.confirm(`¿Eliminar el riesgo «${r.peligro}» y sus medidas? Las actividades ya enviadas al plan de trabajo se conservan.`)) eliminar.mutate(undefined);
            }}
          >
            Eliminar riesgo
          </Boton>
          <Aviso error={eliminar.error} />
        </div>
      )}
    </div>
  );
}

function Medidas({ riesgo, gestiona }: { riesgo: Riesgo; gestiona: boolean }) {
  const [agregando, setAgregando] = useState(false);
  const ordenadas = [...riesgo.medidas].sort((a, b) => JERARQUIA_CONTROLES.findIndex((j) => j.id === a.jerarquia) - JERARQUIA_CONTROLES.findIndex((j) => j.id === b.jerarquia));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-noche">Medidas de intervención</p>
        {gestiona && !agregando && <Boton variante="secundario" onClick={() => setAgregando(true)}>Agregar medida</Boton>}
      </div>
      {riesgo.inherente?.critico && riesgo.medidas.length === 0 && (
        <Aviso>Este riesgo es crítico: define al menos una medida y envíala al plan de trabajo (programas del paso 8).</Aviso>
      )}
      {agregando && <FormularioMedida riesgoId={riesgo.id} alTerminar={() => setAgregando(false)} />}
      {ordenadas.length > 0 && (
        <ul className="flex flex-col divide-y divide-linea rounded-xl bg-white ring-1 ring-linea">
          {ordenadas.map((m) => <FilaMedida key={m.id} m={m} gestiona={gestiona} />)}
        </ul>
      )}
    </div>
  );
}

function FilaMedida({ m, gestiona }: { m: Medida; gestiona: boolean }) {
  const [editando, setEditando] = useState(false);
  const cambiarEstado = useAccion((estado: Medida['estado']) =>
    api.patch(`/org/matriz/medidas/${m.id}`, { jerarquia: m.jerarquia, descripcion: m.descripcion, responsable: m.responsable, fechaLimite: m.fechaLimite, estado }),
  );
  const alPlan = useAccion(() => api.post(`/org/matriz/medidas/${m.id}/plan`));
  const borrar = useAccion(() => api.delete(`/org/matriz/medidas/${m.id}`));
  if (editando) return <li className="p-3"><FormularioMedida medida={m} riesgoId={m.riesgoId} alTerminar={() => setEditando(false)} /></li>;
  const vencida = m.estado !== 'implementada' && m.fechaLimite && m.fechaLimite < new Date().toISOString().slice(0, 10);
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <Insignia tono="info">{nombreDe(JERARQUIA_CONTROLES, m.jerarquia)}</Insignia>
        <p className="mt-1 text-sm font-semibold text-noche">{m.descripcion}</p>
        <p className="text-[13px] text-gris">
          {m.responsable ?? 'Sin responsable'} · {m.fechaLimite ? `Hasta ${fecha(m.fechaLimite)}` : 'Sin fecha límite'}
          {vencida && <> · <span className="font-semibold text-alerta">Vencida</span></>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {gestiona ? (
          <select
            aria-label="Estado de la medida"
            className="h-10 rounded-lg border border-[#d5dae1] bg-white px-2 text-sm"
            value={m.estado}
            disabled={cambiarEstado.isPending}
            onChange={(e) => cambiarEstado.mutate(e.target.value as Medida['estado'])}
          >
            {Object.entries(ESTADO_MEDIDA).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        ) : (
          <Insignia tono={m.estado === 'implementada' ? 'exito' : m.estado === 'en_curso' ? 'aviso' : 'neutro'}>{ESTADO_MEDIDA[m.estado]}</Insignia>
        )}
        {m.actividadPlanId ? (
          <Link to="/planificacion" className="text-sm font-semibold text-[#1d4e89] underline">En el plan de trabajo</Link>
        ) : (
          gestiona && <Boton variante="secundario" cargando={alPlan.isPending} onClick={() => alPlan.mutate(undefined)}>Enviar al plan de trabajo</Boton>
        )}
        {gestiona && <Boton variante="texto" onClick={() => setEditando(true)}>Editar</Boton>}
        {gestiona && <Boton variante="texto" cargando={borrar.isPending} onClick={() => window.confirm('¿Eliminar esta medida?') && borrar.mutate(undefined)}>Eliminar</Boton>}
      </div>
      <Aviso error={cambiarEstado.error ?? alPlan.error ?? borrar.error} />
    </li>
  );
}

function FormularioMedida({ riesgoId, medida, alTerminar }: { riesgoId: string; medida?: Medida; alTerminar: () => void }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<z.input<typeof medidaSchema>, unknown, MedidaInput>({
    resolver: zodResolver(medidaSchema),
    defaultValues: medida
      ? { jerarquia: medida.jerarquia, descripcion: medida.descripcion, responsable: medida.responsable ?? '', fechaLimite: medida.fechaLimite, estado: medida.estado }
      : { jerarquia: 'administrativos', estado: 'pendiente', fechaLimite: null },
  });
  const jerarquia = useWatch({ control, name: 'jerarquia' });
  const guardar = useAccion((d: MedidaInput) => (medida ? api.patch(`/org/matriz/medidas/${medida.id}`, d) : api.post(`/org/matriz/riesgos/${riesgoId}/medidas`, d)), { alTerminar });
  return (
    <form noValidate className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-linea" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Selector id={`md-j-${riesgoId}`} etiqueta="Jerarquía del control" ayuda={JERARQUIA_CONTROLES.find((j) => j.id === jerarquia)?.ejemplo} {...register('jerarquia')}>
          {JERARQUIA_CONTROLES.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
        </Selector>
        <Selector id={`md-e-${riesgoId}`} etiqueta="Estado" {...register('estado')}>
          {Object.entries(ESTADO_MEDIDA).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
      </div>
      <AreaTexto id={`md-d-${riesgoId}`} etiqueta="Medida" placeholder="Ej.: programa de gestión de la velocidad con monitoreo GPS" error={errors.descripcion?.message} {...register('descripcion')} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={`md-r-${riesgoId}`} etiqueta="Responsable" {...register('responsable')} />
        <Campo id={`md-f-${riesgoId}`} etiqueta="Fecha límite" type="date" error={errors.fechaLimite?.message} {...register('fechaLimite', { setValueAs: (v: string | null) => v || null })} />
      </div>
      <Aviso error={guardar.error} />
      <div className="flex gap-2">
        <Boton type="submit" cargando={guardar.isPending}>Guardar medida</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
    </form>
  );
}

// Formulario del riesgo ---------------------------------------------------------------

type Entrada = z.input<typeof riesgoViaSchema>;
const aNumero = (v: unknown) => (v === '' || v == null ? null : Number(v));
const vacio = { deficiencia: null, exposicion: null, consecuencia: null, probabilidad: null, severidad: null };

function CamposEvaluacion({ prefijo, metodologia, register, opcional }: { prefijo: 'inherente' | 'residual'; metodologia: MetodologiaRiesgo; register: UseFormRegister<Entrada>; opcional?: boolean }) {
  const vacioTexto = opcional ? 'Sin evaluar' : 'Elige…';
  const id = (c: string) => `rg-${prefijo}-${c}`;
  if (metodologia === 'gtc45') {
    return (
      <>
        <Selector id={id('nd')} etiqueta="Nivel de deficiencia (ND)" {...register(`${prefijo}.deficiencia`, { setValueAs: aNumero })}>
          <option value="">{vacioTexto}</option>
          {NIVELES_DEFICIENCIA.map((n) => <option key={n.valor} value={n.valor}>{n.valor} · {n.nombre}</option>)}
        </Selector>
        <Selector id={id('ne')} etiqueta="Nivel de exposición (NE)" {...register(`${prefijo}.exposicion`, { setValueAs: aNumero })}>
          <option value="">{vacioTexto}</option>
          {NIVELES_EXPOSICION.map((n) => <option key={n.valor} value={n.valor}>{n.valor} · {n.nombre}</option>)}
        </Selector>
        <Selector id={id('nc')} etiqueta="Nivel de consecuencia (NC)" {...register(`${prefijo}.consecuencia`, { setValueAs: aNumero })}>
          <option value="">{vacioTexto}</option>
          {NIVELES_CONSECUENCIA.map((n) => <option key={n.valor} value={n.valor}>{n.valor} · {n.nombre}</option>)}
        </Selector>
      </>
    );
  }
  return (
    <>
      <Selector id={id('p')} etiqueta="Probabilidad" {...register(`${prefijo}.probabilidad`, { setValueAs: aNumero })}>
        <option value="">{vacioTexto}</option>
        {PROBABILIDADES_5X5.map((n) => <option key={n.valor} value={n.valor}>{n.valor} · {n.nombre}</option>)}
      </Selector>
      <Selector id={id('s')} etiqueta="Severidad" {...register(`${prefijo}.severidad`, { setValueAs: aNumero })}>
        <option value="">{vacioTexto}</option>
        {SEVERIDADES_5X5.map((n) => <option key={n.valor} value={n.valor}>{n.valor} · {n.nombre}</option>)}
      </Selector>
    </>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-linea pt-4">
      <legend className="pr-2 text-sm font-bold uppercase tracking-wide text-gris">{titulo}</legend>
      {children}
    </fieldset>
  );
}

function FormularioRiesgo({ riesgo, metodologia, alTerminar }: { riesgo?: Riesgo; metodologia: MetodologiaRiesgo; alTerminar: () => void }) {
  const { metodologia: vigente } = useConsulta<Matriz>(['matriz'], '/org/matriz').data ?? { metodologia };
  const [usar, setUsar] = useState<MetodologiaRiesgo>(metodologia);
  const valoresIniciales = (): Entrada =>
    riesgo
      ? {
          metodologia: riesgo.metodologia,
          proceso: riesgo.proceso ?? '',
          actividad: riesgo.actividad ?? '',
          cargo: riesgo.cargo ?? '',
          rutinaria: riesgo.rutinaria,
          tipoDesplazamiento: riesgo.tipoDesplazamiento,
          actorVial: riesgo.actorVial,
          factor: riesgo.factor ?? 'humano',
          peligro: riesgo.peligro,
          descripcion: riesgo.descripcion ?? '',
          efectos: riesgo.efectos ?? '',
          expuestos: riesgo.expuestos,
          controlFuente: riesgo.controlFuente ?? '',
          controlMedio: riesgo.controlMedio ?? '',
          controlIndividuo: riesgo.controlIndividuo ?? '',
          inherente: riesgo.inherenteDatos,
          residual: riesgo.residualDatos,
          peorConsecuencia: riesgo.peorConsecuencia ?? '',
          requisitoLegal: riesgo.requisitoLegal,
          referenciaLegal: riesgo.referenciaLegal ?? '',
          responsable: riesgo.responsable ?? '',
          estado: riesgo.estado,
        }
      : { metodologia, proceso: '', peligro: '', rutinaria: true, tipoDesplazamiento: 'en_mision', actorVial: 'conductor', factor: 'humano', inherente: vacio, residual: vacio, requisitoLegal: false, estado: 'abierto' };
  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<Entrada, unknown, RiesgoViaInput>({
    resolver: zodResolver(riesgoViaSchema),
    defaultValues: valoresIniciales(),
  });
  const [factor, inherente, residual, requisito] = useWatch({ control, name: ['factor', 'inherente', 'residual', 'requisitoLegal'] });
  const evalInherente = evaluarRiesgo(usar, inherente ?? {});
  const evalResidual = evaluarRiesgo(usar, residual ?? {});
  const guardar = useAccion((d: RiesgoViaInput) => (riesgo ? api.patch(`/org/matriz/riesgos/${riesgo.id}`, d) : api.post('/org/matriz/riesgos', d)), { alTerminar });

  const reevaluar = () => {
    setUsar(vigente);
    setValue('metodologia', vigente);
    setValue('inherente', vacio);
    setValue('residual', vacio);
  };

  return (
    <Tarjeta>
      <Subtitulo>{riesgo ? 'Editar riesgo' : 'Identificar peligro'}</Subtitulo>
      {riesgo && usar !== vigente && (
        <Aviso tono="info">
          Este riesgo se evaluó con {nombreDe(METODOLOGIAS_RIESGO, usar)}.{' '}
          <button type="button" className="font-semibold underline" onClick={reevaluar}>Reevaluar con {nombreDe(METODOLOGIAS_RIESGO, vigente)}</button>
        </Aviso>
      )}
      <form noValidate className="flex flex-col gap-5" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <input type="hidden" {...register('metodologia')} />
        <Seccion titulo="Identificación">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo id="rg-proceso" etiqueta="Proceso" placeholder="Ej.: Distribución" error={errors.proceso?.message} {...register('proceso')} />
            <Campo id="rg-actividad" etiqueta="Actividad" placeholder="Ej.: Entrega de mercancía" {...register('actividad')} />
            <Campo id="rg-cargo" etiqueta="Cargo expuesto" placeholder="Ej.: Conductor de camión" {...register('cargo')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Selector id="rg-actor" etiqueta="Actor vial" {...register('actorVial')}>
              {ACTORES_VIALES.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </Selector>
            <Selector id="rg-desplazamiento" etiqueta="Tipo de desplazamiento" {...register('tipoDesplazamiento')}>
              {TIPOS_DESPLAZAMIENTO.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </Selector>
            <Selector id="rg-factor" etiqueta="Factor de riesgo" ayuda={FACTORES_RIESGO_VIAL.find((f) => f.id === factor)?.descripcion} {...register('factor')}>
              {FACTORES_RIESGO_VIAL.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </Selector>
            <Campo id="rg-expuestos" etiqueta="N.º de expuestos" type="number" min={0} {...register('expuestos', { setValueAs: aNumero })} />
          </div>
          <Campo id="rg-peligro" etiqueta="Peligro" list="rg-peligros" placeholder="Escribe o elige uno de los frecuentes" error={errors.peligro?.message} {...register('peligro')} />
          <datalist id="rg-peligros">
            {(PELIGROS_SUGERIDOS[(factor ?? 'humano') as FactorRiesgoVial] ?? []).map((p) => <option key={p} value={p} />)}
          </datalist>
          <div className="grid gap-4 sm:grid-cols-2">
            <AreaTexto id="rg-desc" etiqueta="Descripción" placeholder="Situación, ruta o condición en la que se presenta" {...register('descripcion')} />
            <AreaTexto id="rg-efectos" etiqueta="Efectos posibles" placeholder="Ej.: lesiones, muerte, daños a terceros" {...register('efectos')} />
          </div>
          <Casilla etiqueta="Actividad rutinaria" {...register('rutinaria')} />
        </Seccion>

        <Seccion titulo="Controles existentes">
          <div className="grid gap-4 sm:grid-cols-3">
            <AreaTexto id="rg-cf" etiqueta="En la fuente" placeholder="Ej.: limitador de velocidad" {...register('controlFuente')} />
            <AreaTexto id="rg-cm" etiqueta="En el medio" placeholder="Ej.: señalización interna, planeación de rutas" {...register('controlMedio')} />
            <AreaTexto id="rg-ci" etiqueta="En el individuo" placeholder="Ej.: capacitación, EPP, exámenes médicos" {...register('controlIndividuo')} />
          </div>
        </Seccion>

        <Seccion titulo={`Evaluación del riesgo · ${nombreDe(METODOLOGIAS_RIESGO, usar)}`}>
          <div className="grid gap-4 sm:grid-cols-4">
            <CamposEvaluacion prefijo="inherente" metodologia={usar} register={register} />
            <ResultadoEvaluacion e={evalInherente} />
          </div>
          {errors.inherente && <p className="text-[13px] font-medium text-alerta">{errors.inherente.message ?? 'Completa la evaluación del riesgo'}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="rg-peor" etiqueta="Peor consecuencia" placeholder="Ej.: muerte del conductor y de terceros" {...register('peorConsecuencia')} />
            <div className="flex flex-col gap-2">
              <Casilla etiqueta="Existe requisito legal específico" {...register('requisitoLegal')} />
              {requisito && <Campo id="rg-ref" etiqueta="Referencia legal" placeholder="Ej.: Ley 769 de 2002, art. 82" {...register('referenciaLegal')} />}
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Riesgo residual (con las medidas propuestas)">
          <p className="-mt-2 text-sm text-gris">Opcional. Estima el nivel que tendría el riesgo después de implementar las medidas de intervención.</p>
          <div className="grid gap-4 sm:grid-cols-4">
            <CamposEvaluacion prefijo="residual" metodologia={usar} register={register} opcional />
            <ResultadoEvaluacion e={evalResidual} />
          </div>
          {errors.residual && <p className="text-[13px] font-medium text-alerta">{errors.residual.message ?? 'Completa la evaluación residual o déjala vacía'}</p>}
        </Seccion>

        <Seccion titulo="Seguimiento">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="rg-resp" etiqueta="Responsable" {...register('responsable')} />
            <Selector id="rg-estado" etiqueta="Estado" {...register('estado')}>
              {Object.entries(ESTADO_RIESGO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </Selector>
          </div>
        </Seccion>

        <Aviso error={guardar.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={guardar.isPending}>Guardar riesgo</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

function ResultadoEvaluacion({ e }: { e: EvaluacionRiesgo | null }) {
  return (
    <div className="flex flex-col items-start justify-end gap-1 pb-1" aria-live="polite">
      {e ? (
        <>
          <NivelRiesgo e={e} />
          <span className="text-[12px] text-gris">{e.detalle}</span>
          <span className="text-[12px] font-semibold" style={{ color: e.color }}>{e.aceptabilidad}</span>
        </>
      ) : (
        <span className="text-sm text-gris">Completa la evaluación</span>
      )}
    </div>
  );
}
