import { zodResolver } from '@hookform/resolvers/zod';
import { rutaSchema, viajeSchema, type RutaInput, type ViajeInput } from '@pesv/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Casilla, Cifra, Encabezado, Insignia, Pagina, Pestanas, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fechaHora, td, th } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { Conductor, Vehiculo } from '../lib/tipos';

interface Ruta {
  id: string;
  nombre: string;
  origen: string;
  destino: string;
  distanciaKm: number;
  viajesPorMes: number;
  limiteVelocidad: number | null;
  notasRiesgo: string | null;
  activa: boolean;
}
interface Viaje {
  id: string;
  salida: string;
  llegada: string | null;
  distanciaKm: number | null;
  velocidadMaxima: number | null;
  excesoVelocidad: boolean;
  excesoJornada: boolean;
  origen: 'manual' | 'telematica' | 'n8n';
  estado: 'programado' | 'en_curso' | 'terminado' | 'cancelado';
  placa: string;
  conductor: string;
  ruta: string | null;
}

const aIso = (v: string) => (v ? new Date(v).toISOString() : null);
const numero = (v: string) => (v === '' ? null : Number(v));

export function Desplazamientos() {
  const [pestana, setPestana] = useState<'viajes' | 'rutas'>('viajes');
  return (
    <Pagina>
      <Encabezado
        titulo="Desplazamientos"
        descripcion="Rutas habituales con su análisis de riesgo (paso 17) y viajes laborales. No se asigna un viaje a un conductor o vehículo con documentos vencidos o un preoperacional no apto."
      />
      <Pestanas valor={pestana} alCambiar={setPestana} opciones={[{ id: 'viajes', nombre: 'Viajes' }, { id: 'rutas', nombre: 'Rutas' }]} />
      {pestana === 'viajes' ? <Viajes /> : <Rutas />}
    </Pagina>
  );
}

