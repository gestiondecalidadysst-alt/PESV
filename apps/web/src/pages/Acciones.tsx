import { ORIGENES_ACCION, PASOS_PESV, TIPOS_ACCION, type OrigenAccion } from '@pesv/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { GraficaBarras } from '../components/graficas';
import { NuevaAccion } from '../components/NuevaAccion';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Cifra, Encabezado, Insignia, Pagina, Selector, Tarjeta, Vacio, fecha } from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';

export interface Accion {
  id: string;
  origen: OrigenAccion;
  origenId?: string | null;
  pasoNumero?: number | null;
  tipo: string;
  descripcion: string;
  responsable: string;
  venceEl: string;
  estado: 'abierta' | 'cerrada';
  vencida: boolean;
  diasParaVencer?: number | null;
  cerradaATiempo?: boolean | null;
  notaCierre: string | null;
}

interface Plan {
  acciones: Accion[];
  resumen: {
    total: number;
    abiertas: number;
    vencidas: number;
    porVencer: number;
    cerradas: number;
    cumplimientoATiempo: number | null;
    porOrigen: { origen: OrigenAccion; abiertas: number; cerradas: number }[];
    porPaso: { paso: number; abiertas: number; vencidas: number }[];
  };
}

const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? id ?? '—';
const enlaceBoton = 'inline-flex min-h-10 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea';

