import { cuestionarioPorId, CUESTIONARIO_VIGENTE, type ResumenPregunta } from '@pesv/shared';
import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { FormularioEncuesta } from '../components/FormularioEncuesta';
import { SERIES } from '../components/graficas';
import { Aviso, Boton, Campo, Cargando, Casilla, Cifra, Encabezado, Insignia, Pagina, Selector, Subtitulo, Tarjeta, Vacio, fecha, fechaHora } from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';

interface Campana {
  id: string;
  titulo: string;
  cuestionario: string;
  estado: 'abierta' | 'cerrada';
  abierta: boolean;
  anonima: boolean;
  cierraEl: string | null;
  enlace: string;
  respuestas: number;
  creadaEl: string;
}

interface Resultados {
  campana: Campana;
  total: number;
  conductoresActivos: number;
  conductoresQueRespondieron: number;
  cobertura: number | null;
  pendientes: { id: string; nombre: string; documento: string }[];
  hallazgos: { id: string; nombre: string; valor: number | null; ayuda: string }[];
  resumen: ResumenPregunta[];
  respuestas: { id: string; nombre: string | null; documento: string | null; conductorId: string | null; canal: 'enlace' | 'interno'; enviadaEl: string }[];
}

const enlaceBoton = 'inline-flex min-h-10 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea';

export function PerfilConductores() {
  const { puede } = useSesion();
  const campanas = useConsulta<Campana[]>(['perfil'], '/org/perfil-conductores');
  const [elegida, setElegida] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const gestiona = puede('gestionar_pesv');
  const actual = elegida ?? campanas.data?.[0]?.id ?? null;

  return (
    <Pagina ancho="max-w-6xl">
      <Encabezado
        titulo="Perfil de los colaboradores"
        descripcion="Paso 5 · Encuesta de perfil sociodemográfico y de desplazamientos para el diagnóstico del PESV. Compártela por enlace o código QR para responder desde el celular, o regístrala aquí. Los resultados alimentan la matriz de riesgos y el plan de formación."
      />
      {campanas.isPending ? <Cargando /> : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {(campanas.data?.length ?? 0) > 1 && (
              <Selector id="pf-campana" etiqueta="Encuesta" className="w-80" value={actual ?? ''} onChange={(e) => setElegida(e.target.value)}>
                {campanas.data!.map((c) => <option key={c.id} value={c.id}>{c.titulo} · {c.respuestas} respuestas</option>)}
              </Selector>
            )}
            {gestiona && !creando && <Boton variante={campanas.data?.length ? 'secundario' : 'principal'} onClick={() => setCreando(true)}>Nueva encuesta</Boton>}
          </div>
          {creando && <NuevaCampana alTerminar={(id) => { setCreando(false); if (id) setElegida(id); }} />}
          {!campanas.data?.length && !creando ? (
            <Vacio titulo="Aún no hay encuestas">
              Crea la encuesta de caracterización: preguntas sobre edad, escolaridad, vinculación, cómo se desplazan a trabajar y en misión, licencia y experiencia, siniestros, comparendos y percepción del riesgo.
            </Vacio>
          ) : actual ? (
            <ResultadosCampana key={actual} id={actual} gestiona={gestiona} />
          ) : null}
        </>
      )}
      <Aviso error={campanas.error} />
    </Pagina>
  );
}

