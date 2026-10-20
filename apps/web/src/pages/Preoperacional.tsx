import type { InspeccionInput, ItemInspeccion } from '@pesv/shared';
import { useCallback, useEffect, useState } from 'react';
import { Aviso, Boton, Campo, Cargando, Encabezado, Insignia, Pagina, Tarjeta, Vacio } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { Vehiculo } from '../lib/tipos';

const CLAVE_COLA = 'pesv.colaPreoperacionales';
interface Pendiente {
  orgId: string;
  datos: InspeccionInput;
  placa: string;
}

function leerCola(): Pendiente[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_COLA) ?? '[]') as Pendiente[];
  } catch {
    return [];
  }
}
function guardarCola(cola: Pendiente[]) {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
  } catch {
    // Sin almacenamiento: el envío sin conexión no está disponible en este navegador.
  }
}

/** Envía los preoperacionales guardados sin conexión. El servidor descarta los repetidos. */
async function enviarCola(orgId: string): Promise<number> {
  const cola = leerCola();
  let enviados = 0;
  const quedan: Pendiente[] = [];
  for (const p of cola) {
    if (p.orgId !== orgId) {
      quedan.push(p);
      continue;
    }
    try {
      await api.post('/org/inspecciones', p.datos);
      enviados++;
    } catch (e) {
      // Sin conexión: se intenta más tarde. Un error del servidor (datos inválidos) se descarta.
      if (e instanceof ApiError && e.status === 0) quedan.push(p);
    }
  }
  guardarCola(quedan);
  return enviados;
}

const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function Preoperacional() {
  const { organizacion } = useSesion();
  const vehiculos = useConsulta<Vehiculo[]>(['vehiculos'], '/org/vehiculos');
  const [vehiculoId, setVehiculoId] = useState('');
  const [enCola, setEnCola] = useState(() => leerCola().length);
  const [aviso, setAviso] = useState<string | null>(null);

  const sincronizar = useCallback(async () => {
    if (!organizacion) return;
    const n = await enviarCola(organizacion.id);
    setEnCola(leerCola().length);
    if (n) setAviso(`Se enviaron ${n} preoperacional(es) que estaban guardados sin conexión.`);
  }, [organizacion]);

  // Al abrir la pantalla y cada vez que vuelve la conexión, se intenta vaciar la cola.
  useEffect(() => {
    const alInicio = setTimeout(sincronizar, 0);
    window.addEventListener('online', sincronizar);
    return () => {
      clearTimeout(alInicio);
      window.removeEventListener('online', sincronizar);
    };
  }, [sincronizar]);

  if (vehiculos.isPending) return <Cargando />;
  const disponibles = (vehiculos.data ?? []).filter((v) => v.estado !== 'inactivo');
  const vehiculo = disponibles.find((v) => v.id === vehiculoId);

  return (
    <Pagina ancho="max-w-2xl">
      <Encabezado titulo="Preoperacional" descripcion="Revisa el vehículo antes de salir. Si no hay señal, se guarda en el celular y se envía cuando vuelva." />
      {enCola > 0 && <Aviso tono="info">{enCola} preoperacional(es) esperando conexión para enviarse.</Aviso>}
      {aviso && <Aviso tono="exito">{aviso}</Aviso>}
      <Aviso error={vehiculos.error} />
      {disponibles.length === 0 ? (
        <Vacio titulo="No hay vehículos registrados">Pide al líder PESV o a mantenimiento que registre la flota.</Vacio>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Vehículo
          <select value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)} className="h-12 rounded-lg border border-[#d5dae1] bg-white px-3 text-[15px] font-normal">
            <option value="">Elige el vehículo</option>
            {disponibles.map((v) => (
              <option key={v.id} value={v.id}>{v.placa}{v.estado === 'no_apto' ? ' (no apto)' : ''}</option>
            ))}
          </select>
        </label>
      )}
      {vehiculo && (
        <Lista
          key={vehiculo.id}
          vehiculo={vehiculo}
          alEnviar={(m) => {
            setAviso(m);
            setVehiculoId('');
            setEnCola(leerCola().length);
          }}
        />
      )}
    </Pagina>
  );
}

