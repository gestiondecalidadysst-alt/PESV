import { zodResolver } from '@hookform/resolvers/zod';
import {
  capacitacionPlanSchema,
  FACILITADORES,
  MESES,
  METODOS_EVALUACION,
  MODALIDADES_FORMACION,
  PUBLICOS_FORMACION,
  TEMAS_FORMACION,
  TIPOS_FORMACION,
  type CapacitacionPlanInput,
  type IndicadoresFormacion,
} from '@pesv/shared';
import { Fragment, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { Avance, GraficaBarras } from '../components/graficas';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Casilla, Cifra, Encabezado, Insignia, Pagina, Pestanas, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fecha, td, th } from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { Conductor } from '../lib/tipos';

interface Asistente {
  id?: string;
  conductorId: string | null;
  nombre: string;
  documento: string;
  cargo: string | null;
  asistio: boolean;
  nota: number | null;
  aprobo?: boolean | null;
}

interface Capacitacion {
  id: string;
  anio: number;
  titulo: string;
  tipo: CapacitacionPlanInput['tipo'];
  temaId: CapacitacionPlanInput['temaId'];
  tema: string;
  objetivo: string | null;
  publico: CapacitacionPlanInput['publico'];
  modalidad: CapacitacionPlanInput['modalidad'];
  programadaEl: string;
  ejecutadaEl: string | null;
  horas: number | null;
  facilitador: string | null;
  tipoFacilitador: CapacitacionPlanInput['tipoFacilitador'];
  lugar: string | null;
  evaluacion: CapacitacionPlanInput['evaluacion'];
  notaMinima: number;
  estado: 'programada' | 'ejecutada' | 'cancelada';
  riesgoId: string | null;
  riesgo: string | null;
  actividadPlanId: string | null;
  eficacia: { efectiva: boolean; fecha: string; nota: string } | null;
  vencida: boolean;
  resultado: { convocados: number; asistentes: number; evaluados: number; aprobados: number; promedio: number | null };
  asistentes: Asistente[];
}

interface Formacion {
  anio: number;
  capacitaciones: Capacitacion[];
  indicadores: IndicadoresFormacion;
  porTema: { tema: string; programadas: number; ejecutadas: number }[];
  pendientesEficacia: number;
  riesgos: { id: string; peligro: string }[];
}

interface HistorialConductor {
  id: string;
  nombre: string;
  documento: string;
  rol: string;
  capacitacionesAnio: number;
  horasAnio: number;
  temasAnio: string[];
  ultima: string | null;
  historial: { capacitacionId: string; titulo: string; temaId: string; fecha: string; horas: number | null; nota: number | null; aprobo: boolean | null }[];
}

const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? id ?? '—';
const enlaceBoton = 'inline-flex min-h-10 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea';
const porcentaje = (v: number | null) => (v == null ? '—' : `${v} %`);