/** Lista de acciones con cierre; la usan el plan de acción, el comité, los siniestros y las auditorías. */
export function ListaAcciones({ acciones, mostrarOrigen = true }: { acciones: Accion[]; mostrarOrigen?: boolean }) {
  const { puede } = useSesion();
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const cerrar = useAccion((id: string) => api.post(`/org/acciones/${id}/cerrar`, { nota }), { alTerminar: () => { setCerrando(null); setNota(''); } });
  if (!acciones.length) return <Vacio titulo="Sin acciones" />;
  return (
    <ul className="flex flex-col">
      {acciones.map((a) => {
        const origen = ORIGENES_ACCION.find((o) => o.id === a.origen);
        return (
          <li key={a.id} className="flex flex-col gap-2 border-t border-linea py-3 first:border-t-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{a.descripcion}</span>
              {a.estado === 'cerrada' ? (
                <Insignia tono={a.cerradaATiempo === false ? 'aviso' : 'exito'}>{a.cerradaATiempo === false ? 'Cerrada tarde' : 'Cerrada'}</Insignia>
              ) : a.vencida ? (
                <Insignia tono="peligro">Vencida</Insignia>
              ) : (
                <Insignia tono="aviso">{a.diasParaVencer != null && a.diasParaVencer <= 15 ? `Vence en ${a.diasParaVencer} días` : 'Abierta'}</Insignia>
              )}
            </div>
            <p className="flex flex-wrap gap-x-2 text-[13px] text-gris">
              {mostrarOrigen && origen && <Link to={a.origen === 'paso' && a.pasoNumero ? `/pasos/${a.pasoNumero}` : origen.ruta} className="text-[#1d4e89] underline-offset-2 hover:underline">{origen.nombre}</Link>}
              {a.pasoNumero ? <Link to={`/pasos/${a.pasoNumero}`} className="text-[#1d4e89] underline-offset-2 hover:underline">Paso {a.pasoNumero}</Link> : null}
              <span>{nombreDe(TIPOS_ACCION, a.tipo)}</span>
              <span>Responsable: {a.responsable}</span>
              <span>Fecha límite: {fecha(a.venceEl)}</span>
            </p>
            {a.notaCierre && <p className="text-[13px] text-gris">Cierre: {a.notaCierre}</p>}
            {a.estado === 'abierta' && puede('comite') && (
              cerrando === a.id ? (
                <div className="flex flex-col gap-2">
                  <AreaTexto id={`cierre-${a.id}`} etiqueta="¿Cómo se cumplió?" value={nota} onChange={(e) => setNota(e.target.value)} />
                  <div className="flex gap-2">
                    <Boton cargando={cerrar.isPending} disabled={nota.trim().length < 3} onClick={() => cerrar.mutate(a.id)}>Cerrar acción</Boton>
                    <Boton variante="secundario" onClick={() => setCerrando(null)}>Cancelar</Boton>
                  </div>
                  <Aviso error={cerrar.error} />
                </div>
              ) : (
                <Boton variante="texto" className="self-start" onClick={() => setCerrando(a.id)}>Marcar como cumplida</Boton>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Plan de acción unificado (paso 23). */
export function Acciones() {
  const { puede } = useSesion();
  const plan = useConsulta<Plan>(['acciones', 'plan'], '/org/acciones/plan');
  const [filtro, setFiltro] = useState({ estado: 'abierta', origen: '', paso: '', texto: '' });
  const [nueva, setNueva] = useState(false);
  const evidencia = useAccion(() => api.post('/org/acciones/evidencia'));
  const datos = plan.data;
  const lista = (datos?.acciones ?? []).filter(
    (a) =>
      (filtro.estado === '' || (filtro.estado === 'vencida' ? a.vencida : a.estado === filtro.estado)) &&
      (!filtro.origen || a.origen === filtro.origen) &&
      (!filtro.paso || String(a.pasoNumero ?? '') === filtro.paso) &&
      (!filtro.texto || `${a.descripcion} ${a.responsable}`.toLowerCase().includes(filtro.texto.toLowerCase())),
  );
  const r = datos?.resumen;

  return (
    <Pagina ancho="max-w-6xl">
      <Encabezado
        titulo="Plan de acción"
        descripcion="Paso 23 · Todas las acciones correctivas, preventivas, de mejora y los compromisos en un solo lugar: hallazgos de los pasos, comité, siniestros, auditorías, indicadores y matriz de riesgos, cada una con su paso del PESV, responsable y fecha."
        acciones={
          <div className="flex flex-wrap gap-2">
            <a href={urlApi('/org/acciones/exportar')} className={enlaceBoton}>PDF</a>
            <a href={urlApi('/org/acciones/exportar?formato=xlsx')} className={enlaceBoton}>Excel</a>
            {puede('gestionar_pesv') && !!r?.total && <Boton variante="secundario" cargando={evidencia.isPending} onClick={() => evidencia.mutate(undefined)}>Evidencia del paso 23</Boton>}
          </div>
        }
      />
      {evidencia.isSuccess && <Aviso tono="exito">El plan de acción quedó como evidencia del paso 23, pendiente de aprobación.</Aviso>}
      <Aviso error={evidencia.error ?? plan.error} />
      {plan.isPending || !r ? <Cargando /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra etiqueta="Acciones abiertas" valor={r.abiertas} detalle={`${r.porVencer} vencen en los próximos 15 días`} />
            <Cifra etiqueta="Vencidas" valor={r.vencidas} detalle={r.vencidas ? 'Requieren seguimiento inmediato' : 'Ninguna vencida'} />
            <Cifra etiqueta="Cerradas" valor={r.cerradas} detalle={`De ${r.total} registradas`} />
            <Cifra etiqueta="Cerradas a tiempo" valor={r.cumplimientoATiempo == null ? '—' : `${r.cumplimientoATiempo} %`} barra={r.cumplimientoATiempo ?? undefined} detalle="De las que ya vencieron" />
          </div>
          {r.porOrigen.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Tarjeta className="lg:col-span-2">
                <GraficaBarras
                  titulo="Acciones por origen"
                  categorias={r.porOrigen.map((o) => nombreDe(ORIGENES_ACCION, o.origen))}
                  series={[{ nombre: 'Abiertas', valores: r.porOrigen.map((o) => o.abiertas) }, { nombre: 'Cerradas', valores: r.porOrigen.map((o) => o.cerradas) }]}
                  enteros
                  formato={(v) => String(Math.round(v))}
                />
              </Tarjeta>
              <Tarjeta>
                <p className="font-bold text-noche">Acciones abiertas por paso</p>
                {r.porPaso.filter((p) => p.abiertas > 0).length === 0 ? (
                  <p className="text-sm text-gris">No hay acciones abiertas.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {r.porPaso.filter((p) => p.abiertas > 0).map((p) => (
                      <li key={p.paso} className="flex items-center justify-between gap-2">
                        <Link to={`/pasos/${p.paso}`} className="min-w-0 truncate text-[#1d4e89] underline-offset-2 hover:underline">{p.paso}. {PASOS_PESV.find((x) => x.numero === p.paso)?.nombre}</Link>
                        <span className="shrink-0 tabular-nums">{p.abiertas}{p.vencidas ? <span className="ml-1 font-semibold text-alerta">({p.vencidas} vencidas)</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {puede('gestionar_pesv') && !nueva && <Boton onClick={() => setNueva(true)}>Nueva acción de mejora</Boton>}
            <Selector id="pa-estado" etiqueta="Estado" className="w-40" value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value })}>
              <option value="abierta">Abiertas</option>
              <option value="vencida">Vencidas</option>
              <option value="cerrada">Cerradas</option>
              <option value="">Todas</option>
            </Selector>
            <Selector id="pa-origen" etiqueta="Origen" className="w-56" value={filtro.origen} onChange={(e) => setFiltro({ ...filtro, origen: e.target.value })}>
              <option value="">Todos</option>
              {ORIGENES_ACCION.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </Selector>
            <Selector id="pa-paso" etiqueta="Paso" className="w-44" value={filtro.paso} onChange={(e) => setFiltro({ ...filtro, paso: e.target.value })}>
              <option value="">Todos</option>
              {PASOS_PESV.map((p) => <option key={p.numero} value={p.numero}>{p.numero}. {p.nombre}</option>)}
            </Selector>
            <Campo id="pa-buscar" etiqueta="Buscar" className="w-56" value={filtro.texto} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} />
          </div>
          {nueva && (
            <Tarjeta>
              <p className="font-bold text-noche">Nueva acción de mejora</p>
              <NuevaAccion ruta="/org/acciones" tipoPorDefecto="mejora" />
              <Boton variante="texto" className="self-start" onClick={() => setNueva(false)}>Cerrar</Boton>
            </Tarjeta>
          )}
          <Tarjeta>
            <p className="text-sm text-gris">{lista.length} {lista.length === 1 ? 'acción' : 'acciones'}</p>
            <ListaAcciones acciones={lista} />
          </Tarjeta>
          <p className="text-sm text-gris">
            ¿Un paso tiene un problema? Regístralo como hallazgo en la página del paso (por ejemplo, <Link to="/pasos/2" className="text-[#1d4e89] underline">paso 2</Link>) y trátalo aquí con acciones.
          </p>
        </>
      )}
    </Pagina>
  );
}