function Lista({ vehiculo, alEnviar }: { vehiculo: Vehiculo; alEnviar: (mensaje: string) => void }) {
  const { organizacion } = useSesion();
  const plantilla = useConsulta<{ plantilla: { id: string; nombre: string; items: ItemInspeccion[] } }>(['plantilla', vehiculo.id], `/org/inspecciones/plantilla/${vehiculo.id}`, { staleTime: Infinity });
  const [respuestas, setRespuestas] = useState<Record<string, { ok: boolean; nota?: string }>>({});
  const [odometro, setOdometro] = useState('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (plantilla.isPending) return <Cargando texto="Cargando la lista de chequeo…" />;
  if (plantilla.error) return <Aviso error={plantilla.error} />;
  const items = plantilla.data!.plantilla.items;
  const completos = items.every((i) => respuestas[i.codigo] !== undefined);
  const fallaCritica = items.some((i) => i.critico && respuestas[i.codigo]?.ok === false);

  const enviar = async () => {
    const datos: InspeccionInput = {
      vehiculoId: vehiculo.id,
      odometroKm: odometro ? Number(odometro) : null,
      items: items.map((i) => ({ codigo: i.codigo, ok: respuestas[i.codigo]!.ok, nota: respuestas[i.codigo]!.nota || undefined })),
      notas: notas || undefined,
      clientId: nuevoId(),
      realizadaEn: new Date().toISOString(),
    };
    setEnviando(true);
    setError(null);
    try {
      await api.post('/org/inspecciones', datos);
      alEnviar(fallaCritica ? `Preoperacional enviado. ${vehiculo.placa} quedó no apto: avisamos a mantenimiento.` : `Preoperacional de ${vehiculo.placa} enviado.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0 && organizacion) {
        guardarCola([...leerCola(), { orgId: organizacion.id, datos, placa: vehiculo.placa }]);
        alEnviar(`Sin conexión: el preoperacional de ${vehiculo.placa} quedó guardado y se enviará al volver la señal.`);
      } else setError(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xl font-extrabold text-noche">{vehiculo.placa}</p>
        <Insignia>{plantilla.data!.plantilla.nombre}</Insignia>
      </div>
      <Campo id="odometro" etiqueta="Kilometraje actual" type="number" inputMode="numeric" value={odometro} onChange={(e) => setOdometro(e.target.value)} />
      <ul className="flex flex-col">
        {items.map((i) => {
          const r = respuestas[i.codigo];
          return (
            <li key={i.codigo} className="flex flex-col gap-2 border-t border-linea py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold">
                  {i.nombre}
                  {i.critico && <span className="sr-only"> (ítem crítico)</span>}
                </span>
                <span className="flex shrink-0 gap-1.5" role="group" aria-label={i.nombre}>
                  <button
                    type="button"
                    aria-pressed={r?.ok === true}
                    onClick={() => setRespuestas((p) => ({ ...p, [i.codigo]: { ok: true } }))}
                    className="h-11 min-w-16 rounded-lg text-sm font-bold ring-1 ring-[#d5dae1] aria-pressed:bg-via-suave aria-pressed:text-via aria-pressed:ring-via/40"
                  >
                    Bien
                  </button>
                  <button
                    type="button"
                    aria-pressed={r?.ok === false}
                    onClick={() => setRespuestas((p) => ({ ...p, [i.codigo]: { ok: false, nota: p[i.codigo]?.nota } }))}
                    className="h-11 min-w-16 rounded-lg text-sm font-bold ring-1 ring-[#d5dae1] aria-pressed:bg-alerta-suave aria-pressed:text-alerta aria-pressed:ring-alerta/40"
                  >
                    Falla
                  </button>
                </span>
              </div>
              {r?.ok === false && (
                <input
                  aria-label={`Describe la falla en ${i.nombre}`}
                  placeholder="Describe la falla"
                  value={r.nota ?? ''}
                  onChange={(e) => setRespuestas((p) => ({ ...p, [i.codigo]: { ok: false, nota: e.target.value } }))}
                  className="h-11 rounded-lg border border-[#d5dae1] px-3 text-sm"
                />
              )}
            </li>
          );
        })}
      </ul>
      <Campo id="notas" etiqueta="Observaciones (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
      {fallaCritica && <Aviso>Hay una falla en un ítem crítico: el vehículo quedará no apto hasta que mantenimiento la cierre.</Aviso>}
      <Aviso error={error} />
      <Boton className="h-12 text-[15px]" disabled={!completos} cargando={enviando} onClick={enviar}>
        {completos ? 'Enviar preoperacional' : `Faltan ${items.filter((i) => !respuestas[i.codigo]).length} ítems por revisar`}
      </Boton>
    </Tarjeta>
  );
}
