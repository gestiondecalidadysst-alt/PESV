import { ESTADOS_INDICADOR, FASES_PHVA, MESES, NIVEL_LABEL } from '@pesv/shared';
import { Link, Navigate } from 'react-router';
import { Avance, GraficaBarras } from '../components/graficas';
import { Aviso, Boton, Cargando, Cifra, Encabezado, Insignia, Pagina, Subtitulo, Tarjeta, Vacio } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { PropuestaReclasificacion, Tablero } from '../lib/tipos';

export function Inicio() {
  const { organizacion, puede } = useSesion();
  const tablero = useConsulta<Tablero>(['tablero'], '/org/tablero', { enabled: puede('ver'), staleTime: 0 });
  const propuesta = useConsulta<PropuestaReclasificacion>(['reclasificacion'], '/org/reclasificacion', { enabled: puede('ver'), staleTime: 0 });
  const reclasificar = useAccion(() => api.post('/org/reclasificacion'));
  const gestion = useConsulta<Gestion>(['tablero', 'gestion'], '/org/tablero/gestion', { enabled: puede('ver') });

  if (!puede('ver')) return <Navigate to="/preoperacional" replace />;
  if (tablero.isPending) return <Cargando />;
  if (tablero.error) return <Aviso error={tablero.error} />;
  const t = tablero.data!;
  const p = t.preoperacionalesHoy;
  const r = propuesta.data;

  return (
    <Pagina>
      <Encabezado
        titulo={organizacion?.nombre ?? 'Inicio'}
        descripcion={t.nivel ? `Nivel ${NIVEL_LABEL[t.nivel].toLowerCase()} · ${t.cumplimiento.aplicables} pasos aplicables` : undefined}
        acciones={puede('gestionar_pesv') && <Link to="/pasos" className="inline-flex min-h-11 items-center rounded-lg bg-senal px-4 text-sm font-bold text-noche">Trabajar en los pasos</Link>}
      />

      {r?.cambiaNivel && r.propuesta.nivel && (
        <Tarjeta className="ring-senal">
          <Subtitulo>Tu nivel cambiaría a {NIVEL_LABEL[r.propuesta.nivel].toLowerCase()}</Subtitulo>
          <p className="text-sm text-tinta">
            La clasificación vigente es {NIVEL_LABEL[r.vigente.nivel].toLowerCase()} ({r.vigente.vehiculos} vehículos y {r.vigente.conductores} conductores).
            Con lo registrado en la plataforma ({r.registrados.vehiculos} vehículos y {r.registrados.conductores} conductores) aplicarían {r.propuesta.pasosAplicables.length} pasos.
            Al reclasificar se abren los pasos nuevos y no se borra ninguna evidencia.
          </p>
          <Aviso error={reclasificar.error} />
          {puede('gestionar_pesv') && (
            <Boton className="self-start" cargando={reclasificar.isPending} onClick={() => reclasificar.mutate(undefined)}>
              Reclasificar a nivel {NIVEL_LABEL[r.propuesta.nivel].toLowerCase()}
            </Boton>
          )}
        </Tarjeta>
      )}

      <section aria-label="Indicadores clave" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cifra
          etiqueta="Cumplimiento PESV"
          valor={`${t.cumplimiento.porcentajeCumplimiento} %`}
          barra={t.cumplimiento.porcentajeCumplimiento}
          detalle={`${t.cumplimiento.hechos} de ${t.cumplimiento.aplicables} pasos completos${t.iso ? ` · ISO 39001: ${t.iso.porcentaje} %` : ''}`}
        />
        <Cifra
          etiqueta="Preoperacionales de hoy"
          valor={<>{p.realizados} <span className="text-lg font-semibold text-gris">de {p.esperados}</span></>}
          barra={p.esperados ? (p.realizados / p.esperados) * 100 : 0}
          detalle={p.fallasCriticas ? <span className="font-semibold text-alerta">{p.fallasCriticas} con falla crítica</span> : `${p.esperados - p.realizados} sin reportar`}
        />
        <Cifra
          etiqueta="Flota"
          valor={t.flota.vehiculos}
          detalle={t.flota.noAptos ? <span className="font-semibold text-alerta">{t.flota.noAptos} no aptos para operar</span> : `${t.flota.conductoresActivos} conductores activos`}
        />
        <Cifra
          etiqueta="Evidencias por revisar"
          valor={t.evidenciasPorRevisar}
          detalle={t.evidenciasPorRevisar ? 'Esperan aprobación del líder PESV' : 'Nada pendiente de revisión'}
        />
      </section>

      {gestion.data && <TableroGestion g={gestion.data} />}

      <Tarjeta>
        <Subtitulo acciones={<Link to="/flota" className="text-sm font-semibold text-[#1d4e89] underline-offset-4 hover:underline">Ver flota y conductores</Link>}>
          Alertas activas {t.totalAlertas > t.alertas.length && <span className="text-sm font-semibold text-gris">({t.totalAlertas})</span>}
        </Subtitulo>
        {t.alertas.length === 0 ? (
          <Vacio titulo="Sin alertas">Los documentos de vehículos y conductores están al día.</Vacio>
        ) : (
          <ul className="flex flex-col">
            {t.alertas.map((a) => (
              <li key={`${a.entidadId}-${a.titulo}`} className="flex flex-wrap items-center gap-3 border-t border-linea py-3 first:border-t-0">
                <span aria-hidden="true" className={`size-2.5 rounded-full ${a.severidad === 'critica' ? 'bg-alerta' : 'bg-senal'}`} />
                <span className="flex min-w-0 flex-[1_1_16rem] flex-col">
                  <span className="text-sm font-semibold">{a.titulo}</span>
                  <span className="text-[13px] text-gris">{a.detalle}</span>
                </span>
                <Insignia tono={a.severidad === 'critica' ? 'peligro' : 'aviso'}>{a.severidad === 'critica' ? 'Urgente' : 'Próximo'}</Insignia>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </Pagina>
  );
}

interface Gestion {
  anio: number;
  porFase: { fase: 'planear' | 'hacer' | 'verificar' | 'actuar'; aplicables: number; hechos: number; enCurso: number }[];
  siguientes: { numero: number; nombre: string; estado: string; habilita: number; evidencias: number }[];
  bloqueados: number;
  planTrabajo: { cumplimiento: number | null; ejecucion: number | null; atrasadas: number; actividades: number; porMes: { programados: number; ejecutados: number }[] };
  formacion: { cumplimiento: number | null; cobertura: number | null; eficacia: number | null };
  indicadores: { total: number; cumplen: number; enRiesgo: number; noCumplen: number; sinDato: number; porAnalizar: number };
  acciones: { abiertas: number; vencidas: number; porVencer: number; cumplimientoATiempo: number | null; hallazgosAbiertos: number };
  riesgos: { total: number; criticos: number; criticosSinMedida: number };
  documentos: { tienePolitica: boolean; vigentes: number; enRevision: number; porRevisar: number };
}

const enlace = 'text-sm font-semibold text-[#1d4e89] underline-offset-4 hover:underline';

/** Gestión del PESV: avance por fase, lo que sigue y el estado de los planes conectados. */
function TableroGestion({ g }: { g: Gestion }) {
  const pendientes = [
    !g.documentos.tienePolitica && { texto: 'No hay una política de seguridad vial aprobada', ruta: '/documentos' },
    g.riesgos.criticosSinMedida > 0 && { texto: `${g.riesgos.criticosSinMedida} riesgo(s) crítico(s) sin medidas de intervención`, ruta: '/matriz-riesgos' },
    g.acciones.vencidas > 0 && { texto: `${g.acciones.vencidas} acción(es) vencida(s) en el plan de acción`, ruta: '/acciones' },
    g.planTrabajo.atrasadas > 0 && { texto: `${g.planTrabajo.atrasadas} actividad(es) del plan de trabajo con meses vencidos`, ruta: '/plan-trabajo' },
    g.indicadores.porAnalizar > 0 && { texto: `${g.indicadores.porAnalizar} resultado(s) de indicadores sin análisis`, ruta: '/indicadores' },
    g.acciones.hallazgosAbiertos > 0 && { texto: `${g.acciones.hallazgosAbiertos} hallazgo(s) abierto(s) en los pasos`, ruta: '/pasos' },
    g.documentos.porRevisar > 0 && { texto: `${g.documentos.porRevisar} documento(s) con más de un año sin revisión`, ruta: '/documentos' },
  ].filter((x): x is { texto: string; ruta: string } => !!x);
  const conProgramacion = g.planTrabajo.porMes.some((m) => m.programados > 0);
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta>
          <Subtitulo acciones={<Link to="/pasos" className={enlace}>Ver pasos</Link>}>Avance por fase</Subtitulo>
          {g.porFase.filter((f) => f.aplicables > 0).map((f) => (
            <Avance
              key={f.fase}
              etiqueta={FASES_PHVA.find((x) => x.id === f.fase)!.nombre}
              valor={(f.hechos / f.aplicables) * 100}
              detalle={`${f.hechos} de ${f.aplicables} pasos hechos${f.enCurso ? ` · ${f.enCurso} en curso` : ''}`}
            />
          ))}
        </Tarjeta>
        <Tarjeta>
          <Subtitulo>Siguientes pasos</Subtitulo>
          {g.siguientes.length === 0 ? (
            <p className="text-sm text-gris">Todos los pasos aplicables están hechos o esperan prerrequisitos.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {g.siguientes.map((p) => (
                <li key={p.numero}>
                  <Link to={`/pasos/${p.numero}`} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-papel">
                    <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-noche text-xs font-bold text-white">{p.numero}</span>
                    <span className="min-w-0 text-sm">
                      <span className="font-semibold text-noche">{p.nombre}</span>
                      <span className="block text-[12px] text-gris">{p.estado === 'en_curso' ? 'En curso' : 'Pendiente'}{p.habilita ? ` · habilita ${p.habilita} paso(s)` : ''}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {g.bloqueados > 0 && <p className="text-[12px] text-gris">{g.bloqueados} paso(s) esperan que se cierren sus prerrequisitos.</p>}
        </Tarjeta>
        <Tarjeta>
          <Subtitulo>Requiere atención</Subtitulo>
          {pendientes.length === 0 ? (
            <p className="text-sm text-gris">Nada pendiente en los planes conectados.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pendientes.map((p) => (
                <li key={p.texto} className="flex items-start gap-2 text-sm">
                  <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-alerta" />
                  <Link to={p.ruta} className="text-tinta underline-offset-2 hover:underline">{p.texto}</Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cifra etiqueta={`Plan de trabajo ${g.anio}`} valor={g.planTrabajo.cumplimiento == null ? '—' : `${g.planTrabajo.cumplimiento} %`} barra={g.planTrabajo.cumplimiento ?? undefined} detalle={g.planTrabajo.actividades ? `Cumplimiento a la fecha · ${g.planTrabajo.actividades} actividades` : <Link to="/plan-trabajo" className={enlace}>Programar el plan</Link>} />
        <Cifra etiqueta="Formación de conductores" valor={g.formacion.cobertura == null ? '—' : `${g.formacion.cobertura} %`} barra={g.formacion.cobertura ?? undefined} detalle={`Cobertura del año${g.formacion.eficacia != null ? ` · eficacia ${g.formacion.eficacia} %` : ''}`} />
        <div className="flex flex-col gap-2.5 rounded-2xl bg-white p-6 ring-1 ring-linea">
          <p className="text-sm font-semibold text-gris">Indicadores</p>
          {g.indicadores.total === 0 ? (
            <Link to="/indicadores" className={enlace}>Cargar los indicadores sugeridos</Link>
          ) : (
            <>
              <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
                {(['cumple', 'en_riesgo', 'no_cumple'] as const).map((e) => {
                  const n = e === 'cumple' ? g.indicadores.cumplen : e === 'en_riesgo' ? g.indicadores.enRiesgo : g.indicadores.noCumplen;
                  return n ? <div key={e} style={{ flexGrow: n, background: ESTADOS_INDICADOR[e].color }} /> : null;
                })}
                {g.indicadores.sinDato ? <div style={{ flexGrow: g.indicadores.sinDato, background: '#e2e5ea' }} /> : null}
              </div>
              <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-[13px]">
                <li><strong>{g.indicadores.cumplen}</strong> cumplen</li>
                <li><strong>{g.indicadores.enRiesgo}</strong> en riesgo</li>
                <li><strong>{g.indicadores.noCumplen}</strong> no cumplen</li>
                <li><strong>{g.indicadores.sinDato}</strong> sin dato</li>
              </ul>
            </>
          )}
        </div>
        <Cifra
          etiqueta="Plan de acción"
          valor={g.acciones.abiertas}
          detalle={g.acciones.vencidas ? <span className="font-semibold text-alerta">{g.acciones.vencidas} vencidas · {g.acciones.porVencer} por vencer</span> : `abiertas · ${g.acciones.porVencer} vencen pronto`}
        />
      </div>

      {conProgramacion && (
        <Tarjeta>
          <GraficaBarras
            titulo={`Plan de trabajo ${g.anio}: programado y ejecutado`}
            categorias={[...MESES]}
            series={[{ nombre: 'Programadas', valores: g.planTrabajo.porMes.map((m) => m.programados) }, { nombre: 'Ejecutadas', valores: g.planTrabajo.porMes.map((m) => m.ejecutados) }]}
            enteros
            formato={(v) => String(Math.round(v))}
            ancho={900}
          />
        </Tarjeta>
      )}
    </>
  );
}
