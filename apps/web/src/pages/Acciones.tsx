import { useState } from 'react';
import { AreaTexto, Aviso, Boton, Cargando, Encabezado, Insignia, Pagina, Pestanas, Tarjeta, Vacio, fecha } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import { NuevaAccion } from './Siniestros';

export interface Accion {
  id: string;
  origen: 'comite' | 'siniestro' | 'auditoria' | 'hallazgo' | 'manual';
  tipo: string;
  descripcion: string;
  responsable: string;
  venceEl: string;
  estado: 'abierta' | 'cerrada';
  vencida: boolean;
  notaCierre: string | null;
}

const ORIGEN = { comite: 'Comité', siniestro: 'Siniestro', auditoria: 'Auditoría', hallazgo: 'Hallazgo', manual: 'Plan de mejora' } as const;

export function ListaAcciones({ acciones }: { acciones: Accion[] }) {
  const { puede } = useSesion();
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const cerrar = useAccion((id: string) => api.post(`/org/acciones/${id}/cerrar`, { nota }), { alTerminar: () => { setCerrando(null); setNota(''); } });
  if (!acciones.length) return <Vacio titulo="Sin acciones registradas" />;
  return (
    <ul className="flex flex-col">
      {acciones.map((a) => (
        <li key={a.id} className="flex flex-col gap-2 border-t border-linea py-3 first:border-t-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{a.descripcion}</span>
            <Insignia>{ORIGEN[a.origen]}</Insignia>
            {a.estado === 'cerrada' ? <Insignia tono="exito">Cerrada</Insignia> : a.vencida ? <Insignia tono="peligro">Vencida</Insignia> : <Insignia tono="aviso">Abierta</Insignia>}
          </div>
          <p className="text-[13px] text-gris">Responsable: {a.responsable} · fecha límite {fecha(a.venceEl)}{a.notaCierre ? ` · cierre: ${a.notaCierre}` : ''}</p>
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
      ))}
    </ul>
  );
}

export function Acciones() {
  const { puede } = useSesion();
  const [estado, setEstado] = useState<'abierta' | 'cerrada'>('abierta');
  const acciones = useConsulta<Accion[]>(['acciones', estado], `/org/acciones?estado=${estado}`);
  return (
    <Pagina ancho="max-w-4xl">
      <Encabezado titulo="Acciones y compromisos" descripcion="Compromisos del comité, acciones de siniestros y de auditoría, y planes de mejora (paso 23), con responsable y fecha límite." />
      <Pestanas valor={estado} alCambiar={setEstado} opciones={[{ id: 'abierta', nombre: 'Abiertas' }, { id: 'cerrada', nombre: 'Cerradas' }]} />
      {puede('gestionar_pesv') && estado === 'abierta' && (
        <Tarjeta>
          <p className="font-bold text-noche">Nueva acción de mejora</p>
          <NuevaAccion ruta="/org/acciones" tipoPorDefecto="mejora" />
        </Tarjeta>
      )}
      <Tarjeta>{acciones.isPending ? <Cargando /> : <ListaAcciones acciones={acciones.data ?? []} />}</Tarjeta>
      <Aviso error={acciones.error} />
    </Pagina>
  );
}
