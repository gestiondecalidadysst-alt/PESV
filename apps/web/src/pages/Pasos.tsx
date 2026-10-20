import { FASE_LABEL, type EstadoPaso } from '@pesv/shared';
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
  const resumen = detalle.data?.resumen;

  return (
    <Pagina>
      <Encabezado
        titulo="Los 24 pasos"
        descripcion={
          <>
            {resumen ? `${resumen.hechos} de ${resumen.aplicables} pasos aplicables completos. ` : ''}
            Un paso queda hecho cuando tiene al menos una evidencia aprobada.{' '}
            <Link to="/norma" className="font-semibold text-[#1d4e89] underline-offset-4 hover:underline">Ver la norma y su relación con ISO 39001</Link>
          </>
        }
      />
      <Tarjeta>
        <CuadriculaPasos estados={estados} enlace={(n) => `/pasos/${n}`} />
      </Tarjeta>
      <Tabla>
        <thead>
          <tr>
            <th className={th}>Paso</th>
            <th className={th}>Fase</th>
            <th className={th}>Estado</th>
            <th className={th}>Evidencias</th>
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
                {p.estado === 'no_aplica'
                  ? '—'
                  : `${p.evidencias.aprobadas} aprobadas${p.evidencias.enRevision ? `, ${p.evidencias.enRevision} en revisión` : ''}`}
              </td>
              <td className={td}>{p.clausulasIso.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </Pagina>
  );
}
