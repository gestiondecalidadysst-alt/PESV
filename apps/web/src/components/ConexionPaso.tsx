import { FUENTES_HALLAZGO, HERRAMIENTAS_PASO, PASOS_PESV, TIPOS_HALLAZGO_PASO, type TipoHallazgoPaso } from '@pesv/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { EstadoDePaso } from '../lib/tipos';
import { NuevaAccion } from './NuevaAccion';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Insignia, Selector, Subtitulo, Tarjeta, fecha } from './ui';

const TEXTO = { pendiente: 'Pendiente', en_curso: 'En curso', hecho: 'Hecho', no_aplica: 'No aplica' } as const;
const TONO = { pendiente: 'neutro', en_curso: 'aviso', hecho: 'exito', no_aplica: 'neutro' } as const;
const nombrePaso = (n: number) => PASOS_PESV.find((p) => p.numero === n)?.nombre ?? '';

/** Prerrequisitos del paso, pasos que habilita y herramientas de la plataforma donde se trabaja. */
export function ConexionPaso({ paso, todos }: { paso: EstadoDePaso; todos: EstadoDePaso[] }) {
  const herramientas = HERRAMIENTAS_PASO[paso.numero] ?? [];
  return (
    <Tarjeta>
      <Subtitulo>Conexión con los demás pasos</Subtitulo>
      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <p className="mb-2 text-sm font-semibold">Requiere</p>
          {paso.prerrequisitos.length === 0 ? (
            <p className="text-sm text-gris">Es un paso de inicio: no depende de otros.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {paso.prerrequisitos.map((p) => (
                <li key={p.numero} className="flex items-center gap-2 text-sm">
                  <Insignia tono={TONO[p.estado]}>{TEXTO[p.estado]}</Insignia>
                  <Link to={`/pasos/${p.numero}`} className="text-[#1d4e89] underline-offset-2 hover:underline">{p.numero}. {nombrePaso(p.numero)}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Habilita</p>
          {paso.habilita.length === 0 ? (
            <p className="text-sm text-gris">Ningún paso depende de este.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {paso.habilita.map((n) => {
                const e = todos.find((x) => x.numero === n)?.estado ?? 'pendiente';
                return (
                  <li key={n} className="flex items-center gap-2 text-sm">
                    <Insignia tono={TONO[e]}>{TEXTO[e]}</Insignia>
                    <Link to={`/pasos/${n}`} className="text-[#1d4e89] underline-offset-2 hover:underline">{n}. {nombrePaso(n)}</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Dónde se trabaja</p>
          {herramientas.length === 0 ? (
            <p className="text-sm text-gris">Con las evidencias de esta página.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {herramientas.map((h) => (
                <li key={h.ruta + h.nombre} className="text-sm">
                  <Link to={h.ruta} className="font-semibold text-[#1d4e89] underline-offset-2 hover:underline">{h.nombre}</Link>
                  <span className="block text-[13px] text-gris">{h.descripcion}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Tarjeta>
  );
}

interface AccionHallazgo {
  id: string;
  descripcion: string;
  tipo: string;
  responsable: string;
  venceEl: string;
  estado: 'abierta' | 'cerrada';
  vencida: boolean;
  notaCierre: string | null;
}

interface Hallazgo {
  id: string;
  pasoNumero: number;
  tipo: TipoHallazgoPaso;
  fuente: string;
  descripcion: string;
  causa: string | null;
  detectadoEl: string;
  estado: 'abierto' | 'cerrado';
  notaCierre: string | null;
  cerradoEn: string | null;
  acciones: AccionHallazgo[];
  listoParaCerrar: boolean;
}

const TONO_TIPO = { no_conformidad: 'peligro', observacion: 'aviso', oportunidad_mejora: 'info' } as const;
const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string) => lista.find((x) => x.id === id)?.nombre ?? id;

/** Hallazgos del paso: cada uno se trata con acciones del plan de acción y se cierra al verificarlas. */
export function HallazgosPaso({ numero }: { numero: number }) {
  const { puede } = useSesion();
  const hallazgos = useConsulta<Hallazgo[]>(['hallazgos', numero], `/org/pasos/${numero}/hallazgos`);
  const [nuevo, setNuevo] = useState(false);
  const gestiona = puede('gestionar_pesv');
  const abiertos = hallazgos.data?.filter((h) => h.estado === 'abierto') ?? [];
  const cerrados = hallazgos.data?.filter((h) => h.estado === 'cerrado') ?? [];
  return (
    <Tarjeta>
      <Subtitulo acciones={gestiona && !nuevo && <Boton variante="secundario" onClick={() => setNuevo(true)}>Registrar hallazgo</Boton>}>Hallazgos y plan de acción</Subtitulo>
      <p className="-mt-2 text-sm text-gris">
        Lo que se encuentre al revisar este paso (no conformidades, observaciones u oportunidades de mejora) se trata con acciones del <Link to="/acciones" className="font-semibold text-[#1d4e89] underline">plan de acción</Link>. Una no conformidad abierta impide cerrar el paso.
      </p>
      {nuevo && <NuevoHallazgo numero={numero} alTerminar={() => setNuevo(false)} />}
      {hallazgos.isPending ? <Cargando /> : abiertos.length === 0 && !nuevo ? <p className="text-sm text-gris">Sin hallazgos abiertos.</p> : null}
      {abiertos.map((h) => <FilaHallazgo key={h.id} h={h} gestiona={gestiona} />)}
      {cerrados.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-[#1d4e89]">Hallazgos cerrados ({cerrados.length})</summary>
          <div className="mt-2 flex flex-col gap-2">{cerrados.map((h) => <FilaHallazgo key={h.id} h={h} gestiona={false} />)}</div>
        </details>
      )}
      <Aviso error={hallazgos.error} />
    </Tarjeta>
  );
}

function NuevoHallazgo({ numero, alTerminar }: { numero: number; alTerminar: () => void }) {
  const [tipo, setTipo] = useState<TipoHallazgoPaso>('no_conformidad');
  const [fuente, setFuente] = useState('autoevaluacion');
  const [descripcion, setDescripcion] = useState('');
  const [causa, setCausa] = useState('');
  const [f, setF] = useState(new Date().toISOString().slice(0, 10));
  const crear = useAccion(() => api.post(`/org/pasos/${numero}/hallazgos`, { tipo, fuente, descripcion, causa: causa || undefined, detectadoEl: f }), { alTerminar });
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-papel p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Selector id={`hz-tipo-${numero}`} etiqueta="Tipo" ayuda={TIPOS_HALLAZGO_PASO.find((t) => t.id === tipo)?.descripcion} value={tipo} onChange={(e) => setTipo(e.target.value as TipoHallazgoPaso)}>
          {TIPOS_HALLAZGO_PASO.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </Selector>
        <Selector id={`hz-fuente-${numero}`} etiqueta="¿Dónde se detectó?" value={fuente} onChange={(e) => setFuente(e.target.value)}>
          {FUENTES_HALLAZGO.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </Selector>
        <Campo id={`hz-fecha-${numero}`} etiqueta="Fecha" type="date" max={new Date().toISOString().slice(0, 10)} value={f} onChange={(e) => setF(e.target.value)} />
      </div>
      <AreaTexto id={`hz-desc-${numero}`} etiqueta="Hallazgo" placeholder="¿Qué se encontró? ¿Qué requisito no se cumple?" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <AreaTexto id={`hz-causa-${numero}`} etiqueta="Causa (análisis)" placeholder="¿Por qué ocurrió? Por ejemplo, con los 5 porqués." value={causa} onChange={(e) => setCausa(e.target.value)} />
      <Aviso error={crear.error} />
      <div className="flex gap-2">
        <Boton cargando={crear.isPending} disabled={descripcion.trim().length < 5} onClick={() => crear.mutate(undefined)}>Registrar</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
    </div>
  );
}

function FilaHallazgo({ h, gestiona }: { h: Hallazgo; gestiona: boolean }) {
  const [accion, setAccion] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [nota, setNota] = useState('');
  const cerrar = useAccion(() => api.post(`/org/hallazgos/${h.id}/cerrar`, { nota }), { alTerminar: () => setCerrando(false) });
  return (
    <div className="flex flex-col gap-2 rounded-xl p-4 ring-1 ring-linea">
      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono={TONO_TIPO[h.tipo]}>{nombreDe(TIPOS_HALLAZGO_PASO, h.tipo)}</Insignia>
        <span className="text-[13px] text-gris">{nombreDe(FUENTES_HALLAZGO, h.fuente)} · {fecha(h.detectadoEl)}</span>
        {h.estado === 'cerrado' && <Insignia tono="exito">Cerrado</Insignia>}
      </div>
      <p className="text-sm font-semibold text-noche">{h.descripcion}</p>
      {h.causa && <p className="text-sm text-gris">Causa: {h.causa}</p>}
      {h.acciones.length > 0 && (
        <ul className="flex flex-col gap-1 border-l-2 border-linea pl-3 text-sm">
          {h.acciones.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <span>{a.descripcion}</span>
              <span className="text-[12px] text-gris">{a.responsable} · {fecha(a.venceEl)}</span>
              {a.estado === 'cerrada' ? <Insignia tono="exito">Cerrada</Insignia> : a.vencida ? <Insignia tono="peligro">Vencida</Insignia> : <Insignia tono="aviso">Abierta</Insignia>}
            </li>
          ))}
        </ul>
      )}
      {h.notaCierre && <p className="text-sm text-gris">Cierre: {h.notaCierre}</p>}
      {gestiona && h.estado === 'abierto' && (
        <div className="flex flex-wrap gap-1">
          <Boton variante="texto" onClick={() => setAccion(!accion)}>{accion ? 'Cancelar' : 'Agregar acción'}</Boton>
          {h.listoParaCerrar && <Boton variante="texto" onClick={() => setCerrando(!cerrando)}>Cerrar hallazgo</Boton>}
          {!h.acciones.length && <span className="self-center text-[13px] text-alerta">Sin acciones: define cómo se va a tratar.</span>}
          {h.acciones.length > 0 && !h.listoParaCerrar && <span className="self-center text-[13px] text-gris">Se cierra cuando todas sus acciones estén cumplidas.</span>}
        </div>
      )}
      {accion && <NuevaAccion ruta={`/org/hallazgos/${h.id}/acciones`} tipoPorDefecto={h.tipo === 'no_conformidad' ? 'correctiva' : 'mejora'} alTerminar={() => setAccion(false)} />}
      {cerrando && (
        <div className="flex flex-col gap-2">
          <AreaTexto id={`hz-cierre-${h.id}`} etiqueta="¿Cómo se verificó que quedó resuelto?" value={nota} onChange={(e) => setNota(e.target.value)} />
          <Boton className="self-start" cargando={cerrar.isPending} disabled={nota.trim().length < 5} onClick={() => cerrar.mutate(undefined)}>Confirmar cierre</Boton>
          <Aviso error={cerrar.error} />
        </div>
      )}
    </div>
  );
}
