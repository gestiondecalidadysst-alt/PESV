import type { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  conductorSchema,
  TIPOS_VEHICULO,
  vehiculoSchema,
  type ConductorInput,
  type VehiculoInput,
} from '@pesv/shared';
import { useState } from 'react';
import { useForm, type UseFormSetValue } from 'react-hook-form';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Casilla,
  Encabezado,
  Insignia,
  Pagina,
  Pestanas,
  Selector,
  Subtitulo,
  Tabla,
  Tarjeta,
  TEXTO_DOCUMENTO,
  TONO_DOCUMENTO,
  Vacio,
  fecha,
  fechaHora,
  td,
  th,
} from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { Conductor, Vehiculo } from '../lib/tipos';

const nombreTipo = (id: string) => TIPOS_VEHICULO.find((t) => t.id === id)?.nombre ?? id;
const fechaONulo = (v: string) => v || null;
const numeroONulo = (v: string) => (v === '' || v === null || v === undefined ? null : Number(v));
const TONO_ESTADO_VEHICULO = { apto: 'exito', no_apto: 'peligro', inactivo: 'neutro' } as const;
const TEXTO_ESTADO_VEHICULO = { apto: 'Apto', no_apto: 'No apto', inactivo: 'Inactivo' } as const;

type Pestana = 'vehiculos' | 'conductores' | 'preoperacionales';

export function Flota() {
  const [pestana, setPestana] = useState<Pestana>('vehiculos');
  return (
    <Pagina>
      <Encabezado titulo="Flota y conductores" descripcion="Vehículos propios, de contratistas y de terceros; conductores con sus documentos y vencimientos." />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: 'vehiculos', nombre: 'Vehículos' },
          { id: 'conductores', nombre: 'Conductores' },
          { id: 'preoperacionales', nombre: 'Preoperacionales de hoy' },
        ]}
      />
      {pestana === 'vehiculos' && <Vehiculos />}
      {pestana === 'conductores' && <Conductores />}
      {pestana === 'preoperacionales' && <PreoperacionalesHoy />}
    </Pagina>
  );
}

/** Lee la foto de un documento con la IA del cliente y completa el campo de vencimiento. */
function LectorDocumento({ alLeer }: { alLeer: (datos: Record<string, string | null>) => void }) {
  const ia = useConsulta<{ activa: boolean; agentes: string[] }>(['ia-estado'], '/org/ia/estado');
  const [leyendo, setLeyendo] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  if (!ia.data?.agentes.includes('lector')) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-papel p-4">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Leer un documento con IA
        <span className="font-normal text-gris">Sube una foto del SOAT, la revisión técnico-mecánica o la licencia y completamos la fecha de vencimiento.</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={leyendo}
          className="text-sm font-normal"
          onChange={async (e) => {
            const archivo = e.target.files?.[0];
            if (!archivo) return;
            setLeyendo(true);
            setError(null);
            setResultado(null);
            try {
              const datos = new FormData();
              datos.set('imagen', archivo);
              const r = await api.post<Record<string, string | null>>('/org/ia/lector', datos);
              alLeer(r);
              setResultado(r.venceEl ? `Leímos un documento tipo ${r.tipo} que vence el ${fecha(r.venceEl)} (confianza ${r.confianza}). Revisa los campos antes de guardar.` : 'No se pudo leer la fecha de vencimiento. Complétala a mano.');
            } catch (err) {
              setError(err);
            } finally {
              setLeyendo(false);
              e.target.value = '';
            }
          }}
        />
      </label>
      {leyendo && <p className="text-sm text-gris">Leyendo el documento…</p>}
      {resultado && <Aviso tono="info">{resultado}</Aviso>}
      <Aviso error={error} />
    </div>
  );
}