function NuevaCampana({ alTerminar }: { alTerminar: (id?: string) => void }) {
  const [titulo, setTitulo] = useState(`Caracterización de colaboradores ${new Date().getFullYear()}`);
  const [cierra, setCierra] = useState('');
  const [anonima, setAnonima] = useState(false);
  const crear = useAccion(() => api.post<Campana>('/org/perfil-conductores', { titulo, cierraEl: cierra || null, anonima }), { alTerminar: (c) => alTerminar(c.id) });
  return (
    <Tarjeta>
      <Subtitulo>Nueva encuesta</Subtitulo>
      <p className="-mt-2 text-sm text-gris">Usa el cuestionario «{CUESTIONARIO_VIGENTE.nombre}» con {CUESTIONARIO_VIGENTE.preguntas.length} preguntas.</p>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Campo id="nc-titulo" etiqueta="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <Campo id="nc-cierre" etiqueta="Cierra el (opcional)" type="date" min={new Date().toISOString().slice(0, 10)} value={cierra} onChange={(e) => setCierra(e.target.value)} />
      </div>
      <Casilla etiqueta="Encuesta anónima" descripcion="No pide nombre ni cédula: más sinceridad, pero no se puede saber quién falta por responder." checked={anonima} onChange={(e) => setAnonima(e.target.checked)} />
      <Aviso error={crear.error} />
      <div className="flex gap-2">
        <Boton cargando={crear.isPending} onClick={() => crear.mutate(undefined)}>Crear encuesta</Boton>
        <Boton variante="secundario" onClick={() => alTerminar()}>Cancelar</Boton>
      </div>
    </Tarjeta>
  );
}