function Viajes() {
  const { puede } = useSesion();
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const viajes = useConsulta<Viaje[]>(['viajes', mes], `/org/viajes?mes=${mes}`);
  const [registrando, setRegistrando] = useState(false);
  const [terminando, setTerminando] = useState<string | null>(null);
  const lista = viajes.data ?? [];
  const km = lista.reduce((t, v) => t + (v.distanciaKm ?? 0), 0);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Campo id="mes" etiqueta="Mes" type="month" className="max-w-48" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        {puede('gestionar_flota') && !registrando && <Boton onClick={() => setRegistrando(true)}>Registrar viaje</Boton>}
      </div>
      {registrando && <FormularioViaje alTerminar={() => setRegistrando(false)} />}
      <div className="grid gap-4 sm:grid-cols-4">
        <Cifra etiqueta="Viajes" valor={lista.length} />
        <Cifra etiqueta="Kilómetros" valor={Math.round(km).toLocaleString('es-CO')} />
        <Cifra etiqueta="Con exceso de velocidad" valor={lista.filter((v) => v.excesoVelocidad).length} />
        <Cifra etiqueta="Con exceso de jornada" valor={lista.filter((v) => v.excesoJornada).length} />
      </div>
      {viajes.isPending ? <Cargando /> : lista.length ? (
        <Tabla minimo="52rem">
          <thead>
            <tr>
              <th className={th}>Salida</th>
              <th className={th}>Vehículo y conductor</th>
              <th className={th}>Ruta</th>
              <th className={th}>Km</th>
              <th className={th}>Alertas</th>
              <th className={th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((v) => (
              <tr key={v.id}>
                <td className={td}>{fechaHora(v.salida)}{v.origen !== 'manual' && <span className="block text-[13px] text-gris">Origen: {v.origen === 'telematica' ? 'GPS' : 'n8n'}</span>}</td>
                <td className={td}><strong className="text-noche">{v.placa}</strong> · {v.conductor}</td>
                <td className={td}>{v.ruta ?? '—'}</td>
                <td className={td}>{v.distanciaKm ?? '—'}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {v.excesoVelocidad && <Insignia tono="peligro">Velocidad {v.velocidadMaxima} km/h</Insignia>}
                    {v.excesoJornada && <Insignia tono="aviso">Jornada</Insignia>}
                  </div>
                </td>
                <td className={td}>
                  {v.estado === 'terminado' ? `Llegó ${fechaHora(v.llegada)}` : puede('gestionar_flota') ? (
                    terminando === v.id ? <TerminarViaje viaje={v} alTerminar={() => setTerminando(null)} /> : <Boton variante="texto" onClick={() => setTerminando(v.id)}>Registrar llegada</Boton>
                  ) : <Insignia tono="aviso">En curso</Insignia>}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio titulo="Sin viajes en este mes">Registra los desplazamientos laborales; también pueden llegar del GPS o de n8n.</Vacio>
      )}
      <Aviso error={viajes.error} />
    </>
  );
}

function FormularioViaje({ alTerminar }: { alTerminar: () => void }) {
  const rutas = useConsulta<Ruta[]>(['rutas'], '/org/rutas');
  const vehiculos = useConsulta<Vehiculo[]>(['vehiculos'], '/org/vehiculos');
  const conductores = useConsulta<Conductor[]>(['conductores'], '/org/conductores');
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof viajeSchema>, unknown, ViajeInput>({
    resolver: zodResolver(viajeSchema),
    defaultValues: { excesoJornada: false },
  });
  const crear = useAccion((d: ViajeInput) => api.post('/org/viajes', d), { alTerminar });
  return (
    <Tarjeta>
      <Subtitulo>Registrar viaje</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Selector id="v-veh" etiqueta="Vehículo" error={errors.vehiculoId?.message} {...register('vehiculoId')}>
            <option value="">Elige el vehículo</option>
            {(vehiculos.data ?? []).filter((v) => v.motorizado).map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
          </Selector>
          <Selector id="v-cond" etiqueta="Conductor" error={errors.conductorId?.message} {...register('conductorId')}>
            <option value="">Elige el conductor</option>
            {(conductores.data ?? []).filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
          <Selector id="v-ruta" etiqueta="Ruta" {...register('rutaId', { setValueAs: (v) => v || null })}>
            <option value="">Sin ruta habitual</option>
            {(rutas.data ?? []).filter((r) => r.activa).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </Selector>
          <Campo id="v-salida" etiqueta="Salida" type="datetime-local" error={errors.salida?.message} {...register('salida', { setValueAs: (v) => aIso(v) ?? '' })} />
          <Campo id="v-llegada" etiqueta="Llegada (si ya terminó)" type="datetime-local" {...register('llegada', { setValueAs: aIso })} />
          <Campo id="v-km" etiqueta="Distancia (km)" type="number" min={0} ayuda="Si eliges ruta, se toma la de la ruta." {...register('distanciaKm', { setValueAs: numero })} />
          <Campo id="v-vel" etiqueta="Velocidad máxima (km/h)" type="number" min={0} {...register('velocidadMaxima', { setValueAs: numero })} />
        </div>
        <Casilla etiqueta="El conductor excedió la jornada máxima" {...register('excesoJornada')} />
        <Aviso error={crear.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={crear.isPending}>Registrar viaje</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

function TerminarViaje({ viaje, alTerminar }: { viaje: Viaje; alTerminar: () => void }) {
  const [llegada, setLlegada] = useState('');
  const [velocidad, setVelocidad] = useState(viaje.velocidadMaxima?.toString() ?? '');
  const [jornada, setJornada] = useState(viaje.excesoJornada);
  const terminar = useAccion(
    () => api.post(`/org/viajes/${viaje.id}/terminar`, { llegada: aIso(llegada), velocidadMaxima: numero(velocidad), excesoJornada: jornada }),
    { alTerminar },
  );
  return (
    <div className="flex min-w-60 flex-col gap-2">
      <Campo id={`ll-${viaje.id}`} etiqueta="Llegada" type="datetime-local" value={llegada} onChange={(e) => setLlegada(e.target.value)} />
      <Campo id={`vm-${viaje.id}`} etiqueta="Velocidad máxima" type="number" value={velocidad} onChange={(e) => setVelocidad(e.target.value)} />
      <Casilla etiqueta="Exceso de jornada" checked={jornada} onChange={(e) => setJornada(e.target.checked)} />
      <Aviso error={terminar.error} />
      <div className="flex gap-2">
        <Boton cargando={terminar.isPending} disabled={!llegada} onClick={() => terminar.mutate(undefined)}>Guardar</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
    </div>
  );
}

function Rutas() {
  const { puede } = useSesion();
  const rutas = useConsulta<Ruta[]>(['rutas'], '/org/rutas');
  const [editando, setEditando] = useState<Ruta | 'nueva' | null>(null);
  return (
    <>
      {puede('gestionar_flota') && !editando && <Boton className="self-start" onClick={() => setEditando('nueva')}>Agregar ruta</Boton>}
      {editando && <FormularioRuta key={editando === 'nueva' ? 'nueva' : editando.id} ruta={editando === 'nueva' ? undefined : editando} alTerminar={() => setEditando(null)} />}
      {rutas.isPending ? <Cargando /> : rutas.data?.length ? (
        <Tabla minimo="48rem">
          <thead>
            <tr>
              <th className={th}>Ruta</th>
              <th className={th}>Distancia</th>
              <th className={th}>Viajes al mes</th>
              <th className={th}>Límite</th>
              <th className={th}>Riesgos de la vía</th>
              <th className={th}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {rutas.data.map((r) => (
              <tr key={r.id} className={r.activa ? '' : 'opacity-60'}>
                <td className={td}><strong className="text-noche">{r.nombre}</strong><span className="block text-[13px] text-gris">{r.origen} → {r.destino}</span></td>
                <td className={td}>{r.distanciaKm} km</td>
                <td className={td}>{r.viajesPorMes}</td>
                <td className={td}>{r.limiteVelocidad ? `${r.limiteVelocidad} km/h` : '—'}</td>
                <td className={td}>{r.notasRiesgo ?? <span className="text-gris">Sin análisis</span>}</td>
                <td className={td}>{puede('gestionar_flota') && <Boton variante="texto" onClick={() => setEditando(r)}>Editar</Boton>}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio titulo="Sin rutas">Registra las rutas habituales con su límite de velocidad y los puntos críticos.</Vacio>
      )}
      <Aviso error={rutas.error} />
    </>
  );
}

function FormularioRuta({ ruta, alTerminar }: { ruta?: Ruta; alTerminar: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof rutaSchema>, unknown, RutaInput>({
    resolver: zodResolver(rutaSchema),
    defaultValues: ruta ? { ...ruta, notasRiesgo: ruta.notasRiesgo ?? '' } : { viajesPorMes: 0, activa: true },
  });
  const guardar = useAccion((d: RutaInput) => (ruta ? api.patch(`/org/rutas/${ruta.id}`, d) : api.post('/org/rutas', d)), { alTerminar });
  return (
    <Tarjeta>
      <Subtitulo>{ruta ? 'Editar ruta' : 'Nueva ruta'}</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="ru-nombre" etiqueta="Nombre" error={errors.nombre?.message} {...register('nombre')} />
          <Campo id="ru-origen" etiqueta="Origen" error={errors.origen?.message} {...register('origen')} />
          <Campo id="ru-destino" etiqueta="Destino" error={errors.destino?.message} {...register('destino')} />
          <Campo id="ru-km" etiqueta="Distancia (km)" type="number" step="any" min={0} error={errors.distanciaKm?.message} {...register('distanciaKm', { setValueAs: Number })} />
          <Campo id="ru-viajes" etiqueta="Viajes al mes" type="number" min={0} {...register('viajesPorMes', { setValueAs: (v) => (v === '' ? 0 : Number(v)) })} />
          <Campo id="ru-limite" etiqueta="Límite de velocidad (km/h)" type="number" min={5} {...register('limiteVelocidad', { setValueAs: numero })} />
        </div>
        <AreaTexto id="ru-riesgo" etiqueta="Puntos críticos y riesgos de la vía" {...register('notasRiesgo')} />
        <Casilla etiqueta="Ruta activa" {...register('activa')} />
        <Aviso error={guardar.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={guardar.isPending}>Guardar ruta</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