function FormularioVehiculo({ inicial, alTerminar }: { inicial?: Vehiculo; alTerminar: () => void }) {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<z.input<typeof vehiculoSchema>, unknown, VehiculoInput>({
    resolver: zodResolver(vehiculoSchema),
    defaultValues: inicial
      ? {
          placa: inicial.placa,
          tipo: inicial.tipo as VehiculoInput['tipo'],
          servicio: inicial.servicio as VehiculoInput['servicio'],
          propiedad: inicial.propiedad,
          marca: inicial.marca ?? undefined,
          modelo: inicial.modelo,
          capacidad: inicial.capacidad ?? undefined,
          soatVence: inicial.soatVence,
          rtmVence: inicial.rtmVence,
          odometroKm: inicial.odometroKm,
          estado: inicial.estado,
        }
      : { tipo: 'camioneta', propiedad: 'propio', servicio: 'particular' },
  });
  const guardar = useAccion((d: VehiculoInput) => (inicial ? api.patch(`/org/vehiculos/${inicial.id}`, d) : api.post('/org/vehiculos', d)), { alTerminar });
  const aplicarLectura = (r: Record<string, string | null>, set: UseFormSetValue<z.input<typeof vehiculoSchema>>) => {
    if (r.tipo === 'soat' && r.venceEl) set('soatVence', r.venceEl, { shouldDirty: true });
    if (r.tipo === 'rtm' && r.venceEl) set('rtmVence', r.venceEl, { shouldDirty: true });
    if (r.placa && !inicial) set('placa', r.placa.toUpperCase());
  };
  return (
    <Tarjeta>
      <Subtitulo>{inicial ? `Editar ${inicial.placa}` : 'Agregar vehículo'}</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="v-placa" etiqueta="Placa o identificador" error={errors.placa?.message} {...register('placa')} />
          <Selector id="v-tipo" etiqueta="Tipo" {...register('tipo')}>
            {TIPOS_VEHICULO.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </Selector>
          <Selector id="v-propiedad" etiqueta="Propiedad" {...register('propiedad')}>
            <option value="propio">Propio</option>
            <option value="contratista">De contratista</option>
            <option value="tercero">De tercero</option>
          </Selector>
          <Selector id="v-servicio" etiqueta="Servicio" {...register('servicio')}>
            <option value="particular">Particular</option>
            <option value="publico">Público</option>
            <option value="oficial">Oficial</option>
            <option value="otro">Otro</option>
          </Selector>
          <Campo id="v-marca" etiqueta="Marca" {...register('marca', { setValueAs: (v) => v || undefined })} />
          <Campo id="v-modelo" etiqueta="Modelo (año)" type="number" inputMode="numeric" error={errors.modelo?.message} {...register('modelo', { setValueAs: numeroONulo })} />
          <Campo id="v-soat" etiqueta="SOAT vence" type="date" error={errors.soatVence?.message} {...register('soatVence', { setValueAs: fechaONulo })} />
          <Campo id="v-rtm" etiqueta="Revisión técnico-mecánica vence" type="date" error={errors.rtmVence?.message} {...register('rtmVence', { setValueAs: fechaONulo })} />
          <Campo id="v-km" etiqueta="Odómetro (km)" type="number" inputMode="numeric" {...register('odometroKm', { setValueAs: numeroONulo })} />
          {inicial && (
            <Selector id="v-estado" etiqueta="Estado" ayuda="Pasa a apto cuando mantenimiento cierre la falla." {...register('estado')}>
              <option value="apto">Apto</option>
              <option value="no_apto">No apto</option>
              <option value="inactivo">Inactivo</option>
            </Selector>
          )}
        </div>
        <LectorDocumento alLeer={(r) => aplicarLectura(r, setValue)} />
        <Aviso error={guardar.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={guardar.isPending}>{inicial ? 'Guardar cambios' : 'Agregar vehículo'}</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

function Vehiculos() {
  const { puede } = useSesion();
  const vehiculos = useConsulta<Vehiculo[]>(['vehiculos'], '/org/vehiculos');
  const [editando, setEditando] = useState<Vehiculo | 'nuevo' | null>(null);
  if (vehiculos.isPending) return <Cargando />;
  if (vehiculos.error) return <Aviso error={vehiculos.error} />;
  const lista = vehiculos.data!;
  return (
    <div className="flex flex-col gap-5">
      {puede('gestionar_flota') && !editando && <Boton className="self-start" onClick={() => setEditando('nuevo')}>Agregar vehículo</Boton>}
      {editando && <FormularioVehiculo key={editando === 'nuevo' ? 'nuevo' : editando.id} inicial={editando === 'nuevo' ? undefined : editando} alTerminar={() => setEditando(null)} />}
      {lista.length === 0 ? (
        <Vacio titulo="Aún no hay vehículos">Registra la flota propia, la de contratistas y la de terceros que trabajan para la organización.</Vacio>
      ) : (
        <Tabla minimo="52rem">
          <thead>
            <tr>
              <th className={th}>Placa</th>
              <th className={th}>Tipo</th>
              <th className={th}>Propiedad</th>
              <th className={th}>SOAT</th>
              <th className={th}>Revisión técnico-mecánica</th>
              <th className={th}>Estado</th>
              {puede('gestionar_flota') && <th className={th}><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((v) => (
              <tr key={v.id}>
                <td className={`${td} font-bold text-noche`}>{v.placa}</td>
                <td className={td}>{nombreTipo(v.tipo)}</td>
                <td className={`${td} capitalize`}>{v.propiedad}</td>
                <td className={td}>
                  {v.motorizado ? <><Insignia tono={TONO_DOCUMENTO[v.documentos.soat]}>{TEXTO_DOCUMENTO[v.documentos.soat]}</Insignia> <span className="text-gris">{fecha(v.soatVence)}</span></> : 'No aplica'}
                </td>
                <td className={td}>
                  {v.motorizado ? <><Insignia tono={TONO_DOCUMENTO[v.documentos.rtm]}>{TEXTO_DOCUMENTO[v.documentos.rtm]}</Insignia> <span className="text-gris">{fecha(v.rtmVence)}</span></> : 'No aplica'}
                </td>
                <td className={td}><Insignia tono={TONO_ESTADO_VEHICULO[v.estado]}>{TEXTO_ESTADO_VEHICULO[v.estado]}</Insignia></td>
                {puede('gestionar_flota') && (
                  <td className={td}><Boton variante="texto" onClick={() => setEditando(v)}>Editar</Boton></td>
                )}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}

function FormularioConductor({ inicial, alTerminar }: { inicial?: Conductor; alTerminar: () => void }) {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<z.input<typeof conductorSchema>, unknown, ConductorInput>({
    resolver: zodResolver(conductorSchema),
    defaultValues: inicial
      ? {
          documento: inicial.documento,
          nombre: inicial.nombre,
          telefono: inicial.telefono ?? undefined,
          email: inicial.email ?? undefined,
          categoriaLicencia: inicial.categoriaLicencia ?? undefined,
          licenciaVence: inicial.licenciaVence,
          examenMedicoVence: inicial.examenMedicoVence,
          tipoContrato: inicial.tipoContrato as ConductorInput['tipoContrato'],
          rolVia: inicial.rolVia as ConductorInput['rolVia'],
          activo: inicial.activo,
          consentimientoDatos: true,
        }
      : { tipoContrato: 'directo', rolVia: 'conductor' },
  });
  const guardar = useAccion((d: ConductorInput) => (inicial ? api.patch(`/org/conductores/${inicial.id}`, d) : api.post('/org/conductores', d)), { alTerminar });
  return (
    <Tarjeta>
      <Subtitulo>{inicial ? `Editar a ${inicial.nombre}` : 'Agregar conductor'}</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="c-doc" etiqueta="Cédula" inputMode="numeric" error={errors.documento?.message} {...register('documento')} />
          <Campo id="c-nombre" etiqueta="Nombre completo" error={errors.nombre?.message} {...register('nombre')} />
          <Campo id="c-tel" etiqueta="Celular" type="tel" {...register('telefono', { setValueAs: (v) => v || undefined })} />
          <Campo id="c-email" etiqueta="Correo" type="email" error={errors.email?.message} {...register('email')} />
          <Campo id="c-cat" etiqueta="Categoría de licencia" placeholder="B1, C2…" {...register('categoriaLicencia', { setValueAs: (v) => v || undefined })} />
          <Campo id="c-lic" etiqueta="Licencia vence" type="date" error={errors.licenciaVence?.message} {...register('licenciaVence', { setValueAs: fechaONulo })} />
          <Campo id="c-med" etiqueta="Examen médico vence" type="date" {...register('examenMedicoVence', { setValueAs: fechaONulo })} />
          <Selector id="c-contrato" etiqueta="Vinculación" {...register('tipoContrato')}>
            <option value="directo">Directo</option>
            <option value="contratista">Contratista</option>
            <option value="tercero">Tercero</option>
            <option value="otro">Otro</option>
          </Selector>
          <Selector id="c-rol" etiqueta="Rol en la vía" {...register('rolVia')}>
            <option value="conductor">Conductor</option>
            <option value="motociclista">Motociclista</option>
            <option value="ciclista">Ciclista</option>
            <option value="peaton">Peatón</option>
            <option value="pasajero">Pasajero</option>
          </Selector>
        </div>
        {inicial && <Casilla etiqueta="Conductor activo" {...register('activo')} />}
        <LectorDocumento
          alLeer={(r) => {
            if (r.tipo === 'licencia' && r.venceEl) setValue('licenciaVence', r.venceEl);
            if (r.tipo === 'licencia' && r.categoria) setValue('categoriaLicencia', r.categoria);
          }}
        />
        <Casilla
          etiqueta="El conductor autorizó el tratamiento de sus datos personales"
          descripcion="Ley 1581 de 2012. Guarda el soporte firmado como evidencia del paso 10."
          {...register('consentimientoDatos')}
        />
        {errors.consentimientoDatos && <p className="text-[13px] font-medium text-alerta">{errors.consentimientoDatos.message}</p>}
        <Aviso error={guardar.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={guardar.isPending}>{inicial ? 'Guardar cambios' : 'Agregar conductor'}</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

function Conductores() {
  const { puede } = useSesion();
  const conductores = useConsulta<Conductor[]>(['conductores'], '/org/conductores');
  const [editando, setEditando] = useState<Conductor | 'nuevo' | null>(null);
  if (conductores.isPending) return <Cargando />;
  if (conductores.error) return <Aviso error={conductores.error} />;
  const lista = conductores.data!;
  return (
    <div className="flex flex-col gap-5">
      {puede('gestionar_flota') && !editando && <Boton className="self-start" onClick={() => setEditando('nuevo')}>Agregar conductor</Boton>}
      {editando && <FormularioConductor key={editando === 'nuevo' ? 'nuevo' : editando.id} inicial={editando === 'nuevo' ? undefined : editando} alTerminar={() => setEditando(null)} />}
      {lista.length === 0 ? (
        <Vacio titulo="Aún no hay conductores">Incluye a toda persona que conduce para la organización, sin importar su cargo.</Vacio>
      ) : (
        <Tabla minimo="50rem">
          <thead>
            <tr>
              <th className={th}>Nombre</th>
              <th className={th}>Cédula</th>
              <th className={th}>Licencia</th>
              <th className={th}>Examen médico</th>
              <th className={th}>Estado</th>
              {puede('gestionar_flota') && <th className={th}><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td className={`${td} font-semibold text-noche`}>{c.nombre}</td>
                <td className={td}>{c.documento}</td>
                <td className={td}><Insignia tono={TONO_DOCUMENTO[c.documentos.licencia]}>{TEXTO_DOCUMENTO[c.documentos.licencia]}</Insignia> <span className="text-gris">{c.categoriaLicencia ?? ''} {fecha(c.licenciaVence)}</span></td>
                <td className={td}><Insignia tono={TONO_DOCUMENTO[c.documentos.examenMedico]}>{TEXTO_DOCUMENTO[c.documentos.examenMedico]}</Insignia> <span className="text-gris">{fecha(c.examenMedicoVence)}</span></td>
                <td className={td}>{c.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia>Inactivo</Insignia>}</td>
                {puede('gestionar_flota') && <td className={td}><Boton variante="texto" onClick={() => setEditando(c)}>Editar</Boton></td>}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}

interface FilaInspeccion {
  id: string;
  resultado: 'apto' | 'falla_menor' | 'falla_critica';
  realizadaEn: string;
  odometroKm: number | null;
  notas: string | null;
  placa: string;
  conductor: string | null;
  fallas: string[];
}

function PreoperacionalesHoy() {
  const datos = useConsulta<{ fecha: string; inspecciones: FilaInspeccion[] }>(['inspecciones-hoy'], '/org/inspecciones');
  if (datos.isPending) return <Cargando />;
  if (datos.error) return <Aviso error={datos.error} />;
  const lista = datos.data!.inspecciones;
  const tono = { apto: 'exito', falla_menor: 'aviso', falla_critica: 'peligro' } as const;
  const texto = { apto: 'Apto', falla_menor: 'Falla menor', falla_critica: 'Falla crítica' } as const;
  return lista.length === 0 ? (
    <Vacio titulo="Aún no hay preoperacionales hoy">Los conductores los registran desde su celular en la sección Preoperacional.</Vacio>
  ) : (
    <Tabla minimo="44rem">
      <thead>
        <tr>
          <th className={th}>Hora</th>
          <th className={th}>Placa</th>
          <th className={th}>Conductor</th>
          <th className={th}>Resultado</th>
          <th className={th}>Ítems con falla</th>
        </tr>
      </thead>
      <tbody>
        {lista.map((i) => (
          <tr key={i.id}>
            <td className={td}>{fechaHora(i.realizadaEn)}</td>
            <td className={`${td} font-bold text-noche`}>{i.placa}</td>
            <td className={td}>{i.conductor ?? '—'}</td>
            <td className={td}><Insignia tono={tono[i.resultado]}>{texto[i.resultado]}</Insignia></td>
            <td className={td}>{i.fallas.length ? i.fallas.join(', ') : '—'}</td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}
