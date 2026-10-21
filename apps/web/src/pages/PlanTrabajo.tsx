import { zodResolver } from '@hookform/resolvers/zod';
import {
  actividadTrabajoSchema,
  ESTADOS_ACTIVIDAD,
  FASES_PHVA,
  MESES,
  MESES_LARGOS,
  ORIGENES_ACTIVIDAD,
  PASOS_PESV,
  type ActividadTrabajoInput,
  type EstadoActividad,
  type FasePhva,
  type OrigenActividad,
} from '@pesv/shared';
import { Fragment, useState, type FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { Avance, GraficaBarras } from '../components/graficas';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Casilla, Cifra, Encabezado, Insignia, Pagina, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fecha, td, th } from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';

interface Seguimiento {
  mes: number;
  ejecutado: boolean;
  fecha: string | null;
  nota: string | null;
  evidenciaId: string | null;
}

interface Actividad {
  id: string;
  anio: number;
  titulo: string;
  descripcion: string | null;
  pasoNumero: number | null;
  metaId: string | null;
  meta: { objetivo: string; indicador: string } | null;
  fase: FasePhva;
  responsable: string;
  recursos: string | null;
  entregable: string | null;
  presupuesto: number | null;
  presupuestoEjecutado: number | null;
  meses: number[];
  estado: EstadoActividad;
  ejecutadaEl: string | null;
  origen: OrigenActividad;
  origenId: string | null;
  avance: number;
  atrasados: number[];
  seguimiento: Seguimiento[];
}

interface Plan {
  anio: number;
  corte: number;
  metas: { id: string; objetivo: string; indicador: string }[];
  actividades: Actividad[];
  resumen: {
    programados: number;
    ejecutados: number;
    programadosALaFecha: number;
    ejecutadosALaFecha: number;
    cumplimiento: number | null;
    ejecucion: number | null;
    porMes: { programados: number; ejecutados: number }[];
    actividades: number;
    ejecutadas: number;
    atrasadas: number;
    canceladas: number;
    presupuesto: number;
    presupuestoEjecutado: number;
    porFase: { fase: FasePhva; actividades: number; cumplimiento: number | null; ejecucion: number | null }[];
  };
}

const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? '—';
const pesos = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
const enlaceBoton = 'inline-flex min-h-10 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea';
const RUTA_ORIGEN: Partial<Record<OrigenActividad, string>> = { riesgo: '/matriz-riesgos', hallazgo: '/acciones', capacitacion: '/capacitacion' };

/** Cómo se ve un mes del cronograma: letra + color (nunca solo color). */
const MES_ESTADO = {
  programado: { letra: 'P', clase: 'bg-[#dce8f7] text-[#1c4f8f]', texto: 'Programado' },
  ejecutado: { letra: 'E', clase: 'bg-[#cdebd9] text-[#1f6b43]', texto: 'Ejecutado' },
  atrasado: { letra: '!', clase: 'bg-[#f8c9c4] text-[#9e2a1c]', texto: 'Vencido sin seguimiento' },
  noEjecutado: { letra: 'NE', clase: 'bg-[#fde2c3] text-[#8a4a00]', texto: 'No ejecutado' },
} as const;

function estadoMes(a: Actividad, mes: number): keyof typeof MES_ESTADO | null {
  if (!a.meses.includes(mes)) return null;
  const s = a.seguimiento.find((x) => x.mes === mes);
  if (s?.ejecutado) return 'ejecutado';
  if (a.atrasados.includes(mes)) return s ? 'noEjecutado' : 'atrasado';
  return 'programado';
}

const TONO_ESTADO = { planeada: 'neutro', en_curso: 'info', ejecutada: 'exito', cancelada: 'neutro' } as const;

