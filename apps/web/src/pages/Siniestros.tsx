import { zodResolver } from '@hookform/resolvers/zod';
import { accionSchema, investigacionSchema, NIVEL_SINIESTRO_LABEL, siniestroSchema, type AccionInput, type InvestigacionInput, type SiniestroInput } from '@pesv/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import type { z } from 'zod';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Casilla, Encabezado, Insignia, Pagina, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fecha, fechaHora, td, th } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { Conductor, Vehiculo } from '../lib/tipos';
import { ListaAcciones, type Accion } from './Acciones';

type Nivel = keyof typeof NIVEL_SINIESTRO_LABEL;
interface Siniestro {
  id: string;
  ocurridoEn: string;
  lugar: string;
  municipio: string | null;
  placa: string;
  conductorNombre: string;
  fallecidos: number;
  heridosGraves: number;
  heridosLeves: number;
  nivel: Nivel;
  numeroIpat: string | null;
  autoridad: string | null;
  descripcion: string;
  enMision: boolean;
  costoDirecto: number;
  costoIndirecto: number;
  revisadoPorComiteEl: string | null;
  estado: 'abierto' | 'en_investigacion' | 'cerrado';
  investigacion: {
    obligatoria: boolean;
    investigadores: string | null;
    hechos: string | null;
    causasInmediatas: string | null;
    causasRaiz: string | null;
    leccionesAprendidas: string | null;
    estado: 'pendiente' | 'en_curso' | 'cerrada';
  } | null;
  acciones?: Accion[];
}

const TONO_NIVEL = { con_fallecidos: 'peligro', con_lesionados_graves: 'peligro', con_lesionados_leves: 'aviso', solo_danos: 'neutro' } as const;
const TEXTO_ESTADO = { abierto: 'Abierto', en_investigacion: 'En investigación', cerrado: 'Cerrado' } as const;
const aIso = (local: string) => (local ? new Date(local).toISOString() : '');
const numero = (v: string) => (v === '' ? 0 : Number(v));

