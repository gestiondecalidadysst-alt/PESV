import { FASE_LABEL, PASOS_PESV, pasosQueDependenDe, siguientesPasos, type EstadoPaso } from '@pesv/shared';
import { Link } from 'react-router';
import { CuadriculaPasos } from '../components/CuadriculaPasos';
import { Aviso, Cargando, Encabezado, Insignia, Pagina, Tabla, Tarjeta, td, th } from '../components/ui';
import { useConsulta } from '../lib/consultas';
import type { DetalleOrganizacion, EstadoDePaso } from '../lib/tipos';

export const TEXTO_ESTADO: Record<EstadoPaso, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  hecho: 'Hecho',
  no_aplica: 'No aplica',
};
export const TONO_ESTADO = { pendiente: 'neutro', en_curso: 'aviso', hecho: 'exito', no_aplica: 'neutro' } as const;

export function Pasos() {
  const pasos = useConsulta<EstadoDePaso[]>(['pasos'], '/org/pasos');
  const detalle = useConsulta<DetalleOrganizacion>(['detalle'], '/org');
  if (pasos.isPending) return <Cargando />;
  if (pasos.error) return <Aviso error={pasos.error} />;
  const lista = pasos.data!;
  const estados = Object.fromEntries(lista.map((p) => [p.numero, p.estado]));
  const siguientes = siguientesPasos(estados, pasosQueDependenDe).slice(0, 6);
  const resumen = detalle.data?.resumen;

  return (
    <Pagina>
      <Encabezado
        titulo="Los 24 pasos"
        descripcion={
          <>
            {resumen ? `${resumen.hechos} de ${resumen.aplicables} pasos aplicables completos. ` : ''}
            Un paso queda hecho cuando tiene al menos una evidencia aprobada, sus prerrequisitos están cerrados y no tiene no conformidades abiertas.{' '}
            <Link to="/norma" className="font-semibold text-[#1d4e89] underline-offset-4 hover:underline">Ver la norma y su relación con ISO 39001</Link>
          </>
        }
      />
      <Tarjeta>
        <CuadriculaPasos estados={estados} enlace={(n) => `/pasos/${n}`} />
      </Tarjeta>
      {siguientes.length > 0 && (
        <Tarjeta>
          <p className="font-bold text-noche">Siguientes pasos recomendados</p>
          <p className="-mt-2 text-sm text-gris">Sus prerrequisitos ya están cerrados. Primero los que habilitan más pasos.</p>
          <ol className="flex flex-wrap gap-2">
            {siguientes.map((n) => (
              <li key={n}>
                <Link to={`/pasos/${n}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-papel px-3 text-sm font-semibold text-noche ring-1 ring-linea hover:ring-noche/40">
                  <span className="text-[#1d4e89]">{n}</span> {PASOS_PESV.find((p) => p.numero === n)?.nombre}
                </Link>
              </li>
            ))}
          </ol>
        </Tarjeta>
      )}
      <Tabla>
        <thead>
          <tr>
            <th className={th}>Paso</th>
            <th className={th}>Fase</th>
            <th className={th}>Estado</th>
            <th className={th}>Requisitos</th>
            <th className={th}>Evidencias</th>
            <th className={th}>Requiere</th>
            <th className={th}>Hallazgos y acciones</th>
            <th className={th}>ISO 39001</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.numero} className={p.estado === 'no_aplica' ? 'text-gris' : ''}>
              <td className={td}>
                {p.estado === 'no_aplica' ? (
                  <span><strong className="mr-2">{p.numero}</strong>{p.nombre}</span>
                ) : (
                  <Link to={`/pasos/${p.numero}`} className="font-semibold text-noche underline-offset-4 hover:underline">
                    <strong className="mr-2">{p.numero}</strong>{p.nombre}
                  </Link>
                )}
              </td>
              <td className={td}>{FASE_LABEL[p.fase]}</td>
              <td className={td}><Insignia tono={TONO_ESTADO[p.estado]}>{TEXTO_ESTADO[p.estado]}</Insignia></td>
              <td className={td}>
                {p.estado === 'no_aplica' ? '—' : p.requisitos?.total ? (
                  <span className={`whitespace-nowrap text-[13px] tabular-nums ${p.requisitos.completo ? 'text-via' : ''}`}>{p.requisitos.cumplen} de {p.requisitos.total}</span>
                ) : <span className="text-[13px] text-gris">Por cargar</span>}
              </td>
              <td className={td}>
                {p.estado === 'no_aplica'
                  ? '—'
                  : `${p.evidencias.aprobadas} aprobadas${p.evidencias.enRevision ? `, ${p.evidencias.enRevision} en revisión` : ''}`}
              </td>
              <td className={td}>
                {p.estado === 'no_aplica' || p.prerrequisitos.length === 0 ? '—' : p.prerrequisitosPendientes.length ? <Insignia tono="aviso">Espera {p.prerrequisitosPendientes.join(', ')}</Insignia> : <span className="text-[13px] text-via">Listo</span>}
              </td>
              <td className={td}>
                {p.hallazgosAbiertos || p.accionesAbiertas ? (
                  <span className="text-[13px]">
                    {p.hallazgosAbiertos ? <span className={p.noConformidadesAbiertas ? 'font-semibold text-alerta' : ''}>{p.hallazgosAbiertos} hallazgo(s)</span> : null}
                    {p.hallazgosAbiertos && p.accionesAbiertas ? ' · ' : ''}
                    {p.accionesAbiertas ? <span className={p.accionesVencidas ? 'font-semibold text-alerta' : ''}>{p.accionesAbiertas} acción(es){p.accionesVencidas ? `, ${p.accionesVencidas} vencida(s)` : ''}</span> : null}
                  </span>
                ) : '—'}
              </td>
              <td className={td}>{p.clausulasIso.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </Pagina>
  );
}
