import { zodResolver } from '@hookform/resolvers/zod';
import { cerrarOrdenSchema, ordenTrabajoSchema, planMantenimientoSchema, type CerrarOrdenInput, type OrdenTrabajoInput, type PlanMantenimientoInput } from '@pesv/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Aviso, Boton, Campo, Cargando, Encabezado, Insignia, Pagina, Pestanas, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fecha, fechaHora, td, th } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { Vehiculo } from '../lib/tipos';

interface Orden {
  id: string;
  vehiculoId: string;
  placa: string;
  tipo: 'preventivo' | 'correctivo';
  origen: 'plan' | 'inspeccion' | 'manual';
  descripcion: string;
  prioridad: 'critica' | 'normal';
  estado: 'abierta' | 'en_proceso' | 'cerrada';
  proveedor: string | null;
  tecnico: string | null;
  costo: number | null;
  abiertaEn: string;
  cerradaEn: string | null;
}
interface Plan {
  id: string;
  vehiculoId: string;
  placa: string;
  nombre: string;
  intervaloKm: number | null;
  intervaloDias: number | null;
  ultimoEn: string | null;
  ultimoKm: number | null;
  odometroActual: number | null;
  proximaFecha: string | null;
  proximoKm: number | null;
  estado: 'vigente' | 'por_vencer' | 'vencido' | 'sin_historial';
}

const numeroONulo = (v: string) => (v === '' ? null : Number(v));
const ORIGEN = { plan: 'Plan preventivo', inspeccion: 'Preoperacional', manual: 'Manual' } as const;
const TONO_PLAN = { vigente: 'exito', por_vencer: 'aviso', vencido: 'peligro', sin_historial: 'neutro' } as const;
const TEXTO_PLAN = { vigente: 'Al día', por_vencer: 'Próximo', vencido: 'Vencido', sin_historial: 'Sin historial' } as const;
const cop = (n: number | null) => (n === null ? '—' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n));

export function Mantenimiento() {
  const [pestana, setPestana] = useState<'abiertas' | 'planes' | 'historial'>('abiertas');
  return (
    <Pagina>
      <Encabezado
        titulo="Mantenimiento"
        descripcion="Cada falla del preoperacional abre una orden. Al cerrar las órdenes críticas con los datos del taller, el vehículo vuelve a quedar apto."
      />
      <Pestanas valor={pestana} alCambiar={setPestana} opciones={[{ id: 'abiertas', nombre: 'Órdenes abiertas' }, { id: 'planes', nombre: 'Planes preventivos' }, { id: 'historial', nombre: 'Historial' }]} />
      {pestana === 'abiertas' && <Ordenes abiertas />}
      {pestana === 'historial' && <Ordenes abiertas={false} />}
      {pestana === 'planes' && <Planes />}
    </Pagina>
  );
}