export function Siniestros() {
  const { puede } = useSesion();
  const siniestros = useConsulta<Siniestro[]>(['siniestros'], '/org/siniestros');
  const [registrando, setRegistrando] = useState(false);
  return (
    <Pagina>
      <Encabezado
        titulo="Siniestros viales"
        descripcion="Registro con los datos que pide Supertransporte. En nivel estándar y avanzado cada siniestro abre una investigación interna y queda pendiente de revisión por el comité."
        acciones={puede('gestionar_siniestros') && !registrando && <Boton onClick={() => setRegistrando(true)}>Registrar siniestro</Boton>}
      />
      {registrando && <FormularioSiniestro alTerminar={() => setRegistrando(false)} />}
      {siniestros.isPending ? <Cargando /> : siniestros.data?.length ? (
        <Tabla minimo="52rem">
          <thead>
            <tr>
              <th className={th}>Fecha</th>
              <th className={th}>Placa y conductor</th>
              <th className={th}>Nivel</th>
              <th className={th}>Investigación</th>
              <th className={th}>Comité</th>
              <th className={th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {siniestros.data.map((s) => (
              <tr key={s.id}>
                <td className={td}><Link to={`/siniestros/${s.id}`} className="font-semibold text-[#1d4e89] underline-offset-4 hover:underline">{fechaHora(s.ocurridoEn)}</Link></td>
                <td className={td}><strong className="text-noche">{s.placa}</strong> · {s.conductorNombre}</td>
                <td className={td}><Insignia tono={TONO_NIVEL[s.nivel]}>{NIVEL_SINIESTRO_LABEL[s.nivel]}</Insignia></td>
                <td className={td}>{s.investigacion ? `${s.investigacion.obligatoria ? 'Obligatoria' : 'Opcional'} · ${s.investigacion.estado.replace('_', ' ')}` : '—'}</td>
                <td className={td}>{s.revisadoPorComiteEl ? fecha(s.revisadoPorComiteEl) : <Insignia tono="aviso">Pendiente</Insignia>}</td>
                <td className={td}>{TEXTO_ESTADO[s.estado]}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio titulo="Sin siniestros registrados">Cuando ocurra un siniestro en misión, regístralo aquí el mismo día.</Vacio>
      )}
      <Aviso error={siniestros.error} />
    </Pagina>
  );
}

function FormularioSiniestro({ alTerminar }: { alTerminar: () => void }) {
  const vehiculos = useConsulta<Vehiculo[]>(['vehiculos'], '/org/vehiculos');
  const conductores = useConsulta<Conductor[]>(['conductores'], '/org/conductores');
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<z.input<typeof siniestroSchema>, unknown, SiniestroInput>({
    resolver: zodResolver(siniestroSchema),
    defaultValues: { enMision: true, fallecidos: 0, heridosGraves: 0, heridosLeves: 0, costoDirecto: 0, costoIndirecto: 0 },
  });
  const crear = useAccion((d: SiniestroInput) => api.post('/org/siniestros', d), { alTerminar });
  return (
    <Tarjeta>
      <Subtitulo>Registrar siniestro</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="s-fecha" etiqueta="Fecha y hora" type="datetime-local" error={errors.ocurridoEn?.message} {...register('ocurridoEn', { setValueAs: aIso })} />
          <Campo id="s-lugar" etiqueta="Lugar" placeholder="Vía, kilómetro o dirección" error={errors.lugar?.message} {...register('lugar')} />
          <Campo id="s-mun" etiqueta="Municipio" {...register('municipio')} />
          <Selector
            id="s-veh"
            etiqueta="Vehículo de la organización"
            {...register('vehiculoId', { setValueAs: (v) => v || null })}
            onChange={(e) => {
              const v = vehiculos.data?.find((x) => x.id === e.target.value);
              setValue('vehiculoId', e.target.value || null);
              if (v) setValue('placa', v.placa);
            }}
          >
            <option value="">Otro (escribe la placa)</option>
            {(vehiculos.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
          </Selector>
          <Campo id="s-placa" etiqueta="Placa" error={errors.placa?.message} {...register('placa')} />
          <Selector
            id="s-cond"
            etiqueta="Conductor registrado"
            {...register('conductorId', { setValueAs: (v) => v || null })}
            onChange={(e) => {
              const c = conductores.data?.find((x) => x.id === e.target.value);
              setValue('conductorId', e.target.value || null);
              if (c) {
                setValue('conductorNombre', c.nombre);
                setValue('conductorDocumento', c.documento);
              }
            }}
          >
            <option value="">Otro (escribe sus datos)</option>
            {(conductores.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
          <Campo id="s-cnom" etiqueta="Nombre del conductor" error={errors.conductorNombre?.message} {...register('conductorNombre')} />
          <Campo id="s-cdoc" etiqueta="Cédula del conductor" inputMode="numeric" error={errors.conductorDocumento?.message} {...register('conductorDocumento')} />
          <Campo id="s-ipat" etiqueta="Número de IPAT" ayuda="Informe policial de accidente de tránsito." {...register('numeroIpat')} />
          <Campo id="s-aut" etiqueta="Autoridad que atendió" {...register('autoridad')} />
          <Campo id="s-fal" etiqueta="Fallecidos" type="number" min={0} {...register('fallecidos', { setValueAs: numero })} />
          <Campo id="s-hg" etiqueta="Heridos graves" type="number" min={0} {...register('heridosGraves', { setValueAs: numero })} />
          <Campo id="s-hl" etiqueta="Heridos leves" type="number" min={0} {...register('heridosLeves', { setValueAs: numero })} />
          <Campo id="s-cd" etiqueta="Costo directo (COP)" type="number" min={0} {...register('costoDirecto', { setValueAs: numero })} />
          <Campo id="s-ci" etiqueta="Costo indirecto (COP)" type="number" min={0} {...register('costoIndirecto', { setValueAs: numero })} />
        </div>
        <AreaTexto id="s-desc" etiqueta="¿Qué pasó?" error={errors.descripcion?.message} {...register('descripcion')} />
        <Casilla etiqueta="Ocurrió en un desplazamiento laboral (en misión)" {...register('enMision')} />
        <Aviso error={crear.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={crear.isPending}>Registrar siniestro</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

export function SiniestroDetalle() {
  const { id } = useParams();
  const { puede } = useSesion();
  const s = useConsulta<Siniestro>(['siniestro', id], `/org/siniestros/${id}`);
  const ia = useConsulta<{ agentes: string[] }>(['ia-estado'], '/org/ia/estado');
  if (s.isPending) return <Cargando />;
  if (s.error || !s.data) return <Aviso error={s.error} />;
  const d = s.data;
  return (
    <Pagina ancho="max-w-5xl">
      <Link to="/siniestros" className="self-start text-sm font-semibold text-[#1d4e89] underline-offset-4 hover:underline">Siniestros</Link>
      <Encabezado titulo={`Siniestro del ${fechaHora(d.ocurridoEn)}`} descripcion={`${d.lugar}${d.municipio ? `, ${d.municipio}` : ''} · ${d.placa} · ${d.conductorNombre}`} acciones={<Insignia tono={TONO_NIVEL[d.nivel]}>{NIVEL_SINIESTRO_LABEL[d.nivel]}</Insignia>} />
      <Tarjeta>
        <Subtitulo>Datos del registro</Subtitulo>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Víctimas', `Fallecidos: ${d.fallecidos} · heridos graves: ${d.heridosGraves} · heridos leves: ${d.heridosLeves}`],
            ['IPAT', d.numeroIpat || 'Sin registrar'],
            ['Autoridad', d.autoridad || 'Sin registrar'],
            ['En misión', d.enMision ? 'Sí' : 'No'],
            ['Costos (COP)', `Directo ${d.costoDirecto.toLocaleString('es-CO')} · indirecto ${d.costoIndirecto.toLocaleString('es-CO')}`],
            ['Revisión del comité', d.revisadoPorComiteEl ? fecha(d.revisadoPorComiteEl) : 'Pendiente'],
          ].map(([k, v]) => (
            <div key={k}><dt className="font-semibold text-gris">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
        <p className="text-sm">{d.descripcion}</p>
      </Tarjeta>
      {d.investigacion && <Investigacion siniestro={d} puedeEditar={puede('gestionar_siniestros')} conIa={!!ia.data?.agentes.includes('siniestros')} />}
      <Tarjeta>
        <Subtitulo>Acciones correctivas y preventivas</Subtitulo>
        <ListaAcciones acciones={d.acciones ?? []} />
        {puede('gestionar_siniestros') && <NuevaAccion ruta={`/org/siniestros/${d.id}/acciones`} />}
      </Tarjeta>
    </Pagina>
  );
}

function Investigacion({ siniestro, puedeEditar, conIa }: { siniestro: Siniestro; puedeEditar: boolean; conIa: boolean }) {
  const inv = siniestro.investigacion!;
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<z.input<typeof investigacionSchema>, unknown, InvestigacionInput>({
    resolver: zodResolver(investigacionSchema),
    defaultValues: {
      investigadores: inv.investigadores ?? '',
      hechos: inv.hechos ?? '',
      causasInmediatas: inv.causasInmediatas ?? '',
      causasRaiz: inv.causasRaiz ?? '',
      leccionesAprendidas: inv.leccionesAprendidas ?? '',
      estado: inv.estado,
      revisadoPorComiteEl: siniestro.revisadoPorComiteEl,
    },
  });
  const guardar = useAccion((d: InvestigacionInput) => api.patch(`/org/siniestros/${siniestro.id}/investigacion`, d));
  const borrador = useAccion(() => api.post<{ hechos: string; causasInmediatas: string; causasRaiz: string; leccionesAprendidas: string; accionesSugeridas: string[] }>(`/org/siniestros/${siniestro.id}/borrador-ia`), {
    alTerminar: (r) => {
      setValue('hechos', r.hechos);
      setValue('causasInmediatas', r.causasInmediatas);
      setValue('causasRaiz', r.causasRaiz);
      setValue('leccionesAprendidas', r.leccionesAprendidas);
    },
  });
  return (
    <Tarjeta>
      <Subtitulo acciones={<Insignia tono={inv.obligatoria ? 'aviso' : 'neutro'}>{inv.obligatoria ? 'Obligatoria (paso 13)' : 'Opcional'}</Insignia>}>Investigación interna</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <fieldset disabled={!puedeEditar} className="flex flex-col gap-4">
          <Campo id="i-inv" etiqueta="Investigadores" {...register('investigadores')} />
          <AreaTexto id="i-hechos" etiqueta="Hechos" {...register('hechos')} />
          <AreaTexto id="i-inm" etiqueta="Causas inmediatas" {...register('causasInmediatas')} />
          <AreaTexto id="i-raiz" etiqueta="Causas raíz" ayuda="Método sugerido: árbol de causas." {...register('causasRaiz')} />
          <AreaTexto id="i-lec" etiqueta="Lecciones aprendidas" {...register('leccionesAprendidas')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Selector id="i-estado" etiqueta="Estado" error={errors.estado?.message} {...register('estado')}>
              <option value="pendiente">Pendiente</option>
              <option value="en_curso">En curso</option>
              <option value="cerrada">Cerrada</option>
            </Selector>
            <Campo id="i-comite" etiqueta="Revisada por el comité el" type="date" {...register('revisadoPorComiteEl', { setValueAs: (v) => v || null })} />
          </div>
        </fieldset>
        {borrador.data && borrador.data.accionesSugeridas.length > 0 && (
          <Aviso tono="info">
            Acciones sugeridas por la IA (revísalas antes de registrarlas): {borrador.data.accionesSugeridas.join(' · ')}
          </Aviso>
        )}
        <Aviso error={guardar.error ?? borrador.error} />
        {guardar.isSuccess && <Aviso tono="exito">Investigación guardada.</Aviso>}
        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" cargando={guardar.isPending}>Guardar investigación</Boton>
            {conIa && <Boton variante="secundario" cargando={borrador.isPending} onClick={() => borrador.mutate(undefined)}>Proponer borrador con IA</Boton>}
          </div>
        )}
      </form>
    </Tarjeta>
  );
}

export function NuevaAccion({ ruta, tipoPorDefecto = 'correctiva' }: { ruta: string; tipoPorDefecto?: AccionInput['tipo'] }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof accionSchema>, unknown, AccionInput>({ resolver: zodResolver(accionSchema), defaultValues: { tipo: tipoPorDefecto } });
  const crear = useAccion((d: AccionInput) => api.post(ruta, d), { alTerminar: () => reset({ tipo: tipoPorDefecto }) });
  return (
    <form noValidate className="flex flex-col gap-3 rounded-xl bg-papel p-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
      <Campo id={`a-desc-${ruta}`} etiqueta="Acción" error={errors.descripcion?.message} {...register('descripcion')} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id={`a-resp-${ruta}`} etiqueta="Responsable" error={errors.responsable?.message} {...register('responsable')} />
        <Campo id={`a-fecha-${ruta}`} etiqueta="Fecha límite" type="date" error={errors.venceEl?.message} {...register('venceEl')} />
        <Selector id={`a-tipo-${ruta}`} etiqueta="Tipo" {...register('tipo')}>
          <option value="correctiva">Correctiva</option>
          <option value="preventiva">Preventiva</option>
          <option value="mejora">Mejora</option>
          <option value="compromiso">Compromiso</option>
        </Selector>
      </div>
      <Aviso error={crear.error} />
      <Boton type="submit" className="self-start" cargando={crear.isPending}>Agregar acción</Boton>
    </form>
  );
}