function CodigoQr({ texto }: { texto: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(texto);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [texto]);
  // El SVG lo genera la librería a partir del enlace: no incluye contenido del usuario.
  return <div className="size-36 shrink-0 rounded-lg bg-white p-1 ring-1 ring-linea [&_svg]:size-full" role="img" aria-label="Código QR del enlace de la encuesta" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function ResultadosCampana({ id, gestiona }: { id: string; gestiona: boolean }) {
  const datos = useConsulta<Resultados>(['perfil', id], `/org/perfil-conductores/${id}`);
  const [registrando, setRegistrando] = useState<{ id: string; nombre: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const cerrar = useAccion(() => api.post(`/org/perfil-conductores/${id}/${datos.data?.campana.estado === 'abierta' ? 'cerrar' : 'reabrir'}`));
  const evidencia = useAccion(() => api.post(`/org/perfil-conductores/${id}/evidencia`));
  const eliminar = useAccion(() => api.delete(`/org/perfil-conductores/${id}`));
  if (datos.isPending) return <Cargando />;
  if (!datos.data) return <Aviso error={datos.error} />;
  const r = datos.data;
  const c = r.campana;
  const cuestionario = cuestionarioPorId(c.cuestionario);

  return (
    <>
      <Tarjeta>
        <div className="flex flex-wrap items-start gap-5">
          {c.abierta && <CodigoQr texto={c.enlace} />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-bold text-noche">{c.titulo}</p>
              <Insignia tono={c.abierta ? 'exito' : 'neutro'}>{c.abierta ? 'Abierta' : 'Cerrada'}</Insignia>
              {c.anonima && <Insignia tono="info">Anónima</Insignia>}
            </div>
            <p className="text-sm text-gris">Creada el {fecha(c.creadaEl)}{c.cierraEl ? ` · cierra el ${fecha(c.cierraEl)}` : ''}</p>
            {c.abierta && (
              <div className="flex flex-wrap items-center gap-2">
                <input readOnly aria-label="Enlace de la encuesta" value={c.enlace} className="h-10 min-w-0 flex-1 rounded-lg border border-[#d5dae1] bg-papel px-3 text-sm" onFocus={(e) => e.target.select()} />
                <Boton
                  variante="secundario"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(c.enlace);
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 2000);
                    } catch {
                      /* El navegador no permite copiar: el enlace queda seleccionable. */
                    }
                  }}
                >
                  {copiado ? 'Copiado' : 'Copiar enlace'}
                </Boton>
                <a className={enlaceBoton} href={`https://wa.me/?text=${encodeURIComponent(`Responde la encuesta de seguridad vial: ${c.enlace}`)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={urlApi(`/org/perfil-conductores/${id}/exportar`)} className={enlaceBoton}>Informe PDF</a>
              <a href={urlApi(`/org/perfil-conductores/${id}/exportar?formato=xlsx`)} className={enlaceBoton}>Excel</a>
              {gestiona && r.total > 0 && <Boton variante="secundario" cargando={evidencia.isPending} onClick={() => evidencia.mutate(undefined)}>Evidencia del paso 5</Boton>}
              {gestiona && <Boton variante="texto" cargando={cerrar.isPending} onClick={() => cerrar.mutate(undefined)}>{c.estado === 'abierta' ? 'Cerrar encuesta' : 'Reabrir'}</Boton>}
              {gestiona && r.total === 0 && <Boton variante="texto" cargando={eliminar.isPending} onClick={() => window.confirm('¿Eliminar esta encuesta?') && eliminar.mutate(undefined)}>Eliminar</Boton>}
            </div>
          </div>
        </div>
        {evidencia.isSuccess && <Aviso tono="exito">El informe quedó como evidencia del paso 5, pendiente de aprobación. <Link to="/pasos/5" className="font-semibold underline">Ver el paso 5</Link></Aviso>}
        <Aviso error={cerrar.error ?? evidencia.error ?? eliminar.error} />
      </Tarjeta>

      <div className="grid gap-4 sm:grid-cols-3">
        <Cifra etiqueta="Respuestas" valor={r.total} detalle={r.respuestas.length ? `Última: ${fechaHora(r.respuestas[0]!.enviadaEl)}` : 'Aún no hay respuestas'} />
        <Cifra etiqueta="Cobertura de conductores" valor={r.cobertura == null ? '—' : `${r.cobertura} %`} barra={r.cobertura ?? undefined} detalle={c.anonima ? 'No se mide en encuestas anónimas' : `${r.conductoresQueRespondieron} de ${r.conductoresActivos} conductores activos`} />
        <Cifra etiqueta="Conductores pendientes" valor={c.anonima ? '—' : r.pendientes.length} detalle={c.anonima ? 'Encuesta anónima' : r.pendientes.length ? 'Recuérdales responder o regístralo aquí' : 'Todos respondieron'} />
      </div>

      {registrando && cuestionario && (
        <Tarjeta>
          <Subtitulo acciones={<Boton variante="texto" onClick={() => setRegistrando(null)}>Cerrar</Boton>}>Encuesta de {registrando.nombre}</Subtitulo>
          <FormularioEncuesta
            cuestionario={cuestionario}
            identificacion="conductor"
            organizacion="la organización"
            textoEnviar="Guardar respuestas"
            alEnviar={async (d) => {
              await api.post(`/org/perfil-conductores/${id}/respuestas`, { ...d, conductorId: registrando.id });
              setRegistrando(null);
              await datos.refetch();
            }}
          />
        </Tarjeta>
      )}

      {!c.anonima && r.pendientes.length > 0 && (
        <details className="rounded-2xl bg-white p-5 ring-1 ring-linea">
          <summary className="cursor-pointer font-semibold text-noche">Conductores que no han respondido ({r.pendientes.length})</summary>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {r.pendientes.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-papel px-3 py-2 text-sm">
                <span>{p.nombre} <span className="text-gris">· C.C. {p.documento}</span></span>
                {gestiona && c.abierta && <Boton variante="texto" onClick={() => { setRegistrando(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Registrar</Boton>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {r.total === 0 ? (
        <Vacio titulo="Sin respuestas todavía">Comparte el enlace o el código QR. Los resultados aparecen aquí a medida que llegan.</Vacio>
      ) : (
        <>
          <Tarjeta>
            <Subtitulo>Hallazgos para el diagnóstico</Subtitulo>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {r.hallazgos.map((h) => (
                <div key={h.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 font-semibold text-tinta">{h.nombre}</span>
                    <strong className="shrink-0 tabular-nums">{h.valor == null ? '—' : `${h.valor} %`}</strong>
                  </div>
                  <div className="h-2 rounded-full bg-[#e8edf3]"><div className="h-2 rounded-full" style={{ width: `${h.valor ?? 0}%`, background: SERIES[0] }} /></div>
                  <p className="text-[12px] text-gris">{h.ayuda}</p>
                </div>
              ))}
            </div>
          </Tarjeta>
          <div className="grid gap-4 lg:grid-cols-2">
            {r.resumen.map((p, i) => {
              const titulo = i === 0 || r.resumen[i - 1]!.seccion !== p.seccion ? p.seccion : null;
              return (
                <div key={p.pregunta} className="contents">
                  {titulo && <h2 className="pt-2 text-lg font-bold text-noche lg:col-span-2">{titulo}</h2>}
                  <Tarjeta className={p.tipo === 'texto' ? 'lg:col-span-2' : undefined}>
                    <Distribucion p={p} />
                  </Tarjeta>
                </div>
              );
            })}
          </div>
          <details className="rounded-2xl bg-white p-5 ring-1 ring-linea">
            <summary className="cursor-pointer font-semibold text-noche">Respuestas recibidas ({r.respuestas.length})</summary>
            <ListaRespuestas r={r} gestiona={gestiona} />
          </details>
        </>
      )}
    </>
  );
}

/** Barras horizontales: una por opción, con cantidad y porcentaje escritos (no dependen del color). */
function Distribucion({ p }: { p: ResumenPregunta }) {
  const max = Math.max(1, ...p.opciones.map((o) => o.porcentaje));
  return (
    <figure className="flex flex-col gap-3">
      <figcaption>
        <p className="font-semibold text-noche">{p.texto}</p>
        <p className="text-[12px] text-gris">
          {p.respondieron} {p.respondieron === 1 ? 'respuesta' : 'respuestas'}
          {p.tipo === 'multiple' ? ' · selección múltiple (puede sumar más de 100 %)' : ''}
        </p>
      </figcaption>
      {p.tipo === 'texto' ? (
        p.textos.length ? (
          <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto text-sm">
            {p.textos.map((t, i) => <li key={i} className="rounded-lg bg-papel px-3 py-2">{t}</li>)}
          </ul>
        ) : <p className="text-sm text-gris">Sin respuestas.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...p.opciones].sort((a, b) => b.cantidad - a.cantidad).map((o) => (
            <li key={o.id} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[13px] sm:grid-cols-[minmax(0,13rem)_1fr_auto]" title={`${o.nombre}: ${o.cantidad} (${o.porcentaje} %)`}>
              <span className="truncate text-tinta">{o.nombre}</span>
              <span className="h-3 rounded-r" aria-hidden="true">
                <span className="block h-3 rounded-r-[4px]" style={{ width: `${(o.porcentaje / max) * 100}%`, minWidth: o.cantidad ? 3 : 0, background: SERIES[0] }} />
              </span>
              <span className="w-20 text-right tabular-nums text-tinta">{o.cantidad} <span className="text-gris">({o.porcentaje} %)</span></span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function ListaRespuestas({ r, gestiona }: { r: Resultados; gestiona: boolean }) {
  const borrar = useAccion((rid: string) => api.delete(`/org/perfil-conductores/respuestas/${rid}`));
  return (
    <div className="mt-3 flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-linea text-sm">
        {r.respuestas.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="min-w-0 flex-1">{x.nombre ?? 'Anónima'}{x.documento && <span className="text-gris"> · C.C. {x.documento}</span>}{x.nombre && !x.conductorId && <span className="text-gris"> · no es conductor registrado</span>}</span>
            <span className="text-gris">{x.canal === 'enlace' ? 'Por enlace' : 'En la plataforma'} · {fechaHora(x.enviadaEl)}</span>
            {gestiona && <Boton variante="texto" onClick={() => window.confirm('¿Eliminar esta respuesta?') && borrar.mutate(x.id)}>Eliminar</Boton>}
          </li>
        ))}
      </ul>
      <Aviso error={borrar.error} />
    </div>
  );
}

