import { ESTADOS_REQUISITO } from '@pesv/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { RequisitoEvaluado, ResumenRequisitos } from '../lib/tipos';
import { AreaTexto, Aviso, Boton, Cargando, Insignia, Selector, Subtitulo, Tarjeta } from './ui';

interface Respuesta {
  paso: number;
  resumen: ResumenRequisitos;
  requisitos: RequisitoEvaluado[];
  evidenciasAprobadas: { id: string; titulo: string; aprobadaEl: string | null }[];
}

const COMO: Record<RequisitoEvaluado['verificacion'], string> = {
  dato: 'Se verifica con los datos',
  documento: 'Documento controlado',
  registro: 'Verificación del líder',
};

/** Requisitos de la Res. 40595 para el paso, con su estado y la verificación manual cuando aplica. */
export function RequisitosPaso({ numero }: { numero: number }) {
  const consulta = useConsulta<Respuesta>(['requisitos', numero], `/org/pasos/${numero}/requisitos`);
  if (consulta.isPending) return <Tarjeta><Cargando /></Tarjeta>;
  if (!consulta.data) return <Aviso error={consulta.error} />;
  const { resumen, requisitos, evidenciasAprobadas } = consulta.data;
  return (
    <Tarjeta>
      <Subtitulo acciones={resumen.total ? <span className="text-sm font-semibold tabular-nums text-gris">{resumen.cumplen} de {resumen.total} cumplen</span> : undefined}>
        Requisitos de la Resolución 40595
      </Subtitulo>
      {!requisitos.length ? (
        <p className="text-sm text-gris">Los requisitos de este paso aún se están cotejando con el texto oficial. Mientras tanto, el paso se cierra con al menos una evidencia aprobada.</p>
      ) : (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-[#e8edf3]" role="img" aria-label={`${resumen.porcentaje ?? 0} % de los requisitos cumplen`}>
            <div className="h-full rounded-full bg-via" style={{ width: `${resumen.porcentaje ?? 0}%` }} />
          </div>
          <ul className="flex flex-col">
            {requisitos.map((r) => (
              <FilaRequisito key={r.id} requisito={r} numero={numero} evidencias={evidenciasAprobadas} />
            ))}
          </ul>
          <p className="text-[13px] text-gris">El paso solo se puede marcar como hecho cuando todos sus requisitos cumplen.</p>
        </>
      )}
    </Tarjeta>
  );
}

function FilaRequisito({ requisito: r, numero, evidencias }: { requisito: RequisitoEvaluado; numero: number; evidencias: Respuesta['evidenciasAprobadas'] }) {
  const { puede } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<'cumple' | 'no_cumple'>('cumple');
  const [nota, setNota] = useState('');
  const [evidenciaId, setEvidenciaId] = useState('');
  const verificar = useAccion(() => api.post(`/org/pasos/${numero}/requisitos/${r.id}`, { estado, nota, evidenciaId: evidenciaId || null }), {
    alTerminar: () => {
      setAbierto(false);
      setNota('');
    },
  });
  const tono = ESTADOS_REQUISITO[r.estado];
  return (
    <li className="flex flex-col gap-1.5 border-t border-linea py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm">
          <span className="mr-1.5 font-semibold tabular-nums text-gris">{r.id}</span>
          {r.texto}
        </p>
        <Insignia tono={tono.tono}>{tono.nombre}</Insignia>
      </div>
      <p className="text-[13px] text-gris">
        {r.cita} · {COMO[r.verificacion]}
        {r.criterio ? ` · Criterio: ${r.criterio}` : ''}
        {r.vigenciaMeses ? ` · Vigencia de ${r.vigenciaMeses} meses` : ''}
      </p>
      <p className={`text-[13px] ${r.estado === 'cumple' ? 'text-via' : r.estado === 'no_cumple' ? 'text-alerta' : 'text-tinta'}`}>{r.detalle}</p>
      {r.verificado?.nota && <p className="text-[13px] text-gris">Nota: {r.verificado.nota}{r.verificado.evidencia ? ` · Soporte: ${r.verificado.evidencia}` : ''}</p>}
      {r.porValidar && <p className="text-[13px] text-[#8A5A00]">Por validar: {r.porValidar}</p>}
      <div className="flex flex-wrap gap-3">
        {r.ruta && r.estado !== 'cumple' && (
          <Link to={r.ruta} className="text-sm font-semibold text-[#1d4e89] underline-offset-4 hover:underline">Ir a cumplirlo</Link>
        )}
        {r.verificacion === 'registro' && puede('gestionar_pesv') && !abierto && (
          <Boton variante="texto" className="!min-h-0 !px-0" onClick={() => setAbierto(true)}>{r.verificado ? 'Actualizar verificación' : 'Verificar'}</Boton>
        )}
      </div>
      {abierto && (
        <div className="mt-1 flex flex-col gap-3 rounded-lg bg-[#f5f7fa] p-3">
          <Selector id={`est-${r.id}`} etiqueta="Resultado" value={estado} onChange={(e) => setEstado(e.target.value as 'cumple' | 'no_cumple')}>
            <option value="cumple">Cumple</option>
            <option value="no_cumple">No cumple</option>
          </Selector>
          {estado === 'cumple' && (
            evidencias.length ? (
              <Selector id={`ev-${r.id}`} etiqueta="Evidencia aprobada que lo soporta" value={evidenciaId} onChange={(e) => setEvidenciaId(e.target.value)}>
                <option value="">Elige una evidencia</option>
                {evidencias.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}
              </Selector>
            ) : (
              <p className="text-sm text-alerta">Sube y aprueba primero la evidencia que soporta este requisito (más abajo, en Evidencias).</p>
            )
          )}
          <AreaTexto id={`nota-${r.id}`} etiqueta={estado === 'cumple' ? '¿Cómo se cumple?' : '¿Qué falta?'} value={nota} onChange={(e) => setNota(e.target.value)} />
          <div className="flex gap-2">
            <Boton cargando={verificar.isPending} disabled={nota.trim().length < 3 || (estado === 'cumple' && !evidenciaId)} onClick={() => verificar.mutate(undefined)}>Guardar</Boton>
            <Boton variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Boton>
          </div>
          <Aviso error={verificar.error} />
        </div>
      )}
    </li>
  );
}