function Ordenes({ abiertas }: { abiertas: boolean }) {
  const { puede } = useSesion();
  const ordenes = useConsulta<Orden[]>(['ordenes'], '/org/mantenimiento/ordenes');
  const [cerrando, setCerrando] = useState<Orden | null>(null);
  const [creando, setCreando] = useState(false);
  const iniciar = useAccion((id: string) => api.patch(`/org/mantenimiento/ordenes/${id}/iniciar`, {}));
  if (ordenes.isPending) return <Cargando />;
  const lista = (ordenes.data ?? []).filter((o) => (abiertas ? o.estado !== 'cerrada' : o.estado === 'cerrada'));
  return (
    <div className="flex flex-col gap-5">
      {abiertas && puede('gestionar_mantenimiento') && !creando && <Boton className="self-start" onClick={() => setCreando(true)}>Nueva orden de trabajo</Boton>}
      {creando && <NuevaOrden alTerminar={() => setCreando(false)} />}
      {cerrando && <CerrarOrden orden={cerrando} alTerminar={() => setCerrando(null)} />}
      <Aviso error={ordenes.error ?? iniciar.error} />
      {lista.length === 0 ? (
        <Vacio titulo={abiertas ? 'No hay órdenes abiertas' : 'Aún no hay órdenes cerradas'}>
          {abiertas ? 'Las fallas reportadas en los preoperacionales aparecerán aquí automáticamente.' : 'Las órdenes cerradas quedan como soporte del formulario de vehículos de VIGIA 2.'}
        </Vacio>
      ) : (
        <Tabla minimo="52rem">
          <thead>
            <tr>
              <th className={th}>Placa</th>
              <th className={th}>Trabajo</th>
              <th className={th}>Origen</th>
              <th className={th}>{abiertas ? 'Estado' : 'Taller y técnico'}</th>
              <th className={th}>{abiertas ? 'Abierta' : 'Cerrada'}</th>
              {abiertas && puede('gestionar_mantenimiento') && <th className={th}><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((o) => (
              <tr key={o.id}>
                <td className={`${td} font-bold text-noche`}>{o.placa}</td>
                <td className={td}>
                  <span className="flex flex-col gap-1">
                    <span>{o.descripcion}</span>
                    <span className="flex gap-1">
                      <Insignia>{o.tipo === 'preventivo' ? 'Preventivo' : 'Correctivo'}</Insignia>
                      {o.prioridad === 'critica' && <Insignia tono="peligro">Crítica</Insignia>}
                    </span>
                  </span>
                </td>
                <td className={td}>{ORIGEN[o.origen]}</td>
                <td className={td}>
                  {abiertas ? (
                    <Insignia tono={o.estado === 'en_proceso' ? 'aviso' : 'neutro'}>{o.estado === 'en_proceso' ? 'En proceso' : 'Abierta'}</Insignia>
                  ) : (
                    <span className="text-gris">{o.proveedor} · {o.tecnico} · {cop(o.costo)}</span>
                  )}
                </td>
                <td className={td}>{fechaHora(abiertas ? o.abiertaEn : o.cerradaEn)}</td>
                {abiertas && puede('gestionar_mantenimiento') && (
                  <td className={td}>
                    <span className="flex flex-wrap gap-1">
                      {o.estado === 'abierta' && <Boton variante="texto" onClick={() => iniciar.mutate(o.id)}>Iniciar</Boton>}
                      <Boton variante="texto" onClick={() => setCerrando(o)}>Cerrar</Boton>
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}

function CerrarOrden({ orden, alTerminar }: { orden: Orden; alTerminar: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof cerrarOrdenSchema>, unknown, CerrarOrdenInput>({ resolver: zodResolver(cerrarOrdenSchema) });
  const cerrar = useAccion((d: CerrarOrdenInput) => api.post(`/org/mantenimiento/ordenes/${orden.id}/cerrar`, d), { alTerminar });
  return (
    <Tarjeta>
      <Subtitulo>Cerrar orden · {orden.placa}</Subtitulo>
      <p className="text-sm text-gris">{orden.descripcion}. Estos datos son los que pide el soporte de mantenimiento de VIGIA 2.</p>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => cerrar.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="o-prov" etiqueta="Taller o proveedor" error={errors.proveedor?.message} {...register('proveedor')} />
          <Campo id="o-nit" etiqueta="NIT del proveedor" inputMode="numeric" {...register('nitProveedor')} />
          <Campo id="o-tec" etiqueta="Técnico" error={errors.tecnico?.message} {...register('tecnico')} />
          <Campo id="o-doc" etiqueta="Cédula del técnico" inputMode="numeric" {...register('documentoTecnico')} />
          <Campo id="o-cargo" etiqueta="Cargo del técnico" {...register('cargoTecnico')} />
          <Campo id="o-costo" etiqueta="Costo (COP)" type="number" min={0} {...register('costo', { setValueAs: numeroONulo })} />
          <Campo id="o-km" etiqueta="Odómetro al cierre (km)" type="number" min={0} {...register('odometroKm', { setValueAs: numeroONulo })} />
        </div>
        <Campo id="o-notas" etiqueta="Notas" {...register('notas')} />
        <Aviso error={cerrar.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={cerrar.isPending}>Cerrar orden</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

function SelectorVehiculo({ id, error, registro }: { id: string; error?: string; registro: ReturnType<ReturnType<typeof useForm>['register']> }) {
  const vehiculos = useConsulta<Vehiculo[]>(['vehiculos'], '/org/vehiculos');
  return (
    <Selector id={id} etiqueta="Vehículo" error={error} {...registro}>
      <option value="">Elige el vehículo</option>
      {(vehiculos.data ?? []).filter((v) => v.estado !== 'inactivo').map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
    </Selector>
  );
}

function NuevaOrden({ alTerminar }: { alTerminar: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof ordenTrabajoSchema>, unknown, OrdenTrabajoInput>({ resolver: zodResolver(ordenTrabajoSchema), defaultValues: { tipo: 'correctivo', prioridad: 'normal' } });
  const crear = useAccion((d: OrdenTrabajoInput) => api.post('/org/mantenimiento/ordenes', d), { alTerminar });
  return (
    <Tarjeta>
      <Subtitulo>Nueva orden de trabajo</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectorVehiculo id="n-veh" error={errors.vehiculoId ? 'Elige el vehículo' : undefined} registro={register('vehiculoId') as never} />
          <Selector id="n-tipo" etiqueta="Tipo" {...register('tipo')}>
            <option value="correctivo">Correctivo</option>
            <option value="preventivo">Preventivo</option>
          </Selector>
          <Selector id="n-prio" etiqueta="Prioridad" {...register('prioridad')}>
            <option value="normal">Normal</option>
            <option value="critica">Crítica</option>
          </Selector>
        </div>
        <Campo id="n-desc" etiqueta="Trabajo a realizar" error={errors.descripcion?.message} {...register('descripcion')} />
        <Aviso error={crear.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={crear.isPending}>Crear orden</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

function Planes() {
  const { puede } = useSesion();
  const planes = useConsulta<Plan[]>(['planes'], '/org/mantenimiento/planes');
  const [creando, setCreando] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof planMantenimientoSchema>, unknown, PlanMantenimientoInput>({ resolver: zodResolver(planMantenimientoSchema) });
  const crear = useAccion((d: PlanMantenimientoInput) => api.post('/org/mantenimiento/planes', d), { alTerminar: () => { reset(); setCreando(false); } });
  const generar = useAccion((p: Plan) => api.post('/org/mantenimiento/ordenes', { vehiculoId: p.vehiculoId, tipo: 'preventivo', descripcion: p.nombre, planId: p.id }));
  if (planes.isPending) return <Cargando />;
  return (
    <div className="flex flex-col gap-5">
      {puede('gestionar_mantenimiento') && !creando && <Boton className="self-start" onClick={() => setCreando(true)}>Nuevo plan preventivo</Boton>}
      {creando && (
        <Tarjeta>
          <Subtitulo>Nuevo plan preventivo</Subtitulo>
          <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SelectorVehiculo id="p-veh" error={errors.vehiculoId ? 'Elige el vehículo' : undefined} registro={register('vehiculoId') as never} />
              <Campo id="p-nombre" etiqueta="Nombre" placeholder="Cambio de aceite y filtros" error={errors.nombre?.message} {...register('nombre')} />
              <Campo id="p-km" etiqueta="Cada cuántos km" type="number" min={1} error={errors.intervaloKm?.message} {...register('intervaloKm', { setValueAs: numeroONulo })} />
              <Campo id="p-dias" etiqueta="Cada cuántos días" type="number" min={1} {...register('intervaloDias', { setValueAs: numeroONulo })} />
              <Campo id="p-ult" etiqueta="Último realizado el" type="date" {...register('ultimoEn', { setValueAs: (v) => v || null })} />
              <Campo id="p-ultkm" etiqueta="Kilometraje del último" type="number" min={0} {...register('ultimoKm', { setValueAs: numeroONulo })} />
            </div>
            <p className="text-[13px] text-gris">El mantenimiento vence por tiempo o por kilometraje, lo que ocurra primero.</p>
            <Aviso error={crear.error} />
            <div className="flex gap-2">
              <Boton type="submit" cargando={crear.isPending}>Crear plan</Boton>
              <Boton variante="secundario" onClick={() => setCreando(false)}>Cancelar</Boton>
            </div>
          </form>
        </Tarjeta>
      )}
      <Aviso error={planes.error ?? generar.error} />
      {planes.data?.length ? (
        <Tabla minimo="50rem">
          <thead>
            <tr>
              <th className={th}>Placa</th>
              <th className={th}>Plan</th>
              <th className={th}>Intervalo</th>
              <th className={th}>Próximo</th>
              <th className={th}>Estado</th>
              {puede('gestionar_mantenimiento') && <th className={th}><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {planes.data.map((p) => (
              <tr key={p.id}>
                <td className={`${td} font-bold text-noche`}>{p.placa}</td>
                <td className={td}>{p.nombre}</td>
                <td className={td}>{[p.intervaloKm && `${p.intervaloKm.toLocaleString('es-CO')} km`, p.intervaloDias && `${p.intervaloDias} días`].filter(Boolean).join(' o ')}</td>
                <td className={td}>{[p.proximaFecha && fecha(p.proximaFecha), p.proximoKm && `${p.proximoKm.toLocaleString('es-CO')} km`].filter(Boolean).join(' · ') || '—'}</td>
                <td className={td}><Insignia tono={TONO_PLAN[p.estado]}>{TEXTO_PLAN[p.estado]}</Insignia></td>
                {puede('gestionar_mantenimiento') && (
                  <td className={td}><Boton variante="texto" onClick={() => generar.mutate(p)}>Abrir orden</Boton></td>
                )}
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio titulo="Aún no hay planes preventivos">Define cada cuántos kilómetros o días se hace cada mantenimiento por vehículo.</Vacio>
      )}
    </div>
  );
}