export function PlanTrabajo() {
  const { puede } = useSesion();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const plan = useConsulta<Plan>(['plan-trabajo', anio], `/org/plan-trabajo?anio=${anio}`, { placeholderData: (previo) => previo });
  const [editando, setEditando] = useState<Actividad | 'nueva' | null>(null);
  const [celda, setCelda] = useState<{ actividad: Actividad; mes: number } | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<{ texto: string; fase: string; estado: string }>({ texto: '', fase: '', estado: '' });
  const evidencia = useAccion(() => api.post(`/org/plan-trabajo/evidencia?anio=${anio}`));
  const gestiona = puede('gestionar_pesv');

  const datos = plan.data;
  const visibles = (datos?.actividades ?? []).filter(
    (a) =>
      (!filtro.texto || `${a.titulo} ${a.responsable} ${a.descripcion ?? ''}`.toLowerCase().includes(filtro.texto.toLowerCase())) &&
      (!filtro.fase || a.fase === filtro.fase) &&
      (!filtro.estado || (filtro.estado === 'atrasada' ? a.atrasados.length > 0 : a.estado === filtro.estado)),
  );
  const actual = new Date().getFullYear();

  return (
    <Pagina ancho="max-w-7xl">
      <Encabezado
        titulo="Plan anual de trabajo"
        descripcion="Paso 9 · Actividades del PESV programadas mes a mes, con responsable, recursos y presupuesto. El seguimiento mensual calcula el cumplimiento y los soportes quedan como evidencia del paso de cada actividad."
        acciones={
          <div className="flex flex-wrap items-end gap-2">
            <Selector id="pt-anio" etiqueta="Año" className="w-28" value={anio} onChange={(e) => { setAnio(Number(e.target.value)); setCelda(null); setEditando(null); }}>
              {[actual + 1, actual, actual - 1, actual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
            </Selector>
            <a href={urlApi(`/org/plan-trabajo/exportar?anio=${anio}`)} className={enlaceBoton}>PDF</a>
            <a href={urlApi(`/org/plan-trabajo/exportar?anio=${anio}&formato=xlsx`)} className={enlaceBoton}>Excel</a>
            {gestiona && !!datos?.actividades.length && <Boton variante="secundario" cargando={evidencia.isPending} onClick={() => evidencia.mutate(undefined)}>Evidencia del paso 9</Boton>}
          </div>
        }
      />
      {evidencia.isSuccess && <Aviso tono="exito">El plan quedó como evidencia del paso 9, pendiente de aprobación. <Link to="/pasos/9" className="font-semibold underline">Ver el paso 9</Link></Aviso>}
      <Aviso error={evidencia.error ?? plan.error} />

      {!datos ? <Cargando /> : (
        <div className={plan.isFetching && plan.isPlaceholderData ? 'flex flex-col gap-6 opacity-60' : 'flex flex-col gap-6'}>
          <Resumen plan={datos} />

          {datos.resumen.programados > 0 && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Tarjeta className="lg:col-span-2">
                <GraficaBarras
                  titulo="Programado y ejecutado por mes"
                  descripcion="Meses-actividad: una actividad programada en tres meses cuenta tres veces."
                  categorias={[...MESES]}
                  series={[
                    { nombre: 'Programadas', valores: datos.resumen.porMes.map((m) => m.programados) },
                    { nombre: 'Ejecutadas', valores: datos.resumen.porMes.map((m) => m.ejecutados) },
                  ]}
                  enteros
                  formato={(v) => String(Math.round(v))}
                />
              </Tarjeta>
              <Tarjeta>
                <p className="font-bold text-noche">Cumplimiento por fase del ciclo PHVA</p>
                <p className="-mt-2 text-[13px] text-gris">A la fecha de corte ({MESES_LARGOS[Math.max(datos.corte, 1) - 1]}).</p>
                {datos.resumen.porFase.map((f) => (
                  <Avance
                    key={f.fase}
                    etiqueta={nombreDe(FASES_PHVA, f.fase)}
                    valor={f.cumplimiento}
                    detalle={f.actividades ? `${f.actividades} ${f.actividades === 1 ? 'actividad' : 'actividades'} · ejecución del año ${f.ejecucion ?? 0} %` : 'Sin actividades'}
                  />
                ))}
              </Tarjeta>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            {gestiona && !editando && <Boton onClick={() => { setEditando('nueva'); setCelda(null); }}>Programar actividad</Boton>}
            {datos.actividades.length > 0 && (
              <>
                <Campo id="pt-buscar" etiqueta="Buscar" className="w-56" placeholder="Actividad o responsable" value={filtro.texto} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} />
                <Selector id="pt-fase" etiqueta="Fase" className="w-36" value={filtro.fase} onChange={(e) => setFiltro({ ...filtro, fase: e.target.value })}>
                  <option value="">Todas</option>
                  {FASES_PHVA.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </Selector>
                <Selector id="pt-estado" etiqueta="Estado" className="w-44" value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value })}>
                  <option value="">Todos</option>
                  <option value="atrasada">Con meses vencidos</option>
                  {ESTADOS_ACTIVIDAD.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </Selector>
              </>
            )}
          </div>

          {editando && <FormularioActividad key={editando === 'nueva' ? 'nueva' : editando.id} actividad={editando === 'nueva' ? undefined : editando} anio={anio} metas={datos.metas} alTerminar={() => setEditando(null)} />}
          {celda && <PanelSeguimiento key={`${celda.actividad.id}-${celda.mes}`} actividad={celda.actividad} mes={celda.mes} alTerminar={() => setCelda(null)} />}

          {datos.actividades.length === 0 ? (
            <Vacio titulo={`Aún no hay actividades para ${anio}`}>
              Programa las actividades del año por mes. Las medidas de la matriz de riesgos también llegan aquí cuando las envías al plan.
            </Vacio>
          ) : (
            <>
              <Leyenda />
              <Tabla minimo="60rem">
                <thead>
                  <tr>
                    <th className={th}>Actividad</th>
                    <th className={th}>Responsable</th>
                    {MESES.map((m, i) => (
                      <th key={m} className={`${th} w-10 px-0 text-center ${datos.corte === i + 1 && anio === actual ? 'text-noche' : ''}`}>{m}</th>
                    ))}
                    <th className={`${th} text-right`}>Avance</th>
                    <th className={th}><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((a) => (
                    <Fragment key={a.id}>
                      <tr className={a.estado === 'cancelada' ? 'opacity-60' : undefined}>
                        <td className={td}>
                          <strong className="text-noche">{a.titulo}</strong>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-gris">
                            {a.pasoNumero && <span>Paso {a.pasoNumero}</span>}
                            <span>· {nombreDe(FASES_PHVA, a.fase)}</span>
                            {a.origen !== 'manual' && <Insignia tono="info">{nombreDe(ORIGENES_ACTIVIDAD, a.origen)}</Insignia>}
                            {a.estado !== 'planeada' && <Insignia tono={TONO_ESTADO[a.estado]}>{nombreDe(ESTADOS_ACTIVIDAD, a.estado)}</Insignia>}
                          </span>
                        </td>
                        <td className={td}>{a.responsable}</td>
                        {MESES.map((m, i) => {
                          const e = estadoMes(a, i + 1);
                          const elegida = celda?.actividad.id === a.id && celda.mes === i + 1;
                          return (
                            <td key={m} className="border-t border-linea px-0.5 py-3 text-center align-top">
                              {e ? (
                                <button
                                  type="button"
                                  disabled={!gestiona || a.estado === 'cancelada' || a.origen === 'capacitacion'}
                                  aria-label={`${a.titulo}, ${MESES_LARGOS[i]}: ${MES_ESTADO[e].texto}${gestiona ? '. Registrar seguimiento' : ''}`}
                                  title={MES_ESTADO[e].texto}
                                  onClick={() => { setCelda({ actividad: a, mes: i + 1 }); setEditando(null); }}
                                  className={`h-8 w-8 rounded-md text-[12px] font-bold ${MES_ESTADO[e].clase} enabled:hover:ring-2 enabled:hover:ring-noche/40 ${elegida ? 'ring-2 ring-noche' : ''}`}
                                >
                                  {MES_ESTADO[e].letra}
                                </button>
                              ) : null}
                            </td>
                          );
                        })}
                        <td className={`${td} text-right tabular-nums`}><strong>{a.estado === 'cancelada' ? '—' : `${a.avance} %`}</strong></td>
                        <td className={td}>
                          <div className="flex gap-1">
                            <Boton variante="texto" aria-expanded={abierta === a.id} onClick={() => setAbierta(abierta === a.id ? null : a.id)}>{abierta === a.id ? 'Cerrar' : 'Ver'}</Boton>
                            {gestiona && <Boton variante="texto" onClick={() => { setEditando(a); setCelda(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</Boton>}
                          </div>
                        </td>
                      </tr>
                      {abierta === a.id && (
                        <tr>
                          <td colSpan={16} className="border-t border-linea bg-papel/40 px-4 py-4">
                            <DetalleActividad a={a} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </Tabla>
              {visibles.length === 0 && <p className="text-sm text-gris">Ninguna actividad coincide con el filtro.</p>}
            </>
          )}
        </div>
      )}
    </Pagina>
  );
}

function Resumen({ plan }: { plan: Plan }) {
  const r = plan.resumen;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Cifra
        etiqueta="Cumplimiento a la fecha"
        valor={r.cumplimiento == null ? '—' : `${r.cumplimiento} %`}
        barra={r.cumplimiento ?? undefined}
        detalle={r.programadosALaFecha ? `${r.ejecutadosALaFecha} de ${r.programadosALaFecha} programadas hasta ${MESES_LARGOS[Math.max(plan.corte, 1) - 1]}` : 'Aún no vence ningún mes programado'}
      />
      <Cifra etiqueta="Ejecución del año" valor={r.ejecucion == null ? '—' : `${r.ejecucion} %`} barra={r.ejecucion ?? undefined} detalle={`${r.ejecutadas} de ${r.actividades} actividades terminadas`} />
      <Cifra
        etiqueta="Actividades con meses vencidos"
        valor={r.atrasadas}
        detalle={r.atrasadas ? 'Registra su seguimiento o justifica por qué no se ejecutaron' : 'Todo al día'}
      />
      <Cifra
        etiqueta="Presupuesto ejecutado"
        valor={r.presupuesto ? `${Math.round((r.presupuestoEjecutado / r.presupuesto) * 100)} %` : '—'}
        barra={r.presupuesto ? (r.presupuestoEjecutado / r.presupuesto) * 100 : undefined}
        detalle={r.presupuesto ? `${pesos(r.presupuestoEjecutado)} de ${pesos(r.presupuesto)}` : 'Sin presupuesto asignado'}
      />
    </div>
  );
}

function Leyenda() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-gris" aria-label="Convenciones del cronograma">
      {Object.values(MES_ESTADO).map((e) => (
        <li key={e.letra} className="flex items-center gap-1.5">
          <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-bold ${e.clase}`}>{e.letra}</span>
          {e.texto}
        </li>
      ))}
    </ul>
  );
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-gris">{titulo}</p>
      <div className="text-sm text-tinta">{children || <span className="text-gris">—</span>}</div>
    </div>
  );
}

function DetalleActividad({ a }: { a: Actividad }) {
  const ruta = RUTA_ORIGEN[a.origen];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato titulo="Descripción">{a.descripcion}</Dato>
        <Dato titulo="Objetivo y meta (paso 7)">{a.meta ? <>{a.meta.objetivo}<span className="block text-gris">{a.meta.indicador}</span></> : null}</Dato>
        <Dato titulo="Recursos">{a.recursos}</Dato>
        <Dato titulo="Entregable o evidencia esperada">{a.entregable}</Dato>
        <Dato titulo="Presupuesto">{a.presupuesto != null ? pesos(a.presupuesto) : null}</Dato>
        <Dato titulo="Presupuesto ejecutado">{a.presupuestoEjecutado != null ? pesos(a.presupuestoEjecutado) : null}</Dato>
        <Dato titulo="Origen">{a.origen === 'manual' ? 'Programada en el plan' : ruta ? <Link to={ruta} className="font-semibold text-[#1d4e89] underline">{nombreDe(ORIGENES_ACTIVIDAD, a.origen)}</Link> : nombreDe(ORIGENES_ACTIVIDAD, a.origen)}</Dato>
        <Dato titulo="Terminada el">{a.ejecutadaEl ? fecha(a.ejecutadaEl) : null}</Dato>
      </div>
      <div>
        <p className="mb-2 font-bold text-noche">Seguimiento</p>
        {a.seguimiento.length === 0 ? (
          <p className="text-sm text-gris">Sin registros. Elige un mes del cronograma para registrar el seguimiento.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-linea rounded-xl bg-white ring-1 ring-linea">
            {a.seguimiento.map((s) => (
              <li key={s.mes} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                <span className="w-24 font-semibold capitalize text-noche">{MESES_LARGOS[s.mes - 1]}</span>
                <Insignia tono={s.ejecutado ? 'exito' : 'aviso'}>{s.ejecutado ? `Ejecutada ${s.fecha ? fecha(s.fecha) : ''}` : 'No ejecutada'}</Insignia>
                <span className="min-w-0 flex-1 text-gris">{s.nota}</span>
                {s.evidenciaId && a.pasoNumero && <Link to={`/pasos/${a.pasoNumero}`} className="font-semibold text-[#1d4e89] underline">Evidencia en el paso {a.pasoNumero}</Link>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Seguimiento de un mes -----------------------------------------------------------

function PanelSeguimiento({ actividad: a, mes, alTerminar }: { actividad: Actividad; mes: number; alTerminar: () => void }) {
  const previo = a.seguimiento.find((s) => s.mes === mes);
  const [ejecutado, setEjecutado] = useState(previo ? previo.ejecutado : true);
  const [fechaEj, setFechaEj] = useState(previo?.fecha ?? '');
  const [nota, setNota] = useState(previo?.nota ?? '');
  const [archivo, setArchivo] = useState<File | null>(null);
  const guardar = useAccion(() => {
    const datos = new FormData();
    datos.set('mes', String(mes));
    datos.set('ejecutado', String(ejecutado));
    if (ejecutado && fechaEj) datos.set('fecha', fechaEj);
    if (nota.trim()) datos.set('nota', nota.trim());
    if (archivo) datos.set('archivo', archivo);
    return api.post(`/org/plan-trabajo/${a.id}/seguimiento`, datos);
  }, { alTerminar });
  const quitar = useAccion(() => api.delete(`/org/plan-trabajo/${a.id}/seguimiento/${mes}`), { alTerminar });
  const hoy = new Date().toISOString().slice(0, 10);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    guardar.mutate(undefined);
  };

  return (
    <Tarjeta>
      <Subtitulo acciones={<Boton variante="texto" onClick={alTerminar}>Cerrar</Boton>}>
        Seguimiento de {MESES_LARGOS[mes - 1]} · {a.titulo}
      </Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={enviar}>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 text-sm font-semibold">¿Se ejecutó?</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="ejecutado" checked={ejecutado} onChange={() => setEjecutado(true)} className="size-4 accent-noche" /> Sí, se ejecutó</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="ejecutado" checked={!ejecutado} onChange={() => setEjecutado(false)} className="size-4 accent-noche" /> No se ejecutó</label>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          {ejecutado && <Campo id="sg-fecha" etiqueta="Fecha de ejecución" type="date" max={hoy} value={fechaEj} onChange={(e) => setFechaEj(e.target.value)} />}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sg-archivo" className="text-sm font-semibold">Soporte (opcional)</label>
            <input id="sg-archivo" type="file" disabled={!a.pasoNumero} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-papel file:px-3 file:py-2 file:font-semibold" />
            <p className="text-[13px] text-gris">{a.pasoNumero ? `Queda como evidencia del paso ${a.pasoNumero}, pendiente de aprobación.` : 'Asigna un paso a la actividad para adjuntar soportes.'}</p>
          </div>
        </div>
        <AreaTexto id="sg-nota" etiqueta={ejecutado ? 'Observaciones' : 'Justificación (obligatoria)'} value={nota} onChange={(e) => setNota(e.target.value)} placeholder={ejecutado ? 'Ej.: participaron 25 conductores' : 'Ej.: se reprogramó por falta del proveedor'} />
        <Aviso error={guardar.error ?? quitar.error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={guardar.isPending}>Guardar seguimiento</Boton>
          {previo && <Boton variante="secundario" cargando={quitar.isPending} onClick={() => quitar.mutate(undefined)}>Quitar registro</Boton>}
        </div>
      </form>
    </Tarjeta>
  );
}

// Formulario de la actividad ---------------------------------------------------------

function FormularioActividad({ actividad, anio, metas, alTerminar }: { actividad?: Actividad; anio: number; metas: Plan['metas']; alTerminar: () => void }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<z.input<typeof actividadTrabajoSchema>, unknown, ActividadTrabajoInput>({
    resolver: zodResolver(actividadTrabajoSchema),
    defaultValues: actividad
      ? {
          anio: actividad.anio,
          titulo: actividad.titulo,
          descripcion: actividad.descripcion ?? '',
          pasoNumero: actividad.pasoNumero,
          metaId: actividad.metaId,
          fase: actividad.fase,
          responsable: actividad.responsable,
          recursos: actividad.recursos ?? '',
          entregable: actividad.entregable ?? '',
          presupuesto: actividad.presupuesto,
          presupuestoEjecutado: actividad.presupuestoEjecutado,
          meses: actividad.meses,
          cancelada: actividad.estado === 'cancelada',
        }
      : { anio, fase: 'hacer', meses: [], cancelada: false, pasoNumero: null, metaId: null },
  });
  const guardar = useAccion((d: ActividadTrabajoInput) => (actividad ? api.put(`/org/plan-trabajo/${actividad.id}`, d) : api.post('/org/plan-trabajo', d)), { alTerminar });
  const eliminar = useAccion(() => api.delete(`/org/plan-trabajo/${actividad!.id}`), { alTerminar });
  const numero = (v: unknown) => (v === '' || v == null ? null : Number(v));

  return (
    <Tarjeta>
      <Subtitulo>{actividad ? 'Editar actividad' : `Programar actividad ${anio}`}</Subtitulo>
      {actividad && actividad.origen !== 'manual' && (
        <Aviso tono="info">
          Esta actividad viene de: {nombreDe(ORIGENES_ACTIVIDAD, actividad.origen)}.{' '}
          {actividad.origen === 'capacitacion' ? 'La fecha, la cancelación y la ejecución se manejan en el plan de formación; aquí puedes completar la meta, los recursos y el presupuesto.' : 'Su avance se refleja allá.'}
        </Aviso>
      )}
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <input type="hidden" {...register('anio', { valueAsNumber: true })} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="ac-titulo" etiqueta="Actividad" className="sm:col-span-2" placeholder="Ej.: Simulacro de respuesta a siniestros viales" error={errors.titulo?.message} {...register('titulo')} />
          <Campo id="ac-resp" etiqueta="Responsable" error={errors.responsable?.message} {...register('responsable')} />
        </div>
        <AreaTexto id="ac-desc" etiqueta="Descripción y alcance" {...register('descripcion')} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Selector id="ac-paso" etiqueta="Paso del PESV" {...register('pasoNumero', { setValueAs: numero })}>
            <option value="">Sin paso</option>
            {PASOS_PESV.map((p) => <option key={p.numero} value={p.numero}>{p.numero}. {p.nombre}</option>)}
          </Selector>
          <Selector id="ac-fase" etiqueta="Fase PHVA" {...register('fase')}>
            {FASES_PHVA.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </Selector>
          <Selector id="ac-meta" etiqueta="Objetivo / meta (paso 7)" ayuda={metas.length ? undefined : <>No hay metas para {anio}. <Link to="/planificacion" className="underline">Crearlas</Link></>} {...register('metaId', { setValueAs: (v) => v || null })}>
            <option value="">Sin meta asociada</option>
            {metas.map((m) => <option key={m.id} value={m.id}>{m.objetivo} — {m.indicador}</option>)}
          </Selector>
        </div>
        <Controller
          control={control}
          name="meses"
          render={({ field }) => {
            const valor = (field.value ?? []) as number[];
            const alternar = (m: number) => field.onChange(valor.includes(m) ? valor.filter((x) => x !== m) : [...valor, m]);
            return (
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold">Meses en que se ejecuta</legend>
                <div className="flex flex-wrap gap-1.5">
                  {MESES.map((m, i) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={valor.includes(i + 1)}
                      onClick={() => alternar(i + 1)}
                      className="h-10 w-14 rounded-lg text-sm font-semibold ring-1 ring-[#d5dae1] aria-pressed:bg-noche aria-pressed:text-white aria-pressed:ring-noche"
                    >
                      {m}
                    </button>
                  ))}
                  <Boton variante="texto" onClick={() => field.onChange([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])}>Todo el año</Boton>
                  <Boton variante="texto" onClick={() => field.onChange([3, 6, 9, 12])}>Trimestral</Boton>
                </div>
                {errors.meses && <p className="mt-1 text-[13px] font-medium text-alerta">{errors.meses.message}</p>}
              </fieldset>
            );
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="ac-rec" etiqueta="Recursos" placeholder="Humanos, técnicos, físicos" {...register('recursos')} />
          <Campo id="ac-ent" etiqueta="Entregable o evidencia esperada" placeholder="Ej.: informe del simulacro y lista de asistencia" {...register('entregable')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="ac-ppto" etiqueta="Presupuesto (COP)" type="number" min={0} {...register('presupuesto', { setValueAs: numero })} />
          <Campo id="ac-ejec" etiqueta="Presupuesto ejecutado (COP)" type="number" min={0} {...register('presupuestoEjecutado', { setValueAs: numero })} />
        </div>
        {actividad && <Casilla etiqueta="Actividad cancelada" descripcion="No cuenta en el cumplimiento del plan." {...register('cancelada')} />}
        <Aviso error={guardar.error ?? eliminar.error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={guardar.isPending}>Guardar actividad</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
          {actividad && (
            <Boton variante="peligro" className="ml-auto" cargando={eliminar.isPending} onClick={() => window.confirm(`¿Eliminar «${actividad.titulo}» y su seguimiento?`) && eliminar.mutate(undefined)}>
              Eliminar
            </Boton>
          )}
        </div>
      </form>
    </Tarjeta>
  );
}