export function Capacitacion() {
  const { puede } = useSesion();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [pestana, setPestana] = useState<'programa' | 'conductores'>('programa');
  const datos = useConsulta<Formacion>(['capacitacion', anio], `/org/capacitacion?anio=${anio}`, { placeholderData: (p) => p });
  const evidencia = useAccion(() => api.post(`/org/capacitacion/evidencia?anio=${anio}`));
  const actual = new Date().getFullYear();
  const gestiona = puede('gestionar_pesv');

  return (
    <Pagina ancho="max-w-7xl">
      <Encabezado
        titulo="Plan anual de formación"
        descripcion="Paso 10 · Capacitaciones en seguridad vial por tema y público, con convocatoria, asistencia, evaluación y verificación de la eficacia. Cada capacitación entra al plan de trabajo y su lista de asistencia es evidencia del paso."
        acciones={
          <div className="flex flex-wrap items-end gap-2">
            <Selector id="cp-anio" etiqueta="Año" className="w-28" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
              {[actual + 1, actual, actual - 1, actual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
            </Selector>
            <a href={urlApi(`/org/capacitacion/exportar?anio=${anio}`)} className={enlaceBoton}>PDF</a>
            <a href={urlApi(`/org/capacitacion/exportar?anio=${anio}&formato=xlsx`)} className={enlaceBoton}>Excel</a>
            {gestiona && !!datos.data?.capacitaciones.length && <Boton variante="secundario" cargando={evidencia.isPending} onClick={() => evidencia.mutate(undefined)}>Evidencia del paso 10</Boton>}
          </div>
        }
      />
      {evidencia.isSuccess && <Aviso tono="exito">El programa quedó como evidencia del paso 10, pendiente de aprobación. <Link to="/pasos/10" className="font-semibold underline">Ver el paso 10</Link></Aviso>}
      <Aviso error={evidencia.error ?? datos.error} />
      <Pestanas valor={pestana} alCambiar={setPestana} opciones={[{ id: 'programa', nombre: 'Programa' }, { id: 'conductores', nombre: 'Formación por conductor' }]} />
      {!datos.data ? <Cargando /> : pestana === 'programa' ? <Programa datos={datos.data} gestiona={gestiona} /> : <PorConductor anio={anio} />}
    </Pagina>
  );
}

// Programa ----------------------------------------------------------------------------

function Programa({ datos, gestiona }: { datos: Formacion; gestiona: boolean }) {
  const [editando, setEditando] = useState<Capacitacion | 'nueva' | null>(null);
  const i = datos.indicadores;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra etiqueta="Cumplimiento a la fecha" valor={porcentaje(i.cumplimiento)} barra={i.cumplimiento ?? undefined} detalle={i.programadasALaFecha ? `${i.ejecutadasALaFecha} de ${i.programadasALaFecha} con fecha vencida` : 'Ninguna capacitación vencida aún'} />
        <Cifra etiqueta="Cobertura de conductores" valor={porcentaje(i.cobertura)} barra={i.cobertura ?? undefined} detalle={`${i.conductoresFormados} de ${i.conductoresActivos} conductores activos formados en el año`} />
        <Cifra etiqueta="Eficacia (aprobación)" valor={porcentaje(i.eficacia)} barra={i.eficacia ?? undefined} detalle={i.evaluados ? `${i.aprobados} de ${i.evaluados} evaluados aprobaron` : 'Sin evaluaciones calificadas'} />
        <Cifra etiqueta="Horas-persona" valor={new Intl.NumberFormat('es-CO').format(i.horasPersona)} detalle={i.convocados ? `Asistencia ${porcentaje(i.asistencia)} (${i.asistentes} de ${i.convocados} convocados)` : 'Sin capacitaciones ejecutadas'} />
      </div>

      {datos.pendientesEficacia > 0 && (
        <Aviso tono="info">{datos.pendientesEficacia === 1 ? 'Una capacitación ejecutada está' : `${datos.pendientesEficacia} capacitaciones ejecutadas están`} pendiente de verificar su eficacia (por ejemplo, observando el comportamiento en la vía semanas después).</Aviso>
      )}

      {i.programadas > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Tarjeta className="lg:col-span-2">
            <GraficaBarras
              titulo="Capacitaciones programadas y ejecutadas por mes"
              categorias={[...MESES]}
              series={[
                { nombre: 'Programadas', valores: i.porMes.map((m) => m.programadas) },
                { nombre: 'Ejecutadas', valores: i.porMes.map((m) => m.ejecutadas) },
              ]}
              enteros
                  formato={(v) => String(Math.round(v))}
            />
          </Tarjeta>
          <Tarjeta>
            <p className="font-bold text-noche">Avance por tema</p>
            {datos.porTema.map((t) => (
              <Avance key={t.tema} etiqueta={nombreDe(TEMAS_FORMACION, t.tema)} valor={(t.ejecutadas / t.programadas) * 100} detalle={`${t.ejecutadas} de ${t.programadas} ejecutadas`} />
            ))}
          </Tarjeta>
        </div>
      )}

      {gestiona && !editando && <Boton className="self-start" onClick={() => setEditando('nueva')}>Programar capacitación</Boton>}
      {editando && (
        <FormularioCapacitacion key={editando === 'nueva' ? 'nueva' : editando.id} capacitacion={editando === 'nueva' ? undefined : editando} anio={datos.anio} riesgos={datos.riesgos} alTerminar={() => setEditando(null)} />
      )}

      {datos.capacitaciones.length === 0 ? (
        <Vacio titulo={`Aún no hay capacitaciones para ${datos.anio}`}>
          Programa las capacitaciones del año según los riesgos de la matriz y los actores viales de tu organización. Cada una llega al plan de trabajo.
        </Vacio>
      ) : (
        <div className="flex flex-col gap-3">
          {datos.capacitaciones.map((c) => (
            <TarjetaCapacitacion key={c.id} c={c} gestiona={gestiona} alEditar={() => { setEditando(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          ))}
        </div>
      )}
    </>
  );
}

function TarjetaCapacitacion({ c, gestiona, alEditar }: { c: Capacitacion; gestiona: boolean; alEditar: () => void }) {
  const [panel, setPanel] = useState<'asistencia' | 'ejecutar' | 'eficacia' | null>(null);
  const evidencia = useAccion(() => api.post(`/org/capacitacion/${c.id}/evidencia`));
  const calificable = METODOS_EVALUACION.find((m) => m.id === c.evaluacion)?.calificable ?? false;
  const estado =
    c.estado === 'ejecutada' ? <Insignia tono="exito">Ejecutada {fecha(c.ejecutadaEl)}</Insignia> : c.estado === 'cancelada' ? <Insignia>Cancelada</Insignia> : c.vencida ? <Insignia tono="peligro">Vencida sin ejecutar</Insignia> : <Insignia tono="aviso">Programada</Insignia>;
  return (
    <Tarjeta className={c.estado === 'cancelada' ? 'opacity-70' : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-noche">{c.titulo}</p>
          <p className="text-sm text-gris">
            {nombreDe(TIPOS_FORMACION, c.tipo)} · {nombreDe(TEMAS_FORMACION, c.temaId)}
            {c.tema && c.tema !== nombreDe(TEMAS_FORMACION, c.temaId) ? ` · ${c.tema}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{estado}{c.actividadPlanId && <Insignia tono="info">En el plan de trabajo</Insignia>}</div>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Fecha</dt><dd>{fecha(c.programadaEl)}{c.horas ? ` · ${c.horas} h` : ''}</dd></div>
        <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Público</dt><dd>{c.publico.map((p) => nombreDe(PUBLICOS_FORMACION, p)).join(', ')}</dd></div>
        <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Modalidad</dt><dd>{nombreDe(MODALIDADES_FORMACION, c.modalidad)}{c.lugar ? ` · ${c.lugar}` : ''}</dd></div>
        <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Facilitador</dt><dd>{c.facilitador ?? '—'} ({nombreDe(FACILITADORES, c.tipoFacilitador)})</dd></div>
        {c.riesgo && <div className="sm:col-span-2"><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Riesgo que atiende</dt><dd><Link to="/matriz-riesgos" className="text-[#1d4e89] underline">{c.riesgo}</Link></dd></div>}
        <div className="sm:col-span-2">
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Resultado</dt>
          <dd>
            {c.resultado.convocados === 0 ? 'Sin convocados' : c.estado === 'ejecutada' ? `${c.resultado.asistentes} de ${c.resultado.convocados} asistieron` : `${c.resultado.convocados} convocados`}
            {calificable && c.resultado.evaluados > 0 && ` · ${c.resultado.aprobados} de ${c.resultado.evaluados} aprobaron (promedio ${c.resultado.promedio})`}
            {c.eficacia && <> · <strong className={c.eficacia.efectiva ? 'text-via' : 'text-alerta'}>{c.eficacia.efectiva ? 'Eficaz' : 'No eficaz'}</strong></>}
          </dd>
        </div>
      </dl>
      {c.eficacia && <p className="text-[13px] text-gris">Verificación de eficacia ({fecha(c.eficacia.fecha)}): {c.eficacia.nota}</p>}
      <div className="flex flex-wrap items-center gap-1 border-t border-linea pt-3">
        {gestiona && c.estado !== 'cancelada' && (
          <Boton variante="texto" aria-expanded={panel === 'asistencia'} onClick={() => setPanel(panel === 'asistencia' ? null : 'asistencia')}>{c.estado === 'ejecutada' ? 'Asistencia y notas' : 'Convocar y registrar asistencia'}</Boton>
        )}
        {gestiona && c.estado === 'programada' && <Boton variante="texto" onClick={() => setPanel(panel === 'ejecutar' ? null : 'ejecutar')}>Marcar como ejecutada</Boton>}
        {gestiona && c.estado === 'ejecutada' && <Boton variante="texto" onClick={() => setPanel(panel === 'eficacia' ? null : 'eficacia')}>{c.eficacia ? 'Actualizar eficacia' : 'Verificar eficacia'}</Boton>}
        <a href={urlApi(`/org/capacitacion/${c.id}/lista-asistencia`)} className="px-3 text-sm font-semibold text-[#1d4e89] underline-offset-2 hover:underline">{c.estado === 'ejecutada' ? 'Lista de asistencia (PDF)' : 'Lista para firmar (PDF)'}</a>
        {gestiona && c.estado === 'ejecutada' && <Boton variante="texto" cargando={evidencia.isPending} onClick={() => evidencia.mutate(undefined)}>Guardar lista como evidencia</Boton>}
        {gestiona && <Boton variante="texto" className="ml-auto" onClick={alEditar}>Editar</Boton>}
      </div>
      {evidencia.isSuccess && <Aviso tono="exito">La lista de asistencia quedó como evidencia del paso 10.</Aviso>}
      <Aviso error={evidencia.error} />
      {panel === 'asistencia' && <EditorAsistencia c={c} alTerminar={() => setPanel(null)} />}
      {panel === 'ejecutar' && <PanelEjecutar c={c} alTerminar={() => setPanel(null)} />}
      {panel === 'eficacia' && <PanelEficacia c={c} alTerminar={() => setPanel(null)} />}
    </Tarjeta>
  );
}

function EditorAsistencia({ c, alTerminar }: { c: Capacitacion; alTerminar: () => void }) {
  const conductores = useConsulta<Conductor[]>(['conductores'], '/org/conductores');
  const historial = useConsulta<HistorialConductor[]>(['capacitacion-conductores', c.anio], `/org/capacitacion/conductores?anio=${c.anio}`);
  const [lista, setLista] = useState<Asistente[]>(() => c.asistentes.map((a) => ({ ...a })));
  const [externo, setExterno] = useState({ nombre: '', documento: '', cargo: '' });
  const calificable = METODOS_EVALUACION.find((m) => m.id === c.evaluacion)?.calificable ?? false;
  const ejecutada = c.estado === 'ejecutada';
  const guardar = useAccion(
    () =>
      api.put(`/org/capacitacion/${c.id}/asistencia`, {
        asistentes: lista.map((a) => ({ conductorId: a.conductorId, nombre: a.nombre, documento: a.documento, cargo: a.cargo ?? undefined, asistio: a.asistio, nota: a.asistio ? a.nota : null })),
      }),
    { alTerminar },
  );
  const activos = (conductores.data ?? []).filter((d) => d.activo);
  const convocar = (ds: Conductor[]) => {
    const ya = new Set(lista.map((a) => a.documento));
    setLista([...lista, ...ds.filter((d) => !ya.has(d.documento)).map((d) => ({ conductorId: d.id, nombre: d.nombre, documento: d.documento, cargo: null, asistio: true, nota: null }))]);
  };
  const sinFormacion = activos.filter((d) => historial.data?.find((h) => h.id === d.id)?.capacitacionesAnio === 0);
  const cambiar = (i: number, cambio: Partial<Asistente>) => setLista(lista.map((a, k) => (k === i ? { ...a, ...cambio } : a)));
  const documentoValido = /^\d{5,12}$/.test(externo.documento);

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-papel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-semibold">{ejecutada ? 'Asistencia y resultados' : 'Convocados'} ({lista.length})</p>
        <Boton variante="secundario" disabled={!activos.length} onClick={() => convocar(activos)}>Convocar a todos los conductores activos</Boton>
        <Boton variante="secundario" disabled={!sinFormacion.length} onClick={() => convocar(sinFormacion)}>Convocar a quienes no se han formado ({sinFormacion.length})</Boton>
      </div>
      {conductores.isPending ? <Cargando /> : (
        <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-linea">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="text-[13px] text-gris">
                <th className="px-3 py-2 font-semibold">Persona</th>
                <th className="px-3 py-2 font-semibold">Cargo</th>
                <th className="px-3 py-2 font-semibold">Asistió</th>
                {calificable && <th className="px-3 py-2 font-semibold">Nota (0–100)</th>}
                <th className="px-3 py-2"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a, i) => (
                <tr key={a.documento} className="border-t border-linea">
                  <td className="px-3 py-2"><span className="font-semibold text-noche">{a.nombre}</span><span className="block text-[12px] text-gris">C.C. {a.documento}{a.conductorId ? '' : ' · externo'}</span></td>
                  <td className="px-3 py-2"><input aria-label={`Cargo de ${a.nombre}`} className="h-9 w-full rounded-md border border-[#d5dae1] px-2" value={a.cargo ?? ''} onChange={(e) => cambiar(i, { cargo: e.target.value || null })} /></td>
                  <td className="px-3 py-2"><input type="checkbox" aria-label={`${a.nombre} asistió`} className="size-5 accent-noche" checked={a.asistio} onChange={(e) => cambiar(i, { asistio: e.target.checked })} /></td>
                  {calificable && (
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        aria-label={`Nota de ${a.nombre}`}
                        disabled={!a.asistio}
                        className="h-9 w-20 rounded-md border border-[#d5dae1] px-2 disabled:bg-papel"
                        value={a.nota ?? ''}
                        onChange={(e) => cambiar(i, { nota: e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value))) })}
                      />
                      {a.asistio && a.nota != null && <span className={`ml-2 text-[12px] font-semibold ${a.nota >= c.notaMinima ? 'text-via' : 'text-alerta'}`}>{a.nota >= c.notaMinima ? 'Aprueba' : 'No aprueba'}</span>}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right"><Boton variante="texto" onClick={() => setLista(lista.filter((_, k) => k !== i))}>Quitar</Boton></td>
                </tr>
              ))}
              {lista.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-gris">Convoca conductores o agrega personas.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Selector id={`cv-${c.id}`} etiqueta="Agregar conductor" className="w-64" value="" onChange={(e) => { const d = activos.find((x) => x.id === e.target.value); if (d) convocar([d]); }}>
          <option value="">Elige…</option>
          {activos.filter((d) => !lista.some((a) => a.documento === d.documento)).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </Selector>
        <Campo id={`ex-n-${c.id}`} etiqueta="O una persona externa" className="w-56" placeholder="Nombre completo" value={externo.nombre} onChange={(e) => setExterno({ ...externo, nombre: e.target.value })} />
        <Campo id={`ex-d-${c.id}`} etiqueta="Cédula" className="w-36" inputMode="numeric" value={externo.documento} onChange={(e) => setExterno({ ...externo, documento: e.target.value.replace(/\D/g, '') })} />
        <Campo id={`ex-c-${c.id}`} etiqueta="Cargo" className="w-44" value={externo.cargo} onChange={(e) => setExterno({ ...externo, cargo: e.target.value })} />
        <Boton
          variante="secundario"
          disabled={externo.nombre.trim().length < 3 || !documentoValido || lista.some((a) => a.documento === externo.documento)}
          onClick={() => { setLista([...lista, { conductorId: null, nombre: externo.nombre.trim(), documento: externo.documento, cargo: externo.cargo || null, asistio: true, nota: null }]); setExterno({ nombre: '', documento: '', cargo: '' }); }}
        >
          Agregar
        </Boton>
      </div>
      <Aviso error={guardar.error} />
      <div className="flex gap-2">
        <Boton cargando={guardar.isPending} disabled={lista.length === 0} onClick={() => guardar.mutate(undefined)}>Guardar</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
    </div>
  );
}

function PanelEjecutar({ c, alTerminar }: { c: Capacitacion; alTerminar: () => void }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState(c.programadaEl <= hoy ? c.programadaEl : hoy);
  const [horas, setHoras] = useState(c.horas != null ? String(c.horas) : '');
  const ejecutar = useAccion(() => api.post(`/org/capacitacion/${c.id}/ejecutar`, { fecha: f, horas: horas ? Number(horas) : null }), { alTerminar });
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-papel p-4">
      {c.resultado.asistentes === 0 && <Aviso tono="info">Primero registra quiénes asistieron.</Aviso>}
      <div className="flex flex-wrap items-end gap-3">
        <Campo id={`ej-f-${c.id}`} etiqueta="Fecha de ejecución" type="date" max={hoy} className="w-48" value={f} onChange={(e) => setF(e.target.value)} />
        <Campo id={`ej-h-${c.id}`} etiqueta="Duración (horas)" type="number" min={0.5} step={0.5} className="w-36" value={horas} onChange={(e) => setHoras(e.target.value)} />
        <Boton cargando={ejecutar.isPending} disabled={c.resultado.asistentes === 0} onClick={() => ejecutar.mutate(undefined)}>Confirmar ejecución</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
      <Aviso error={ejecutar.error} />
    </div>
  );
}

function PanelEficacia({ c, alTerminar }: { c: Capacitacion; alTerminar: () => void }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [efectiva, setEfectiva] = useState(c.eficacia?.efectiva ?? true);
  const [f, setF] = useState(c.eficacia?.fecha ?? hoy);
  const [nota, setNota] = useState(c.eficacia?.nota ?? '');
  const guardar = useAccion(() => api.put(`/org/capacitacion/${c.id}/eficacia`, { efectiva, fecha: f, nota }), { alTerminar });
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-papel p-4">
      <p className="text-sm text-gris">¿La capacitación cambió el comportamiento que buscaba? Verifícalo con observación en la vía, inspecciones, telemetría o la siniestralidad.</p>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">Resultado</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={efectiva} onChange={() => setEfectiva(true)} className="size-4 accent-noche" /> Eficaz</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!efectiva} onChange={() => setEfectiva(false)} className="size-4 accent-noche" /> No eficaz (requiere acción)</label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Campo id={`ef-f-${c.id}`} etiqueta="Fecha de verificación" type="date" min={c.ejecutadaEl ?? undefined} max={hoy} value={f} onChange={(e) => setF(e.target.value)} />
        <AreaTexto id={`ef-n-${c.id}`} etiqueta="Cómo se verificó" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: en las inspecciones de las 6 semanas siguientes no hubo excesos de velocidad" />
      </div>
      {!efectiva && <Aviso tono="info">Registra una acción de mejora en <Link to="/acciones" className="font-semibold underline">Acciones y compromisos</Link> para reforzar la formación.</Aviso>}
      <Aviso error={guardar.error} />
      <div className="flex gap-2">
        <Boton cargando={guardar.isPending} disabled={nota.trim().length < 5} onClick={() => guardar.mutate(undefined)}>Guardar verificación</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
    </div>
  );
}

function FormularioCapacitacion({ capacitacion: c, anio, riesgos, alTerminar }: { capacitacion?: Capacitacion; anio: number; riesgos: Formacion['riesgos']; alTerminar: () => void }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<z.input<typeof capacitacionPlanSchema>, unknown, CapacitacionPlanInput>({
    resolver: zodResolver(capacitacionPlanSchema),
    defaultValues: c
      ? {
          titulo: c.titulo,
          tipo: c.tipo,
          temaId: c.temaId,
          tema: c.tema === nombreDe(TEMAS_FORMACION, c.temaId) ? '' : c.tema,
          objetivo: c.objetivo ?? '',
          publico: c.publico,
          modalidad: c.modalidad,
          programadaEl: c.programadaEl,
          horas: c.horas,
          facilitador: c.facilitador ?? '',
          tipoFacilitador: c.tipoFacilitador,
          lugar: c.lugar ?? '',
          evaluacion: c.evaluacion,
          notaMinima: c.notaMinima,
          riesgoId: c.riesgoId,
          enPlanDeTrabajo: !!c.actividadPlanId,
          cancelada: c.estado === 'cancelada',
        }
      : { tipo: 'formacion', temaId: 'manejo_defensivo', publico: ['conductores'], modalidad: 'presencial', tipoFacilitador: 'interno', evaluacion: 'evaluacion_escrita', notaMinima: 70, enPlanDeTrabajo: true, cancelada: false, riesgoId: null, programadaEl: `${anio}-${String(new Date().getMonth() + 1).padStart(2, '0')}-15` },
  });
  const [temaId, evaluacion] = useWatch({ control, name: ['temaId', 'evaluacion'] });
  const guardar = useAccion((d: CapacitacionPlanInput) => (c ? api.put(`/org/capacitacion/${c.id}`, d) : api.post('/org/capacitacion', d)), { alTerminar });
  const eliminar = useAccion(() => api.delete(`/org/capacitacion/${c!.id}`), { alTerminar });
  const numero = (v: unknown) => (v === '' || v == null ? null : Number(v));
  const calificable = METODOS_EVALUACION.find((m) => m.id === evaluacion)?.calificable ?? false;

  return (
    <Tarjeta>
      <Subtitulo>{c ? 'Editar capacitación' : 'Programar capacitación'}</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="cf-titulo" etiqueta="Título" className="sm:col-span-2" placeholder="Ej.: Taller de manejo defensivo para conductores" error={errors.titulo?.message} {...register('titulo')} />
          <Selector id="cf-tipo" etiqueta="Tipo" {...register('tipo')}>
            {TIPOS_FORMACION.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </Selector>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Selector id="cf-tema" etiqueta="Tema" ayuda={TEMAS_FORMACION.find((t) => t.id === temaId)?.descripcion} {...register('temaId')}>
            {TEMAS_FORMACION.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </Selector>
          <Campo id="cf-detalle" etiqueta="Contenido específico (opcional)" placeholder="Ej.: distancia de seguimiento y puntos ciegos" {...register('tema')} />
        </div>
        <AreaTexto id="cf-objetivo" etiqueta="Objetivo" placeholder="¿Qué comportamiento debe cambiar después de la capacitación?" {...register('objetivo')} />
        <Controller
          control={control}
          name="publico"
          render={({ field }) => {
            const valor = (field.value ?? []) as string[];
            return (
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold">Público</legend>
                <div className="flex flex-wrap gap-1.5">
                  {PUBLICOS_FORMACION.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={valor.includes(p.id)}
                      onClick={() => field.onChange(valor.includes(p.id) ? valor.filter((x) => x !== p.id) : [...valor, p.id])}
                      className="min-h-10 rounded-lg px-3 text-sm font-semibold ring-1 ring-[#d5dae1] aria-pressed:bg-noche aria-pressed:text-white aria-pressed:ring-noche"
                    >
                      {p.nombre}
                    </button>
                  ))}
                </div>
                {errors.publico && <p className="mt-1 text-[13px] font-medium text-alerta">{errors.publico.message}</p>}
              </fieldset>
            );
          }}
        />
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo id="cf-fecha" etiqueta="Fecha programada" type="date" error={errors.programadaEl?.message} {...register('programadaEl')} />
          <Campo id="cf-horas" etiqueta="Duración (horas)" type="number" min={0.5} step={0.5} error={errors.horas?.message} {...register('horas', { setValueAs: numero })} />
          <Selector id="cf-modalidad" etiqueta="Modalidad" {...register('modalidad')}>
            {MODALIDADES_FORMACION.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </Selector>
          <Campo id="cf-lugar" etiqueta="Lugar o enlace" {...register('lugar')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo id="cf-facilitador" etiqueta="Facilitador" className="sm:col-span-2" {...register('facilitador')} />
          <Selector id="cf-tipo-fac" etiqueta="Tipo de facilitador" {...register('tipoFacilitador')}>
            {FACILITADORES.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </Selector>
          <Selector id="cf-riesgo" etiqueta="Riesgo que atiende" {...register('riesgoId', { setValueAs: (v) => v || null })}>
            <option value="">Ninguno en particular</option>
            {riesgos.map((r) => <option key={r.id} value={r.id}>{r.peligro}</option>)}
          </Selector>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Selector id="cf-eval" etiqueta="Evaluación" {...register('evaluacion')}>
            {METODOS_EVALUACION.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </Selector>
          {calificable && <Campo id="cf-nota" etiqueta="Nota mínima para aprobar" type="number" min={0} max={100} {...register('notaMinima', { valueAsNumber: true })} />}
        </div>
        <Casilla etiqueta="Incluir en el plan de trabajo" descripcion="Se crea la actividad del paso 10 en el mes programado y su ejecución se refleja allá." {...register('enPlanDeTrabajo')} />
        {c && c.estado !== 'ejecutada' && <Casilla etiqueta="Capacitación cancelada" {...register('cancelada')} />}
        <Aviso error={guardar.error ?? eliminar.error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={guardar.isPending}>Guardar</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
          {c && c.estado !== 'ejecutada' && (
            <Boton variante="peligro" className="ml-auto" cargando={eliminar.isPending} onClick={() => window.confirm(`¿Eliminar «${c.titulo}»?`) && eliminar.mutate(undefined)}>Eliminar</Boton>
          )}
        </div>
      </form>
    </Tarjeta>
  );
}

// Por conductor ------------------------------------------------------------------------

function PorConductor({ anio }: { anio: number }) {
  const datos = useConsulta<HistorialConductor[]>(['capacitacion-conductores', anio], `/org/capacitacion/conductores?anio=${anio}`);
  const [soloSin, setSoloSin] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  if (datos.isPending) return <Cargando />;
  const lista = (datos.data ?? []).filter((d) => !soloSin || d.capacitacionesAnio === 0);
  const sin = (datos.data ?? []).filter((d) => d.capacitacionesAnio === 0).length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm">{sin === 0 ? 'Todos los conductores activos tienen formación este año.' : <><strong>{sin}</strong> {sin === 1 ? 'conductor activo no ha' : 'conductores activos no han'} recibido formación en {anio}.</>}</p>
        <Casilla etiqueta="Ver solo quienes no se han formado" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} />
      </div>
      {lista.length === 0 ? (
        <Vacio titulo="Sin conductores para mostrar">Registra los conductores en <Link to="/flota" className="underline">Flota y conductores</Link>.</Vacio>
      ) : (
        <Tabla minimo="48rem">
          <thead>
            <tr>
              <th className={th}>Conductor</th>
              <th className={`${th} text-right`}>Capacitaciones {anio}</th>
              <th className={`${th} text-right`}>Horas</th>
              <th className={th}>Temas</th>
              <th className={th}>Última</th>
              <th className={th}><span className="sr-only">Historial</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((d) => (
              <Fragment key={d.id}>
                <tr>
                  <td className={td}><strong className="text-noche">{d.nombre}</strong><span className="block text-[12px] text-gris">C.C. {d.documento}</span></td>
                  <td className={`${td} text-right tabular-nums`}>{d.capacitacionesAnio === 0 ? <Insignia tono="peligro">Sin formación</Insignia> : d.capacitacionesAnio}</td>
                  <td className={`${td} text-right tabular-nums`}>{d.horasAnio}</td>
                  <td className={td}>{d.temasAnio.map((t) => nombreDe(TEMAS_FORMACION, t)).join(', ') || '—'}</td>
                  <td className={td}>{d.ultima ? fecha(d.ultima) : '—'}</td>
                  <td className={td}>{d.historial.length > 0 && <Boton variante="texto" aria-expanded={abierto === d.id} onClick={() => setAbierto(abierto === d.id ? null : d.id)}>{abierto === d.id ? 'Cerrar' : 'Historial'}</Boton>}</td>
                </tr>
                {abierto === d.id && (
                  <tr>
                    <td colSpan={6} className="border-t border-linea bg-papel/40 px-4 py-3">
                      <ul className="flex flex-col gap-1 text-sm">
                        {d.historial.map((h) => (
                          <li key={h.capacitacionId} className="flex flex-wrap gap-x-3">
                            <span className="w-24 text-gris">{fecha(h.fecha)}</span>
                            <span className="font-semibold text-noche">{h.titulo}</span>
                            <span className="text-gris">{nombreDe(TEMAS_FORMACION, h.temaId)}{h.horas ? ` · ${h.horas} h` : ''}</span>
                            {h.nota != null && <span className={h.aprobo ? 'text-via' : 'text-alerta'}>Nota {h.nota} · {h.aprobo ? 'aprobó' : 'no aprobó'}</span>}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </Tabla>
      )}
      <Aviso error={datos.error} />
    </>
  );
}
