import { NIVEL_LABEL } from '@pesv/shared';
import { Link, Navigate } from 'react-router';
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
          detalle={`${t.cumplimiento.hechos} de ${t.cumplimiento.aplicables} pasos completos`}
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
